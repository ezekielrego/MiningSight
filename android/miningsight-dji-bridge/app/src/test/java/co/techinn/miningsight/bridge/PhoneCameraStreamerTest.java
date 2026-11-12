package co.techinn.miningsight.bridge;

import android.view.TextureView;
import com.pedro.library.rtmp.RtmpStream;
import org.junit.Before;
import org.junit.Test;
import static org.mockito.Mockito.*;
import static org.junit.Assert.*;

public class PhoneCameraStreamerTest {
    private RtmpStream camera;
    private TextureView preview;
    private PhoneCameraStreamer stream;
    private PhoneCameraStreamer.Listener listener;
    private boolean previewing;
    private boolean streaming;

    @Before public void setup() {
        camera = mock(RtmpStream.class);
        preview = mock(TextureView.class);
        listener = mock(PhoneCameraStreamer.Listener.class);
        when(preview.isAvailable()).thenReturn(true);
        when(preview.getWidth()).thenReturn(720);
        when(preview.getHeight()).thenReturn(1280);
        when(camera.isOnPreview()).thenAnswer(i -> previewing);
        when(camera.isStreaming()).thenAnswer(i -> streaming);
        when(camera.prepareVideo(1280, 720, 1500000, 30, 2, 90)).thenAnswer(i -> {
            assertFalse("prepareVideo called while previewing", previewing);
            assertFalse("prepareVideo called while streaming", streaming);
            return true;
        });
        when(camera.prepareAudio(44100, false, 64000)).thenReturn(true);
        doAnswer(i -> { previewing = true; return null; }).when(camera).startPreview(preview);
        doAnswer(i -> { previewing = false; return null; }).when(camera).stopPreview();
        doAnswer(i -> { streaming = true; return null; }).when(camera).startStream(anyString());
        when(camera.stopStream()).thenAnswer(i -> { streaming = false; return true; });
        when(preview.post(any())).thenAnswer(i -> { ((Runnable)i.getArgument(0)).run(); return true; });
        stream = new PhoneCameraStreamer(camera, preview, listener);
    }

    @Test public void repeatedSurfaceEventsPrepareOnlyOnce() {
        stream.startPreview(); stream.startPreview(); stream.startPreview();
        verify(camera, times(1)).prepareVideo(1280, 720, 1500000, 30, 2, 90);
        verify(camera, times(1)).startPreview(preview);
        verify(camera, never()).prepareAudio(anyInt(), anyBoolean(), anyInt());
    }

    @Test public void previewThenStreamUsesPreparedVideoAndCorrectAudio() {
        stream.startPreview(); stream.startStream("rtmp://example/live/test");
        stream.startStream("rtmp://example/live/test");
        verify(camera, times(1)).prepareVideo(1280, 720, 1500000, 30, 2, 90);
        verify(camera, times(1)).prepareAudio(44100, false, 64000);
        verify(camera, times(1)).startStream(anyString());
    }

    @Test public void stopAndRestartPreservesLibraryPreparedEncoders() {
        stream.startPreview(); stream.startStream("rtmp://example/live/test");
        stream.stopStream(); stream.startStream("rtmp://example/live/test");
        verify(camera, times(1)).prepareVideo(1280, 720, 1500000, 30, 2, 90);
        verify(camera, times(2)).startStream(anyString());
    }

    @Test public void unavailableSurfaceWaitsWithoutOpeningCamera() {
        when(preview.isAvailable()).thenReturn(false);
        stream.startPreview();
        verify(camera, never()).startPreview(preview);
        verify(camera, never()).prepareVideo(anyInt(), anyInt(), anyInt(), anyInt(), anyInt(), anyInt());
    }

    @Test public void failedConnectionStopsAndAllowsRetry() {
        stream.startPreview(); stream.startStream("rtmp://example/live/test");
        stream.onConnectionFailed("network unavailable");
        assertFalse(stream.isStreaming());
        stream.startStream("rtmp://example/live/test");
        verify(camera, times(2)).startStream(anyString());
    }

    @Test public void previewReadyRequiresRenderedFrame() {
        stream.startPreview();
        verify(listener, never()).onPhoneStreamStatus("Camera image ready · tap ▶ to stream");
        stream.onPreviewFrame(); stream.onPreviewFrame();
        verify(listener, times(1)).onPhoneStreamStatus("Camera image ready · tap ▶ to stream");
    }

    @Test public void legacyCredentialsBecomeRelayQueryParameters() throws Exception {
        assertEquals("rtmp://example:1935/dji/test?user=bridge&pass=secret",
                PhoneCameraStreamer.normalizePublishUrl("rtmp://bridge:secret@example:1935/dji/test"));
    }
}
