import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, LockKeyhole, X } from 'lucide-react';

interface OnboardingGuideProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAuth: () => void;
}

interface OnboardingStep {
  eyebrow: string;
  title: string;
  description: string;
  location: string;
  tips: string[];
  target: string;
}

interface TargetRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const STEPS: OnboardingStep[] = [
  {
    eyebrow: 'Welcome to MiningSight',
    title: 'Your mine visualisation workspace',
    description: 'MiningSight is an interactive surface and subsurface review tool. It combines 3D mine scenes, project files, media, measurements, camera paths, markers, and AI-assisted reconstruction in one workstation.',
    location: 'This tour covers the main workspace',
    tips: ['You can reopen this tour at any time from Help → First-time Onboarding Tour.', 'The tour can be skipped now and does not change your project or viewer state.'],
    target: 'top-navigation',
  },
  {
    eyebrow: '1 · Start exploring',
    title: 'Sample models are already loaded for you',
    description: 'The default scene is a ready-to-use rugged timbered mine drift. Use the Scene or File menus to switch between the built-in photo-reference scene and the classic diorama scene before adding your own files.',
    location: 'Look at the centre 3D viewport and the File / Scene menus above it',
    tips: ['The sample models are available without signing in.', 'Use the viewport controls to orbit, zoom, focus, or enter Walk Mode.'],
    target: 'viewport-controls',
  },
  {
    eyebrow: '2 · Navigate the scene',
    title: 'Orbit, walk, zoom, and inspect',
    description: 'Orbit is the default mode for inspecting the whole model. Drag in the viewport to rotate, use the wheel or + / - to zoom, and double-click a surface to focus it. Walk Mode gives you a first-person route through the drift.',
    location: 'The Orbit / Walk Mode switch is in the viewport control strip',
    tips: ['Orbit: drag to rotate, wheel to zoom, arrow keys to orbit.', 'Walk: W, A, S, D or arrow keys move; drag to look around; Shift enables sprint.', 'Select a map feature or scene object, then press Delete or Backspace to remove it.'],
    target: 'viewport-controls',
  },
  {
    eyebrow: '3 · Projects and files',
    title: 'Sign in when you want private storage',
    description: 'Sample content is public to the workstation, but creating server projects and uploading models, videos, images, and documents requires Google sign-in. Your project assets are associated with your account so other users cannot browse them.',
    location: 'The Objects panel and Project Assets section are on the right',
    tips: ['Choose Sign in with Google from the account prompt.', 'After sign-in, create a named project, upload files, watch validation progress, then click an asset to render it.'],
    target: 'right-panel',
  },
  {
    eyebrow: '4 · Mark and review',
    title: 'Record evidence on the model or media',
    description: 'Use the marking tools to add notes, measurements, survey points, and faint gas or smoke brush areas. Marks are stored with their frame or video time so returning to that keyframe restores the same review context.',
    location: 'Marking tools are in the viewport controls; playback is along the bottom timeline',
    tips: ['Use K to record a camera keyframe and M for the 3D measurement ruler.', 'Open Mark History to revisit, edit, jump to, or remove saved marks.'],
    target: 'timeline',
  },
  {
    eyebrow: '5 · AI reconstruction',
    title: 'Generate scenes from your own references',
    description: 'The AI Survey panel supports image sets, descriptions, reconstruction instructions, and provider selection. Gemini is used for MiningSight-compatible analysis and reconstruction; World Labs Marble can create navigable worlds with its own key, while GOMERA X independently reconstructs photogrammetry captures without Gemini.',
    location: 'Open AI Survey from the top navigation or the orange AI Survey button',
    tips: ['Sign in before saving personal provider settings.', 'Open Provider API keys when a provider needs a key, then select the preferred model and return to generation.'],
    target: 'ai-survey',
  },
];

