/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { C4DMaterial, C4DSceneObject, TimelineState, ToolMode, Vector3D } from './types/c4d';
import { StatusAlert } from './types/aiSurvey';
import { MenuBar } from './components/layout/MenuBar';
import { MainToolbar } from './components/layout/MainToolbar';
import { LeftToolPalette } from './components/layout/LeftToolPalette';
import { Viewport3D } from './components/viewport/Viewport3D';
import { ObjectManager } from './components/panels/ObjectManager';
import { AttributeManager } from './components/panels/AttributeManager';
import { Timeline } from './components/panels/Timeline';
import { MaterialManager } from './components/panels/MaterialManager';
import { CoordinateManager } from './components/panels/CoordinateManager';
import { AIGeologicalMapperPanel } from './components/panels/AIGeologicalMapperPanel';
import { StatusBar } from './components/layout/StatusBar';
import { DockLayout } from './components/layout/DockLayout';
import { PictureViewerModal } from './components/modals/PictureViewerModal';
import { RenderSettingsModal } from './components/modals/RenderSettingsModal';
import { calculateCartZ, stepFrame } from './utils/math3d';

// Baseline Mining Tunnel Objects
const getBaselineObjects = (): C4DSceneObject[] => [
  {
    id: 'Mining_Tunnel_Complex',
    name: 'Mining_Tunnel_Complex',
    type: 'group',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 4, y: -60, z: 2 },
    scale: { x: 1, y: 1, z: 1 },
    visibleInEditor: true,
    visibleInRenderer: true,
    locked: false,
    expanded: true,
    materialIds: ['mat_rock', 'mat_timber', 'mat_iron', 'mat_gold'],
    children: [
      {
        id: 'Rock_Tunnel_Mesh',
        name: 'Rock_Tunnel_Mesh',
        type: 'group',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        visibleInEditor: true,
        visibleInRenderer: true,
        locked: false,
        expanded: false,
        materialIds: ['mat_rock'],
      },
      {
        id: 'Timber_Support_Arches',
        name: 'Timber_Support_Arches',
        type: 'group',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        visibleInEditor: true,
        visibleInRenderer: true,
        locked: false,
        expanded: false,
        materialIds: ['mat_timber'],
      },
      {
        id: 'Railway_Tracks',
        name: 'Railway_Tracks',
        type: 'group',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        visibleInEditor: true,
        visibleInRenderer: true,
        locked: false,
        expanded: false,
        materialIds: ['mat_iron', 'mat_timber'],
      },
      {
        id: 'Mine_Cart_Ore',
        name: 'Mine_Cart_Ore',
        type: 'group',
        position: { x: 0, y: 0, z: 400 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        visibleInEditor: true,
        visibleInRenderer: true,
        locked: false,
        expanded: false,
        materialIds: ['mat_iron', 'mat_gold'],
      },
      {
        id: 'Hanging_Work_Lights',
        name: 'Hanging_Work_Lights',
        type: 'group',
        position: { x: 0, y: 620, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        visibleInEditor: true,
        visibleInRenderer: true,
        locked: false,
        expanded: false,
        materialIds: ['mat_gold'],
      },
      {
        id: 'Ventilation_Duct',
        name: 'Ventilation_Duct',
        type: 'cylinder',
        position: { x: -380, y: 580, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        visibleInEditor: true,
        visibleInRenderer: true,
        locked: false,
        expanded: false,
        materialIds: ['mat_iron'],
      },
    ],
  },
];

// Baseline Materials
const getBaselineMaterials = (): C4DMaterial[] => [
  {
    id: 'mat_rock',
    name: 'Rock_Strata',
    color: '#5a544e',
    roughness: 0.88,
    metalness: 0.12,
    specular: 0.3,
  },
  {
    id: 'mat_timber',
    name: 'Timber_Beams',
    color: '#4d3b2c',
    roughness: 0.75,
    metalness: 0.05,
    specular: 0.4,
  },
  {
    id: 'mat_iron',
    name: 'Rusted_Iron',
    color: '#3d3f44',
    roughness: 0.55,
    metalness: 0.72,
    specular: 0.7,
  },
  {
    id: 'mat_gold',
    name: 'Lantern_Gold',
    color: '#ffaa22',
    roughness: 0.25,
    metalness: 0.65,
    specular: 0.9,
  },
];

export default function App() {
  const [layout, setLayout] = useState<string>('Startup');
  const [activeUpperTab, setActiveUpperTab] = useState<'Objects' | 'AI Survey' | 'Takes' | 'Content Browser' | 'Structure'>('Objects');
  const [activeTool, setActiveTool] = useState<ToolMode>('move');
  const [activeLeftMode, setActiveLeftMode] = useState<ToolMode>('model');
  const [isSnapping, setIsSnapping] = useState<boolean>(false);
  const [isWorldSpace, setIsWorldSpace] = useState<boolean>(true);
  const [axisLocks, setAxisLocks] = useState({ x: true, y: true, z: true });

  // Attention-grabbing Status Bar state (supports red errors with popups, amber loading, green success)
  const [statusAlert, setStatusAlert] = useState<StatusAlert>({
    type: 'idle',
    message: 'move elements. Hold down SHIFT to quantize movement / add to the selection in point mode, CTRL to remove.',
  });

  // Modal dialogs
  const [showPictureViewer, setShowPictureViewer] = useState<boolean>(false);
  const [showRenderSettings, setShowRenderSettings] = useState<boolean>(false);

  // Hidden File input for opening saved .c4d.json projects
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Materials for Mining Tunnel
  const [materials, setMaterials] = useState<C4DMaterial[]>(getBaselineMaterials());
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>('mat_rock');

  // Scene Hierarchy Objects for Mining Tunnel
  const [objects, setObjects] = useState<C4DSceneObject[]>(getBaselineObjects());
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>('Mining_Tunnel_Complex');

  // Undo / Redo history stack
  const [historyStack, setHistoryStack] = useState<C4DSceneObject[][]>([]);
  const [redoStack, setRedoStack] = useState<C4DSceneObject[][]>([]);

  // Timeline State
  const [timeline, setTimeline] = useState<TimelineState>({
    currentFrame: 0,
    minFrame: 0,
    previewMaxFrame: 90,
    projectMaxFrame: 90,
    isPlaying: false,
    fps: 30,
    loop: true,
  });

  // Animation Playback Loop
  useEffect(() => {
    if (!timeline.isPlaying) return;
    const interval = setInterval(() => {
      setTimeline((prev) => ({
        ...prev,
        currentFrame: stepFrame(
          prev.currentFrame,
          prev.minFrame,
          prev.previewMaxFrame,
          1,
          prev.loop
        ),
      }));
    }, 1000 / timeline.fps);
    return () => clearInterval(interval);
  }, [timeline.isPlaying, timeline.fps]);

  // Synchronize Mine_Cart_Ore scene tree coordinates with timeline scrubbing
  useEffect(() => {
    const currentZCm = Math.round(calculateCartZ(timeline.currentFrame, 90, 16.0, -16.0) * 100);
    setObjects((prev) =>
      prev.map((root) => {
        if (!root.children) return root;
        return {
          ...root,
          children: root.children.map((c) =>
            c.id === 'Mine_Cart_Ore' ? { ...c, position: { ...c.position, z: currentZCm } } : c
          ),
        };
      })
    );
  }, [timeline.currentFrame]);

  // Handle Layout switching (e.g. "Mining Survey & AI Mapping")
  const handleSelectLayout = (newLayout: string) => {
    setLayout(newLayout);
    if (newLayout.toLowerCase().includes('mining') || newLayout.toLowerCase().includes('survey') || newLayout.toLowerCase().includes('ai')) {
      setActiveUpperTab('AI Survey');
      setStatusAlert({
        type: 'idle',
        message: 'Switched workspace to Mining Survey & AI Mapping photogrammetry workstation.',
      });
    } else {
      setActiveUpperTab('Objects');
      setStatusAlert({
        type: 'idle',
        message: `Layout switched to ${newLayout}.`,
      });
    }
  };

  // Keyboard Shortcuts (Standard Cinema 4D keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid hotkeys when typing in input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setTimeline((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
      } else if (e.key === 'e' || e.key === 'E') {
        setActiveTool('move');
        setStatusAlert({
          type: 'idle',
          message: 'Move tool activated. Drag gizmo or click in viewport to reposition.',
        });
      } else if (e.key === 't' || e.key === 'T') {
        setActiveTool('scale');
        setStatusAlert({ type: 'idle', message: 'Scale tool activated.' });
      } else if (e.key === 'r' || e.key === 'R') {
        setActiveTool('rotate');
        setStatusAlert({ type: 'idle', message: 'Rotate tool activated.' });
      } else if (e.key === '9') {
        setActiveTool('live_selection');
        setStatusAlert({ type: 'idle', message: 'Live Selection activated.' });
      } else if (e.key === 'w' || e.key === 'W') {
        setIsWorldSpace((prev) => !prev);
      } else if (e.key === 'x' || e.key === 'X') {
        setAxisLocks((prev) => ({ ...prev, x: !prev.x }));
      } else if (e.key === 'y' || e.key === 'Y') {
        setAxisLocks((prev) => ({ ...prev, y: !prev.y }));
      } else if (e.key === 'z' || e.key === 'Z') {
        setAxisLocks((prev) => ({ ...prev, z: !prev.z }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Record undo state before modification
  const pushUndoState = () => {
    setHistoryStack((prev) => [...prev.slice(-20), JSON.parse(JSON.stringify(objects))]);
    setRedoStack([]);
  };

  // Undo Handler
  const handleUndo = useCallback(() => {
    if (historyStack.length === 0) {
      setStatusAlert({
        type: 'idle',
        message: 'Nothing left to undo.',
      });
      return;
    }
    const previous = historyStack[historyStack.length - 1];
    setRedoStack((prev) => [...prev, JSON.parse(JSON.stringify(objects))]);
    setHistoryStack((prev) => prev.slice(0, prev.length - 1));
    setObjects(previous);
    setStatusAlert({
      type: 'idle',
      message: 'Undo executed.',
    });
  }, [historyStack, objects]);

  // Redo Handler
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) {
      setStatusAlert({
        type: 'idle',
        message: 'Nothing left to redo.',
      });
      return;
    }
    const next = redoStack[redoStack.length - 1];
    setHistoryStack((prev) => [...prev, JSON.parse(JSON.stringify(objects))]);
    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    setObjects(next);
    setStatusAlert({
      type: 'idle',
      message: 'Redo executed.',
    });
  }, [redoStack, objects]);

  // Revert Project Baseline (Working Revert Arrow ↺)
  const handleRevertProject = useCallback(() => {
    pushUndoState();
    setObjects(getBaselineObjects());
    setMaterials(getBaselineMaterials());
    setSelectedObjectId('Mining_Tunnel_Complex');
    setSelectedMaterialId('mat_rock');
    setTimeline((prev) => ({ ...prev, currentFrame: 0, isPlaying: false }));
    setStatusAlert({
      type: 'success',
      message: 'Mining Site project reverted to default surface & subsurface baseline.',
      details: 'Restored 6 scene nodes, initial rock strata, timber arches, railway tracks, and ore cart.',
    });
  }, [objects]);

  // Update object transform
  const handleUpdateTransform = useCallback(
    (pos: Vector3D, rot: Vector3D, scale: Vector3D) => {
      if (!selectedObjectId) return;
      setObjects((prev) =>
        prev.map((obj) => {
          if (obj.id === selectedObjectId) {
            return { ...obj, position: pos, rotation: rot, scale };
          }
          if (obj.children) {
            return {
              ...obj,
              children: obj.children.map((c) =>
                c.id === selectedObjectId ? { ...c, position: pos, rotation: rot, scale } : c
              ),
            };
          }
          return obj;
        })
      );
    },
    [selectedObjectId]
  );

  // Update object properties (e.g. name, visibility)
  const handleUpdateProperty = (key: string, val: any) => {
    if (!selectedObjectId) return;
    pushUndoState();
    setObjects((prev) =>
      prev.map((obj) => {
        if (obj.id === selectedObjectId) {
          return { ...obj, [key]: val };
        }
        if (obj.children) {
          return {
            ...obj,
            children: obj.children.map((c) =>
              c.id === selectedObjectId ? { ...c, [key]: val } : c
            ),
          };
        }
        return obj;
      })
    );
  };

  // Toggle editor / renderer visibility
  const handleToggleVisibility = (id: string, target: 'editor' | 'renderer') => {
    setObjects((prev) =>
      prev.map((obj) => {
        if (obj.id === id) {
          return target === 'editor'
            ? { ...obj, visibleInEditor: !obj.visibleInEditor }
            : { ...obj, visibleInRenderer: !obj.visibleInRenderer };
        }
        if (obj.children) {
          return {
            ...obj,
            children: obj.children.map((c) =>
              c.id === id
                ? target === 'editor'
                  ? { ...c, visibleInEditor: !c.visibleInEditor }
                  : { ...c, visibleInRenderer: !c.visibleInRenderer }
                : c
            ),
          };
        }
        return obj;
      })
    );
  };

  // Toggle hierarchy expansion
  const handleToggleExpand = (id: string) => {
    setObjects((prev) =>
      prev.map((obj) => (obj.id === id ? { ...obj, expanded: !obj.expanded } : obj))
    );
  };

  // Add new primitive object
  const handleAddObject = (type: string) => {
    pushUndoState();
    const newId = `${type}_${Date.now().toString().slice(-4)}`;
    const formattedName =
      type === 'survey_marker'
        ? 'Survey_Station_Marker'
        : `${type.charAt(0).toUpperCase() + type.slice(1)}`;

    const newObj: C4DSceneObject = {
      id: newId,
      name: formattedName,
      type: type as any,
      position: { x: 0, y: type === 'survey_marker' ? 100 : 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visibleInEditor: true,
      visibleInRenderer: true,
      locked: false,
      expanded: false,
      materialIds: [type === 'survey_marker' ? 'mat_gold' : 'mat_iron'],
    };
    setObjects((prev) => [...prev, newObj]);
    setSelectedObjectId(newId);
    setStatusAlert({
      type: 'success',
      message: `Created new ${newObj.name} object in Mining Site scene.`,
    });
  };

  // Delete object
  const handleDeleteObject = (id: string) => {
    pushUndoState();
    setObjects((prev) => prev.filter((o) => o.id !== id));
    if (selectedObjectId === id) setSelectedObjectId(null);
    setStatusAlert({
      type: 'idle',
      message: `Deleted object ${id}.`,
    });
  };

  // Create new material
  const handleCreateMaterial = () => {
    const newMat: C4DMaterial = {
      id: `mat_${Date.now()}`,
      name: `Mat.${materials.length + 1}`,
      color: '#4e545c',
      roughness: 0.5,
      metalness: 0.1,
      specular: 0.5,
    };
    setMaterials((prev) => [...prev, newMat]);
    setSelectedMaterialId(newMat.id);
  };

  // Apply 3D Survey Markers generated by AI Photogrammetry
  const handleApply3DMarkers = useCallback(
    (points: Array<{ stationId: string; x: number; y: number; z: number; color: string; label: string }>) => {
      pushUndoState();
      const newStationChildren: C4DSceneObject[] = points.map((p) => ({
        id: `Station_${p.stationId}`,
        name: `Station_${p.stationId} (${p.label})`,
        type: 'survey_marker' as any,
        position: { x: Math.round(p.x * 100), y: Math.round(p.y * 100), z: Math.round(p.z * 100) },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        visibleInEditor: true,
        visibleInRenderer: true,
        locked: false,
        expanded: false,
        materialIds: ['mat_gold'],
      }));

      const surveyGroup: C4DSceneObject = {
        id: `AI_Survey_Set_${Date.now().toString().slice(-4)}`,
        name: `AI_Survey_Stations (${points.length} Pts)`,
        type: 'group',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        visibleInEditor: true,
        visibleInRenderer: true,
        locked: false,
        expanded: true,
        materialIds: ['mat_gold'],
        children: newStationChildren,
      };

      setObjects((prev) => [surveyGroup, ...prev]);
      setSelectedObjectId(surveyGroup.id);
      setStatusAlert({
        type: 'success',
        message: `Synthesized ${points.length} 3D Survey Station markers into scene hierarchy.`,
        details: 'Station spatial nodes mapped with sequential distance tags and drift coordinates.',
      });
    },
    [objects]
  );

  // Save Project (.c4d.json export)
  const handleSaveProject = () => {
    const projectData = {
      projectName: 'Mining Site',
      version: 'R19.068',
      timestamp: new Date().toISOString(),
      objects,
      materials,
      timeline,
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mining_Site_Project_${new Date().toISOString().slice(0, 10)}.c4d.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusAlert({
      type: 'success',
      message: 'Project successfully exported as Mining_Site.c4d.json',
      details: 'All surface and subsurface hierarchies, materials, and keyframes saved.',
    });
  };

  // Open Project (.c4d.json import)
  const handleOpenProjectClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.objects && Array.isArray(parsed.objects)) {
          pushUndoState();
          setObjects(parsed.objects);
          if (parsed.materials) setMaterials(parsed.materials);
          if (parsed.timeline) setTimeline(parsed.timeline);
          setStatusAlert({
            type: 'success',
            message: `Loaded Mining Site project "${file.name}".`,
            details: `Successfully restored ${parsed.objects.length} top-level nodes and scene data.`,
          });
        } else {
          setStatusAlert({
            type: 'error',
            errorCode: 'ERR_INVALID_FILE',
            message: 'Invalid Project File Format',
            details: 'The selected JSON file does not contain a valid Cinema 4D scene hierarchy array.',
          });
        }
      } catch (err: any) {
        setStatusAlert({
          type: 'error',
          errorCode: 'ERR_PARSE_FAILED',
          message: 'Failed to read project file',
          details: err.message || 'JSON parse syntax error.',
        });
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  // Selected Object lookup
  const selectedObject =
    objects.find((o) => o.id === selectedObjectId) ||
    objects.flatMap((o) => o.children || []).find((c) => c.id === selectedObjectId) ||
    null;

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-[#292929] text-[#e0e0e0] font-sans">
      {/* Hidden File Input for Opening Saved Projects */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.c4d.json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 1. Main Top Menu Bar */}
      <MenuBar
        currentLayout={layout}
        onSelectLayout={handleSelectLayout}
        onNewObject={handleAddObject}
        onResetView={() =>
          setStatusAlert({ type: 'idle', message: 'Layout reset to Startup default.' })
        }
        onSaveProject={handleSaveProject}
        onOpenProject={handleOpenProjectClick}
        onRevertProject={handleRevertProject}
        onOpenAISurvey={() => {
          setActiveUpperTab('AI Survey');
          setStatusAlert({
            type: 'idle',
            message: 'Opened AI Photogrammetry Survey & Geological Mapping panel.',
          });
        }}
        onTriggerRender={() => setShowPictureViewer(true)}
      />

      {/* 2. Main Horizontal Toolbar */}
      <MainToolbar
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        axisLocks={axisLocks}
        onToggleAxis={(axis) => setAxisLocks((prev) => ({ ...prev, [axis]: !prev[axis] }))}
        isWorldSpace={isWorldSpace}
        onToggleCoordinateSpace={() => setIsWorldSpace((prev) => !prev)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onRevert={handleRevertProject}
        onAddPrimitive={handleAddObject}
        onTriggerRender={() => setShowPictureViewer(true)}
        onOpenRenderSettings={() => setShowRenderSettings(true)}
        onOpenPictureViewer={() => setShowPictureViewer(true)}
      />

      {/* 3. Docking Layout: Central Viewport, Object Manager / AI Survey, Attribute Manager, Timeline, Materials, Coordinates */}
      <DockLayout
        activeUpperTab={activeUpperTab}
        onUpperTabChange={setActiveUpperTab}
        aiSurveyPanel={
          <AIGeologicalMapperPanel
            projectTitle="Mining Site - Surface & Subsurface Mapping"
            onStatusChange={setStatusAlert}
            onApply3DMarkers={handleApply3DMarkers}
          />
        }
        leftPalette={
          <LeftToolPalette
            activeMode={activeLeftMode}
            onSelectMode={setActiveLeftMode}
            isSnapping={isSnapping}
            onToggleSnapping={() => setIsSnapping((prev) => !prev)}
          />
        }
        viewport={
          <Viewport3D
            selectedObject={selectedObject}
            onSelectObject={setSelectedObjectId}
            activeTool={activeTool}
            activeLeftMode={activeLeftMode}
            materials={materials}
            isPlaying={timeline.isPlaying}
            currentFrame={timeline.currentFrame}
            onUpdateTransform={handleUpdateTransform}
          />
        }
        timeline={
          <Timeline
            timeline={timeline}
            onScrub={(frame) => setTimeline((prev) => ({ ...prev, currentFrame: frame }))}
            onTogglePlay={() => setTimeline((prev) => ({ ...prev, isPlaying: !prev.isPlaying }))}
            onStepFrame={(delta) =>
              setTimeline((prev) => ({
                ...prev,
                currentFrame: stepFrame(
                  prev.currentFrame,
                  prev.minFrame,
                  prev.previewMaxFrame,
                  delta,
                  prev.loop
                ),
              }))
            }
            onGoToStart={() => setTimeline((prev) => ({ ...prev, currentFrame: prev.minFrame }))}
            onGoToEnd={() =>
              setTimeline((prev) => ({ ...prev, currentFrame: prev.previewMaxFrame }))
            }
          />
        }
        materialManager={
          <MaterialManager
            materials={materials}
            selectedMaterialId={selectedMaterialId}
            onSelectMaterial={setSelectedMaterialId}
            onUpdateMaterial={(updated) =>
              setMaterials((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
            }
            onCreateMaterial={handleCreateMaterial}
          />
        }
        coordinateManager={
          <CoordinateManager
            selectedObject={selectedObject}
            onApplyCoordinates={handleUpdateTransform}
          />
        }
        objectManager={
          <ObjectManager
            objects={objects}
            selectedObjectId={selectedObjectId}
            onSelectObject={setSelectedObjectId}
            onToggleVisibility={handleToggleVisibility}
            onToggleExpand={handleToggleExpand}
            onDeleteObject={handleDeleteObject}
            onAddObject={handleAddObject}
          />
        }
        attributeManager={
          <AttributeManager
            selectedObject={selectedObject}
            onUpdateTransform={handleUpdateTransform}
            onUpdateProperty={handleUpdateProperty}
          />
        }
      />

      {/* 4. Attention-Grabbing Bottom Status Bar */}
      <StatusBar
        status={statusAlert}
        projectName="Mining Site"
        onRevert={handleRevertProject}
        onClearError={() =>
          setStatusAlert({
            type: 'idle',
            message: 'Ready. All systems operational.',
          })
        }
      />

      {/* 5. Picture Viewer Modal */}
      <PictureViewerModal
        isOpen={showPictureViewer}
        onClose={() => setShowPictureViewer(false)}
        currentFrame={timeline.currentFrame}
      />

      {/* 6. Render Settings Modal */}
      <RenderSettingsModal
        isOpen={showRenderSettings}
        onClose={() => setShowRenderSettings(false)}
        onApplyAndRender={() => setShowPictureViewer(true)}
      />
    </div>
  );
}
