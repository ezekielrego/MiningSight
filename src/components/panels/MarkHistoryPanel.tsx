import React from 'react';
import { Crosshair, Droplets, Edit3, MapPin, Trash2, Video } from 'lucide-react';

export type MarkHistoryKind = 'keyframe-note' | 'media-marker' | 'gas-mark';

export interface MarkHistoryItem {
  id: string;
  kind: MarkHistoryKind;
  title: string;
  detail: string;
  note?: string;
  frame: number;
  timeSeconds?: number;
  assetId?: string | null;
  tourId?: string;
  keyframeId?: string;
  createdAt: string;
  color?: string;
  concentration?: number;
  radius?: number;
}

interface MarkHistoryPanelProps {
  items: MarkHistoryItem[];
  onJump: (item: MarkHistoryItem) => void;
  onEdit: (item: MarkHistoryItem) => void;
  onDelete: (item: MarkHistoryItem) => void;
}

const kindMeta: Record<MarkHistoryKind, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  'keyframe-note': { label: 'Keyframe note', icon: Crosshair, color: '#ffb347' },
  'media-marker': { label: 'Media marker', icon: Video, color: '#88bbdd' },
  'gas-mark': { label: 'Gas brush', icon: Droplets, color: '#83d8c7' },
};

export const MarkHistoryPanel: React.FC<MarkHistoryPanelProps> = ({ items, onJump, onEdit, onDelete }) => (
  <div className="w-full h-full flex flex-col bg-[#2e2e2e] text-[#d6d6d6] text-[11px] select-none font-sans overflow-hidden border-l border-[#222]">
    <div className="h-7 shrink-0 bg-[#383838] border-b border-[#222] px-2 flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5 text-[#e88724]" />
        <span className="font-bold text-[#f0f0f0]">Mark History</span>
      </div>
      <span className="font-mono text-[9px] text-[#999]">{items.length} saved</span>
    </div>
    <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
      <div className="bg-[#242424] border border-[#414141] rounded-[2px] p-1.5 text-[9px] text-[#999] leading-relaxed">
        Select a mark to return to its asset and frame. Edit or delete it here; deleted marks are removed from the viewer and project history.
      </div>
      {items.length === 0 ? (
        <div className="py-8 text-center text-[#777]">
          <MapPin className="w-6 h-6 mx-auto mb-2 text-[#555]" />
          <div className="font-semibold text-[#aaa]">No marks yet</div>
          <div className="mt-1 text-[9.5px]">Use Mark, Gas Brush, or the video marker action in the viewport.</div>
        </div>
      ) : items.map((item) => {
        const meta = kindMeta[item.kind];
        const Icon = meta.icon;
        return (
          <div key={`${item.kind}:${item.id}`} className="bg-[#353535] border border-[#464646] rounded-[2px] p-1.5 space-y-1 hover:border-[#6a6a6a]">
            <button onClick={() => onJump(item)} className="w-full text-left cursor-pointer active:bg-[#414141]">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 font-bold" style={{ color: meta.color }}><Icon className="w-3 h-3" />{meta.label}</span>
                <span className="font-mono text-[8.5px] text-[#999]">{item.timeSeconds !== undefined ? `${item.timeSeconds.toFixed(2)}s` : `${item.frame}F`}</span>
              </div>
              <div className="mt-0.5 truncate text-[10px] text-[#eee]" title={item.title}>{item.title}</div>
              <div className="truncate text-[9px] text-[#999]" title={item.detail}>{item.detail}</div>
              {item.note && <div className="mt-0.5 line-clamp-2 text-[9.5px] text-[#ccc]">{item.note}</div>}
              {item.kind === 'gas-mark' && <div className="flex items-center gap-2 text-[8.5px] text-[#9bcfc4]"><span style={{ color: item.color }}>●</span><span>{Math.round((item.concentration || 0) * 100)}% concentration</span><span>{(item.radius || 0).toFixed(2)} size</span></div>}
            </button>
            <div className="flex items-center justify-between gap-1 border-t border-[#474747] pt-1">
              <span className="text-[8px] text-[#777]">{new Date(item.createdAt).toLocaleString()}</span>
              <div className="flex gap-1">
                <button onClick={() => onEdit(item)} className="flex items-center gap-1 rounded-[2px] bg-[#444] px-1.5 py-0.5 text-[8.5px] text-[#ddd] hover:bg-[#555] cursor-pointer"><Edit3 className="w-3 h-3" />Edit</button>
                <button onClick={() => onDelete(item)} className="flex items-center gap-1 rounded-[2px] bg-[#492626] px-1.5 py-0.5 text-[8.5px] text-[#ffb0b0] hover:bg-[#762d2d] cursor-pointer"><Trash2 className="w-3 h-3" />Delete</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);
