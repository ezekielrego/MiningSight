import React, { useState } from 'react';
import { C4DSceneObject } from '../../types/c4d';

interface ObjectManagerProps {
  objects: C4DSceneObject[];
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
  onToggleVisibility: (id: string, target: 'editor' | 'renderer') => void;
  onToggleExpand: (id: string) => void;
  onDeleteObject: (id: string) => void;
  onAddObject: (type: string) => void;
}

export const ObjectManager: React.FC<ObjectManagerProps> = ({
  objects,
  selectedObjectId,
  onSelectObject,
  onToggleVisibility,
  onToggleExpand,
  onDeleteObject,
  onAddObject,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const renderObjectRow = (obj: C4DSceneObject, depth: number = 0) => {
    const isSelected = selectedObjectId === obj.id;
    const hasChildren = obj.children && obj.children.length > 0;

    return (
      <React.Fragment key={obj.id}>
        <div
          onClick={() => onSelectObject(obj.id)}
          className={`h-[20px] flex items-center justify-between px-2 cursor-pointer text-[11px] select-none ${
            isSelected
              ? 'bg-[#3b516b] text-white'
              : 'hover:bg-[#434343] text-[#cfcfcf]'
          }`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          {/* Left: Expand [+] / [-], Object Type Icon, Name */}
          <div className="flex items-center space-x-1.5 overflow-hidden">
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(obj.id);
                }}
                className="w-3.5 h-3.5 flex items-center justify-center text-[#888] hover:text-white font-mono text-[10px]"
              >
                {obj.expanded ? '▼' : '▶'}
              </button>
            ) : (
              <span className="w-3.5" />
            )}

            {/* C4D Cube / Primitive Icon */}
            <span className="w-3.5 h-3.5 flex items-center justify-center text-[#4ea3e8]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              </svg>
            </span>

            {/* Object Name */}
            <span className="truncate font-sans tracking-tight text-[11.5px]">
              {obj.name}
            </span>
          </div>

          {/* Right: Visibility Dots & Tag Badges */}
          <div className="flex items-center space-x-2 flex-shrink-0">
            {/* C4D Editor & Renderer Visibility Dots (Double-dot indicator) */}
            <div
              className="flex flex-col items-center justify-center space-y-[2px] cursor-pointer"
              title="Top: Editor Visibility | Bottom: Renderer Visibility"
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility(obj.id, 'editor');
              }}
            >
              {/* Top dot: Editor */}
              <span
                className={`w-[5px] h-[5px] rounded-full ${
                  obj.visibleInEditor ? 'bg-[#5cd65c]' : 'bg-[#e05252]'
                }`}
              />
              {/* Bottom dot: Renderer */}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(obj.id, 'renderer');
                }}
                className={`w-[5px] h-[5px] rounded-full ${
                  obj.visibleInRenderer ? 'bg-[#5cd65c]' : 'bg-[#e05252]'
                }`}
              />
            </div>

            {/* C4D Tag Icons: Phong Tag & Material Swatches */}
            <div className="flex items-center space-x-1">
              {/* Phong Tag */}
              <span
                title="Phong Tag (Angle: 80°)"
                className="w-3.5 h-3.5 bg-[#404040] border border-[#2b2b2b] rounded-[1px] flex items-center justify-center text-[8px] text-[#e89b4e] font-bold"
              >
                ∠
              </span>

              {/* Material tags */}
              <span
                title="Material: Rock_Strata"
                className="w-3 h-3 rounded-full bg-[#5a544e] border border-[#777] inline-block shadow-inner"
              />
              <span
                title="Material: Timber_Beams"
                className="w-3 h-3 rounded-full bg-[#4d3b2c] border border-[#666] inline-block shadow-inner"
              />
              <span
                title="Material: Rusted_Iron"
                className="w-3 h-3 rounded-full bg-[#3d3f44] border border-[#555] inline-block shadow-inner"
              />
              <span
                title="Material: Lantern_Gold"
                className="w-3 h-3 rounded-full bg-[#ffaa22] border border-[#ffd060] inline-block shadow-inner"
              />
            </div>
          </div>
        </div>

        {/* Nested Children */}
        {hasChildren &&
          obj.expanded &&
          obj.children!.map((child) => renderObjectRow(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="w-full h-full bg-[#393939] flex flex-col select-none overflow-hidden border-b border-[#222]">
      {/* Panel Header */}
      <div className="h-[22px] bg-[#464646] border-b border-[#282828] flex items-center justify-between px-2 text-[11px] text-[#cfcfcf]">
        <div className="flex items-center space-x-2.5">
          {/* Grip dots */}
          <div className="flex space-x-0.5 opacity-60">
            <span className="w-1 h-1 bg-[#888] rounded-full inline-block"></span>
            <span className="w-1 h-1 bg-[#888] rounded-full inline-block"></span>
            <span className="w-1 h-1 bg-[#888] rounded-full inline-block"></span>
          </div>

          <span className="hover:text-white cursor-pointer">File</span>
          <span className="hover:text-white cursor-pointer">Edit</span>
          <span className="hover:text-white cursor-pointer">View</span>
          <span className="hover:text-white cursor-pointer">Objects</span>
          <span className="hover:text-white cursor-pointer">Tags</span>
          <span className="hover:text-white cursor-pointer">Bookmarks</span>
        </div>

        {/* Utility Icons */}
        <div className="flex items-center space-x-1.5 text-[#a0a0a0]">
          <button
            onClick={() => setShowSearch(!showSearch)}
            title="Search Objects"
            className="hover:text-white"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </button>
          <button
            onClick={() => onAddObject('cube')}
            title="Add Child Primitive"
            className="hover:text-white text-[13px] font-bold"
          >
            +
          </button>
        </div>
      </div>

      {/* Search Input bar if toggled */}
      {showSearch && (
        <div className="p-1 bg-[#2e2e2e] border-b border-[#222]">
          <input
            type="text"
            placeholder="Search scene objects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#1e1e1e] border border-[#444] text-[#eee] text-[11px] px-2 py-0.5 rounded-[2px] focus:outline-none focus:border-[#e88724]"
          />
        </div>
      )}

      {/* Hierarchy Tree Area */}
      <div className="flex-1 overflow-y-auto bg-[#363636] py-1">
        {objects
          .filter((o) => o.name.toLowerCase().includes(searchTerm.toLowerCase()))
          .map((obj) => renderObjectRow(obj))}
      </div>
    </div>
  );
};
