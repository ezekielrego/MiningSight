package co.techinn.miningsight.bridge;

import android.content.Context;
import android.view.SurfaceHolder;
import android.view.SurfaceView;

import dji.midware.usb.P3.UsbAccessoryService;
import dji.sdk.camera.VideoFeeder;
import dji.sdk.codec.DJICodecManager;

/** Renders the primary aircraft feed and reports when actual camera frames arrive. */
final class PrimaryVideoPreview extends SurfaceView implements SurfaceHolder.Callback {
    private DJICodecManager codecManager;
    private VideoFeeder.VideoDataListener videoDataListener;
    private volatile boolean receivedFrame;
    private boolean firstFrameLogged;

    PrimaryVideoPreview(Context context) {
        super(context);
        getHolder().addCallback(this);
    }

    boolean hasReceivedFrame() {
        return receivedFrame;
    }

    void attachToPrimaryFeed() {
        VideoFeeder.VideoFeed feed = VideoFeeder.getInstance().getPrimaryVideoFeed();
        if (feed == null) {
            BridgeLog.warn("Video", "Primary DJI video feed is not available yet");
            return;
        }
        if (videoDataListener == null) {
            videoDataListener = (videoBuffer, size) -> {
                if (size <= 0) return;
                receivedFrame = true;
                if (!firstFrameLogged) {
                    firstFrameLogged = true;
                    BridgeLog.info("Video", "First primary camera frame received (" + size + " bytes)");
                }
                DJICodecManager decoder = codecManager;
                if (decoder != null) {
                    decoder.sendDataToDecoder(videoBuffer, size, UsbAccessoryService.VideoStreamSource.Camera.getIndex());
                }
            };
        }
        if (!feed.getListeners().contains(videoDataListener)) {
            feed.addVideoDataListener(videoDataListener);
            BridgeLog.info("Video", "Registered primary camera feed listener");
        }
    }

    void detachFromPrimaryFeed() {
        VideoFeeder.VideoFeed feed = VideoFeeder.getInstance().getPrimaryVideoFeed();
        if (feed != null && videoDataListener != null) feed.removeVideoDataListener(videoDataListener);
        receivedFrame = false;
    }

    @Override public void surfaceCreated(SurfaceHolder holder) {
        if (codecManager == null) {
            codecManager = new DJICodecManager(getContext(), holder, getWidth(), getHeight(),
                    UsbAccessoryService.VideoStreamSource.Camera);
            BridgeLog.info("Video", "Primary camera decoder surface created");
        }
    }

    @Override public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {
        // The SDK codec manager tracks the SurfaceHolder dimensions itself.
    }

    @Override public void surfaceDestroyed(SurfaceHolder holder) {
        if (codecManager != null) {
            codecManager.cleanSurface();
            codecManager.destroyCodec();
            codecManager = null;
        }
    }
}