export const OnboardingGuide: React.FC<OnboardingGuideProps> = ({ isOpen, onClose, onOpenAuth }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  useEffect(() => {
    if (!isOpen) return undefined;
    let frame = 0;
    const measureTarget = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const element = document.querySelector(`[data-onboarding-target="${step.target}"]`);
        if (!element) {
          setTargetRect(null);
          return;
        }
        const rect = element.getBoundingClientRect();
        setTargetRect({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
      });
    };
    measureTarget();
    window.addEventListener('resize', measureTarget);
    window.addEventListener('scroll', measureTarget, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measureTarget);
      window.removeEventListener('scroll', measureTarget, true);
    };
  }, [isOpen, step.target]);

  const spotlight = useMemo(() => {
    if (!targetRect) return null;
    const padding = 6;
    return {
      top: Math.max(0, targetRect.top - padding),
      left: Math.max(0, targetRect.left - padding),
      right: Math.min(window.innerWidth, targetRect.right + padding),
      bottom: Math.min(window.innerHeight, targetRect.bottom + padding),
      width: Math.min(window.innerWidth, targetRect.right + padding) - Math.max(0, targetRect.left - padding),
      height: Math.min(window.innerHeight, targetRect.bottom + padding) - Math.max(0, targetRect.top - padding),
    };
  }, [targetRect]);

  const guidePosition = useMemo<React.CSSProperties>(() => {
    const width = Math.min(480, Math.max(280, window.innerWidth - 32));
    if (!targetRect) return { left: '50%', top: '50%', width, transform: 'translate(-50%, -50%)' };
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const isRightTarget = targetRect.left > viewportWidth * 0.58;
    const isBottomTarget = targetRect.top > viewportHeight * 0.68;
    const left = isRightTarget
      ? Math.max(16, targetRect.left - width - 18)
      : Math.max(16, Math.min(viewportWidth - width - 16, targetRect.left));
    const top = isRightTarget
      ? Math.max(38, Math.min(viewportHeight - 420, targetRect.top + 18))
      : isBottomTarget
        ? Math.max(16, targetRect.top - 385)
        : Math.min(viewportHeight - 420, Math.max(42, targetRect.bottom + 18));
    return { left, top, width, maxHeight: 'calc(100vh - 32px)' };
  }, [targetRect]);

  const finish = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] text-[#e8e8e8]" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      {spotlight ? (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 top-0 bg-black/72 backdrop-blur-[3px]" style={{ height: spotlight.top }} />
          <div className="absolute left-0 bg-black/72 backdrop-blur-[3px]" style={{ top: spotlight.top, width: spotlight.left, height: spotlight.bottom - spotlight.top }} />
          <div className="absolute right-0 bg-black/72 backdrop-blur-[3px]" style={{ top: spotlight.top, width: window.innerWidth - spotlight.right, height: spotlight.bottom - spotlight.top }} />
          <div className="absolute inset-x-0 bottom-0 bg-black/72 backdrop-blur-[3px]" style={{ height: window.innerHeight - spotlight.bottom }} />
          <div className="absolute rounded border border-[#e88724] shadow-[0_0_0_2px_rgba(232,135,36,0.24),0_0_24px_rgba(232,135,36,0.22)]" style={{ top: spotlight.top, left: spotlight.left, width: spotlight.right - spotlight.left, height: spotlight.bottom - spotlight.top }} />
          <div className="absolute flex -translate-y-full flex-col items-center gap-1 text-[#f7c17e] drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]" style={{ top: Math.max(34, spotlight.top - 8), left: Math.max(16, Math.min(window.innerWidth - 110, spotlight.left + spotlight.width / 2 - 55)) }}>
            <div className="rounded-full border border-[#e88724]/80 bg-[#23170d]/95 px-2 py-1 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Look here</div>
            <ArrowDown className="h-4 w-4" />
          </div>
        </div>
      ) : <div className="pointer-events-none absolute inset-0 bg-black/75 backdrop-blur-[3px]" />}

      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute overflow-y-auto rounded-lg border border-[#6b533c] bg-[#292929] shadow-[0_24px_80px_rgba(0,0,0,0.65)]" style={guidePosition}>
          <div className="flex items-start justify-between gap-4 border-b border-[#474747] bg-[#35302b] px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e88724] text-black">
                {stepIndex === 0 ? <CircleHelp className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#e88724]">{step.eyebrow}</div>
                <h2 id="onboarding-title" className="mt-1 text-base font-bold text-white sm:text-lg">{step.title}</h2>
              </div>
            </div>
            <button onClick={finish} className="shrink-0 rounded p-1 text-[#999] hover:bg-[#4a4a4a] hover:text-white" aria-label="Skip onboarding">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
            <p className="text-[12px] leading-relaxed text-[#ddd] sm:text-[13px]">{step.description}</p>
            <div className="rounded border border-[#5c4630] bg-[#211a14] px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-[#e88724]">Where to find it</div>
              <div className="mt-1 text-[11px] leading-relaxed text-[#f0d7bb]">{step.location}</div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {step.tips.map((tip) => <div key={tip} className="flex gap-2 text-[10.5px] leading-relaxed text-[#bdbdbd]"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#e88724]" />{tip}</div>)}
            </div>
            {stepIndex === 3 && (
              <button onClick={onOpenAuth} className="inline-flex items-center gap-2 rounded border border-[#e88724] bg-[#e88724] px-3 py-1.5 text-[10.5px] font-bold text-black hover:bg-[#ff9933]">
                <LockKeyhole className="h-3.5 w-3.5" /> Open Google sign-in
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#474747] bg-[#242424] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-1.5" aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}>
              {STEPS.map((item, index) => <span key={item.title} className={`h-1.5 rounded-full transition-all ${index === stepIndex ? 'w-6 bg-[#e88724]' : 'w-1.5 bg-[#666]'}`} />)}
              <span className="ml-1 text-[9px] text-[#888]">{stepIndex + 1} / {STEPS.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={finish} className="px-2 py-1 text-[10px] text-[#aaa] hover:text-white">Skip tour</button>
              {stepIndex > 0 && <button onClick={() => setStepIndex((index) => index - 1)} className="inline-flex items-center gap-1 rounded border border-[#555] px-2.5 py-1 text-[10px] text-[#ddd] hover:bg-[#444]"><ChevronLeft className="h-3 w-3" /> Back</button>}
              <button onClick={() => (isLast ? finish() : setStepIndex((index) => index + 1))} className="inline-flex items-center gap-1 rounded bg-[#e88724] px-3 py-1 text-[10px] font-bold text-black hover:bg-[#ff9933]">
                {isLast ? 'Finish' : 'Next'} {!isLast && <ChevronRight className="h-3 w-3" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
