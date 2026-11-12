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
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.TextureView;
import android.graphics.SurfaceTexture;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
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
    private static final int REQUEST_PHONE_CAMERA = 43;
    private static final String PREFS = "miningsight_bridge";
    private static final String STREAM_URL = "stream_url";
    private static final String LINKED_EMAIL = "linked_email";
    private static final String LINKED_STREAM_URL = "linked_stream_url";
    private static final String DEFAULT_STREAM_URL = "rtmp://5.189.146.229:1935/dji/live";

    private final ExecutorService streamExecutor = Executors.newSingleThreadExecutor();
    private TextView statusText;
    private TextView networkText;
    private TextView serverLogText;
    private EditText streamUrlInput;
    private Button startButton;
    private Button stopButton;
    private PrimaryVideoPreview videoPreview;
    private Button djiNavButton;
    private Button phoneNavButton;
    private ScrollView djiPanel;
    private FrameLayout phonePanel;
    private EditText phoneStreamUrlInput;
    private Button phoneStartButton;
    private Button phoneStopButton;
    private TextView phoneStatusText;
    private TextureView phonePreview;
    private PhoneCameraStreamer phoneStreamer;
    private EditText accountEmailInput;
    private Button linkAccountButton;
    private TextView accountLinkStatus;
    private View drawerView;
    private Button drawerToggle;
    private View drawerScrim;
    private String linkedStreamUrl = "";
    private boolean phoneMode;
    private volatile boolean registered;
    private volatile boolean registrationPending;
    private final ExecutorService registrationExecutor = Executors.newSingleThreadExecutor();
    private volatile boolean productConnected;
    private boolean connectionStarted;
    private android.net.ConnectivityManager.NetworkCallback controllerNetworkCallback;
    private boolean connectionRetryPending;
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
        linkedStreamUrl = prefs.getString(LINKED_STREAM_URL, "");
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
        watchControllerWifi();
        requestRuntimePermissions();
    }

    private void buildUi(SharedPreferences prefs) {
        int padding = dp(18);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(23, 23, 23));

        FrameLayout panelHost = new FrameLayout(this);
        root.addView(panelHost, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        drawerScrim = new View(this);
        drawerScrim.setBackgroundColor(Color.argb(150, 0, 0, 0));
        drawerScrim.setVisibility(View.GONE);
        root.addView(drawerScrim, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        LinearLayout sideNav = new LinearLayout(this);
        drawerView = sideNav;
        sideNav.setOrientation(LinearLayout.VERTICAL);
        sideNav.setPadding(dp(8), dp(16), dp(8), dp(16));
        sideNav.setBackgroundColor(Color.rgb(31, 31, 31));
        FrameLayout.LayoutParams drawerParams = new FrameLayout.LayoutParams(dp(286), FrameLayout.LayoutParams.MATCH_PARENT);
        drawerParams.gravity = android.view.Gravity.START;
        sideNav.setVisibility(View.GONE);
        root.addView(sideNav, drawerParams);

        drawerToggle = navButton("☰");
        drawerToggle.setTextSize(22);
        drawerToggle.setTextColor(Color.WHITE);
        drawerToggle.setBackgroundColor(Color.argb(180, 25, 25, 25));
        FrameLayout.LayoutParams toggleParams = new FrameLayout.LayoutParams(dp(52), dp(52));
        toggleParams.gravity = android.view.Gravity.TOP | android.view.Gravity.START;
        toggleParams.setMargins(dp(12), dp(18), 0, 0);
        root.addView(drawerToggle, toggleParams);

        TextView navTitle = text("STREAM\nSOURCES", 11, Color.rgb(246, 210, 167));
        navTitle.setGravity(android.view.Gravity.CENTER);
        sideNav.addView(navTitle, marginParams(42, 0, 0, 18));

        TextView accountLabel = text("LINK TUNNELSIGHT ACCOUNT", 10, Color.LTGRAY);
        sideNav.addView(accountLabel, marginParams(6, 0, 6, 5));
        accountEmailInput = new EditText(this);
        accountEmailInput.setSingleLine(true);
        accountEmailInput.setText(prefs.getString(LINKED_EMAIL, ""));
        accountEmailInput.setHint("your email");
        accountEmailInput.setTextColor(Color.WHITE);
        accountEmailInput.setHintTextColor(Color.GRAY);
        accountEmailInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        sideNav.addView(accountEmailInput, marginParams(4, 0, 4, 6));
        linkAccountButton = button("Link stream account");
        linkAccountButton.setAllCaps(false);
        sideNav.addView(linkAccountButton, marginParams(4, 0, 4, 4));
        accountLinkStatus = text(linkedStreamUrl.isEmpty() ? "Not linked yet" : "Linked account ready", 10, linkedStreamUrl.isEmpty() ? Color.LTGRAY : Color.rgb(155, 220, 170));
        sideNav.addView(accountLinkStatus, marginParams(6, 0, 6, 16));

        djiNavButton = navButton("DJI\nBridge");
        phoneNavButton = navButton("Phone\nCamera");
        sideNav.addView(djiNavButton, marginParams(0, 0, 0, 8));
        sideNav.addView(phoneNavButton, marginParams(0, 0, 0, 8));
        TextView navNote = text("One source at a time\n\nBoth modes publish to the selected RTMP endpoint and appear in the TunnelSight live viewer.", 10, Color.GRAY);
        navNote.setGravity(android.view.Gravity.CENTER);
        sideNav.addView(navNote, marginParams(4, 18, 4, 0));

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(padding, padding, padding, padding);
        content.setBackgroundColor(Color.rgb(23, 23, 23));

        TextView title = text("DJI controller bridge", 22, Color.rgb(246, 210, 167));
        content.addView(title, matchWrap());

        TextView subtitle = text("Phantom camera → VPS → MiningSight website", 14, Color.LTGRAY);
        content.addView(subtitle, marginParams(0, 6, 0, 16));

        videoPreview = new PrimaryVideoPreview(this);
        videoPreview.setBackgroundColor(Color.BLACK);
        content.addView(videoPreview, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(220)));

        streamUrlInput = new EditText(this);
        streamUrlInput.setSingleLine(true);
        String savedStreamUrl = prefs.getString(STREAM_URL, DEFAULT_STREAM_URL);
        String migratedStreamUrl = savedStreamUrl.replace("stream.tunnelsight.applications.co.zw", "5.189.146.229");
        if (!migratedStreamUrl.equals(savedStreamUrl)) prefs.edit().putString(STREAM_URL, migratedStreamUrl).apply();
        streamUrlInput.setText(linkedStreamUrl.isEmpty() ? migratedStreamUrl : linkedStreamUrl);
        streamUrlInput.setHint("RTMP publish URL");
        streamUrlInput.setTextColor(Color.WHITE);
        streamUrlInput.setHintTextColor(Color.GRAY);
        streamUrlInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        LinearLayout detailsContent = new LinearLayout(this);
        detailsContent.setOrientation(LinearLayout.VERTICAL);
        detailsContent.setPadding(dp(12), dp(12), dp(12), dp(12));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        startButton = floatingButton("▶", "Start DJI stream");
        stopButton = floatingButton("■", "Stop DJI stream");
        stopButton.setEnabled(false);

        statusText = text("Waiting for DJI SDK registration…", 14, Color.WHITE);
        statusText.setGravity(android.view.Gravity.CENTER_VERTICAL);
        statusText.setPadding(dp(14), 0, dp(14), 0);
        statusText.setBackgroundColor(Color.argb(155, 0, 0, 0));

        networkText = text("Checking Wi-Fi and permissions…", 12, Color.LTGRAY);
        networkText.setGravity(android.view.Gravity.CENTER);
        networkText.setPadding(dp(10), 0, dp(10), 0);
        networkText.setBackgroundColor(Color.argb(135, 0, 0, 0));

        TextView note = text("Phantom 3 Standard setup: power on the controller and aircraft and wait for the controller link light to go solid green. Connect this phone to PHANTOM3 Wi-Fi. For the bridge test, force-stop DJI GO first, then tap Connect / retry DJI. Open TunnelSight on another device to watch the stream.", 12, Color.GRAY);
        detailsContent.addView(note, marginParams(0, 12, 0, 0));

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
        detailsContent.addView(diagnostics, marginParams(0, 16, 0, 0));
        serverLogText = text("Server log sync is starting…", 11, Color.LTGRAY);
        detailsContent.addView(serverLogText, marginParams(0, 6, 0, 0));
        detailsContent.addView(reconnect, marginParams(0, 8, 0, 0));
        detailsContent.addView(checkWifi, marginParams(0, 6, 0, 0));

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
        reconnect.setOnClickListener(v -> { if (!registered) requestRuntimePermissions(); else connectToProduct("manual reconnect"); });
        checkWifi.setOnClickListener(v -> { refreshNetworkDiagnostics("manual check"); if (!hasDjiConnectionPermissions()) requestRuntimePermissions(); });

        djiPanel = new ScrollView(this);
        djiPanel.setFillViewport(true);
        djiPanel.setBackgroundColor(Color.rgb(23, 23, 23));

        TextView djiTopBar = text("DJI BRIDGE  ·  TUNNELSIGHT", 11, Color.WHITE);
        djiTopBar.setGravity(android.view.Gravity.CENTER_VERTICAL);
        djiTopBar.setPadding(dp(64), 0, dp(12), 0);
        djiTopBar.setBackgroundColor(Color.argb(175, 0, 0, 0));
        content.addView(djiTopBar, 0, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48)));

        content.addView(statusText, marginParams(0, 10, 0, 0));

        content.addView(networkText, marginParams(0, 8, 0, 0));

        actions.setGravity(android.view.Gravity.CENTER);
        actions.setPadding(dp(10), dp(8), dp(10), dp(10));
        actions.setBackgroundColor(Color.argb(175, 0, 0, 0));
        Button connectFloating = floatingButton("⟳", "Connect or retry DJI controller");
        Button detailsButton = floatingButton("☷", "Open bridge diagnostics");
        actions.addView(connectFloating, weightParams(1, 5));
        actions.addView(startButton, weightParams(1, 5));
        actions.addView(stopButton, weightParams(1, 5));
        actions.addView(detailsButton, weightParams(1, 5));
        content.addView(actions, marginParams(0, 10, 0, 0));

        ScrollView detailsPanel = new ScrollView(this);
        detailsPanel.setFillViewport(true);
        detailsPanel.setBackgroundColor(Color.argb(238, 23, 23, 23));
        detailsPanel.setVisibility(View.GONE);
        detailsPanel.addView(detailsContent);
        content.addView(detailsPanel, marginParams(0, 8, 0, 0));
        connectFloating.setOnClickListener(v -> reconnect.performClick());
        detailsButton.setOnClickListener(v -> {
            boolean visible = detailsPanel.getVisibility() == View.VISIBLE;
            detailsPanel.setVisibility(visible ? View.GONE : View.VISIBLE);
            detailsButton.setText(visible ? "☷" : "×");
        });
        djiPanel.addView(content);
        panelHost.addView(djiPanel, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        phonePanel = buildPhonePanel(prefs);
        panelHost.addView(phonePanel, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        phonePanel.setVisibility(View.GONE);

        djiNavButton.setOnClickListener(v -> selectMode(false));
        phoneNavButton.setOnClickListener(v -> selectMode(true));
        linkAccountButton.setOnClickListener(v -> linkStreamAccount());
        drawerToggle.setOnClickListener(v -> toggleDrawer());
        drawerScrim.setOnClickListener(v -> closeDrawer());
        setContentView(root);
        selectMode(false);
        diagnosticHandler.postDelayed(serverLogSyncTask, 1200);
    }

    private FrameLayout buildPhonePanel(SharedPreferences prefs) {
        FrameLayout screen = new FrameLayout(this);
        screen.setBackgroundColor(Color.BLACK);

        phonePreview = new TextureView(this);
        phonePreview.setKeepScreenOn(true);
        phonePreview.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
            @Override public void onSurfaceTextureAvailable(SurfaceTexture surface, int width, int height) {
                if (phoneMode) ensurePhonePreview();
            }
            @Override public void onSurfaceTextureSizeChanged(SurfaceTexture surface, int width, int height) {
                if (phoneStreamer != null) phoneStreamer.resizePreview(width, height);
            }
            @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture surface) {
                if (phoneStreamer != null) phoneStreamer.stopPreview();
                return true;
            }
            @Override public void onSurfaceTextureUpdated(SurfaceTexture surface) {
                if (phoneStreamer != null) phoneStreamer.onPreviewFrame();
            }
        });
        screen.addView(phonePreview, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        TextView topBar = text("PHONE CAMERA  ·  TUNNELSIGHT", 11, Color.WHITE);
        topBar.setGravity(android.view.Gravity.CENTER_VERTICAL);
        topBar.setPadding(dp(64), 0, dp(12), 0);
        topBar.setBackgroundColor(Color.argb(175, 0, 0, 0));
        FrameLayout.LayoutParams topParams = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, dp(48));
        topParams.gravity = android.view.Gravity.TOP;
        screen.addView(topBar, topParams);

        phoneStatusText = text("Camera permission is required before preview starts.", 11, Color.WHITE);
        phoneStatusText.setGravity(android.view.Gravity.CENTER);
        phoneStatusText.setPadding(dp(12), 0, dp(12), 0);
        phoneStatusText.setBackgroundColor(Color.argb(145, 0, 0, 0));
        FrameLayout.LayoutParams statusParams = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, dp(38));
        statusParams.gravity = android.view.Gravity.TOP;
        statusParams.setMargins(0, dp(48), 0, 0);
        screen.addView(phoneStatusText, statusParams);

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.HORIZONTAL);
        controls.setGravity(android.view.Gravity.CENTER);
        controls.setPadding(dp(10), dp(8), dp(10), dp(10));
        controls.setBackgroundColor(Color.argb(175, 0, 0, 0));
        phoneStartButton = floatingButton("▶", "Start phone stream");
        phoneStopButton = floatingButton("■", "Stop stream");
        Button switchCamera = floatingButton("↺", "Switch front / back camera");
        Button orientation = floatingButton("▭", "Switch portrait or landscape capture");
        orientation.setTextSize(13);
        orientation.setText("Portrait");
        orientation.setOnClickListener(v -> {
            boolean landscape = !"Landscape".contentEquals(orientation.getText());
            if (phoneStreamer != null) phoneStreamer.setLandscape(landscape);
            orientation.setText(landscape ? "Landscape" : "Portrait");
            setRequestedOrientation(landscape ? android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                    : android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        });
        phoneStopButton.setEnabled(false);
        controls.addView(phoneStartButton, weightParams(1, 5));
        controls.addView(phoneStopButton, weightParams(1, 5));
        controls.addView(switchCamera, weightParams(1, 5));
        controls.addView(orientation, weightParams(1, 5));
        FrameLayout.LayoutParams controlParams = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, dp(76));
        controlParams.gravity = android.view.Gravity.BOTTOM;
        screen.addView(controls, controlParams);

        phoneStreamUrlInput = new EditText(this);
        phoneStreamUrlInput.setSingleLine(true);
        phoneStreamUrlInput.setText(linkedStreamUrl.isEmpty() ? prefs.getString(STREAM_URL, DEFAULT_STREAM_URL) : linkedStreamUrl);
        phoneStreamUrlInput.setVisibility(View.GONE);

        phoneStreamer = new PhoneCameraStreamer(this, phonePreview, new PhoneCameraStreamer.Listener() {
            @Override public void onPhoneStreamStatus(String status) {
                runOnUiThread(() -> {
                    if (phoneStatusText != null) phoneStatusText.setText(status);
                    boolean streaming = phoneStreamer != null && phoneStreamer.isStreaming();
                    if (phoneStartButton != null) phoneStartButton.setEnabled(!streaming);
                    if (phoneStopButton != null) phoneStopButton.setEnabled(streaming);
                });
            }

            @Override public void onPhoneStreamError(String message) {
                BridgeLog.warn("Phone", message);
                runOnUiThread(() -> {
                    if (phoneStatusText != null) phoneStatusText.setText(message);
                    if (phoneStartButton != null) phoneStartButton.setEnabled(true);
                    if (phoneStopButton != null) phoneStopButton.setEnabled(false);
                });
            }
        });

        phoneStartButton.setOnClickListener(v -> startPhoneStream());
        phoneStopButton.setOnClickListener(v -> stopPhoneStream());
        switchCamera.setOnClickListener(v -> {
            if (phoneStreamer != null) phoneStreamer.switchCamera();
        });
        return screen;
    }

    private void selectMode(boolean usePhone) {
        phoneMode = usePhone;
        if (drawerToggle != null) {
            FrameLayout.LayoutParams toggleParams = (FrameLayout.LayoutParams) drawerToggle.getLayoutParams();
            toggleParams.topMargin = usePhone ? 0 : dp(18);
            drawerToggle.setLayoutParams(toggleParams);
        }
        closeDrawer();
        if (djiPanel != null) djiPanel.setVisibility(usePhone ? View.GONE : View.VISIBLE);
        if (phonePanel != null) phonePanel.setVisibility(usePhone ? View.VISIBLE : View.GONE);
        if (djiNavButton != null) setNavSelected(djiNavButton, !usePhone);
        if (phoneNavButton != null) setNavSelected(phoneNavButton, usePhone);
        if (usePhone) {
            releaseControllerRoute();
            if (isDjiStreaming()) stopStream();
            if (hasPhoneCameraPermission()) ensurePhonePreview();
            else requestPhoneCameraPermission();
            setStatus("Phone camera mode selected.");
            if (phonePreview != null) phonePreview.postDelayed(this::ensurePhonePreview, 250);
        } else {
            if (phoneStreamer != null && phoneStreamer.isStreaming()) stopPhoneStream();
            if (phoneStreamer != null) phoneStreamer.stopPreview();
            refreshNetworkDiagnostics("DJI mode selected");
            setStatus(registered ? "DJI mode ready. Connect to the Phantom controller when available." : "Waiting for DJI SDK registration…");
        }
    }

    private void startPhoneStream() {
        if (linkedStreamUrl.isEmpty()) {
            if (phoneStatusText != null) phoneStatusText.setText("Link a TunnelSight account from the ☰ menu before streaming.");
            openDrawer();
            return;
        }
        if (!hasPhoneCameraPermission()) {
            requestPhoneCameraPermission();
            return;
        }
        if (phoneStreamer == null || phoneStreamUrlInput == null) return;
        String url = linkedStreamUrl;
        if (url.isEmpty() || !url.startsWith("rtmp://")) {
            if (phoneStatusText != null) phoneStatusText.setText("Enter an RTMP publish URL.");
            return;
        }
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(STREAM_URL, url).apply();
        ensurePhonePreview();
        phoneStreamer.startStream(url);
        BridgeLog.info("Phone", "Phone camera stream requested");
    }

    private void stopPhoneStream() {
        if (phoneStreamer != null) phoneStreamer.stopStream();
        if (phoneStartButton != null) phoneStartButton.setEnabled(true);
        if (phoneStopButton != null) phoneStopButton.setEnabled(false);
    }

    private void ensurePhonePreview() {
        if (phoneStreamer == null || !hasPhoneCameraPermission()) return;
        if (phonePreview != null && !phonePreview.isShown()) return;
        phoneStreamer.startPreview();
    }

    private void linkStreamAccount() {
        String email = accountEmailInput == null ? "" : accountEmailInput.getText().toString().trim().toLowerCase(java.util.Locale.US);
        if (!android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
            if (accountLinkStatus != null) accountLinkStatus.setText("Enter a valid email address.");
            return;
        }
        if (linkAccountButton != null) {
            linkAccountButton.setEnabled(false);
            linkAccountButton.setText("Linking…");
        }
        if (accountLinkStatus != null) accountLinkStatus.setText("Creating your private stream link…");
        BridgeLog.linkAccount(this, email, (success, message, publishUrl) -> runOnUiThread(() -> {
            if (linkAccountButton != null) {
                linkAccountButton.setEnabled(true);
                linkAccountButton.setText("Link stream account");
            }
            if (success && publishUrl != null && !publishUrl.isEmpty()) {
                linkedStreamUrl = publishUrl;
                getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                        .putString(LINKED_EMAIL, email)
                        .putString(LINKED_STREAM_URL, publishUrl)
                        .putString(STREAM_URL, publishUrl)
                        .apply();
                if (streamUrlInput != null) streamUrlInput.setText(publishUrl);
                if (phoneStreamUrlInput != null) phoneStreamUrlInput.setText(publishUrl);
                if (accountLinkStatus != null) accountLinkStatus.setText("Linked · streams will appear under " + email);
                if (phoneStatusText != null) phoneStatusText.setText("Account linked. Camera is ready when you press ▶.");
            } else if (accountLinkStatus != null) {
                accountLinkStatus.setText(message == null ? "Could not link account." : message);
            }
        }));
    }

    private void toggleDrawer() {
        if (sideDrawerOpen()) closeDrawer(); else openDrawer();
    }

    private boolean sideDrawerOpen() {
        return drawerScrim != null && drawerScrim.getVisibility() == View.VISIBLE;
    }

    private void openDrawer() {
        if (drawerScrim != null) drawerScrim.setVisibility(View.VISIBLE);
        if (drawerToggle != null) drawerToggle.setText("×");
        if (drawerScrim != null) drawerScrim.bringToFront();
        if (drawerView != null) drawerView.setVisibility(View.VISIBLE);
        if (drawerView != null) drawerView.bringToFront();
        if (drawerToggle != null) drawerToggle.bringToFront();
        if (accountEmailInput != null) accountEmailInput.requestFocus();
    }

    private void closeDrawer() {
        if (drawerScrim != null) drawerScrim.setVisibility(View.GONE);
        if (drawerView != null) drawerView.setVisibility(View.GONE);
        if (drawerToggle != null) drawerToggle.setText("☰");
        if (drawerToggle != null) drawerToggle.bringToFront();
    }

    private boolean hasPhoneCameraPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestPhoneCameraPermission() {
        java.util.ArrayList<String> needed = new java.util.ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) needed.add(Manifest.permission.CAMERA);
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) needed.add(Manifest.permission.RECORD_AUDIO);
        if (needed.isEmpty()) ensurePhonePreview();
        else {
            if (phoneStatusText != null) phoneStatusText.setText("Allow camera and microphone access to use phone streaming.");
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), REQUEST_PHONE_CAMERA);
        }
    }

    private boolean isDjiStreaming() {
        try {
            LiveStreamManager manager = DJISDKManager.getInstance().getLiveStreamManager();
            return manager != null && manager.isStreaming();
        } catch (Throwable ignored) {
            return false;
        }
    }

    private Button navButton(String label) {
        Button button = button(label);
        button.setAllCaps(false);
        button.setTextSize(12);
        button.setMinHeight(dp(54));
        return button;
    }

    private Button floatingButton(String label, String description) {
        Button button = navButton(label);
        button.setContentDescription(description);
        button.setTextSize(20);
        button.setTextColor(Color.WHITE);
        button.setBackgroundColor(Color.argb(185, 35, 35, 35));
        button.setMinHeight(dp(52));
        return button;
    }

    private void setNavSelected(Button button, boolean selected) {
        button.setTextColor(selected ? Color.rgb(23, 23, 23) : Color.LTGRAY);
        button.setBackgroundColor(selected ? Color.rgb(246, 210, 167) : Color.rgb(50, 50, 50));
    }

    private void registerDjiSdk() {
        if (registered || registrationPending) return;
        registrationPending = true;
        setStatus("Registering DJI SDK…");
        BridgeLog.info("DJI", "Registering DJI SDK");
        DJISDKManager.getInstance().setCallbackRunInUIThread(true);
        diagnosticHandler.postDelayed(() -> {
            if (registrationPending && !registered) {
                BridgeLog.warn("DJI", "Registration has not completed after 45 seconds; check internet access");
                setStatus("DJI registration is still waiting. Connect to internet Wi-Fi or working mobile data; diagnostics continue syncing.");
            }
        }, 45000);
        registrationExecutor.execute(() -> {
        try {
        android.net.ConnectivityManager internet = (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        android.net.Network registrationNetwork = null;
        for (android.net.Network network : internet.getAllNetworks()) {
            android.net.NetworkCapabilities caps = internet.getNetworkCapabilities(network);
            if (caps != null && caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                    && caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
                registrationNetwork = network;
                if (caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR)) break;
            }
        }
        internet.bindProcessToNetwork(registrationNetwork);
        BridgeLog.info("DJI", "Registration internet route=" + registrationNetwork);
        DJISDKManager.getInstance().registerApp(getApplicationContext(), new DJISDKManager.SDKManagerCallback() {
            @Override
            public void onRegister(DJIError error) {
                releaseControllerRoute();
                registrationPending = false;
                registered = error == DJISDKError.REGISTRATION_SUCCESS;
                if (registered) {
                    BridgeLog.info("DJI", "SDK registration succeeded");
                    setStatus("SDK registered. Starting the Phantom Wi-Fi connection…");
                    diagnosticHandler.post(() -> connectToProduct("SDK registration callback"));
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
                productConnected = product != null && product.isConnected();
                if (productConnected) {
                    setStatus("DJI product connected.");
                    attachPrimaryVideoFeed();
                }
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
                BridgeLog.info("DJIInit", String.valueOf(event) + " progress=" + progress);
                setStatus("Preparing DJI SDK… " + progress + "%");
            }

            @Override
            public void onDatabaseDownloadProgress(long current, long total) {
                if (total > 0) setStatus("Preparing DJI database… " + (current * 100 / total) + "%");
            }
        });
        } catch (Throwable error) {
            registrationPending = false;
            BridgeLog.error("DJI", "SDK registration invocation failed", error);
            setStatus("DJI registration failed to start: " + error.getMessage());
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
                needed.add(Manifest.permission.ACCESS_COARSE_LOCATION);
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
        if (productConnected) {
            setStatus("DJI product is already connected. Wait for the camera preview.");
            return;
        }
        if (connectionStarted) {
            BridgeLog.info("DJI", "Connection scan already active; ignoring duplicate request (" + reason + ")");
            setStatus("DJI connection scan is still active. Wait up to 15 seconds before retrying.");
            return;
        }
        startProductConnection(reason);
    }

    private void startProductConnection(String reason) {
        DJISDKManager sdkManager = DJISDKManager.getInstance();
        String ssid = currentSsid();
        if (phoneMode || connectionRetryPending) return;
        if (!hasConnectedWifi() || ssid == null || !ssid.toUpperCase(java.util.Locale.US).startsWith("PHANTOM")) {
            setStatus("SDK ready. Connect Android Wi-Fi to PHANTOM3, then tap ⟳. No extra password is required here.");
            return;
        }
        boolean access = DJISDKManager.shouldAllowAccessToSDK();
        BridgeLog.info("DJI", "SDK activation gate=" + access);
        if (!access) {
            registered = false;
            releaseControllerRoute();
            setStatus("DJI registration callback succeeded but SDK activation is not ready. Enable internet and tap ⟳ to register again.");
            return;
        }
        android.net.ConnectivityManager networks = (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        android.net.Network wifiNetwork = null;
        for (android.net.Network network : networks.getAllNetworks()) {
            android.net.NetworkCapabilities caps = networks.getNetworkCapabilities(network);
            if (caps != null && caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI)) wifiNetwork = network;
        }
        if (wifiNetwork == null || !networks.bindProcessToNetwork(wifiNetwork)) {
            setStatus("The Phantom Wi-Fi route is not available to this app yet. Reconnect Wi-Fi and tap ⟳.");
            return;
        }
        BridgeLog.info("DJI", "Bound discovery to Wi-Fi network " + wifiNetwork + "; routes=" + networks.getLinkProperties(wifiNetwork));
        connectionRetryPending = true;
        sdkManager.stopConnectionToProduct();
        diagnosticHandler.postDelayed(() -> {
        connectionRetryPending = false;
        if (phoneMode || productConnected) return;
        BridgeLog.info("DJI", "Starting product connection (" + reason + "); Wi-Fi="
                + (ssid == null ? "unknown" : ssid) + ", package=" + getPackageName()
                + ", sdk=" + sdkManager.getSDKVersion());
        try {
            sdkManager.setSupportOnlyForBluetoothDevice(false);
        } catch (Throwable error) {
            BridgeLog.warn("DJI", "Could not set Wi-Fi product mode explicitly: " + error.getMessage());
        }
        setStatus("Connecting to DJI controller over Wi-Fi…");
        boolean started = sdkManager.startConnectionToProduct();
        connectionStarted = started;
        BridgeLog.info("DJI", "startConnectionToProduct returned " + started);
        logProductState("immediate");
        diagnosticHandler.postDelayed(() -> logProductState("3 seconds"), 3000);
        diagnosticHandler.postDelayed(() -> logProductState("10 seconds"), 10000);
        diagnosticHandler.postDelayed(() -> logProductState("30 seconds"), 30000);
        if (!started) {
            setStatus("DJI did not start discovery on the Phantom Wi-Fi route. Diagnostics include activation and network state; tap ⟳ to retry.");
        } else {
            diagnosticHandler.postDelayed(() -> {
                if (connectionStarted && !productConnected) {
                    connectionStarted = false;
                    BridgeLog.warn("DJI", "No product callback after 15 seconds; retry is enabled");
                    setStatus("No DJI product detected yet. Verify DJI GO is force-stopped and the controller link light is solid green, then retry.");
                }
            }, 15000);
        }
        }, 700);
    }

    private void releaseControllerRoute() {
        android.net.ConnectivityManager networks = (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (networks != null) networks.bindProcessToNetwork(null);
    }

    private void watchControllerWifi() {
        android.net.ConnectivityManager networks = (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        controllerNetworkCallback = new android.net.ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(android.net.Network network) {
                diagnosticHandler.postDelayed(() -> {
                    if (registered && !phoneMode && !productConnected) connectToProduct("Wi-Fi became available");
                }, 1000);
            }
            @Override public void onLost(android.net.Network network) {
                diagnosticHandler.post(() -> {
                    connectionStarted = false;
                    releaseControllerRoute();
                    BridgeLog.warn("DJI", "Wi-Fi network lost: " + network);
                });
            }
        };
        networks.registerNetworkCallback(new android.net.NetworkRequest.Builder()
                .addTransportType(android.net.NetworkCapabilities.TRANSPORT_WIFI).build(), controllerNetworkCallback);
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

    private boolean hasConnectedWifi() {
        android.net.ConnectivityManager manager = (android.net.ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager != null) for (android.net.Network network : manager.getAllNetworks()) {
            android.net.NetworkCapabilities caps = manager.getNetworkCapabilities(network);
            if (caps != null && caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI)) return true;
        }
        WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        return wifi != null && wifi.getConnectionInfo() != null && wifi.getConnectionInfo().getIpAddress() != 0;
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
        if (linkedStreamUrl.isEmpty()) {
            setStatus("Link a TunnelSight account from the ☰ menu before streaming.");
            openDrawer();
            return;
        }
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
            releaseControllerRoute();
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
            needed.add(Manifest.permission.ACCESS_COARSE_LOCATION);
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
        else {
            BridgeLog.info("Permissions", "Requesting: " + needed);
            setStatus("Allow location, nearby Wi-Fi and phone permissions to initialize DJI. Tap Check Wi-Fi and permissions to retry.");
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), REQUEST_DJI_PERMISSIONS);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_PHONE_CAMERA) {
            if (hasPhoneCameraPermission()) {
                BridgeLog.info("Permissions", "Phone camera and microphone permissions granted");
                if (phoneStatusText != null) phoneStatusText.setText("Permissions ready. Starting camera preview…");
                ensurePhonePreview();
            } else if (phoneStatusText != null) {
                phoneStatusText.setText("Phone streaming needs camera and microphone permissions.");
            }
            return;
        }
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
        android.net.ConnectivityManager networks = (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (networks != null && controllerNetworkCallback != null) networks.unregisterNetworkCallback(controllerNetworkCallback);
        releaseControllerRoute();
        diagnosticHandler.removeCallbacksAndMessages(null);
        if (phoneStreamer != null) phoneStreamer.release();
        stopStream();
        if (videoPreview != null) videoPreview.detachFromPrimaryFeed();
        streamExecutor.shutdownNow();
        registrationExecutor.shutdown();
        super.onDestroy();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshNetworkDiagnostics("resume");
        if (phoneMode && phonePreview != null) phonePreview.post(this::ensurePhonePreview);
    }

    @Override protected void onPause() {
        if (phoneStreamer != null) {
            if (phoneStreamer.isStreaming()) stopPhoneStream();
            phoneStreamer.stopPreview();
        }
        super.onPause();
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
