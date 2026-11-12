package co.techinn.miningsight.bridge;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;

import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.OutputStream;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.GZIPOutputStream;
import org.json.JSONObject;

/**
 * Small temporary diagnostic log for the bridge itself. Android does not allow
 * ordinary apps to read global logcat, so ADB is still required for native
 * tombstones and system-level crashes.
 */
public final class BridgeLog {
    public interface UploadCallback { void onResult(String message); }
    private static final String TAG = "MiningSightBridge";
    private static final String FILE_NAME = "bridge-diagnostics.log";
    private static final int MAX_BYTES = 256 * 1024;
    private static final Object LOCK = new Object();
    private static File logFile;
    private static final AtomicBoolean uploadInProgress = new AtomicBoolean(false);
    private static long lastUploadErrorAt;

    private BridgeLog() {}

    public static void init(Context context) {
        synchronized (LOCK) {
            if (logFile == null) logFile = new File(context.getCacheDir(), FILE_NAME);
        }
        info("BridgeLog", "Diagnostic logging started");
    }

    public static void info(String tag, String message) {
        write("I", tag, message, null);
    }

    public static void warn(String tag, String message) {
        write("W", tag, message, null);
    }

    public static void error(String tag, String message, Throwable error) {
        write("E", tag, message, error);
    }

    private static void write(String level, String tag, String message, Throwable error) {
        String safeMessage = message == null ? "" : message;
        if ("E".equals(level)) Log.e(TAG + "/" + tag, safeMessage, error);
        else if ("W".equals(level)) Log.w(TAG + "/" + tag, safeMessage);
        else Log.i(TAG + "/" + tag, safeMessage);

        StringBuilder entry = new StringBuilder()
                .append(new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US).format(new Date()))
                .append(" ").append(level).append("/").append(tag).append(": ").append(safeMessage).append("\n");
        if (error != null) {
            StringWriter stack = new StringWriter();
            error.printStackTrace(new PrintWriter(stack));
            entry.append(stack).append("\n");
        }

        synchronized (LOCK) {
            if (logFile == null) return;
            try {
                if (logFile.length() > MAX_BYTES) {
                    FileOutputStream trim = new FileOutputStream(logFile, false);
                    trim.write("[diagnostic log rotated]\n".getBytes(StandardCharsets.UTF_8));
                    trim.close();
                }
                FileOutputStream output = new FileOutputStream(logFile, true);
                output.write(entry.toString().getBytes(StandardCharsets.UTF_8));
                output.close();
            } catch (Exception ignored) {
                // Diagnostics must never take down the transmitter.
            }
        }
    }

    public static String read() {
        synchronized (LOCK) {
            if (logFile == null || !logFile.exists()) return "No diagnostic log recorded yet.";
            try {
                FileInputStream input = new FileInputStream(logFile);
                byte[] bytes = new byte[(int) Math.min(logFile.length(), MAX_BYTES)];
                int count = input.read(bytes);
                input.close();
                return new String(bytes, 0, Math.max(0, count), StandardCharsets.UTF_8);
            } catch (Exception error) {
                return "Could not read diagnostic log: " + error.getMessage();
            }
        }
    }

    public static void uploadToServer(Context context, UploadCallback callback) {
        if (!uploadInProgress.compareAndSet(false, true)) return;
        new Thread(() -> {
            HttpURLConnection connection = null;
            String result = null;
            try {
                ApplicationInfo appInfo = context.getPackageManager().getApplicationInfo(context.getPackageName(), PackageManager.GET_META_DATA);
                String token = appInfo.metaData == null ? "" : appInfo.metaData.getString("co.techinn.miningsight.bridge.LOG_TOKEN", "");
                if (token.isEmpty() || token.contains("NOT_SET")) throw new IllegalStateException("Server log-upload token is not configured in this build.");
                SharedPreferences prefs = context.getSharedPreferences("miningsight_bridge", Context.MODE_PRIVATE);
                String deviceId = prefs.getString("bridge_log_device_id", null);
                if (deviceId == null) {
                    deviceId = UUID.randomUUID().toString().replace("-", "");
                    prefs.edit().putString("bridge_log_device_id", deviceId).apply();
                }
                JSONObject payload = new JSONObject();
                payload.put("deviceId", deviceId);
                payload.put("appVersion", context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName);
                payload.put("logs", read());
                byte[] json = payload.toString().getBytes(StandardCharsets.UTF_8);
                URL endpoint = new URL("https://tunnelsight.applications.co.zw/api/bridge/logs");
                android.net.ConnectivityManager manager = (android.net.ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
                android.net.Network internetNetwork = null;
                if (manager != null) for (android.net.Network network : manager.getAllNetworks()) {
                    android.net.NetworkCapabilities caps = manager.getNetworkCapabilities(network);
                    if (caps != null && caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
                            && caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                        internetNetwork = network;
                        if (caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR)) break;
                    }
                }
                connection = (HttpURLConnection) (internetNetwork == null ? endpoint.openConnection() : internetNetwork.openConnection(endpoint));
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(5000);
                connection.setReadTimeout(5000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setRequestProperty("Content-Encoding", "gzip");
                connection.setRequestProperty("X-Bridge-Log-Token", token);
                try (OutputStream output = new GZIPOutputStream(connection.getOutputStream())) { output.write(json); }
                int status = connection.getResponseCode();
                if (status >= 200 && status < 300) result = "Server log sync is active · last sent " + new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date());
                else if (status == 429) result = "Server sync rate limited · next automatic attempt in 10 seconds";
                else if (status == 401) throw new IllegalStateException("Server rejected the log-upload token (HTTP 401).");
                else throw new IllegalStateException("Server log upload returned HTTP " + status + ".");
            } catch (Exception error) {
                long now = System.currentTimeMillis();
                if (now - lastUploadErrorAt > 60000) {
                    lastUploadErrorAt = now;
                    warn("ServerLogs", "Upload failed: " + error.getMessage());
                }
                result = "Server log sync unavailable · " + error.getMessage();
            } finally {
                if (connection != null) connection.disconnect();
                uploadInProgress.set(false);
            }
            if (callback != null && result != null) {
                String message = result;
                new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> callback.onResult(message));
            }
        }, "MiningSight-log-upload").start();
    }

    public static void clear() {
        synchronized (LOCK) {
            if (logFile != null && logFile.exists()) logFile.delete();
        }
        info("BridgeLog", "Diagnostic log cleared");
    }

    public static void copyToClipboard(Context context) {
        ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText("MiningSight bridge diagnostics", read()));
    }
}
