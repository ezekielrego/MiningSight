import React, { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Camera, Circle, LoaderCircle, Pause, Play, Radio, RefreshCw, Square, Volume2, VolumeX, X } from 'lucide-react';

type StreamState = 'connecting' | 'waiting' | 'live' | 'error';

interface LiveStreamViewerProps {
  onClose: () => void;
  onCapture: (dataUrl: string, name: string) => void;
  onSaveFile?: (file: File) => void | Promise<void>;
  sourceUrl?: string;
}

const DEFAULT_SOURCE = '/dji/live/index.m3u8';

export const LiveStreamViewer: React.FC<LiveStreamViewerProps> = ({ onClose, onCapture, onSaveFile, sourceUrl = DEFAULT_SOURCE }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingDrawTimerRef = useRef<number | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const closeAfterRecordingRef = useRef(false);
  const [isSavingRecording, setIsSavingRecording] = useState(false);
  const [unsavedRecording, setUnsavedRecording] = useState<File | null>(null);
  const hasRenderedFrameRef = useRef(false);
  const userPausedRef = useRef(false);
  const [retryToken, setRetryToken] = useState(0);
  const [streamState, setStreamState] = useState<StreamState>('connecting');
  const [message, setVisibleMessage] = useState('Connecting to the live relay…');
  const noticeRef = useRef({ current: 'Connecting to the live relay…', pending: '', shownAt: 0, timer: null as ReturnType<typeof setTimeout> | null });
  const setMessage = useCallback((text: string) => {
    const notice = noticeRef.current;
    notice.pending = text === notice.current ? '' : text;
    if (!notice.pending || notice.timer) return;
    const showLatest = () => {
      notice.timer = null;
      if (!notice.pending) return;
      notice.current = notice.pending;
      notice.pending = '';
      notice.shownAt = Date.now();
      setVisibleMessage(notice.current);
    };
    const remaining = 30000 - (Date.now() - notice.shownAt);
    if (remaining <= 0) showLatest();
    else notice.timer = setTimeout(showLatest, remaining);
  }, []);
  const releaseRecording = useCallback(() => {
    if (recordingDrawTimerRef.current !== null) window.clearInterval(recordingDrawTimerRef.current);
    recordingDrawTimerRef.current = null;
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  }, []);
  useEffect(() => () => {
    if (noticeRef.current.timer) clearTimeout(noticeRef.current.timer);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    releaseRecording();
  }, [releaseRecording]);
  const [hasRenderedFrame, setHasRenderedFrame] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setStreamState('connecting');
    setMessage('Connecting to the live relay…');
    hasRenderedFrameRef.current = false;
    setHasRenderedFrame(false);
    setIsRecovering(false);
    setIsPaused(false);
    userPausedRef.current = false;
    video.muted = true;
    const onPlaying = () => {
      hasRenderedFrameRef.current = true;
      setHasRenderedFrame(true);
      setIsRecovering(false);
      setStreamState('live');
      if (!recorderRef.current) setMessage('Live feed');
      setIsPaused(false);
    };
    const onWaiting = () => {
      if (hasRenderedFrameRef.current) {
        setIsRecovering(true);
        setMessage('Connection recovering…');
        return;
      }
      setStreamState('waiting');
      setMessage('Waiting for the bridge to publish video…');
    };
    const onError = () => {
      if (hasRenderedFrameRef.current) {
        setIsRecovering(true);
        setMessage('Connection recovering…');
        return;
      }
      setStreamState('waiting');
      setMessage('Waiting for the bridge to publish video…');
    };
    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('error', onError);

    let hls: Hls | null = null;
    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        liveSyncDuration: 1.2,
        liveMaxLatencyDuration: 3.5,
        liveSyncOnStallIncrease: 0.1,
        maxLiveSyncPlaybackRate: 1.1,
        maxBufferLength: 3,
        maxMaxBufferLength: 5,
        backBufferLength: 2,
        maxBufferHole: 0.3,
      });
      hlsRef.current = hls;
      hls.attachMedia(video);
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls?.loadSource(sourceUrl));
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!hasRenderedFrameRef.current) {
          setStreamState('waiting');
          setMessage('Relay reached. Waiting for the bridge to publish video…');
        }
        void video.play().catch(() => setMessage('Tap Play when the live feed is available.'));
      });
      const catchUp = () => {
        if (userPausedRef.current || video.paused) return;
        const livePosition = hls?.liveSyncPosition;
        if (hasRenderedFrameRef.current && livePosition !== null && livePosition !== undefined
            && Number.isFinite(livePosition) && livePosition - video.currentTime > 2.3) {
          video.currentTime = livePosition;
          setIsRecovering(false);
          if (!recorderRef.current) setMessage('Live feed');
        }
      };
      hls.on(Hls.Events.LEVEL_UPDATED, catchUp);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (hasRenderedFrameRef.current) {
            setIsRecovering(true);
            setMessage('Connection recovering…');
          } else {
            setStreamState('waiting');
            setMessage('Waiting for the bridge stream. Retrying automatically…');
          }
          hls?.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && hasRenderedFrameRef.current) {
          setIsRecovering(true);
          setMessage('Connection recovering…');
          hls?.recoverMediaError();
          return;
        }
        setStreamState('error');
        setMessage('The browser could not decode this stream. Retry the connection or check the bridge output.');
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = sourceUrl;
      video.load();
      void video.play().catch(() => undefined);
    } else {
      setStreamState('error');
      setMessage('This browser cannot play HLS live video. Open TunnelSight in a current browser.');
    }

    const keepNearLive = () => {
      if (userPausedRef.current || video.paused || !hasRenderedFrameRef.current || !video.seekable.length) return;
      const edge = video.seekable.end(video.seekable.length - 1);
      const target = hls?.liveSyncPosition ?? Math.max(video.seekable.start(video.seekable.length - 1), edge - 1.2);
      if (Number.isFinite(target) && edge - video.currentTime > 3.5 && target - video.currentTime > 1) video.currentTime = target;
    };
    const liveTimer = window.setInterval(keepNearLive, 1000);
    const onVisible = () => { if (!document.hidden) keepNearLive(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(liveTimer);
      document.removeEventListener('visibilitychange', onVisible);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('error', onError);
      hls?.destroy();
      if (hlsRef.current === hls) hlsRef.current = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [sourceUrl, retryToken]);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      userPausedRef.current = false;
      const edge = video.seekable.length ? video.seekable.end(video.seekable.length - 1) : null;
      const target = hlsRef.current?.liveSyncPosition ?? (edge !== null ? Math.max(0, edge - 1.2) : null);
      if (target !== null && Number.isFinite(target)) video.currentTime = target;
      void video.play().then(() => setIsPaused(false)).catch(() => undefined);
    }
    else {
      userPausedRef.current = true;
      video.pause();
      setIsPaused(true);
    }
  }, []);

  const goLive = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    userPausedRef.current = false;
    const target = hlsRef.current?.liveSyncPosition ?? (video.seekable.length ? Math.max(video.seekable.start(video.seekable.length - 1), video.seekable.end(video.seekable.length - 1) - 1.2) : null);
    if (target !== null && Number.isFinite(target)) video.currentTime = target;
    void video.play().then(() => setIsPaused(false)).catch(() => undefined);
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      setMessage('A camera frame is not available yet. Wait for the live picture, then capture again.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setMessage('Could not prepare the frame for capture.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const filename = `DJI-live-frame-${timestamp}.jpg`;
    onCapture(dataUrl, filename);
    void fetch(dataUrl).then((response) => response.blob()).then(async (blob) => {
      if (!onSaveFile) throw new Error('Choose a project before saving captures.');
      await onSaveFile(new File([blob], filename, { type: 'image/jpeg' }));
      setMessage('Frame saved to this project.');
    }).catch((error) => setMessage(`Frame could not be saved: ${error.message}`));
  }, [onCapture, onSaveFile]);

  const toggleRecording = useCallback(() => {
    const video = videoRef.current;
    if (!video || isSavingRecording) return;
    if (recorderRef.current) {
      if (recorderRef.current.state === 'recording') recorderRef.current.stop();
      return;
    }
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      setMessage('Wait for a live picture before recording.');
      return;
    }
    if (typeof HTMLCanvasElement.prototype.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      setMessage('This browser cannot record the live playback. Use Capture frame instead.');
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not prepare the recording surface.');
      const draw = () => {
        if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
        const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
        const width = video.videoWidth * scale, height = video.videoHeight * scale;
        context.fillStyle = '#000';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      };
      draw();
      const stream = canvas.captureStream(30);
      recordingStreamRef.current = stream;
      recordingDrawTimerRef.current = window.setInterval(draw, 1000 / 30);
      const mimeType = ['video/webm;codecs=vp8', 'video/webm', 'video/webm;codecs=vp9'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 3000000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { setMessage('Recording was interrupted. Saving the available video.'); if (recorder.state !== 'inactive') recorder.stop(); };
      recorder.onstop = async () => {
        releaseRecording();
        const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
        recorderRef.current = null;
        setIsRecording(false);
        if (!blob.size) { setMessage('No video data was captured. Wait for a live picture and try again.'); return; }
        const file = new File([blob], `TunnelSight-live-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`, { type: blob.type });
        setIsSavingRecording(true);
        try {
          if (!onSaveFile) throw new Error('Choose a project before saving recordings.');
          await onSaveFile(file);
          setMessage(`Recording saved (${(blob.size / (1024 * 1024)).toFixed(1)} MB).`);
          if (closeAfterRecordingRef.current) onClose();
        } catch (error) {
          setUnsavedRecording(file);
          closeAfterRecordingRef.current = false;
          setMessage('Recording upload failed. Download your recording below; retry the upload from Objects.');
        } finally { setIsSavingRecording(false); }
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setIsRecording(true);
      setUnsavedRecording(null);
      setMessage('Recording live playback. Stop to save the WebM file to this project.');
    } catch (error) {
      releaseRecording();
      setMessage(error instanceof Error ? `Recording could not start: ${error.message}` : 'Recording could not start.');
    }
  }, [onSaveFile, onClose, isSavingRecording, releaseRecording, setMessage]);

  const closeViewer = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      closeAfterRecordingRef.current = true;
      recorderRef.current.stop();
      return;
    }
    if (isSavingRecording) return;
    onClose();
  }, [onClose, isSavingRecording]);

  return (
    <section data-media-stage className="absolute inset-x-0 top-7 bottom-0 z-[40] flex min-h-0 flex-col overflow-hidden border-t border-[#343434] bg-[#111] text-[#ddd]">
      <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#202020] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Radio className="h-4 w-4 shrink-0 text-[#e88724]" />
          <span className="truncate text-[10px] font-bold uppercase tracking-wide">TunnelSight live stream</span>
          <span className={`flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[8px] font-bold ${hasRenderedFrame ? 'bg-red-600/90 text-white' : 'bg-[#3b3b3b] text-[#bbb]'}`}>
            {hasRenderedFrame ? <><span className={`h-1.5 w-1.5 rounded-full bg-white ${isRecovering ? 'animate-pulse' : ''}`} />LIVE</> : streamState.toUpperCase()}
          </span>
        </div>
        <button onClick={closeViewer} title="Close live view" className="rounded-sm p-1 text-[#aaa] hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <video ref={videoRef} autoPlay muted playsInline preload="auto" className="absolute inset-0 h-full w-full bg-black object-contain" />
        {!hasRenderedFrame && streamState !== 'live' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35 p-4">
            <div className="max-w-sm text-center">
              {streamState === 'connecting' ? <LoaderCircle className="mx-auto mb-2 h-6 w-6 animate-spin text-[#e88724]" /> : <Radio className="mx-auto mb-2 h-6 w-6 text-[#e88724]" />}
              <p className="text-[11px] font-semibold text-white">{streamState === 'waiting' ? 'Stream not live yet' : streamState === 'error' ? 'Live playback unavailable' : 'Connecting to live view'}</p>
              <p className="mt-1 text-[10px] text-[#aaa]">{message}</p>
            </div>
          </div>
        )}
      </div>

      <footer className="flex min-h-10 shrink-0 items-center justify-between gap-2 border-t border-white/10 bg-[#202020] px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <button onClick={togglePlayback} title={isPaused ? 'Play live feed' : 'Pause live feed'} className="rounded-sm p-1.5 text-[#ddd] hover:bg-white/10">
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <button onClick={() => { const video = videoRef.current; if (video) { video.muted = !video.muted; setIsMuted(video.muted); } }} title={isMuted ? 'Unmute' : 'Mute'} className="rounded-sm p-1.5 text-[#bbb] hover:bg-white/10">
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <span data-live-notice className="truncate text-[9px] text-[#999]">{message}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={goLive} disabled={!hasRenderedFrame} title="Jump to the latest available live video" className="px-2 py-1 text-[9px] text-[#e88724] hover:text-white disabled:opacity-40">Go live</button>
          <button onClick={() => setRetryToken((value) => value + 1)} className="flex items-center gap-1 rounded-sm px-2 py-1 text-[9px] text-[#ccc] hover:bg-white/10">
            <RefreshCw className="h-3 w-3" />Retry
          </button>
          {unsavedRecording && <button onClick={() => { const url = URL.createObjectURL(unsavedRecording); const a = document.createElement('a'); a.href = url; a.download = unsavedRecording.name; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }} className="text-[9px] text-[#ffb347]">Download recording</button>}
          <button onClick={toggleRecording} disabled={isSavingRecording || (!hasRenderedFrame && !isRecording)} className={`flex items-center gap-1 rounded-sm px-2 py-1 text-[9px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${isRecording ? 'bg-red-700 text-white' : 'border border-white/15 text-[#ddd] hover:bg-white/10'}`}>
            {isRecording ? <Square className="h-3 w-3 fill-current" /> : <Circle className="h-3 w-3 text-red-400" />}{isSavingRecording ? 'Saving…' : isRecording ? 'Stop & save' : 'Record'}
          </button>
          <button onClick={captureFrame} disabled={!hasRenderedFrame} className="flex items-center gap-1 rounded-sm bg-[#e88724] px-2 py-1 text-[9px] font-bold text-black hover:bg-[#f0a44e] disabled:cursor-not-allowed disabled:opacity-40">
            <Camera className="h-3 w-3" />Capture frame
          </button>
        </div>
      </footer>
    </section>
  );
};
