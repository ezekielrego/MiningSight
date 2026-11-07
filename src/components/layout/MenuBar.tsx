import React, { useState } from 'react';

interface MenuBarProps {
  currentLayout: string;
  onSelectLayout: (layout: string) => void;
  onNewObject?: (type: string) => void;
  onResetView?: () => void;
  onSaveProject?: () => void;
  onOpenProject?: () => void;
  onRevertProject?: () => void;
  onOpenAISurvey?: () => void;
  onTriggerRender?: () => void;
}

export const MenuBar: React.FC<MenuBarProps> = ({
  currentLayout,
  onSelectLayout,
  onNewObject,
  onResetView,
  onSaveProject,
  onOpenProject,
  onRevertProject,
  onOpenAISurvey,
  onTriggerRender,
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const menuItems: { name: string; items: { label: string; shortcut?: string; action?: () => void }[] }[] = [
    {
      name: 'File',
      items: [
        { label: 'New Project (Mining Site)', shortcut: 'Ctrl+N', action: onRevertProject },
        { label: 'Open Project / Survey...', shortcut: 'Ctrl+O', action: onOpenProject },
        { label: 'Save Project (.c4d.json)', shortcut: 'Ctrl+S', action: onSaveProject },
        { label: 'Save Project As...', shortcut: 'Ctrl+Shift+S', action: onSaveProject },
        { label: 'Revert to Baseline Project', action: onRevertProject },
        { label: 'Import Survey Images (AI Photogrammetry)', action: onOpenAISurvey },
        { label: 'Export 3D Mesh (.obj)', shortcut: 'OBJ / GLTF', action: onSaveProject },
      ],
    },
    {
      name: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z' },
        { label: 'Redo', shortcut: 'Ctrl+Y' },
        { label: 'Revert All Transformations', action: onRevertProject },
        { label: 'Project Settings: Mining Site Survey', shortcut: 'Ctrl+D' },
        { label: 'Photogrammetry Calibration...', shortcut: 'Ctrl+E', action: onOpenAISurvey },
      ],
    },
    {
      name: 'Create',
      items: [
        { label: 'Survey Station Marker', action: () => onNewObject?.('survey_marker') },
        { label: 'Primitive: Cube', action: () => onNewObject?.('cube') },
        { label: 'Primitive: Cylinder / Borehole Pipe', action: () => onNewObject?.('cylinder') },
        { label: 'Spline: Geological Fault Pen', action: () => onNewObject?.('spline') },
        { label: 'Subdivision Surface: Cavern Arch', action: () => onNewObject?.('generator') },
        { label: 'Camera: Survey Perspective', action: () => onNewObject?.('camera') },
        { label: 'Light: Industrial Lantern', action: () => onNewObject?.('light') },
      ],
    },
    {
      name: 'Select',
      items: [
        { label: 'Live Selection', shortcut: '9' },
        { label: 'Rectangle Selection', shortcut: '0' },
        { label: 'Lasso Selection', shortcut: '8' },
        { label: 'Select Subsurface Drift Mesh' },
      ],
    },
    {
      name: 'Tools',
      items: [
        { label: 'Move Tool', shortcut: 'E' },
        { label: 'Scale Tool', shortcut: 'T' },
        { label: 'Rotate Tool', shortcut: 'R' },
        { label: 'Coordinate System (World/Object)', shortcut: 'W' },
        { label: 'Measure Baseline Drift Distance' },
      ],
    },
    {
      name: 'AI Survey',
      items: [
        { label: 'Open Photogrammetry & Subsurface Mapping', action: onOpenAISurvey },
        { label: 'Tag Inter-Frame Distances (Meters)', action: onOpenAISurvey },
        { label: 'Run Gemini 3.8 Flash Geotechnical Solver', action: onOpenAISurvey },
        { label: 'View Survey History Records', action: onOpenAISurvey },
      ],
    },
    {
      name: 'Render',
      items: [
        { label: 'Render View', shortcut: 'Ctrl+R', action: onTriggerRender },
        { label: 'Render to Picture Viewer', shortcut: 'Shift+R', action: onTriggerRender },
        { label: 'Edit Render Settings...', shortcut: 'Ctrl+B' },
      ],
    },
    {
      name: 'Window',
      items: [
        { label: 'Picture Viewer', shortcut: 'Shift+F6' },
        { label: 'AI Geological Mapper Panel', action: onOpenAISurvey },
        { label: 'Object Manager' },
        { label: 'Attribute Manager' },
        { label: 'Coordinate Manager' },
        { label: 'Reset Layout to Default', action: onResetView },
      ],
    },
    {
      name: 'Help',
      items: [
        { label: 'Mining Site Visualisation Help...', shortcut: 'Ctrl+F1' },
        { label: 'Photogrammetry Tagging Reference' },
        { label: 'About Mining Site 3D CAD' },
      ],
    },
  ];

  return (
    <div className="relative w-full h-[22px] bg-[#323232] border-b border-[#1e1e1e] flex items-center justify-between px-1.5 text-[11px] text-[#cfcfcf] select-none font-sans z-30">
      {/* Horizontal Menu Items */}
      <div className="flex items-center space-x-0.5 overflow-x-hidden whitespace-nowrap">
        {menuItems.map((menu) => (
          <div key={menu.name} className="relative">
            <button
              onClick={() => setActiveMenu(activeMenu === menu.name ? null : menu.name)}
              onMouseEnter={() => {
                if (activeMenu !== null) setActiveMenu(menu.name);
              }}
              className={`px-1.5 py-0.5 rounded-[2px] transition-colors cursor-pointer ${
                activeMenu === menu.name
                  ? 'bg-[#e88724] text-black font-bold'
                  : menu.name === 'AI Survey'
                  ? 'text-[#e88724] font-semibold hover:bg-[#464646]'
                  : 'hover:bg-[#464646] hover:text-white'
              }`}
            >
              {menu.name}
            </button>

            {/* Dropdown Menu */}
            {activeMenu === menu.name && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setActiveMenu(null)}
                />
                <div className="absolute top-[21px] left-0 min-w-[230px] bg-[#363636] border border-[#1b1b1b] shadow-2xl py-1 z-50 rounded-[1px] text-[#e0e0e0]">
                  {menu.items.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        item.action?.();
                        setActiveMenu(null);
                      }}
                      className="w-full text-left px-3 py-1 flex items-center justify-between hover:bg-[#e88724] hover:text-black group text-[11px] cursor-pointer"
                    >
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <span className="text-[10px] text-[#888] group-hover:text-black ml-4">
                          {item.shortcut}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Center Project Title Branding */}
      <div className="hidden lg:flex items-center space-x-2 text-[10.5px] text-[#aaa]">
        <span className="font-bold text-[#e88724]">Mining Site</span>
        <span>—</span>
        <span className="truncate max-w-xs text-[#ddd]">Surface & Subsurface Visualisation and Mapping</span>
      </div>

      {/* Right side: Layout Selector and Utility Buttons */}
      <div className="flex items-center space-x-2 flex-shrink-0 pl-2">
        <div className="flex items-center space-x-1">
          <span className="text-[#a0a0a0] text-[11px]">Layout:</span>
          <select
            value={currentLayout}
            onChange={(e) => onSelectLayout(e.target.value)}
            className="bg-[#262626] border border-[#484848] text-[#e8e8e8] text-[11px] px-1 py-0.5 rounded-[2px] cursor-pointer focus:outline-none focus:border-[#e88724]"
          >
            <option value="Startup">Startup</option>
            <option value="Mining Survey & AI Mapping">Mining Survey & AI Mapping</option>
            <option value="Modeling">Modeling</option>
            <option value="Sculpting">Sculpting</option>
            <option value="Animation">Animation</option>
            <option value="Render">Render</option>
          </select>
        </div>

        {/* AI Quick Button */}
        <button
          onClick={onOpenAISurvey}
          title="Open AI Photogrammetry Panel"
          className="px-1.5 py-0.5 bg-[#e88724] hover:bg-[#ff9933] text-black font-bold text-[10px] rounded-[2px] cursor-pointer"
        >
          AI Survey
        </button>

        {/* Lock layout icon */}
        <button title="Lock Workspace" className="text-[#999] hover:text-white p-0.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </button>
      </div>
    </div>
  );
};
