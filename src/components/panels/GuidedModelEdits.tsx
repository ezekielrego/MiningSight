import React, { useEffect, useRef, useState } from 'react';
import type { editableModelContext } from '../../scene/modelEditing';

export type EditableModelContext = ReturnType<typeof editableModelContext>;

export function GuidedModelEdits({ context, projectId, authToken, onProposal }: {
  context: EditableModelContext; projectId?: string | null; authToken?: string | null; onProposal: (proposal: unknown) => void;
}) {
  const [guidance, setGuidance] = useState('');
  const [json, setJson] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const generate = async () => {
    const controller = new AbortController(); abortRef.current = controller;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/reconstruction/ai/model-edit-proposal', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ projectId, assetId: context.assetId, guidance, objects: context.parts }), signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not generate an edit proposal.');
      if (result.clarification) setError(`More guidance needed: ${result.clarification}`);
      else onProposal(result.modelEditProposal);
    } catch (error: any) { if (!controller.signal.aborted) setError(error.message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const downloadContext = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(context, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'model-edit-context.json'; link.click(); URL.revokeObjectURL(url);
  };
  return <section aria-label="Guided model editing" className="p-2 border-b border-[#222] bg-[#252525] space-y-2 flex-shrink-0 max-h-[45%] overflow-auto">
    <div className="font-bold text-[#ffb35d]">Guided model editing · {context.parts.length} parts</div>
    <p className="text-[#aaa]">Describe the part and change. Gemini proposes edits for your review. Only part names, transforms and your guidance are sent when you click Generate.</p>
    <textarea aria-label="Model edit guidance" value={guidance} maxLength={8000} onChange={(event) => setGuidance(event.target.value)} placeholder="For example: hide the ceiling panels so I can inspect the supports." className="w-full bg-[#191919] border border-[#555] p-1 h-14 select-text" />
    <div className="flex gap-2 items-center flex-wrap">
      <button onClick={generate} disabled={busy || !authToken || !projectId || projectId.startsWith('provider_') || !guidance.trim() || !context.parts.length} className="bg-[#e88724] text-black font-bold px-2 py-1 disabled:opacity-40">{busy ? 'Generating proposal…' : 'Generate edit proposal'}</button>
      <button onClick={downloadContext} className="border border-[#555] px-2 py-1 hover:bg-[#444]">Export part context</button>
    </div>
    <details>
      <summary className="cursor-pointer text-[#4ea3e8]">Review a proposal from another AI connection</summary>
      <textarea aria-label="Model edit proposal JSON" value={json} onChange={(event) => setJson(event.target.value)} className="w-full h-20 bg-[#191919] border border-[#555] p-1 mt-1 select-text font-mono" placeholder="Paste a modelEditProposal JSON object" />
      <button onClick={() => { try { const data = JSON.parse(json); setError(''); onProposal(data.modelEditProposal || data); } catch { setError('Enter valid proposal JSON.'); } }} disabled={!json.trim()} className="border border-[#555] px-2 py-1 disabled:opacity-40">Review imported proposal</button>
    </details>
    {error && <p role="alert" className="text-[#ffb35d] whitespace-pre-wrap">{error}</p>}
  </section>;
}
