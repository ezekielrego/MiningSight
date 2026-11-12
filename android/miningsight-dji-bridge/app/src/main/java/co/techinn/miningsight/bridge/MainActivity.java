package co.techinn.miningsight.bridge;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.wifi.WifiManager;
import android.net.wifi.WifiInfo;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import dji.common.error.DJIError;
import dji.common.error.DJISDKError;
import dji.sdk.base.BaseComponent;
import dji.sdk.base.BaseProduct;
import dji.sdk.camera.VideoFeeder;
import dji.sdk.sdkmanager.DJISDKInitEvent;
import dji.sdk.sdkmanager.DJISDKManager;
import dji.sdk.sdkmanager.LiveStreamManager;

/**
 * Small field transmitter: DJI controller connection in, RTMP stream out.
 * The website remains the viewer and frame-capture workspace.
 */
public class MainActivity extends Activity {
    private static final int REQUEST_LOCATION = 41;
    private static final int REQUEST_DJI_PERMISSIONS = 42;
    private static final String PREFS = "miningsight_bridge";
    private static final String STREAM_URL = "stream_url";
    private static final String DEFAULT_STREAM_URL = "rtmp://5.189.146.229:1935/dji/live";

    private final ExecutorService streamExecutor = Executors.newSingleThreadExecutor();
    private TextView statusText;
    private TextView networkText;
    private TextView serverLogText;
    private EditText streamUrlInput;
    private Button startButton;
    private Button stopButton;
    private PrimaryVideoPreview videoPreview;
    private boolean registered;
    private volatile boolean productConnected;
    private boolean connectionStarted;
    private final Handler diagnosticHandler = new Handler(Looper.getMainLooper());
    private final Runnable serverLogSyncTask = new Runnable() {
        @Override public void run() {
            BridgeLog.uploadToServer(MainActivity.this, message -> {
                if (serverLogText != null) serverLogText.setText(message);
            });
            diagnosticHandler.postDelayed(this, 10000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        buildUi(prefs);
        BridgeLog.info("MainActivity", "Activity created");
        try {
            BridgeLog.info("Build", "Bridge version=" + getPackageManager().getPackageInfo(getPackageName(), 0).versionName
                    + ", targetSdk=" + getApplicationInfo().targetSdkVersion
                    + ", Android=" + android.os.Build.VERSION.RELEASE
                    + ", device=" + android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL
                    + ", DJI SDK=" + DJISDKManager.getInstance().getSDKVersion());
        } catch (Exception error) {
            BridgeLog.warn("Build", "Could not read app/SDK version: " + error.getMessage());
        }
        refreshNetworkDiagnostics("app launch");
        requestRuntimePermissions();
    }

    private void buildUi(SharedPreferences prefs) {
        int padding = dp(18);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(padding, padding, padding, padding);
        content.setBackgroundColor(Color.rgb(23, 23, 23));

        TextView title = text("MiningSight DJI Bridge", 22, Color.rgb(246, 210, 167));
        content.addView(title, matchWrap());

        TextView subtitle = text("Phantom camera → VPS → MiningSight website", 14, Color.LTGRAY);
        content.addView(subtitle, marginParams(0, 6, 0, 16));

        videoPreview = new PrimaryVideoPreview(this);
        videoPreview.setBackgroundColor(Color.BLACK);
        content.addView(videoPreview, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(220)));

        streamUrlInput = new EditText(this);
        streamUrlInput.setSingleLine(true);
        String savedStreamUrl = prefs.getString(STREAM_URL, DEFAULT_STREAM_URL);
        String migratedStreamUrl = savedStreamUrl.replace("stream.tunnelsight.applications.co.zw", "5.189.146.229");
        if (!migratedStreamUrl.equals(savedStreamUrl)) prefs.edit().putString(STREAM_URL, migratedStreamUrl).apply();
        streamUrlInput.setText(migratedStreamUrl);
        streamUrlInput.setHint("RTMP publish URL");
        streamUrlInput.setTextColor(Color.WHITE);
        streamUrlInput.setHintTextColor(Color.GRAY);
        streamUrlInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        content.addView(streamUrlInput, marginParams(0, 0, 0, 10));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        startButton = button("Start stream");
        stopButton = button("Stop stream");
        stopButton.setEnabled(false);
        actions.addView(startButton, weightParams(1, 8));
        actions.addView(stopButton, weightParams(1, 8));
        content.addView(actions, matchWrap());

        statusText = text("Waiting for DJI SDK registration…", 14, Color.WHITE);
        content.addView(statusText, marginParams(0, 18, 0, 0));

        networkText = text("Checking Wi-Fi and permissions…", 12, Color.LTGRAY);
        content.addView(networkText, marginParams(0, 8, 0, 0));

        TextView note = text("Phantom 3 Standard setup: power on the controller and aircraft and wait for the controller link light to go solid green. Connect this phone to PHANTOM3 Wi-Fi. For the bridge test, force-stop DJI GO first, then tap Connect / retry DJI. Open TunnelSight on another device to watch the stream.", 12, Color.GRAY);
        content.addView(note, marginParams(0, 12, 0, 0));

        LinearLayout diagnostics = new LinearLayout(this);
        diagnostics.setOrientation(LinearLayout.HORIZONTAL);
        Button copyLogs = button("Copy diagnostics");
        Button clearLogs = button("Clear diagnostics");
        Button sendLogs = button("Sync logs now");
        Button reconnect = button("Connect / retry DJI");
        Button checkWifi = button("Check Wi-Fi and permissions");
        diagnostics.addView(copyLogs, weightParams(1, 8));
        diagnostics.addView(clearLogs, weightParams(1, 8));
        diagnostics.addView(sendLogs, weightParams(1, 8));
        content.addView(diagnostics, marginParams(0, 16, 0, 0));
        serverLogText = text("Server log sync is starting…", 11, Color.LTGRAY);
        content.addView(serverLogText, marginParams(0, 6, 0, 0));
        content.addView(reconnect, marginParams(0, 8, 0, 0));
        content.addView(checkWifi, marginParams(0, 6, 0, 0));

        startButton.setOnClickListener(v -> startStream());
        stopButton.setOnClickListener(v -> stopStream());
        copyLogs.setOnClickListener(v -> {
            BridgeLog.copyToClipboard(this);
            setStatus("Diagnostics copied to clipboard.");
        });
        clearLogs.setOnClickListener(v -> {
            BridgeLog.clear();
            setStatus("Temporary diagnostics cleared.");
        });
        sendLogs.setOnClickListener(v -> {
            if (serverLogText != null) serverLogText.setText("Sending diagnostics to TunnelSight…");
            BridgeLog.uploadToServer(this, message -> { if (serverLogText != null) serverLogText.setText(message); });
        });
        reconnect.setOnClickListener(v -> connectToProduct("manual reconnect"));
        checkWifi.setOnClickListener(v -> refreshNetworkDiagnostics("manual check"));

        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);
        setContentView(scroll);
        diagnosticHandler.postDelayed(serverLogSyncTask, 1200);
    }

