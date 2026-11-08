import React, { useEffect, useState } from 'react';
import { Mail, ShieldCheck, ScrollText, UserRound, X } from 'lucide-react';

export type AboutSection = 'about' | 'terms' | 'privacy';

interface AboutModalProps {
  isOpen: boolean;
  section: AboutSection;
  onClose: () => void;
}

const sectionLabels: Array<{ id: AboutSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'about', label: 'About', icon: UserRound },
  { id: 'terms', label: 'Terms of Use', icon: ScrollText },
  { id: 'privacy', label: 'Privacy & Data Use', icon: ShieldCheck },
];

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, section, onClose }) => {
  const [activeSection, setActiveSection] = useState<AboutSection>(section);

  useEffect(() => {
    if (isOpen) setActiveSection(section);
  }, [isOpen, section]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="about-modal-title">
      <div className="flex max-h-[min(820px,calc(100vh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-[#555] bg-[#2b2b2b] text-[#e7e7e7] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#444] bg-[#383838] px-4 py-3 sm:px-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded bg-[#e88724] text-black"><UserRound className="h-4 w-4" /></div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#e88724]">MiningSight</div>
              <h2 id="about-modal-title" className="mt-1 text-lg font-bold text-white">About, terms, and privacy</h2>
              <p className="mt-1 text-[10.5px] text-[#aaa]">Project author, software purpose, acceptable use, and transparent data handling information.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-[#999] hover:bg-[#4b4b4b] hover:text-white" aria-label="Close About"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#454545] bg-[#242424] p-2 sm:w-48 sm:flex-col sm:border-b-0 sm:border-r" aria-label="About sections">
            {sectionLabels.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveSection(id)} className={`flex items-center gap-2 whitespace-nowrap rounded px-2.5 py-2 text-left text-[10.5px] font-semibold ${activeSection === id ? 'bg-[#3b516b] text-white' : 'text-[#aaa] hover:bg-[#363636] hover:text-white'}`}>
                <Icon className="h-3.5 w-3.5 shrink-0" />{label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 text-[11px] leading-relaxed text-[#cfcfcf] sm:px-6">
            {activeSection === 'about' && (
              <div className="max-w-2xl space-y-5">
                <section>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#e88724]">Project author</div>
                  <h3 className="mt-1 text-xl font-bold text-white">Ezekiel Rego</h3>
                  <p className="mt-2">Ezekiel Rego is a passionate programmer and systems builder focused on turning complex technical ideas into practical, understandable software. His work is guided by curiosity, structured problem-solving, attention to detail, continuous learning, clear communication, and a strong interest in building tools that are useful to real people.</p>
                  <p className="mt-2">MiningSight reflects an interest in combining software engineering, 3D interaction, visual communication, data organisation, and AI-assisted workflows for mining and geological review.</p>
                </section>
                <section className="rounded border border-[#5c4630] bg-[#211a14] p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#e88724]">Contact</div>
                  <div className="mt-2 flex flex-col gap-1.5 text-[11px]">
                    <a href="mailto:ezekiel@techinn.co.zw" className="inline-flex items-center gap-2 text-[#9bcaf0] hover:text-white"><Mail className="h-3.5 w-3.5" /> ezekiel@techinn.co.zw</a>
                    <a href="mailto:ezekielrego01@gmail.com" className="inline-flex items-center gap-2 text-[#9bcaf0] hover:text-white"><Mail className="h-3.5 w-3.5" /> ezekielrego01@gmail.com</a>
                  </div>
                </section>
                <section>
                  <h3 className="text-[13px] font-bold text-[#f1b36b]">About the software</h3>
                  <p className="mt-1.5">MiningSight is a browser-based surface and subsurface visualisation workstation. It provides interactive Three.js scene viewing, sample mine models, project and asset management, image and video review, measurements, annotations, gas-mapping marks, camera tours, keyframe playback, and AI-assisted geological reconstruction.</p>
                  <p className="mt-2">The workstation connects field-style evidence with a reviewable 3D environment. Users can inspect a model, return to the frame where an observation was made, compare media, organise project files, and prepare reconstruction workflows using configurable Gemini, World Labs Marble, and GOMERAX services.</p>
                </section>
                <section>
                  <h3 className="text-[13px] font-bold text-[#f1b36b]">Technology and live interfaces</h3>
                  <p className="mt-1.5">The interface is built with React, TypeScript, Vite, Three.js, Tailwind CSS, and an Express server with project storage support.</p>
                  <div className="mt-2 flex flex-col gap-1"><a href="https://tunnelsight.applications.co.zw/" target="_blank" rel="noreferrer" className="text-[#9bcaf0] hover:text-white">Main workstation: tunnelsight.applications.co.zw</a><a href="/gomerax-trial/" className="text-[#9bcaf0] hover:text-white">Companion viewer: /gomerax-trial/</a><a href="https://github.com/ezekielrego/MiningSight" target="_blank" rel="noreferrer" className="text-[#9bcaf0] hover:text-white">Source repository: github.com/ezekielrego/MiningSight</a></div>
                </section>
              </div>
            )}

            {activeSection === 'terms' && (
              <div className="max-w-2xl space-y-5">
                <section><h3 className="text-xl font-bold text-white">Terms of Use</h3><p className="mt-1.5 text-[#999]">Effective date: 8 November 2026</p></section>
                <section><h3 className="text-[13px] font-bold text-[#f1b36b]">Use of the workstation</h3><p className="mt-1.5">MiningSight is provided as a project and review workstation. Use it lawfully, respectfully, and only with files, images, video, model data, and provider credentials that you are authorised to use. Do not use the service to upload harmful, unlawful, confidential, or malicious material.</p></section>
                <section><h3 className="text-[13px] font-bold text-[#f1b36b]">Your content and AI processing</h3><p className="mt-1.5">You retain responsibility for the content you upload and for having the rights or permissions needed to process it. When you request analysis or reconstruction, the selected provider may receive the relevant prompt, images, videos, model data, or project information needed to perform that request. AI results are assistive outputs and should be checked by a qualified person before being used for safety-critical, regulatory, engineering, or commercial decisions.</p></section>
                <section><h3 className="text-[13px] font-bold text-[#f1b36b]">Accounts and project storage</h3><p className="mt-1.5">Google sign-in is required for private projects and uploads. Keep your account access secure and do not share provider API keys. Project storage is subject to the limits and operational policies shown in the interface.</p></section>
                <section><h3 className="text-[13px] font-bold text-[#f1b36b]">Availability and changes</h3><p className="mt-1.5">The software may be updated, temporarily unavailable, or changed as the project develops. These terms may also be updated when features, providers, or data practices change. Continued use after an update means the updated notice is available for review.</p></section>
                <section><h3 className="text-[13px] font-bold text-[#f1b36b]">Contact</h3><p className="mt-1.5">Questions about use of the project can be sent to <a href="mailto:ezekiel@techinn.co.zw" className="text-[#9bcaf0] hover:text-white">ezekiel@techinn.co.zw</a>.</p></section>
              </div>
            )}

            {activeSection === 'privacy' && (
              <div className="max-w-2xl space-y-5">
                <section><h3 className="text-xl font-bold text-white">Privacy & Data Use</h3><p className="mt-1.5 text-[#999]">Effective date: 8 November 2026</p></section>
                <section><h3 className="text-[13px] font-bold text-[#f1b36b]">What may be processed</h3><p className="mt-1.5">Depending on the features you use, MiningSight may process your Google account identity, project names, uploaded files, model and media metadata, annotations, measurements, keyframes, provider preferences, prompts, and generated results.</p></section>
                <section><h3 className="text-[13px] font-bold text-[#f1b36b]">Why data is used</h3><p className="mt-1.5">Data is used to provide sign-in, private project storage, file validation, rendering, annotation history, AI analysis, reconstruction requests, error reporting, and service security. Project data and interaction information may also be used to improve the MiningSight software, user experience, reliability, and—where enabled by the applicable provider settings and provider terms—to improve AI models or related services.</p></section>
                <section><h3 className="text-[13px] font-bold text-[#f1b36b]">Third-party services</h3><p className="mt-1.5">Google may process sign-in information. Gemini, World Labs Marble, GOMERAX, hosting, storage, and other configured services may process data sent through the features you choose to use. Review the relevant provider’s privacy and data-use terms before submitting sensitive or restricted material. Do not upload information that you are not authorised to share.</p></section>
                <section><h3 className="text-[13px] font-bold text-[#f1b36b]">Your choices</h3><p className="mt-1.5">You can choose whether to sign in, upload files, configure a provider, or send material for AI processing. You can avoid submitting sensitive information, remove project assets where the interface provides that option, and contact the project author about data questions or removal requests.</p></section>
                <section className="rounded border border-[#5c4630] bg-[#211a14] p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-[#e88724]">Important notice</div><p className="mt-1.5 text-[#e6d0ba]">This project notice is intended to explain the current application behaviour. It is not a substitute for jurisdiction-specific legal advice or a provider’s official privacy policy. The application should be reviewed and updated before use with regulated, confidential, or safety-critical data.</p></section>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-[#444] bg-[#242424] px-4 py-3 sm:px-5"><button onClick={onClose} className="rounded bg-[#444] px-3 py-1.5 text-[10px] font-bold text-white hover:bg-[#555]">Close</button></div>
      </div>
    </div>
  );
};
