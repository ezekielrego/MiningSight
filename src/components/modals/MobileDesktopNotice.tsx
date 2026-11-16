import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Copy, Monitor } from 'lucide-react';

const WEBSITE_URL = 'https://tunnelsight.applications.co.zw/';
const DISMISSED_KEY = 'tunnelsight_mobile_notice_dismissed';

function isMobileDevice() {
  const mobileAgent = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle/i.test(navigator.userAgent);
  // iPadOS can identify itself as a Mac, including in desktop website mode.
  const desktopAgentTablet = /Mac/i.test(navigator.platform) && navigator.maxTouchPoints > 1;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const shortSide = Math.min(window.screen.width, window.screen.height);
  const longSide = Math.max(window.screen.width, window.screen.height);
  return mobileAgent || desktopAgentTablet || (coarsePointer && shortSide <= 1024 && longSide <= 1600);
}

/** A recommendation only: the existing workspace stays mounted and is always available. */
export function MobileDesktopNotice() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const [mobile, setMobile] = useState(isMobileDevice);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISSED_KEY) === 'true'; } catch { return false; }
  });
  const [copyStatus, setCopyStatus] = useState('');
  const visible = mobile && !dismissed;

  useEffect(() => {
    const update = () => setMobile(isMobileDevice());
    const pointer = window.matchMedia('(pointer: coarse)');
    pointer.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      pointer.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!visible || !dialog) return;
    // A native dialog provides focus containment and places the notice above onboarding.
    dialog.showModal();
    return () => dialog.close();
  }, [visible]);

  const continueInBrowser = () => {
    try { sessionStorage.setItem(DISMISSED_KEY, 'true'); } catch { /* Private browsing can disable storage. */ }
    setDismissed(true);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(WEBSITE_URL);
      setCopyStatus('Website link copied. Open it on your desktop.');
    } catch {
      linkRef.current?.focus();
      linkRef.current?.select();
      setCopyStatus('Select and copy the website link above.');
    }
  };

  if (!visible) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="mobile-desktop-title"
      aria-describedby="mobile-desktop-description"
      onCancel={(event) => { event.preventDefault(); continueInBrowser(); }}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-24px)] w-[calc(100%-24px)] max-w-lg overflow-y-auto rounded-2xl border border-[#53504a] bg-[#242424] p-0 text-[#e0e0e0] shadow-2xl backdrop:bg-black/85"
    >
      <div className="p-6 sm:p-8">
        <div className="mb-7 flex items-center gap-3">
          <img src="/favicon.webp" alt="" width="64" height="40" className="h-10 w-16 object-contain" />
          <span className="text-lg font-semibold tracking-tight text-white">TunnelSight</span>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[#755132] bg-[#382b1e] px-3 py-1.5 text-xs font-medium text-[#f2b36d]"><Monitor size={15} aria-hidden="true" /> Built for desktop</span>
        <h1 id="mobile-desktop-title" className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-white">Switch to a desktop for the full workspace.</h1>
        <p id="mobile-desktop-description" className="mt-3 text-sm leading-relaxed text-[#bfbfbf]">TunnelSight’s 3D tools, project panels, and window streaming need a desktop for the best experience. Open this website on your computer, or get the Windows app.</p>
        <a href="/desktop/" className="mt-6 flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#e88724] px-4 py-3 text-center text-sm font-semibold text-[#17120c] hover:bg-[#ff9933] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f2b36d]">Windows app &amp; setup <ArrowUpRight size={18} aria-hidden="true" /></a>
        <p className="mt-2 text-center text-xs text-[#aaa]">Windows 10 / 11 · x64 · Download on your PC</p>
        <label htmlFor="desktop-website-link" className="mt-6 block text-xs font-medium text-[#ccc]">Website link for your computer</label>
        <input ref={linkRef} id="desktop-website-link" type="url" readOnly value={WEBSITE_URL} onFocus={(event) => event.currentTarget.select()} className="mt-2 w-full min-w-0 select-text rounded-lg border border-[#555] bg-[#191919] px-3 py-3 text-xs text-[#ddd] focus-visible:outline-2 focus-visible:outline-[#f2b36d]" />
        <button type="button" onClick={() => void copyLink()} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#555] px-4 py-2 text-sm hover:bg-[#333] focus-visible:outline-2 focus-visible:outline-[#f2b36d]"><Copy size={15} aria-hidden="true" /> Copy website link</button>
        <p role="status" className="mt-2 min-h-8 text-xs leading-relaxed text-[#f2b36d]">{copyStatus}</p>
        <div className="mt-3 border-t border-white/10 pt-4 text-center">
          <button type="button" onClick={continueInBrowser} className="min-h-11 rounded px-4 py-2 text-sm font-medium text-[#ddd] underline decoration-[#777] underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-[#f2b36d]">Continue in browser</button>
          <p className="mt-1 text-xs leading-relaxed text-[#aaa]">You can still access settings and try the web workspace here. Some tools may be difficult to use on a phone or tablet.</p>
        </div>
      </div>
    </dialog>
  );
}