    private void registerDjiSdk() {
        setStatus("Registering DJI SDK…");
        BridgeLog.info("DJI", "Registering DJI SDK");
        DJISDKManager.getInstance().registerApp(getApplicationContext(), new DJISDKManager.SDKManagerCallback() {
            @Override
            public void onRegister(DJIError error) {
                registered = error == DJISDKError.REGISTRATION_SUCCESS;
                if (registered) {
                    BridgeLog.info("DJI", "SDK registration succeeded");
                    setStatus("SDK registered. Power on and link the Phantom, connect to PHANTOM3 Wi-Fi, then tap Connect / retry DJI.");
                } else {
                    BridgeLog.warn("DJI", "SDK registration failed: " + (error == null ? "unknown error" : error.getDescription()));
                    setStatus("SDK registration failed: " + (error == null ? "unknown error" : error.getDescription()));
                }
            }

            @Override
            public void onProductDisconnect() {
                productConnected = false;
                connectionStarted = false;
                if (videoPreview != null) videoPreview.detachFromPrimaryFeed();
                BridgeLog.warn("DJI", "Controller disconnected");
                setStatus("Controller disconnected.");
            }

            @Override
            public void onProductConnect(BaseProduct product) {
                productConnected = product != null && product.isConnected();
                BridgeLog.info("DJI", "Controller connected");
                setStatus("Controller connected: " + (product == null || product.getModel() == null ? "DJI product" : product.getModel().getDisplayName()));
                attachPrimaryVideoFeed();
            }

            @Override
            public void onProductChanged(BaseProduct product) {
                BridgeLog.info("DJI", "Product changed: " + (product == null ? "null" : product.getModel()));
                if (product != null && product.isConnected()) setStatus("DJI product connected.");
            }

            @Override
            public void onComponentChange(BaseProduct.ComponentKey key, BaseComponent oldComponent, BaseComponent newComponent) {
                BridgeLog.info("DJI", "Component " + key.name() + " changed; ready=" + (newComponent != null));
                if (newComponent != null) {
                    setStatus("DJI component ready: " + key.name());
                    if (key.name().toLowerCase().contains("camera")) attachPrimaryVideoFeed();
                }
            }

            @Override
            public void onInitProcess(DJISDKInitEvent event, int progress) {
                setStatus("Preparing DJI SDK… " + progress + "%");
            }

            @Override
            public void onDatabaseDownloadProgress(long current, long total) {
                if (total > 0) setStatus("Preparing DJI database… " + (current * 100 / total) + "%");
            }
        });
    }

