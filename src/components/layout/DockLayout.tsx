import React, { useRef, useState } from 'react';

interface DockLayoutProps {
  leftPalette: React.ReactNode;
  viewport: React.ReactNode;
  timeline: React.ReactNode;
  materialManager: React.ReactNode;
  coordinateManager: React.ReactNode;
  objectManager: React.ReactNode;
  attributeManager: React.ReactNode;
  aiSurveyPanel?: React.ReactNode;
  activeUpperTab?: 'Objects' | 'AI Survey' | 'Takes' | 'Content Browser' | 'Structure';
  onUpperTabChange?: (tab: 'Objects' | 'AI Survey' | 'Takes' | 'Content Browser' | 'Structure') => void;
}

export const DockLayout: React.FC<DockLayoutProps> = ({
  leftPalette,
  viewport,
  timeline,
  materialManager,
  coordinateManager,
  objectManager,
  attributeManager,
  aiSurveyPanel,
  activeUpperTab: controlledUpperTab,
  onUpperTabChange,
}) => {
  // Proportions matching 1366x705 reference:
  // Right panel width percentage (approx 34% of available width)
  const [rightPanelWidthPercent, setRightPanelWidthPercent] = useState<number>(36);
  // Bottom panel height percentage (approx 28% of central height)
  const [bottomPanelHeightPercent, setBottomPanelHeightPercent] = useState<number>(28);
  // Object Manager vs Attribute Manager split (approx 52% / 48%)
  const [objectManagerHeightPercent, setObjectManagerHeightPercent] = useState<number>(55);
  // Material Manager vs Coordinate Manager split (approx 45% / 55%)
  const [materialManagerWidthPercent, setMaterialManagerWidthPercent] = useState<number>(45);

  // Active right tabs
  const [internalUpperTab, setInternalUpperTab] = useState<'Objects' | 'AI Survey' | 'Takes' | 'Content Browser' | 'Structure'>('Objects');
  const activeUpperTab = controlledUpperTab !== undefined ? controlledUpperTab : internalUpperTab;

  const handleUpperTabChange = (tab: 'Objects' | 'AI Survey' | 'Takes' | 'Content Browser' | 'Structure') => {
    setInternalUpperTab(tab);
    onUpperTabChange?.(tab);
  };
  const [activeLowerTab, setActiveLowerTab] = useState<'Attributes' | 'Layers'>('Attributes');

  const containerRef = useRef<HTMLDivElement>(null);

  // Splitter drag state
  const startDrag = (
    type: 'vertical-right' | 'horizontal-bottom' | 'horizontal-right' | 'vertical-bottom',
    e: React.MouseEvent
  ) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialRightWidth = rightPanelWidthPercent;
    const initialBottomHeight = bottomPanelHeightPercent;
    const initialObjectHeight = objectManagerHeightPercent;
    const initialMatWidth = materialManagerWidthPercent;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      if (type === 'vertical-right') {
        const deltaX = moveEvent.clientX - startX;
        const deltaPercent = (deltaX / rect.width) * 100;
        const newRight = Math.max(20, Math.min(50, initialRightWidth - deltaPercent));
        setRightPanelWidthPercent(newRight);
      } else if (type === 'horizontal-bottom') {
        const deltaY = moveEvent.clientY - startY;
        const deltaPercent = (deltaY / rect.height) * 100;
        const newBottom = Math.max(15, Math.min(45, initialBottomHeight - deltaPercent));
        setBottomPanelHeightPercent(newBottom);
      } else if (type === 'horizontal-right') {
        const deltaY = moveEvent.clientY - startY;
        const deltaPercent = (deltaY / rect.height) * 100;
        const newObj = Math.max(20, Math.min(80, initialObjectHeight + deltaPercent));
        setObjectManagerHeightPercent(newObj);
      } else if (type === 'vertical-bottom') {
        const deltaX = moveEvent.clientX - startX;
        const deltaPercent = (deltaX / (rect.width * (1 - rightPanelWidthPercent / 100))) * 100;
        const newMat = Math.max(25, Math.min(75, initialMatWidth + deltaPercent));
        setMaterialManagerWidthPercent(newMat);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div ref={containerRef} className="flex-1 w-full flex overflow-hidden select-none bg-[#292929]">
      {/* 1. Far Left Tool Palette */}
      {leftPalette}

      {/* 2. Central Area: Viewport, Timeline, and Bottom Workspaces */}
      <div
        className="flex flex-col h-full overflow-hidden"
        style={{ width: `calc(${100 - rightPanelWidthPercent}% - 36px)` }}
      >
        {/* Upper Viewport */}
        <div
          className="w-full relative overflow-hidden"
          style={{ height: `calc(${100 - bottomPanelHeightPercent}% - 64px)` }}
        >
          {viewport}
        </div>

        {/* Timeline Bar (Fixed 64px height) */}
        <div className="w-full h-[64px] flex-shrink-0">
          {timeline}
        </div>

        {/* Resizer Splitter between Viewport/Timeline and Bottom Workspaces */}
        <div
          onMouseDown={(e) => startDrag('horizontal-bottom', e)}
          className="h-[4px] w-full bg-[#202020] hover:bg-[#e88724] cursor-row-resize transition-colors z-20 flex-shrink-0 border-y border-[#181818]"
        />

        {/* Bottom Workspaces: Material Manager and Coordinate Manager */}
        <div
          className="w-full flex overflow-hidden flex-shrink-0"
          style={{ height: `${bottomPanelHeightPercent}%` }}
        >
          {/* Vertical Maxon Cinema 4D Ribbon along bottom left edge */}
          <div className="w-[18px] bg-[#1e1e1e] border-r border-[#151515] flex flex-col items-center justify-center py-2 flex-shrink-0">
            <span
              className="text-[9px] font-bold text-[#888] tracking-widest uppercase transform -rotate-90 whitespace-nowrap"
              style={{ letterSpacing: '0.15em' }}
            >
              <span className="text-[#e88724]">MAXON</span> CINEMA 4D
            </span>
          </div>

          {/* Material Manager */}
          <div
            className="h-full overflow-hidden"
            style={{ width: `${materialManagerWidthPercent}%` }}
          >
            {materialManager}
          </div>

          {/* Vertical Splitter between Materials and Coordinates */}
          <div
            onMouseDown={(e) => startDrag('vertical-bottom', e)}
            className="w-[4px] h-full bg-[#202020] hover:bg-[#e88724] cursor-col-resize transition-colors z-20 flex-shrink-0 border-x border-[#181818]"
          />

          {/* Coordinate Manager */}
          <div
            className="h-full overflow-hidden"
            style={{ width: `calc(${100 - materialManagerWidthPercent}% - 4px)` }}
          >
            {coordinateManager}
          </div>
        </div>
      </div>

      {/* Main Vertical Splitter between Viewport column and Right panel column */}
      <div
        onMouseDown={(e) => startDrag('vertical-right', e)}
        className="w-[4px] h-full bg-[#202020] hover:bg-[#e88724] cursor-col-resize transition-colors z-20 flex-shrink-0 border-x border-[#181818]"
      />

      {/* 3. Right Management Column: Object Manager & Attribute Manager */}
      <div
        className="h-full flex overflow-hidden flex-shrink-0"
        style={{ width: `${rightPanelWidthPercent}%` }}
      >
        {/* Panels Column */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Object Manager or AI Survey (Upper Right) */}
          <div
            className="w-full overflow-hidden flex flex-col"
            style={{ height: `${objectManagerHeightPercent}%` }}
          >
            {activeUpperTab === 'AI Survey' && aiSurveyPanel ? (
              aiSurveyPanel
            ) : (
              objectManager
            )}
          </div>

          {/* Splitter between Object Manager / AI Survey and Attribute Manager */}
          <div
            onMouseDown={(e) => startDrag('horizontal-right', e)}
            className="h-[4px] w-full bg-[#202020] hover:bg-[#e88724] cursor-row-resize transition-colors z-20 flex-shrink-0 border-y border-[#181818]"
          />

          {/* Attribute Manager (Lower Right) */}
          <div
            className="w-full overflow-hidden"
            style={{ height: `calc(${100 - objectManagerHeightPercent}% - 4px)` }}
          >
            {attributeManager}
          </div>
        </div>

        {/* Far Right Vertical Tab Strips (Classic C4D side tabs) */}
        <div className="w-[18px] bg-[#2b2b2b] border-l border-[#222] flex flex-col justify-between py-2 flex-shrink-0">
          {/* Upper Vertical Tabs */}
          <div className="flex flex-col items-center space-y-7 pt-2">
            {(['Objects', 'AI Survey', 'Takes', 'Content Browser', 'Structure'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => handleUpperTabChange(tab)}
                title={`Switch to ${tab}`}
                className={`text-[9.5px] font-medium tracking-tight transform -rotate-90 whitespace-nowrap transition-colors cursor-pointer ${
                  activeUpperTab === tab ? 'text-[#e88724] font-bold' : 'text-[#888] hover:text-[#ddd]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Lower Vertical Tabs */}
          <div className="flex flex-col items-center space-y-6 pb-2">
            {(['Attributes', 'Layers'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveLowerTab(tab)}
                className={`text-[9.5px] font-medium tracking-tight transform -rotate-90 whitespace-nowrap transition-colors ${
                  activeLowerTab === tab ? 'text-[#e88724] font-bold' : 'text-[#888] hover:text-[#ddd]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
