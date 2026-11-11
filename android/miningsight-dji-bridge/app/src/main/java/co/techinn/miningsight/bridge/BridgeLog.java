package co.techinn.miningsight.bridge;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Small temporary diagnostic log for the bridge itself. Android does not allow
 * ordinary apps to read global logcat, so ADB is still required for native
 * tombstones and system-level crashes.
 */
public final class BridgeLog {
    private static final String TAG = "MiningSightBridge";
    private static final String FILE_NAME = "bridge-diagnostics.log";
    private static final int MAX_BYTES = 256 * 1024;
    private static final Object LOCK = new Object();
    private static File logFile;

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