    private boolean hasDjiConnectionPermissions() {
        boolean locationGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean nearbyGranted = android.os.Build.VERSION.SDK_INT < 33
                || ContextCompat.checkSelfPermission(this, Manifest.permission.NEARBY_WIFI_DEVICES) == PackageManager.PERMISSION_GRANTED;
        boolean phoneStateGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED;
        BridgeLog.info("Permissions", "Location=" + locationGranted + ", nearbyWifi=" + nearbyGranted + ", phoneState=" + phoneStateGranted);
        return locationGranted && nearbyGranted && phoneStateGranted;
    }

    private void connectToProduct(String reason) {
        if (!registered) {
            setStatus("Waiting for DJI SDK registration…");
            return;
        }
        if (!hasDjiConnectionPermissions()) {
            java.util.ArrayList<String> needed = new java.util.ArrayList<>();
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                    && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.ACCESS_FINE_LOCATION);
            }
            if (android.os.Build.VERSION.SDK_INT >= 33
                    && ContextCompat.checkSelfPermission(this, Manifest.permission.NEARBY_WIFI_DEVICES) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.NEARBY_WIFI_DEVICES);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.READ_PHONE_STATE);
            }
            if (!needed.isEmpty()) ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), REQUEST_DJI_PERMISSIONS);
            setStatus("Allow location and nearby Wi-Fi access, then reconnect.");
            return;
        }
        refreshNetworkDiagnostics(reason);
        String ssid = currentSsid();
        if (ssid == null || "<unknown ssid>".equalsIgnoreCase(ssid)) {
            BridgeLog.warn("Wi-Fi", "No readable connected Wi-Fi SSID; connect to the Phantom controller Wi-Fi first");
            setStatus("Phone Wi-Fi is not available to the bridge. Join PHANTOM3 Wi-Fi, then tap Reconnect DJI.");
            return;
        }
        if (!ssid.toUpperCase().contains("PHANTOM3")) {
            BridgeLog.warn("Wi-Fi", "Connected Wi-Fi does not have the default Phantom 3 name (it may have been renamed): " + ssid);
        }
        if (productConnected) {
            setStatus("DJI product is already connected. Wait for the camera preview.");
            return;
        }
        if (connectionStarted) {
            BridgeLog.info("DJI", "Connection scan already active; ignoring duplicate request (" + reason + ")");
            setStatus("DJI connection scan is still active. Wait up to 15 seconds before retrying.");
            return;
        }
        BridgeLog.info("DJI", "Starting product connection (" + reason + "); Wi-Fi=" + ssid
                + ", package=" + getPackageName() + ", sdk=" + DJISDKManager.getInstance().getSDKVersion());
        setStatus("Connecting to DJI controller over " + ssid + "…");
        boolean started = DJISDKManager.getInstance().startConnectionToProduct();
        connectionStarted = started;
        BridgeLog.info("DJI", "startConnectionToProduct returned " + started);
        logProductState("immediate");
        diagnosticHandler.postDelayed(() -> logProductState("3 seconds"), 3000);
        diagnosticHandler.postDelayed(() -> logProductState("10 seconds"), 10000);
        diagnosticHandler.postDelayed(() -> logProductState("30 seconds"), 30000);
        if (!started) {
            setStatus("DJI rejected the connection start. Confirm DJI GO is force-stopped, the aircraft is linked to the controller, then tap Connect / retry DJI once.");
        } else {
            diagnosticHandler.postDelayed(() -> {
                if (connectionStarted && !productConnected) {
                    connectionStarted = false;
                    BridgeLog.warn("DJI", "No product callback after 15 seconds; retry is enabled");
                    setStatus("No DJI product detected yet. Verify DJI GO is force-stopped and the controller link light is solid green, then retry.");
                }
            }, 15000);
        }
    }

    private void logProductState(String elapsed) {
        try {
            BaseProduct product = DJISDKManager.getInstance().getProduct();
            String model = product == null || product.getModel() == null ? "none" : product.getModel().getDisplayName();
            boolean connected = product != null && product.isConnected();
            BridgeLog.info("DJI", "Product state " + elapsed + ": model=" + model + ", connected=" + connected);
            if (connected && !productConnected) {
                productConnected = true;
                setStatus("DJI product detected: " + model + ". Waiting for camera feed…");
                attachPrimaryVideoFeed();
            }
        } catch (Exception error) {
            BridgeLog.warn("DJI", "Could not read product state at " + elapsed + ": " + error.getMessage());
        }
    }

    private String currentSsid() {
        try {
            WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi != null && wifi.getConnectionInfo() != null) {
                String ssid = wifi.getConnectionInfo().getSSID();
                return ssid == null ? null : ssid.replace("\"", "").trim();
            }
        } catch (Exception error) {
            BridgeLog.warn("Wi-Fi", "Could not read connected Wi-Fi name: " + error.getMessage());
        }
        return null;
    }

    private void refreshNetworkDiagnostics(String reason) {
        boolean locationGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean nearbyGranted = android.os.Build.VERSION.SDK_INT < 33
                || ContextCompat.checkSelfPermission(this, Manifest.permission.NEARBY_WIFI_DEVICES) == PackageManager.PERMISSION_GRANTED;
        String ssid = currentSsid();
        String ip = "unknown";
        boolean wifiEnabled = false;
        try {
            WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi != null) {
                wifiEnabled = wifi.isWifiEnabled();
                WifiInfo info = wifi.getConnectionInfo();
                if (info != null && info.getIpAddress() != 0) {
                    int address = info.getIpAddress();
                    ip = (address & 0xff) + "." + ((address >> 8) & 0xff) + "." + ((address >> 16) & 0xff) + "." + ((address >> 24) & 0xff);
                }
            }
        } catch (Exception error) {
            BridgeLog.warn("Wi-Fi", "Network check failed: " + error.getMessage());
        }
        String displayedSsid = ssid == null || ssid.isEmpty() ? "not available" : ssid;
        String display = "Wi-Fi " + (wifiEnabled ? "ON" : "OFF") + " · " + displayedSsid + " · IP " + ip
                + "\nLocation permission " + (locationGranted ? "granted" : "missing")
                + " · Nearby Wi-Fi " + (nearbyGranted ? "granted" : "missing");
        BridgeLog.info("Wi-Fi", "Check (" + reason + "): enabled=" + wifiEnabled + ", ssid=" + displayedSsid + ", ip=" + ip
                + ", location=" + locationGranted + ", nearbyWifi=" + nearbyGranted);
        runOnUiThread(() -> { if (networkText != null) networkText.setText(display); });
    }

    private void startStream() {
        if (!registered) {
            BridgeLog.warn("Stream", "Start requested before SDK registration");
            setStatus("Wait for DJI SDK registration before starting the stream.");
            return;
        }
        if (!productConnected) {
            setStatus("Wait for the aircraft/controller connection before streaming.");
            return;
        }
        if (videoPreview == null || !videoPreview.hasReceivedFrame()) {
            setStatus("Waiting for live camera frames. Keep DJI GO closed and check the controller connection.");
            BridgeLog.warn("Stream", "Start blocked because no primary camera frame has reached the phone");
            return;
        }
        String url = streamUrlInput.getText().toString().trim();
        if (url.isEmpty() || !url.startsWith("rtmp://")) {
            BridgeLog.warn("Stream", "Invalid RTMP URL entered");
            setStatus("Enter an RTMP publish URL.");
            return;
        }
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(STREAM_URL, url).apply();
        setStatus("Starting live stream…");
        BridgeLog.info("Stream", "Starting stream to configured RTMP endpoint");
        streamExecutor.execute(() -> {
            LiveStreamManager manager = DJISDKManager.getInstance().getLiveStreamManager();
            if (manager == null) {
                BridgeLog.warn("Stream", "DJI live stream manager unavailable");
                setStatus("DJI live stream manager is unavailable for this product.");
                return;
            }
            manager.setLiveUrl(url);
            manager.setVideoEncodingEnabled(true);
            manager.setVideoSource(LiveStreamManager.LiveStreamVideoSource.Primary);
            manager.registerListener(status -> BridgeLog.info("Stream", "DJI stream status changed: " + status));
            manager.addLiveErrorStatusListener((errorCode, errorMessage) ->
                    BridgeLog.warn("Stream", "DJI live error " + errorCode + ": " + errorMessage));
            int result = manager.startStream();
            if (result == 0) {
                setStatus("LIVE · publishing H.264 to MiningSight VPS");
                runOnUiThread(() -> {
                    startButton.setEnabled(false);
                    stopButton.setEnabled(true);
                });
            } else {
                BridgeLog.warn("Stream", "Stream start failed with code " + result);
                setStatus("Stream start failed: code " + result);
            }
        });
    }

    private void attachPrimaryVideoFeed() {
        if (videoPreview == null || !productConnected) return;
        runOnUiThread(() -> {
            videoPreview.attachToPrimaryFeed();
            setStatus("Aircraft connected. Waiting for primary camera video…");
        });
    }

    private void stopStream() {
        BridgeLog.info("Stream", "Stopping stream");
        streamExecutor.execute(() -> {
            LiveStreamManager manager = DJISDKManager.getInstance().getLiveStreamManager();
            if (manager != null && manager.isStreaming()) manager.stopStream();
            setStatus("Stream stopped.");
            runOnUiThread(() -> {
                startButton.setEnabled(true);
                stopButton.setEnabled(false);
            });
        });
    }

    private void setStatus(String status) {
        runOnUiThread(() -> { if (statusText != null) statusText.setText(status); });
    }

    private void requestRuntimePermissions() {
        java.util.ArrayList<String> needed = new java.util.ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (android.os.Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(this, Manifest.permission.NEARBY_WIFI_DEVICES) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.NEARBY_WIFI_DEVICES);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.READ_PHONE_STATE);
        }
        if (needed.isEmpty()) registerDjiSdk();
        else ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), REQUEST_DJI_PERMISSIONS);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_DJI_PERMISSIONS || requestCode == REQUEST_LOCATION) {
            if (hasDjiConnectionPermissions()) {
                if (!registered) registerDjiSdk();
                else setStatus("Permissions ready. Confirm the Phantom is linked and DJI GO is force-stopped, then tap Connect / retry DJI.");
            }
            else setStatus("DJI needs location and nearby Wi-Fi permissions to find the controller.");
        }
    }

    @Override
    protected void onDestroy() {
        diagnosticHandler.removeCallbacksAndMessages(null);
        stopStream();
        if (videoPreview != null) videoPreview.detachFromPrimaryFeed();
        streamExecutor.shutdownNow();
        super.onDestroy();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshNetworkDiagnostics("resume");
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        return view;
    }

    private Button button(String label) {
        Button button = new Button(this);
        button.setText(label);
        return button;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams marginParams(int left, int top, int right, int bottom) {
        LinearLayout.LayoutParams params = matchWrap();
        params.setMargins(dp(left), dp(top), dp(right), dp(bottom));
        return params;
    }

    private LinearLayout.LayoutParams weightParams(float weight, int margin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, weight);
        params.setMargins(dp(margin), 0, dp(margin), 0);
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
