import React from 'react';
import { BookOpen, ExternalLink, X } from 'lucide-react';

interface HelpGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartOnboarding: () => void;
}

export const HelpGuideModal: React.FC<HelpGuideModalProps> = ({ isOpen, onClose, onStartOnboarding }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="help-guide-title">
      <div className="flex max-h-[min(820px,calc(100vh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-[#555] bg-[#2b2b2b] text-[#e7e7e7] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#444] bg-[#383838] px-4 py-3 sm:px-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded bg-[#e88724] text-black"><BookOpen className="h-4 w-4" /></div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#e88724]">MiningSight help centre</div>
              <h2 id="help-guide-title" className="mt-1 text-lg font-bold text-white">3D mine visualisation, mapping, and reconstruction guide</h2>
              <p className="mt-1 max-w-2xl text-[10.5px] leading-relaxed text-[#aaa]">A readable reference for exploring sample models, managing private project assets, recording field observations, and preparing AI-assisted 3D reconstruction.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-[#999] hover:bg-[#4b4b4b] hover:text-white" aria-label="Close help guide"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(230px,0.9fr)]">
            <div className="space-y-6 text-[11px] leading-relaxed text-[#cfcfcf]">
              <section>
                <h3 className="text-[13px] font-bold text-[#f1b36b]">What MiningSight is</h3>
                <p className="mt-1.5">MiningSight is a browser-based surface and subsurface mine visualisation workstation. It brings together interactive Three.js 3D viewing, procedural tunnel scenes, uploaded project media, survey markers, measurements, camera keyframes, video review, and configurable AI reconstruction services.</p>
                <p className="mt-1.5">The default interface is ready for exploration without an account. The sample models demonstrate the viewer and scene controls; they are not your private project files.</p>
              </section>

              <section>
                <h3 className="text-[13px] font-bold text-[#f1b36b]">Getting started with the default scene</h3>
                <p className="mt-1.5">Start in the centre viewport. Orbit mode is the standard inspection mode: drag to rotate around the model, use the mouse wheel or the plus and minus keys to zoom, and double-click a visible surface to focus the camera. Use the File or Scene menus to switch between the rugged timbered mine reference scene and the classic diorama scene.</p>
                <p className="mt-1.5">Walk Mode provides a first-person tunnel walkthrough. Use W, A, S, D or the arrow keys to move, drag to look, and hold Shift to move faster. The viewport’s Orbit and Walk Mode buttons make the current navigation state clear.</p>
              </section>

              <section>
                <h3 className="text-[13px] font-bold text-[#f1b36b]">Projects, Google sign-in, and private uploads</h3>
                <p className="mt-1.5">Google sign-in is required for server-backed projects and uploads. Once signed in, create a named project in the Objects panel, upload models such as GLB, GLTF, OBJ, FBX, or PLY, attach images and videos, and add supporting documents. Upload progress and validation status are shown in the project asset area.</p>
                <p className="mt-1.5">Your project assets are associated with your account. Selecting a project clears the previous asset selection; selecting a file from Project Assets renders that file in the viewport. A project with no selected asset intentionally shows an empty project view.</p>
              </section>

              <section>
                <h3 className="text-[13px] font-bold text-[#f1b36b]">Markers, measurements, keyframes, and media</h3>
                <p className="mt-1.5">Use the annotation and ruler tools to record observations on the current model view. Camera keyframes preserve a viewpoint for later review, and the timeline controls frame playback, scrubbing, looping, and playback speed. Notes and markers are associated with their keyframe or video time so the same context can be restored later.</p>
                <p className="mt-1.5">Mark History provides a central list of model notes, video markers, measurements, and gas or smoke brush marks. Select a history item to return to its frame or media time, edit it where supported, or remove it from the project.</p>
              </section>

              <section>
                <h3 className="text-[13px] font-bold text-[#f1b36b]">AI geological mapping and 3D reconstruction</h3>
                <p className="mt-1.5">Open AI Survey to load sample survey images or provide your own references, dimensions, geological description, and reconstruction instructions. The panel supports provider selection for Gemini analysis, World Labs Marble scene generation, and the GOMERAX reconstruction workflow.</p>
                <p className="mt-1.5">Provider credentials are configured from the Provider API keys and model preferences area. Sign in before saving personal provider settings. The generation panel reports missing credentials, validation problems, upload progress, and provider errors with an action to correct the issue.</p>
              </section>

              <section>
                <h3 className="text-[13px] font-bold text-[#f1b36b]">Presentation and display controls</h3>
                <p className="mt-1.5">Use Display to change shading, View to toggle the floor grid or clear scene objects, and the overlay minimize controls to keep notes, media, and walkthrough hints out of the way. The GOMERA X button in the top navigation opens the companion interface at its hosted subpath.</p>
              </section>
            </div>

            <aside className="space-y-3 lg:border-l lg:border-[#454545] lg:pl-5">
              <div className="rounded border border-[#5c4630] bg-[#211a14] p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#e88724]">First visit?</div>
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-[#e6d0ba]">Take the short guided tour for labelled locations and the recommended first actions.</p>
                <button onClick={onStartOnboarding} className="mt-3 w-full rounded bg-[#e88724] px-3 py-1.5 text-[10px] font-bold text-black hover:bg-[#ff9933]">Start onboarding tour</button>
              </div>
              <div className="rounded border border-[#454545] bg-[#242424] p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#aaa]">Live interfaces</div>
                <a href="https://tunnelsight.applications.co.zw/" target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-between text-[10.5px] text-[#9bcaf0] hover:text-white">Main MiningSight workstation <ExternalLink className="h-3 w-3" /></a>
                <a href="/gomerax-trial/" className="mt-2 flex items-center justify-between text-[10.5px] text-[#9bcaf0] hover:text-white">GOMERA X companion viewer <ExternalLink className="h-3 w-3" /></a>
              </div>
              <div className="rounded border border-[#454545] bg-[#242424] p-3 text-[10px] leading-relaxed text-[#999]">
                <div className="font-bold text-[#bbb]">Quick keyboard reference</div>
                <div className="mt-2 grid grid-cols-[70px_1fr] gap-y-1"><span className="text-[#e88724]">WASD / arrows</span><span>Walk or orbit</span><span className="text-[#e88724]">+ / -</span><span>Zoom</span><span className="text-[#e88724]">K</span><span>Record a viewpoint</span><span className="text-[#e88724]">M</span><span>Measurement ruler</span><span className="text-[#e88724]">V</span><span>Toggle Walk Mode</span><span className="text-[#e88724]">F</span><span>Toggle headlamp</span></div>
              </div>
            </aside>
          </div>
        </div>

        <div className="flex items-center justify-end border-t border-[#444] bg-[#242424] px-4 py-3 sm:px-5"><button onClick={onClose} className="rounded bg-[#444] px-3 py-1.5 text-[10px] font-bold text-white hover:bg-[#555]">Close guide</button></div>
      </div>
    </div>
  );
};
