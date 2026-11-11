package co.techinn.miningsight.bridge;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
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
    private static final String PREFS = "miningsight_bridge";
    private static final String STREAM_URL = "stream_url";

    private final ExecutorService streamExecutor = Executors.newSingleThreadExecutor();
    private TextView statusText;
    private EditText streamUrlInput;
    private Button startButton;
    private Button stopButton;
    private PrimaryVideoPreview videoPreview;
    private boolean registered;
    private volatile boolean productConnected;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        buildUi(prefs);
        BridgeLog.info("MainActivity", "Activity created");
        requestRuntimePermissions();
        registerDjiSdk();
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
        streamUrlInput.setText(prefs.getString(STREAM_URL, "rtmp://stream.tunnelsight.applications.co.zw/dji/live"));
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

        TextView note = text("Activate the aircraft in DJI GO first. Keep this app connected to the controller while it publishes; the website will provide the viewer and frame capture.", 12, Color.GRAY);
        content.addView(note, marginParams(0, 12, 0, 0));

        LinearLayout diagnostics = new LinearLayout(this);
        diagnostics.setOrientation(LinearLayout.HORIZONTAL);
        Button copyLogs = button("Copy diagnostics");
        Button clearLogs = button("Clear diagnostics");
        diagnostics.addView(copyLogs, weightParams(1, 8));
        diagnostics.addView(clearLogs, weightParams(1, 8));
        content.addView(diagnostics, marginParams(0, 16, 0, 0));

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

        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);
        setContentView(scroll);
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
                    setStatus("SDK registered. Connecting to controller…");
                    DJISDKManager.getInstance().startConnectionToProduct();
                } else {
                    BridgeLog.warn("DJI", "SDK registration failed: " + (error == null ? "unknown error" : error.getDescription()));
                    setStatus("SDK registration failed: " + (error == null ? "unknown error" : error.getDescription()));
                }
            }

            @Override
            public void onProductDisconnect() {
                productConnected = false;
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
                if (product != null && product.isConnected()) setStatus("DJI product connected.");
            }

            @Override
            public void onComponentChange(BaseProduct.ComponentKey key, BaseComponent oldComponent, BaseComponent newComponent) {
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
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, REQUEST_LOCATION);
        }
    }

    @Override
    protected void onDestroy() {
        stopStream();
        if (videoPreview != null) videoPreview.detachFromPrimaryFeed();
        streamExecutor.shutdownNow();
        super.onDestroy();
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
