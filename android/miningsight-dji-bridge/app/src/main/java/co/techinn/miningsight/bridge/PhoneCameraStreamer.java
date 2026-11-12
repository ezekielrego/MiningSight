package co.techinn.miningsight.bridge;

import android.content.Context;

import com.pedro.common.ConnectChecker;
import com.pedro.common.StreamingStatsReport;
import com.pedro.library.rtmp.RtmpCamera2;
import com.pedro.library.view.OpenGlView;

/**
 * Direct handset camera source. RootEncoder handles camera2 preview, H.264/AAC
 * encoding and RTMP publishing; this class keeps that lifecycle small and
 * reports useful state back to the bridge activity.
 */
final class PhoneCameraStreamer implements ConnectChecker {
    interface Listener {
        void onPhoneStreamStatus(String status);
        void onPhoneStreamError(String message);
    }

    private final RtmpCamera2 camera;
    private final Listener listener;

    PhoneCameraStreamer(Context context, OpenGlView preview, Listener listener) {
        this.listener = listener;
        this.camera = new RtmpCamera2(preview, this);
    }

    boolean prepare() {
        try {
            boolean video = camera.prepareVideo(1280, 720, 30, 1_500_000, 2, 0);
            boolean audio = camera.prepareAudio(64 * 1024, 32_000, true);
            if ((!video || !audio) && listener != null) listener.onPhoneStreamError("The phone camera or microphone could not be prepared.");
            return video && audio;
        } catch (Throwable error) {
            BridgeLog.error("Phone", "Camera preparation failed", error);
            if (listener != null) listener.onPhoneStreamError("Camera preparation failed: " + error.getMessage());
            return false;
        }
    }

    void startPreview() {
        try {
            if (!prepare()) return;
            if (!camera.isOnPreview()) camera.startPreview();
            BridgeLog.info("Phone", "Camera preview start requested; preview=" + camera.isOnPreview());
            if (listener != null) listener.onPhoneStreamStatus("Phone camera preview ready.");
        } catch (Throwable error) {
            BridgeLog.error("Phone", "Camera preview failed", error);
            if (listener != null) listener.onPhoneStreamError("Camera preview failed: " + error.getMessage());
        }
    }

    void startStream(String url) {
        try {
            // Preview setup may reset the encoder. Prepare again immediately before publishing.
            if (!prepare()) return;
            if (!camera.isOnPreview()) camera.startPreview();
            BridgeLog.info("Phone", "Starting handset camera stream to configured RTMP endpoint");
            camera.startStream(url);
            if (listener != null) listener.onPhoneStreamStatus("Connecting phone camera to TunnelSight…");
        } catch (Throwable error) {
            BridgeLog.error("Phone", "Phone stream start failed", error);
            if (listener != null) listener.onPhoneStreamError("Phone stream could not start: " + error.getMessage());
        }
    }

    void stopStream() {
        try {
            if (camera.isStreaming()) camera.stopStream();
            if (listener != null) listener.onPhoneStreamStatus("Phone stream stopped.");
        } catch (Throwable error) {
            BridgeLog.error("Phone", "Phone stream stop failed", error);
        }
    }

    void switchCamera() {
        try {
            camera.switchCamera();
            if (listener != null) listener.onPhoneStreamStatus("Phone camera switched.");
        } catch (Throwable error) {
            BridgeLog.error("Phone", "Camera switch failed", error);
            if (listener != null) listener.onPhoneStreamError("Camera switch failed: " + error.getMessage());
        }
    }

    boolean isStreaming() {
        return camera.isStreaming();
    }

    void release() {
        try {
            if (camera.isStreaming()) camera.stopStream();
            if (camera.isOnPreview()) camera.stopCamera();
        } catch (Throwable error) {
            BridgeLog.warn("Phone", "Camera release failed: " + error.getMessage());
        }
    }

    @Override public void onConnectionStarted(String url) {
        BridgeLog.info("Phone", "RTMP connection started");
        if (listener != null) listener.onPhoneStreamStatus("Connecting phone camera to TunnelSight…");
    }

    @Override public void onConnectionSuccess() {
        BridgeLog.info("Phone", "RTMP connection succeeded");
        if (listener != null) listener.onPhoneStreamStatus("LIVE · phone camera publishing to MiningSight");
    }

    @Override public void onConnectionFailed(String reason) {
        BridgeLog.warn("Phone", "RTMP connection failed: " + reason);
        if (listener != null) listener.onPhoneStreamError("Phone stream connection failed: " + reason);
    }

    @Override public void onDisconnect() {
        BridgeLog.info("Phone", "RTMP connection disconnected");
        if (listener != null) listener.onPhoneStreamStatus("Phone stream disconnected.");
    }

    @Override public void onAuthError() {
        BridgeLog.warn("Phone", "RTMP authentication failed");
        if (listener != null) listener.onPhoneStreamError("RTMP authentication failed. Check the publish URL.");
    }

    @Override public void onAuthSuccess() {
        BridgeLog.info("Phone", "RTMP authentication succeeded");
    }

    @Override public void onNewBitrate(long bitrate) {
        BridgeLog.info("Phone", "RTMP bitrate=" + bitrate);
    }

    @Override public void onStreamingStats(StreamingStatsReport report) {
        // Keep diagnostics lightweight; the web viewer remains the monitoring surface.
    }
}
