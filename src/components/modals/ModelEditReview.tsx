import React from 'react';
import type { C4DSceneObject } from '../../types/c4d';
import { flattenObjects, type ModelEditProposal } from '../../scene/modelEditing';

export function ModelEditReview({ proposal, objects, preview, onPreview, onCancel, onConfirm }: {
  proposal: ModelEditProposal; objects: C4DSceneObject[]; preview: boolean;
  onPreview: () => void; onCancel: () => void; onConfirm: () => void;
}) {
  const names = new Map(flattenObjects(objects).map((object) => [object.id, object.name]));
  return <div role="dialog" aria-label="Review guided model edits" className="fixed z-[200] right-3 bottom-12 w-[360px] max-w-[95vw] border border-[#76552b] bg-[#292929] shadow-xl text-[11px] text-[#ddd]">
    <div className="bg-[#383838] border-b border-[#222] p-2 font-bold text-[#ffb35d]">Review guided model edits · {proposal.operations.length}</div>
    <div className="p-2 space-y-2">
      <p className="whitespace-pre-wrap max-h-20 overflow-auto">{proposal.guidance}</p>
      <ol className="max-h-48 overflow-auto space-y-1 list-decimal pl-5">
        {proposal.operations.map((operation, index) => <li key={index} className="break-words">
          <strong>{operation.type}</strong> · {names.get(operation.targetId) || operation.targetId}
          {operation.type === 'transform' && <div className="text-[#aaa] font-mono">{(['position', 'rotation', 'scale'] as const).filter((key) => operation[key]).map((key) => `${key}: ${Object.values(operation[key]!).join(', ')}${key === 'position' ? ' cm' : key === 'rotation' ? '°' : ''}`).join(' / ')}</div>}
        </li>)}
      </ol>
      <p className="text-[#aaa]">Preview is temporary. Apply adds one undo step. Save the project to keep edits; the original model file is preserved.</p>
      <div className="flex gap-2 flex-wrap">
        <button onClick={onPreview} aria-pressed={preview} className="border border-[#666] px-2 py-1 hover:bg-[#444]">{preview ? 'End preview' : 'Preview edits'}</button>
        <button onClick={onCancel} className="border border-[#666] px-2 py-1 hover:bg-[#444]">Cancel</button>
        <button onClick={onConfirm} disabled={!preview} className="bg-[#e88724] text-black px-2 py-1 font-bold disabled:opacity-40">Apply confirmed edits</button>
      </div>
    </div>
  </div>;
}
