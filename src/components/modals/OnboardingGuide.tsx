import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, LockKeyhole, X } from 'lucide-react';

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
  pointerClass: string;
}

const STEPS: OnboardingStep[] = [
  {
    eyebrow: 'Welcome to MiningSight',
    title: 'Your mine visualisation workspace',
    description: 'MiningSight is an interactive surface and subsurface review tool. It combines 3D mine scenes, project files, media, measurements, camera paths, markers, and AI-assisted reconstruction in one workstation.',
    location: 'This tour covers the main workspace',
    tips: ['You can reopen this tour at any time from Help → First-time Onboarding Tour.', 'The tour can be skipped now and does not change your project or viewer state.'],
    pointerClass: 'left-1/2 top-12 -translate-x-1/2',
  },
  {
    eyebrow: '1 · Start exploring',
    title: 'Sample models are already loaded for you',
    description: 'The default scene is a ready-to-use rugged timbered mine drift. Use the Scene or File menus to switch between the built-in photo-reference scene and the classic diorama scene before adding your own files.',
    location: 'Look at the centre 3D viewport and the File / Scene menus above it',
    tips: ['The sample models are available without signing in.', 'Use the viewport controls to orbit, zoom, focus, or enter Walk Mode.'],
    pointerClass: 'left-1/2 top-1/3 -translate-x-1/2',
  },
  {
    eyebrow: '2 · Navigate the scene',
    title: 'Orbit, walk, zoom, and inspect',
    description: 'Orbit is the default mode for inspecting the whole model. Drag in the viewport to rotate, use the wheel or + / - to zoom, and double-click a surface to focus it. Walk Mode gives you a first-person route through the drift.',
    location: 'The Orbit / Walk Mode switch is in the viewport control strip',
    tips: ['Orbit: drag to rotate, wheel to zoom, arrow keys to orbit.', 'Walk: W, A, S, D or arrow keys move; drag to look around; Shift enables sprint.'],
    pointerClass: 'right-1/3 top-1/2',
  },
  {
    eyebrow: '3 · Projects and files',
    title: 'Sign in when you want private storage',
    description: 'Sample content is public to the workstation, but creating server projects and uploading models, videos, images, and documents requires Google sign-in. Your project assets are associated with your account so other users cannot browse them.',
    location: 'The Objects panel and Project Assets section are on the right',
    tips: ['Choose Sign in with Google from the account prompt.', 'After sign-in, create a named project, upload files, watch validation progress, then click an asset to render it.'],
    pointerClass: 'right-8 top-1/3',
  },
  {
    eyebrow: '4 · Mark and review',
    title: 'Record evidence on the model or media',
    description: 'Use the marking tools to add notes, measurements, survey points, and faint gas or smoke brush areas. Marks are stored with their frame or video time so returning to that keyframe restores the same review context.',
    location: 'Marking tools are in the viewport controls; playback is along the bottom timeline',
    tips: ['Use K to record a camera keyframe and M for the 3D measurement ruler.', 'Open Mark History to revisit, edit, jump to, or remove saved marks.'],
    pointerClass: 'left-1/2 bottom-14 -translate-x-1/2',
  },
  {
    eyebrow: '5 · AI reconstruction',
    title: 'Generate scenes from your own references',
    description: 'The AI Survey panel supports image sets, descriptions, reconstruction instructions, and provider selection. Gemini can analyse survey material, while World Labs Marble and the GOMERAX service can be configured for 3D scene generation when the required provider credentials are available.',
    location: 'Open AI Survey from the top navigation or the orange AI Survey button',
    tips: ['Sign in before saving personal provider settings.', 'Open Provider API keys when a provider needs a key, then select the preferred model and return to generation.'],
    pointerClass: 'left-1/2 top-8 -translate-x-1/2',
  },
];

export const OnboardingGuide: React.FC<OnboardingGuideProps> = ({ isOpen, onClose, onOpenAuth }) => {
  const [stepIndex, setStepIndex] = useState(0);
  if (!isOpen) return null;

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  const finish = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[130] text-[#e8e8e8]" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-[2px]" />

      <div className="absolute inset-0 pointer-events-none hidden lg:block">
        <div className={`absolute ${step.pointerClass} flex flex-col items-center gap-1 text-[#f7c17e] drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]`}>
          <div className="rounded-full border border-[#e88724]/80 bg-[#23170d]/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Look here</div>
          <ArrowRight className="h-4 w-4 rotate-90" />
        </div>
      </div>

      <div className="relative flex h-full items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-[#6b533c] bg-[#292929] shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
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
