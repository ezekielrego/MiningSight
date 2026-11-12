package co.techinn.miningsight.bridge;

import android.content.Context;

import com.pedro.common.ConnectChecker;
import com.pedro.common.StreamingStatsReport;
import com.pedro.library.rtmp.RtmpStream;
import com.pedro.encoder.input.sources.video.Camera2Source;
import com.pedro.encoder.input.video.CameraCallbacks;
import com.pedro.encoder.input.video.CameraHelper;
import android.view.TextureView;

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

    private final RtmpStream camera;
    private final Listener listener;
    private final TextureView preview;
    private boolean videoPrepared;
    private boolean audioPrepared;
    private boolean firstFrame;
    private boolean released;
    private boolean stopping;
    private boolean landscape;

    PhoneCameraStreamer(Context context, TextureView preview, Listener listener) {
        this.listener = listener;
        this.preview = preview;
        this.camera = new RtmpStream(context, this);
        ((Camera2Source) camera.getVideoSource()).setCameraCallback(new CameraCallbacks() {
            @Override public void onCameraChanged(CameraHelper.Facing facing) {
                BridgeLog.info("Phone", "Camera lens: " + facing);
            }
            @Override public void onCameraOpened() { BridgeLog.info("Phone", "Android camera device opened"); }
            @Override public void onCameraDisconnected() { BridgeLog.warn("Phone", "Android camera disconnected"); }
            @Override public void onCameraError(String error) {
                BridgeLog.warn("Phone", "Android camera error: " + error);
                if (listener != null) listener.onPhoneStreamError("Camera error: " + error);
            }
        });
    }

    PhoneCameraStreamer(RtmpStream camera, TextureView preview, Listener listener) {
        this.listener = listener;
        this.preview = preview;
        this.camera = camera;
    }

    private boolean prepareVideo() {
        if (released) return false;
        if (videoPrepared) return true;
        try {
            if (camera.isOnPreview() || camera.isStreaming()) return false;
            videoPrepared = camera.prepareVideo(1280, 720, 1_500_000, 30, 2, landscape ? 0 : 90);
            if (!videoPrepared && listener != null) listener.onPhoneStreamError("The camera does not support the requested video settings.");
            return videoPrepared;
        } catch (Throwable error) {
            BridgeLog.error("Phone", "Camera preparation failed", error);
            if (listener != null) listener.onPhoneStreamError("Camera preparation failed: " + error.getMessage());
            return false;
        }
    }

    void startPreview() {
        if (released || camera.isOnPreview() || !preview.isAvailable()
                || preview.getWidth() <= 0 || preview.getHeight() <= 0) return;
        try {
            if (!prepareVideo()) return;
            firstFrame = false;
            camera.startPreview(preview);
            BridgeLog.info("Phone", "Camera preview start requested; preview=" + camera.isOnPreview());
            if (listener != null) listener.onPhoneStreamStatus("Opening camera · waiting for first image…");
            preview.postDelayed(() -> {
                if (!released && camera.isOnPreview() && !firstFrame && listener != null)
                    listener.onPhoneStreamError("Camera opened but no preview image arrived. Tap the camera switch to retry another lens.");
            }, 10000);
        } catch (Throwable error) {
            stopPreview();
            BridgeLog.error("Phone", "Camera preview failed", error);
            if (listener != null) listener.onPhoneStreamError("Camera preview failed: " + error.getMessage());
        }
    }

    void startStream(String url) {
        if (released || camera.isStreaming()) return;
        try {
            if (!prepareVideo()) return;
            if (!audioPrepared) {
                audioPrepared = camera.prepareAudio(44100, false, 64000);
                if (!audioPrepared) throw new IllegalStateException("Microphone encoder preparation failed");
            }
            startPreview();
            BridgeLog.info("Phone", "Starting handset camera stream to configured RTMP endpoint");
            camera.startStream(normalizePublishUrl(url));
            if (listener != null) listener.onPhoneStreamStatus("Connecting phone camera to TunnelSight…");
        } catch (Throwable error) {
            if (camera.isStreaming()) stopStream();
            BridgeLog.error("Phone", "Phone stream start failed", error);
            if (listener != null) listener.onPhoneStreamError("Phone stream could not start: " + error.getMessage());
        }
    }

    void stopStream() {
        try {
            if (camera.isStreaming()) {
                stopping = true;
                boolean restored = camera.stopStream();
                videoPrepared = restored;
                audioPrepared = restored;
                if (!restored) stopPreview();
                stopping = false;
            }
            if (listener != null) listener.onPhoneStreamStatus("Phone stream stopped.");
        } catch (Throwable error) {
            BridgeLog.error("Phone", "Phone stream stop failed", error);
        }
    }

    void switchCamera() {
        try {
            ((Camera2Source) camera.getVideoSource()).switchCamera();
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
            camera.release();
            released = true;
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
        preview.post(() -> {
            if (released) return;
            stopStream();
            if (listener != null) listener.onPhoneStreamError("Phone stream connection failed: " + reason);
        });
    }

    @Override public void onDisconnect() {
        BridgeLog.info("Phone", "RTMP connection disconnected");
        if (!stopping && listener != null) listener.onPhoneStreamStatus("Phone stream disconnected.");
    }

    @Override public void onAuthError() {
        BridgeLog.warn("Phone", "RTMP authentication failed");
        onConnectionFailed("Relay authentication failed. Link your TunnelSight account again from the menu.");
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

    void stopPreview() {
        if (released) return;
        try {
            if (camera.isOnPreview()) camera.stopPreview();
            firstFrame = false;
        } catch (Throwable error) { BridgeLog.error("Phone", "Preview cleanup failed", error); }
    }

    void resizePreview(int width, int height) {
        if (!released && camera.isOnPreview()) camera.getGlInterface().setPreviewResolution(width, height);
    }

    void setLandscape(boolean landscape) {
        if (this.landscape == landscape || released) return;
        if (camera.isStreaming()) stopStream();
        stopPreview();
        this.landscape = landscape;
        videoPrepared = false;
        audioPrepared = false;
        BridgeLog.info("Phone", "Capture orientation=" + (landscape ? "landscape 1280x720" : "portrait 720x1280"));
        startPreview();
    }

    void onPreviewFrame() {
        if (firstFrame || released) return;
        firstFrame = true;
        BridgeLog.info("Phone", "First camera image rendered in local preview");
        if (!camera.isStreaming() && listener != null) listener.onPhoneStreamStatus("Camera image ready · tap ▶ to stream");
    }

    static String normalizePublishUrl(String url) throws Exception {
        java.net.URI uri = java.net.URI.create(url);
        if (uri.getUserInfo() == null) return url;
        String[] credentials = uri.getUserInfo().split(":", 2);
        String base = new java.net.URI(uri.getScheme(), null, uri.getHost(), uri.getPort(),
                uri.getPath(), uri.getQuery(), null).toASCIIString();
        return base + (uri.getQuery() == null ? "?" : "&") + "user="
                + java.net.URLEncoder.encode(credentials[0], "UTF-8") + "&pass="
                + java.net.URLEncoder.encode(credentials.length > 1 ? credentials[1] : "", "UTF-8");
    }
}
