import React, { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Camera, Circle, LoaderCircle, Pause, Play, Radio, RefreshCw, Square, Volume2, VolumeX, X } from 'lucide-react';

type StreamState = 'connecting' | 'waiting' | 'live' | 'error';

interface LiveStreamViewerProps {
  onClose: () => void;
  onCapture: (dataUrl: string, name: string) => void;
  onSaveFile?: (file: File) => void;
  sourceUrl?: string;
}

const DEFAULT_SOURCE = '/dji/live/index.m3u8';

export const LiveStreamViewer: React.FC<LiveStreamViewerProps> = ({ onClose, onCapture, onSaveFile, sourceUrl = DEFAULT_SOURCE }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const [retryToken, setRetryToken] = useState(0);
  const [streamState, setStreamState] = useState<StreamState>('connecting');
  const [message, setMessage] = useState('Connecting to the DJI live relay…');
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setStreamState('connecting');
    setMessage('Connecting to the live relay…');
    setIsPaused(false);
    video.muted = true;
    const onPlaying = () => {
      setStreamState('live');
      setMessage('Live camera feed');
      setIsPaused(false);
    };
    const onWaiting = () => {
      setStreamState('waiting');
      setMessage('Waiting for the bridge to publish video…');
    };
    const onError = () => {
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
        liveSyncDurationCount: 2,
        maxLiveSyncPlaybackRate: 1.2,
      });
      hlsRef.current = hls;
      hls.attachMedia(video);
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls?.loadSource(sourceUrl));
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStreamState('waiting');
        setMessage('Relay reached. Waiting for the bridge to publish video…');
        void video.play().catch(() => setMessage('Tap Play when the live feed is available.'));
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setStreamState('waiting');
          setMessage('Waiting for the bridge stream. Retrying automatically…');
          hls?.startLoad();
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

    return () => {
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
    if (video.paused) void video.play().then(() => setIsPaused(false)).catch(() => undefined);
    else {
      video.pause();
      setIsPaused(true);
    }
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
    void fetch(dataUrl).then((response) => response.blob()).then((blob) => onSaveFile?.(new File([blob], filename, { type: 'image/jpeg' })));
    setMessage('Frame sent to AI Survey and saved to this project.');
  }, [onCapture, onSaveFile]);

  const toggleRecording = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
      return;
    }
    const captureStream = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream;
    if (!captureStream || typeof MediaRecorder === 'undefined') {
      setMessage('This browser cannot record the live playback. Use Capture frame instead.');
      return;
    }
    try {
      const stream = captureStream.call(video);
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) recordingChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'video/webm' });
        recordingChunksRef.current = [];
        recorderRef.current = null;
        setIsRecording(false);
        if (!blob.size) { setMessage('No video data was captured. Wait for a live picture and try again.'); return; }
        const filename = `DJI-live-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
        onSaveFile?.(new File([blob], filename, { type: blob.type }));
        setMessage(`Recording saved to this project (${(blob.size / (1024 * 1024)).toFixed(1)} MB).`);
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setIsRecording(true);
      setMessage('Recording live playback. Stop to save the WebM file to this project.');
    } catch (error) {
      setMessage(error instanceof Error ? `Recording could not start: ${error.message}` : 'Recording could not start.');
    }
  }, [onSaveFile]);

  const closeViewer = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    onClose();
  }, [onClose]);

  return (
    <section className="absolute inset-x-0 top-7 bottom-0 z-[40] flex min-h-0 flex-col overflow-hidden border-t border-[#343434] bg-[#111] text-[#ddd]">
      <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#202020] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Radio className="h-4 w-4 shrink-0 text-[#e88724]" />
          <span className="truncate text-[10px] font-bold uppercase tracking-wide">TunnelSight live camera</span>
          <span className={`flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[8px] font-bold ${streamState === 'live' ? 'bg-red-600/90 text-white' : 'bg-[#3b3b3b] text-[#bbb]'}`}>
            {streamState === 'live' ? <><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />LIVE</> : streamState.toUpperCase()}
          </span>
        </div>
        <button onClick={closeViewer} title="Close live view" className="rounded-sm p-1 text-[#aaa] hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <video ref={videoRef} autoPlay muted playsInline preload="auto" className="absolute inset-0 h-full w-full bg-black object-contain" />
        {streamState !== 'live' && (
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
          <span className="truncate text-[9px] text-[#999]">{message}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={() => setRetryToken((value) => value + 1)} className="flex items-center gap-1 rounded-sm px-2 py-1 text-[9px] text-[#ccc] hover:bg-white/10">
            <RefreshCw className="h-3 w-3" />Retry
          </button>
          <button onClick={toggleRecording} disabled={streamState !== 'live' && !isRecording} className={`flex items-center gap-1 rounded-sm px-2 py-1 text-[9px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${isRecording ? 'bg-red-700 text-white' : 'border border-white/15 text-[#ddd] hover:bg-white/10'}`}>
            {isRecording ? <Square className="h-3 w-3 fill-current" /> : <Circle className="h-3 w-3 text-red-400" />}{isRecording ? 'Stop & save' : 'Record'}
          </button>
          <button onClick={captureFrame} disabled={streamState !== 'live'} className="flex items-center gap-1 rounded-sm bg-[#e88724] px-2 py-1 text-[9px] font-bold text-black hover:bg-[#f0a44e] disabled:cursor-not-allowed disabled:opacity-40">
            <Camera className="h-3 w-3" />Capture frame
          </button>
        </div>
      </footer>
    </section>
  );
};
