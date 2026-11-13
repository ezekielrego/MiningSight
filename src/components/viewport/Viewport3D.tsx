import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import {
  RotateCw,
  Footprints,
  Lightbulb,
  Ruler,
  Camera,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Target,
  Sparkles,
  Layers,
  Box,
  Check,
  Crosshair,
  Image as ImageIcon,
  Sliders as SlidersIcon,
  Map as MapIcon,
} from 'lucide-react';
import { MiningTunnelRig, ShadingDisplayMode } from '../../scene/miningTunnelGenerator';
import { TunnelPresetId, ProceduralTunnelParams } from '../../types/tunnelScene';
import { TUNNEL_PRESETS, createTunnelRigByPreset, getPresetRootId } from '../../scene/tunnelPresetRegistry';
import { ReferencePhotoModal } from '../modals/ReferencePhotoModal';
import { LiveStreamViewer } from './LiveStreamViewer';
import { SceneParametersModal } from '../modals/SceneParametersModal';
import { UndergroundMapEditor } from '../panels/UndergroundMapEditor';
import { C4DMaterial, C4DSceneObject, ToolMode, Vector3D } from '../../types/c4d';
import { CameraKeyframe, CameraTour, HotspotInfo, KeyframeAnnotation } from '../../types/cameraTour';
import { degToRad } from '../../utils/math3d';
import { GasMark, MediaMarker, ProjectAsset } from '../../types/project';
import { ReconstructionMapGeometry, ReconstructionMapSelection } from '../../types/aiSurvey';
import { toEmbeddedWebViewerUrl } from '../../utils/webViewerUrl';
import {
  interpolateCameraTour,
  calculateDistanceMeters,
  getDefaultTunnelHotspots,
} from '../../utils/cameraAnimation';

const flattenSceneObjects = (objects: C4DSceneObject[], result = new Map<string, C4DSceneObject>()) => {
  objects.forEach((object) => {
    result.set(object.id, object);
    if (object.children) flattenSceneObjects(object.children, result);
  });
  return result;
};

const resolveSelectableObjectId = (object: THREE.Object3D, fallback: string | null) => {
  let current: THREE.Object3D | null = object;
  while (current) {
    const selectionId = current.userData?.selectionId;
    if (typeof selectionId === 'string') return selectionId;
    current = current.parent;
  }
  return fallback;
};

const liveSelectionCursor = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M4 2l6 17 3-7 7-3L4 2z' fill='%23ffffff' stroke='%23000000' stroke-width='1.5'/%3E%3Ccircle cx='17' cy='17' r='4' fill='none' stroke='%23e88724' stroke-width='2'/%3E%3C/svg%3E\") 4 3, crosshair";

interface ViewerOverlayProps {
  title: string;
  minimized: boolean;
  onToggle: () => void;
  className?: string;
  children: React.ReactNode;
}

const ViewerOverlay: React.FC<ViewerOverlayProps> = ({ title, minimized, onToggle, className = '', children }) => (
  <div className={`pointer-events-auto transition-opacity duration-150 opacity-60 hover:opacity-100 ${className}`}>
    {minimized ? (
      <button
        onClick={onToggle}
        className="flex items-center gap-1 px-2 py-1 bg-black/55 hover:bg-black/85 border border-[#555] rounded-[3px] text-[9px] text-[#ddd] cursor-pointer shadow-lg"
        title={`Restore ${title}`}
      >
        <span className="text-[#e88724] font-bold">+</span><span>{title}</span>
      </button>
    ) : (
      <div className="bg-black/55 hover:bg-black/85 backdrop-blur-md border border-[#555] rounded-[3px] shadow-xl">
        <div className="flex items-center justify-between gap-3 px-2 py-1 border-b border-white/10 text-[9px] text-[#bbb]">
          <span className="font-bold uppercase tracking-wide truncate">{title}</span>
          <button onClick={onToggle} className="text-[#aaa] hover:text-white cursor-pointer px-1" title={`Minimize ${title}`}>−</button>
        </div>
        <div className="p-2">{children}</div>
      </div>
    )}
  </div>
);

interface Viewport3DProps {
  selectedObject: C4DSceneObject | null;
  onSelectObject: (objId: string | null) => void;
  activeTool: ToolMode;
  activeLeftMode?: ToolMode;
  materials: C4DMaterial[];
  sceneObjects?: C4DSceneObject[];
  isPlaying: boolean;
  currentFrame: number;
  timelineMinFrame?: number;
  timelineMaxFrame?: number;
  playbackSpeed?: number;
  onUpdateTransform?: (pos: Vector3D, rot: Vector3D, scale: Vector3D) => void;
  activeTour?: CameraTour | null;
  isTourPlaybackEnabled?: boolean;
  onRecordCurrentView?: (camState: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    fov: number;
  }) => void;
  keyframeAnnotations?: KeyframeAnnotation[];
  onAddKeyframeAnnotation?: (
    position: { x: number; y: number; z: number },
    note: string,
    camState: { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; fov: number }
  ) => void;
  surveyStationMarkers?: Array<{
    stationId: string;
    x: number;
    y: number;
    z: number;
    color: string;
    label: string;
  }>;
  onJumpToSurveyTab?: () => void;
  currentPresetId?: TunnelPresetId;
  activeProjectId?: string | null;
  cameraResetRequest?: number;
  onSelectPreset?: (presetId: TunnelPresetId) => void;
  proceduralParams?: ProceduralTunnelParams;
  onUpdateProceduralParams?: (params: ProceduralTunnelParams) => void;
  activeAsset?: ProjectAsset | null;
  mediaMarkers?: MediaMarker[];
  onAddMediaMarker?: (timeSeconds: number, note: string) => void;
  gasMarks?: GasMark[];
  onAddGasMark?: (mark: GasMark) => void;
  onSetPlayback?: (isPlaying: boolean) => void;
  onCaptureReferenceImage?: (dataUrl: string, name: string) => void;
  onSaveLiveFile?: (file: File) => void | Promise<void>;
  mapGeometry?: ReconstructionMapGeometry | null;
  mapSelection?: ReconstructionMapSelection | null;
  mapMarkingEnabled?: boolean;
  mapDrawingMode?: boolean;
  onMapPointPicked?: (point: { x: number; y: number }) => void;
  onMapFeaturePicked?: (feature: import('../../types/aiSurvey').ReconstructionMapFeature) => void;
  showMap?: boolean;
  onToggleMap?: () => void;
  onMapGeometryChange?: (geometry: ReconstructionMapGeometry) => void;
  onMapEditorStatus?: (message: string) => void;
  onMapMarkingChange?: (enabled: boolean) => void;
  liveStreamOpen?: boolean;
  onCloseLiveStream?: () => void;
  liveStreamSourceUrl?: string | null;
}

export const Viewport3D: React.FC<Viewport3DProps> = ({
  selectedObject,
  onSelectObject,
  activeTool,
  activeLeftMode,
  materials,
  sceneObjects = [],
  isPlaying,
  currentFrame,
  timelineMinFrame = 0,
  timelineMaxFrame = 90,
  playbackSpeed = 1,
  onUpdateTransform,
  activeTour,
  isTourPlaybackEnabled = true,
  onRecordCurrentView,
  keyframeAnnotations = [],
  onAddKeyframeAnnotation,
  surveyStationMarkers = [],
  onJumpToSurveyTab,
  currentPresetId = 'rugged_timbered_photo',
  activeProjectId = null,
  cameraResetRequest = 0,
  onSelectPreset,
  proceduralParams = TUNNEL_PRESETS.rugged_timbered_photo.defaultParams,
  onUpdateProceduralParams,
  activeAsset = null,
  mediaMarkers = [],
  onAddMediaMarker,
  gasMarks = [],
  onAddGasMark,
  onSetPlayback,
  onCaptureReferenceImage,
  onSaveLiveFile,
  mapGeometry = null,
  mapSelection = null,
  mapMarkingEnabled = false,
  mapDrawingMode = false,
  onMapPointPicked,
  onMapFeaturePicked,
  showMap = false,
  onToggleMap,
  onMapGeometryChange,
  onMapEditorStatus,
  onMapMarkingChange,
  liveStreamOpen = false,
  onCloseLiveStream,
  liveStreamSourceUrl = null,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coveredByWorldRef = useRef(false);
  coveredByWorldRef.current = !showMap && (liveStreamOpen || ['world', 'image', 'video'].includes(activeAsset?.kind || ''));
  const [connectedViewerReload, setConnectedViewerReload] = useState(0);

  // Three.js internal references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const miningTunnelRigRef = useRef<MiningTunnelRig | null>(null);
  const gizmoGroupRef = useRef<THREE.Group | null>(null);
  const flashlightRef = useRef<THREE.SpotLight | null>(null);
  const surveyMarkersGroupRef = useRef<THREE.Group | null>(null);
  const annotationsGroupRef = useRef<THREE.Group | null>(null);
  const gasMarksGroupRef = useRef<THREE.Group | null>(null);
  const gasTextureRef = useRef<THREE.Texture | null>(null);
  const rulerLineRef = useRef<THREE.Line | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const externalModelGroupRef = useRef<THREE.Group | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoTimeRef = useRef(0);
  const walkBoundsRef = useRef({ minX: -4.2, maxX: 2.4, minY: 1.2, maxY: 4.8, minZ: -23.0, maxZ: 23.0 });
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoTime, setVideoTime] = useState(0);
  const [assetLoadState, setAssetLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [assetLoadMessage, setAssetLoadMessage] = useState('');
  const [assetLoadId, setAssetLoadId] = useState<string | null>(null);
  const worldFrameRef = useRef<HTMLIFrameElement>(null);
  const [rigLoad, setRigLoad] = useState<{ params: ProceduralTunnelParams | null; state: 'loading' | 'ready' | 'error'; message?: string }>({ params: null, state: 'loading' });
  const viewerLoadError = !showMap && !liveStreamOpen && (activeAsset ? assetLoadId === activeAsset.id && assetLoadState === 'error' ? assetLoadMessage : '' : !activeProjectId && rigLoad.state === 'error' ? rigLoad.message : '');
  const viewerLoadName = activeAsset?.name || proceduralParams.name || TUNNEL_PRESETS[currentPresetId]?.name || 'model';

  // Navigation mode: 'orbit' (C4D orbital viewer) vs 'walk' (First-Person walkable drift inspection)
  const [navMode, setNavMode] = useState<'orbit' | 'walk'>('orbit');
  const [highlightedSelectionId, setHighlightedSelectionId] = useState<string | null>(null);

  // Miner's Headlamp / Flashlight state
  const [flashlightOn, setFlashlightOn] = useState<boolean>(true);

  // 3D Measurement Tool state
  const [isRulerActive, setIsRulerActive] = useState<boolean>(false);
  const [rulerPoints, setRulerPoints] = useState<Array<{ x: number; y: number; z: number }>>([]);
  const [measuredDistance, setMeasuredDistance] = useState<number | null>(null);

  // Hotspot Inspection state
  const [hotspots] = useState<HotspotInfo[]>(getDefaultTunnelHotspots());
  const [selectedHotspot, setSelectedHotspot] = useState<HotspotInfo | null>(null);

  // Shading mode state
  const [shadingMode, setShadingMode] = useState<ShadingDisplayMode>('gouraud');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [clearView, setClearView] = useState<boolean>(false);
  const [displayMenuOpen, setDisplayMenuOpen] = useState<boolean>(false);
  const [cameraMenuOpen, setCameraMenuOpen] = useState<boolean>(false);
  const [viewMenuOpen, setViewMenuOpen] = useState<boolean>(false);
  const [hotspotMenuOpen, setHotspotMenuOpen] = useState<boolean>(false);
  const [presetMenuOpen, setPresetMenuOpen] = useState<boolean>(false);
  const [showReferenceModal, setShowReferenceModal] = useState<boolean>(false);
  const [showParametersModal, setShowParametersModal] = useState<boolean>(false);
  const [showOnscreenWalkControls, setShowOnscreenWalkControls] = useState<boolean>(true);
  const [walkSprint, setWalkSprint] = useState(false);
  const [isAnnotationMode, setIsAnnotationMode] = useState<boolean>(false);
  const [isGasBrushActive, setIsGasBrushActive] = useState<boolean>(false);
  const [gasBrushColor, setGasBrushColor] = useState('#83d8c7');
  const [gasBrushRadius, setGasBrushRadius] = useState(1.25);
  const [gasConcentration, setGasConcentration] = useState(0.28);
  const [pendingAnnotationPosition, setPendingAnnotationPosition] = useState<{ x: number; y: number; z: number } | null>(null);
  const [annotationNote, setAnnotationNote] = useState('');
  const [minimizedOverlays, setMinimizedOverlays] = useState<Record<string, boolean>>({});
  const isGasBrushingRef = useRef(false);
  const gasStrokeRef = useRef<string | null>(null);
  const gasLastStampRef = useRef<{ space: GasMark['space']; x: number; y: number; z?: number } | null>(null);

  const toggleOverlay = useCallback((id: string) => {
    setMinimizedOverlays((current) => ({ ...current, [id]: !current[id] }));
  }, []);

  const restoreOverlay = useCallback((id: string) => {
    setMinimizedOverlays((current) => (current[id] ? { ...current, [id]: false } : current));
  }, []);

  // Keep the render loop stable. Rebuilding the WebGL scene on every timeline frame
  // made Walk Mode stutter and made loaded content disappear during playback.
  const isPlayingRef = useRef(isPlaying);
  const currentFrameRef = useRef(currentFrame);
  const navModeRef = useRef(navMode);
  const flashlightOnRef = useRef(flashlightOn);
  const activeTourRef = useRef(activeTour);
  const isTourPlaybackEnabledRef = useRef(isTourPlaybackEnabled);
  const manualNavigationRef = useRef(false);
  const lastNavigationFrameRef = useRef(currentFrame);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { currentFrameRef.current = currentFrame; }, [currentFrame]);
  useEffect(() => { navModeRef.current = navMode; }, [navMode]);
  useEffect(() => { flashlightOnRef.current = flashlightOn; }, [flashlightOn]);
  useEffect(() => { activeTourRef.current = activeTour; }, [activeTour]);
  useEffect(() => { isTourPlaybackEnabledRef.current = isTourPlaybackEnabled; }, [isTourPlaybackEnabled]);
  useEffect(() => {
    // A timeline change is an explicit request to inspect the tour at that frame.
    // It should re-enable the tour camera, while pointer/keyboard input below
    // can take control again without being overwritten on the next render tick.
    if (lastNavigationFrameRef.current !== currentFrame) {
      lastNavigationFrameRef.current = currentFrame;
      manualNavigationRef.current = false;
    }
  }, [currentFrame]);
  useEffect(() => {
    // Starting playback intentionally hands the camera back to the tour path.
    if (isPlaying) manualNavigationRef.current = false;
  }, [isPlaying]);

  // Align camera to exact perspective of reference photo
  const alignCameraToPhotoReference = useCallback(() => {
    manualNavigationRef.current = true;
    onSetPlayback?.(false);
    setNavMode('walk');
    walkPosRef.current.set(0, 1.85, 17.5);
    walkYawRef.current = Math.PI;
    walkPitchRef.current = -0.04;
    targetRef.current.set(0, 1.85, -25);
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 1.85, 17.5);
      cameraRef.current.lookAt(0, 1.85, -25);
      cameraRef.current.fov = 46;
      cameraRef.current.updateProjectionMatrix();
    }
  }, [onSetPlayback]);

  // Camera navigation coordinates
  // Orbit coordinates:
  const sphericalRef = useRef<THREE.Spherical>(new THREE.Spherical(33, 1.18, 0.44));
  const targetRef = useRef<THREE.Vector3>(new THREE.Vector3(-0.5, 3.0, 0));

  // Walk mode state (inside the tunnel: position + yaw & pitch)
  const walkPosRef = useRef<THREE.Vector3>(new THREE.Vector3(-0.5, 1.85, 18.0));
  const walkVelocityRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const walkYawRef = useRef<number>(Math.PI); // Facing inward toward -Z
  const walkPitchRef = useRef<number>(-0.05);
  const isWalkingRef = useRef<{ w: boolean; s: boolean; a: boolean; d: boolean; shift: boolean }>({
    w: false,
    s: false,
    a: false,
    d: false,
    shift: false,
  });

  // Dragging state
  const isDraggingRef = useRef<boolean>(false);
  const dragModeRef = useRef<'orbit' | 'pan' | 'zoom' | 'look' | 'transform' | 'none'>('none');
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDistanceRef = useRef<number | null>(null);
  const transformDragRef = useRef<{ position: Vector3D; rotation: Vector3D; scale: Vector3D } | null>(null);

  const clampWalkPosition = useCallback((position: THREE.Vector3) => {
    const bounds = walkBoundsRef.current;
    return {
      x: Math.max(bounds.minX, Math.min(bounds.maxX, position.x)),
      y: Math.max(bounds.minY, Math.min(bounds.maxY, position.y)),
      z: Math.max(bounds.minZ, Math.min(bounds.maxZ, position.z)),
    };
  }, []);

  const resetWalkPosition = useCallback((entrance = false) => {
    const bounds = walkBoundsRef.current;
    walkPosRef.current.set(
      (bounds.minX + bounds.maxX) / 2,
      Math.max(bounds.minY, Math.min(bounds.maxY, 1.85)),
      entrance ? bounds.maxZ - Math.min(2, Math.max(0.5, (bounds.maxZ - bounds.minZ) * 0.08)) : (bounds.minZ + bounds.maxZ) / 2
    );
    walkVelocityRef.current.set(0, 0, 0);
    walkYawRef.current = Math.PI;
    walkPitchRef.current = -0.05;
    restoreOverlay('walkBanner');
    restoreOverlay('walkControls');
  }, [restoreOverlay]);

  const setOrbitView = useCallback((radius: number, phi: number, theta: number, target: { x: number; y: number; z: number }) => {
    manualNavigationRef.current = true;
    isWalkingRef.current.w = false;
    isWalkingRef.current.a = false;
    isWalkingRef.current.s = false;
    isWalkingRef.current.d = false;
    onSetPlayback?.(false);
    setNavMode('orbit');
    sphericalRef.current.set(radius, phi, theta);
    targetRef.current.set(target.x, target.y, target.z);
  }, [onSetPlayback]);

  useEffect(() => {
    if (!cameraResetRequest) return;
    setOrbitView(33, 1.18, 0.44, { x: -0.5, y: 3.0, z: 0 });
  }, [cameraResetRequest, setOrbitView]);

  const focusSelectedObject = useCallback(() => {
    const root = externalModelGroupRef.current || (!activeProjectId ? miningTunnelRigRef.current?.root : null);
    if (!root || !selectedObject) return;
    let selectedNode: THREE.Object3D = root;
    root.traverse((node) => {
      const id = node.userData?.selectionId || node.name;
      if (id === selectedObject.id) selectedNode = node;
    });
    const bounds = new THREE.Box3().setFromObject(selectedNode);
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    setOrbitView(Math.max(6, Math.min(140, size.length() * 1.6)), Math.PI / 2.6, Math.PI / 4, center);
  }, [selectedObject, activeProjectId, setOrbitView]);

  // Expose current camera state for recording keyframes
  const captureCurrentCameraState = useCallback(() => {
    if (!cameraRef.current) return null;
    const cam = cameraRef.current;
    let tgt = targetRef.current.clone();

    if (navMode === 'walk') {
      const dir = new THREE.Vector3(
        -Math.sin(walkYawRef.current) * Math.cos(walkPitchRef.current),
        Math.sin(walkPitchRef.current),
        -Math.cos(walkYawRef.current) * Math.cos(walkPitchRef.current)
      );
      tgt = walkPosRef.current.clone().addScaledVector(dir, 10);
    }

    return {
      position: { x: Number(cam.position.x.toFixed(2)), y: Number(cam.position.y.toFixed(2)), z: Number(cam.position.z.toFixed(2)) },
      target: { x: Number(tgt.x.toFixed(2)), y: Number(tgt.y.toFixed(2)), z: Number(tgt.z.toFixed(2)) },
      fov: cam.fov,
    };
  }, [navMode]);

  const handleRecordViewClick = () => {
    const state = captureCurrentCameraState();
    if (state && onRecordCurrentView) {
      onRecordCurrentView(state);
    }
  };

  // Jump camera to keyframe
  const jumpCameraToKeyframe = useCallback((kf: CameraKeyframe) => {
    if (!cameraRef.current) return;
    targetRef.current.set(kf.target.x, kf.target.y, kf.target.z);
    walkPosRef.current.set(kf.position.x, kf.position.y, kf.position.z);

    const posVec = new THREE.Vector3(kf.position.x, kf.position.y, kf.position.z);
    const dir = new THREE.Vector3().subVectors(targetRef.current, posVec);
    sphericalRef.current.setFromVector3(dir.negate());

    if (kf.fov && cameraRef.current) {
      cameraRef.current.fov = kf.fov;
      cameraRef.current.updateProjectionMatrix();
    }
  }, []);

  // Sync left palette modes with 3D wireframe / point display
  useEffect(() => {
    if (!activeLeftMode) return;
    if (activeLeftMode === 'polygon') setShadingMode('gouraud_lines');
    else if (activeLeftMode === 'edge') setShadingMode('wireframe');
    else if (activeLeftMode === 'point') setShadingMode('points');
    else if (activeLeftMode === 'model') setShadingMode('gouraud');
  }, [activeLeftMode]);

  // Sync materials with Three.js meshes
  useEffect(() => {
    if (!miningTunnelRigRef.current) return;
    const { rock, timber, iron, gold } = miningTunnelRigRef.current.materials;

    const rockMat = materials.find((m) => m.name.toLowerCase().includes('rock') || m.id === 'mat_rock');
    if (rockMat) {
      rock.color.setStyle(rockMat.color);
      rock.roughness = rockMat.roughness;
      rock.metalness = rockMat.metalness;
      rock.needsUpdate = true;
    }

    const timberMat = materials.find((m) => m.name.toLowerCase().includes('timber') || m.id === 'mat_timber');
    if (timberMat) {
      timber.color.setStyle(timberMat.color);
      timber.roughness = timberMat.roughness;
      timber.metalness = timberMat.metalness;
      timber.needsUpdate = true;
    }

    const ironMat = materials.find((m) => m.name.toLowerCase().includes('iron') || m.id === 'mat_iron');
    if (ironMat) {
      iron.color.setStyle(ironMat.color);
      iron.roughness = ironMat.roughness;
      iron.metalness = ironMat.metalness;
      iron.needsUpdate = true;
    }

    const goldMat = materials.find((m) => m.name.toLowerCase().includes('lantern') || m.name.toLowerCase().includes('gold') || m.id === 'mat_gold');
    if (goldMat) {
      gold.color.setStyle(goldMat.color);
      gold.roughness = goldMat.roughness;
      gold.metalness = goldMat.metalness;
      gold.needsUpdate = true;
    }
  }, [materials, rigLoad.state]);

  // Sync selected object transformation to 3D scene
  useEffect(() => {
    if (!miningTunnelRigRef.current || !selectedObject) return;
    const tunnel = miningTunnelRigRef.current.root;

    const rootId = getPresetRootId(currentPresetId);
    // Only the model root owns the scene transform. Selecting a child should
    // select that part without snapping or transforming the entire tunnel.
    if (selectedObject.id === rootId) {
      tunnel.position.set(selectedObject.position.x * 0.01, selectedObject.position.y * 0.01, selectedObject.position.z * 0.01);
      tunnel.rotation.set(
        degToRad(selectedObject.rotation.x),
        degToRad(selectedObject.rotation.y),
        degToRad(selectedObject.rotation.z)
      );
      tunnel.scale.set(selectedObject.scale.x, selectedObject.scale.y, selectedObject.scale.z);
    }

    if (gizmoGroupRef.current) {
      gizmoGroupRef.current.position.copy(tunnel.position);
      gizmoGroupRef.current.visible = !activeProjectId && selectedObject.id === rootId && selectedObject.visibleInEditor && (activeTool === 'move' || activeTool === 'rotate' || activeTool === 'scale');
    }
  }, [selectedObject, activeProjectId, activeTool, currentPresetId, rigLoad.state]);

  useEffect(() => {
    setHighlightedSelectionId(null);
    setShadingMode(currentPresetId === 'branching_drift' ? 'wireframe' : 'gouraud');
  }, [currentPresetId]);

  useEffect(() => {
    const rootId = getPresetRootId(currentPresetId);
    if (!selectedObject) {
      setHighlightedSelectionId(null);
    } else if (selectedObject.id !== rootId) {
      // Object Manager selections should also receive the same visual feedback.
      setHighlightedSelectionId(selectedObject.id);
    }
  }, [selectedObject, currentPresetId]);

  useEffect(() => {
    const rig = miningTunnelRigRef.current;
    if (!rig) return;
    const visibility = flattenSceneObjects(sceneObjects);
    const rootId = getPresetRootId(currentPresetId);
    rig.root.visible = !activeProjectId && !clearView && (visibility.get(rootId)?.visibleInEditor ?? false);

    rig.root.traverse((node) => {
      if (node === rig.root) return;
      const id = node.userData?.selectionId || node.name;
      node.visible = visibility.has(id) && Boolean(visibility.get(id)?.visibleInEditor);
    });
  }, [sceneObjects, currentPresetId, activeProjectId, clearView, rigLoad.state]);

  useEffect(() => {
    if (gridHelperRef.current) gridHelperRef.current.visible = showGrid && !clearView;
  }, [showGrid, clearView]);

  // Load server-backed GLB/glTF assets into the same Three.js scene as the built-in rigs.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (externalModelGroupRef.current) {
      scene.remove(externalModelGroupRef.current);
      externalModelGroupRef.current.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
      externalModelGroupRef.current = null;
    }
    walkBoundsRef.current = { minX: -4.2, maxX: 2.4, minY: 1.2, maxY: 4.8, minZ: -23.0, maxZ: 23.0 };
    if (!activeAsset || activeAsset.kind !== 'model') {
      setAssetLoadId(activeAsset?.id || null);
      setAssetLoadState(activeAsset && ['world', 'image', 'video'].includes(activeAsset.kind) ? 'loading' : activeAsset ? 'ready' : 'idle');
      setAssetLoadMessage('');
      return;
    }

    let cancelled = false;
    setAssetLoadId(activeAsset.id);
    setAssetLoadState('loading');
    setAssetLoadMessage(`Loading ${activeAsset.name}…`);
    const draco = new DRACOLoader();
    draco.setDecoderPath('/draco/');
    const extension = activeAsset.name.split('.').pop()?.toLowerCase() || '';
    const addLoadedModel = (model: THREE.Object3D) => {
      if (cancelled) return;
      const group = new THREE.Group();
      group.name = `Loaded_${activeAsset.name}`;
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const largest = Math.max(size.x, size.y, size.z) || 1;
      const scale = Math.min(1, 28 / largest);
      model.position.copy(center).multiplyScalar(-scale);
      model.scale.setScalar(scale);
      group.add(model);
      group.visible = !clearView;
      externalModelGroupRef.current = group;
      scene.add(group);
      const loadedBounds = new THREE.Box3().setFromObject(group);
      const loadedSize = loadedBounds.getSize(new THREE.Vector3());
      const xPadding = Math.min(0.6, Math.max(0.15, loadedSize.x * 0.08));
      const zPadding = Math.min(0.6, Math.max(0.15, loadedSize.z * 0.08));
      const minX = loadedBounds.min.x + xPadding;
      const maxX = loadedBounds.max.x - xPadding;
      const minZ = loadedBounds.min.z + zPadding;
      const maxZ = loadedBounds.max.z - zPadding;
      const minY = Math.max(1.2, loadedBounds.min.y + 1.2);
      const maxY = Math.max(minY + 0.5, loadedBounds.max.y - 0.2);
      walkBoundsRef.current = {
        minX: minX < maxX ? minX : -4.2,
        maxX: minX < maxX ? maxX : 2.4,
        minY,
        maxY,
        minZ: minZ < maxZ ? minZ : -23,
        maxZ: minZ < maxZ ? maxZ : 23,
      };
      setAssetLoadState('ready');
      setAssetLoadMessage('');
    };
    const handleLoadError = (error: unknown) => {
      if (cancelled) return;
      console.warn('Could not load project model asset:', error);
      setAssetLoadState('error');
      setAssetLoadMessage(`Could not render ${activeAsset.name}. Check the file format or upload it again.`);
    };

    if (extension === 'obj') {
      new OBJLoader().load(activeAsset.url, addLoadedModel, undefined, handleLoadError);
    } else if (extension === 'fbx') {
      new FBXLoader().load(activeAsset.url, addLoadedModel, undefined, handleLoadError);
    } else if (extension === 'ply') {
      new PLYLoader().load(activeAsset.url, (geometry) => {
        geometry.computeVertexNormals();
        const hasColors = Boolean(geometry.getAttribute('color'));
        addLoadedModel(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xb7c5cf, vertexColors: hasColors, roughness: 0.82, metalness: 0.05 })));
      }, undefined, handleLoadError);
    } else {
      const loader = new GLTFLoader();
      loader.setDRACOLoader(draco);
      loader.load(activeAsset.url, (gltf) => addLoadedModel(gltf.scene), undefined, handleLoadError);
    }
    return () => {
      cancelled = true;
      draco.dispose();
    };
  }, [activeAsset, clearView, connectedViewerReload]);

  useEffect(() => {
    if (!activeAsset || !['model', 'world', 'image', 'video'].includes(activeAsset.kind) || assetLoadState !== 'loading') return;
    const timeout = window.setTimeout(() => {
      setAssetLoadState('error');
      setAssetLoadMessage(`Loading ${activeAsset.name} is taking too long. Check the connection, then retry.`);
    }, 90000);
    return () => window.clearTimeout(timeout);
  }, [activeAsset, assetLoadState, connectedViewerReload]);

  useEffect(() => {
    if (activeAsset?.kind !== 'world') return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== 'https://www.tunnelsight.applications.co.zw' || event.source !== worldFrameRef.current?.contentWindow) return;
      if (event.data?.type === 'tunnelsight:viewer-ready') setAssetLoadState('ready');
      if (event.data?.type === 'tunnelsight:viewer-error') {
        setAssetLoadState('error');
        setAssetLoadMessage(String(event.data.message || 'The connected model could not be loaded.'));
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [activeAsset?.id, activeAsset?.kind, connectedViewerReload]);

  useEffect(() => {
    if (externalModelGroupRef.current) externalModelGroupRef.current.visible = !clearView;
  }, [clearView]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || activeAsset?.kind !== 'video') return;
    video.playbackRate = playbackSpeed;
    if (isPlaying) video.play().catch(() => {});
    else video.pause();
  }, [activeAsset, isPlaying, playbackSpeed]);

  // The shared frame timeline is the source of truth for video scrubbing too.
  // Only seek while paused; during playback the video runs continuously while
  // the same timeline transport advances the scene frames.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || activeAsset?.kind !== 'video' || !videoDuration || isPlaying) return;
    const frameRange = Math.max(1, timelineMaxFrame - timelineMinFrame);
    const frameProgress = Math.max(0, Math.min(1, (currentFrame - timelineMinFrame) / frameRange));
    const nextTime = frameProgress * videoDuration;
    if (Math.abs(video.currentTime - nextTime) > 0.03) video.currentTime = nextTime;
    videoTimeRef.current = nextTime;
    setVideoTime(nextTime);
  }, [activeAsset?.id, currentFrame, isPlaying, timelineMaxFrame, timelineMinFrame, videoDuration]);

  useEffect(() => {
    if (activeAsset?.id) {
      restoreOverlay('video');
      restoreOverlay('image');
      restoreOverlay('unsupported');
    }
  }, [activeAsset?.id, restoreOverlay]);

  useEffect(() => {
    if (assetLoadState === 'loading') restoreOverlay('assetLoading');
    if (assetLoadState === 'error') restoreOverlay('assetError');
  }, [assetLoadState, restoreOverlay]);

  useEffect(() => {
    if (activeProjectId && !activeAsset) restoreOverlay('projectEmpty');
  }, [activeAsset, activeProjectId, restoreOverlay]);

  useEffect(() => {
    if (keyframeAnnotations.length > 0) restoreOverlay('notes');
  }, [keyframeAnnotations.length, restoreOverlay]);

  // Update Survey Markers in 3D Scene
  useEffect(() => {
    if (!sceneRef.current) return;
    if (surveyMarkersGroupRef.current) {
      sceneRef.current.remove(surveyMarkersGroupRef.current);
    }

    const group = new THREE.Group();
    group.name = 'Survey_Station_Markers_3D';
    surveyMarkersGroupRef.current = group;

    surveyStationMarkers.forEach((m) => {
      // Station pin tripod / sphere
      const sphereGeo = new THREE.SphereGeometry(0.35, 16, 16);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: m.color || '#00e5ff',
        emissive: m.color || '#00e5ff',
        emissiveIntensity: 0.6,
        roughness: 0.3,
      });
      const pin = new THREE.Mesh(sphereGeo, sphereMat);
      pin.position.set(m.x, m.y, m.z);
      pin.name = `Marker_${m.stationId}`;

      // Beacon vertical laser line from floor to station point
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(m.x, 0.1, m.z),
        new THREE.Vector3(m.x, m.y, m.z),
      ]);
      const lineMat = new THREE.LineBasicMaterial({ color: m.color || '#00e5ff', transparent: true, opacity: 0.85 });
      const line = new THREE.Line(lineGeo, lineMat);

      group.add(pin);
      group.add(line);
    });

    sceneRef.current.add(group);
  }, [surveyStationMarkers]);

  // Render only the annotations belonging to the active camera keyframe.
  // They are world-space pins, so returning to that frame makes them appear
  // over the same model location without changing the model geometry.
  const rebuildAnnotationGroup = useCallback(() => {
    if (!sceneRef.current) return;
    if (annotationsGroupRef.current) sceneRef.current.remove(annotationsGroupRef.current);

    const group = new THREE.Group();
    group.name = 'Keyframe_Annotations_3D';
    annotationsGroupRef.current = group;

    keyframeAnnotations.forEach((annotation) => {
      const color = annotation.color || '#ffb347';
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 16, 16),
        new THREE.MeshBasicMaterial({ color, depthTest: false })
      );
      sphere.position.set(annotation.position.x, annotation.position.y, annotation.position.z);
      sphere.renderOrder = 20;
      sphere.name = `Annotation_${annotation.id}`;

      const stem = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(annotation.position.x, annotation.position.y, annotation.position.z),
          new THREE.Vector3(annotation.position.x, annotation.position.y + 0.65, annotation.position.z),
        ]),
        new THREE.LineBasicMaterial({ color, depthTest: false })
      );
      stem.renderOrder = 19;
      group.add(sphere);
      group.add(stem);
    });

    sceneRef.current.add(group);
  }, [keyframeAnnotations]);

  useEffect(() => {
    rebuildAnnotationGroup();
  }, [rebuildAnnotationGroup]);

  const rebuildGasMarkGroup = useCallback(() => {
    if (!sceneRef.current) return;
    if (gasMarksGroupRef.current) {
      sceneRef.current.remove(gasMarksGroupRef.current);
      gasMarksGroupRef.current.traverse((child) => {
        const sprite = child as THREE.Sprite;
        if (sprite.material) sprite.material.dispose();
      });
    }

    const group = new THREE.Group();
    group.name = 'Gas_Marks_3D';
    group.visible = !clearView && activeAsset?.kind !== 'video' && activeAsset?.kind !== 'image';
    gasMarksGroupRef.current = group;

    if (!gasTextureRef.current) {
      const textureCanvas = document.createElement('canvas');
      textureCanvas.width = 128;
      textureCanvas.height = 128;
      const context = textureCanvas.getContext('2d');
      if (context) {
        const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 62);
        gradient.addColorStop(0, 'rgba(255,255,255,0.75)');
        gradient.addColorStop(0.34, 'rgba(255,255,255,0.42)');
        gradient.addColorStop(0.7, 'rgba(255,255,255,0.12)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 128, 128);
        gasTextureRef.current = new THREE.CanvasTexture(textureCanvas);
        gasTextureRef.current.needsUpdate = true;
      }
    }

    const currentAssetId = activeAsset?.kind === 'model' ? activeAsset.id : null;
    const visibleMarks = gasMarks.filter((mark) => (
      mark.space === 'world'
      && (mark.assetId || null) === currentAssetId
      && mark.frame === currentFrame
      && mark.position
    ));

    visibleMarks.forEach((mark) => {
      if (!mark.position || !gasTextureRef.current) return;
      const opacity = Math.max(0.06, Math.min(0.72, 0.08 + mark.concentration * 0.64));
      const material = new THREE.SpriteMaterial({
        map: gasTextureRef.current,
        color: mark.color,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(mark.position.x, mark.position.y, mark.position.z);
      const size = Math.max(0.25, mark.radius * 2.2);
      sprite.scale.set(size, size, 1);
      sprite.renderOrder = 40;
      sprite.name = `Gas_${mark.id}`;
      group.add(sprite);

      // A second, softer cloud makes a brush stroke read as smoke rather than a flat pin.
      const hazeMaterial = new THREE.SpriteMaterial({
        map: gasTextureRef.current,
        color: mark.color,
        transparent: true,
        opacity: opacity * 0.34,
        depthTest: false,
        depthWrite: false,
      });
      const haze = new THREE.Sprite(hazeMaterial);
      haze.position.set(mark.position.x + mark.radius * 0.22, mark.position.y + mark.radius * 0.12, mark.position.z - mark.radius * 0.12);
      haze.scale.set(size * 1.5, size * 1.2, 1);
      haze.renderOrder = 39;
      group.add(haze);
    });

    sceneRef.current.add(group);
  }, [activeAsset?.id, activeAsset?.kind, clearView, currentFrame, gasMarks]);

  useEffect(() => {
    rebuildGasMarkGroup();
  }, [rebuildGasMarkGroup]);

  // WebGL Scene Initialization
  useEffect(() => {
    const mount = mountRef.current;
    const canvas = canvasRef.current;
    if (!mount || !canvas) return;

    // Detect software WebGL
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    rendererRef.current = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x555555);

    if (!isSoftwareGl) {
      try {
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
        pmremGenerator.dispose();
      } catch (e) {}
    }

    // Camera
    const camera = new THREE.PerspectiveCamera(44, mount.clientWidth / mount.clientHeight, 0.4, 2000);
    cameraRef.current = camera;

    // Miner's Headlamp / Flashlight
    const flashlight = new THREE.SpotLight(0xfff0dd, 5.0, 45, Math.PI / 4, 0.4, 1.2);
    flashlight.position.set(0, 0, 0);
    flashlight.target = new THREE.Object3D();
    scene.add(flashlight.target);
    camera.add(flashlight);
    scene.add(camera);
    flashlightRef.current = flashlight;

    // Grid Helper
    const gridHelper = new THREE.GridHelper(160, 80, 0x3d3d3d, 0x4f4f4f);
    gridHelper.position.y = -6.0;
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    // Studio Lighting Rig
    const keyLight = new THREE.DirectionalLight(0xfff8f0, 2.0);
    keyLight.position.set(25, 45, 30);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd0e0ff, 1.2);
    fillLight.position.set(-35, 25, -25);
    scene.add(fillLight);

    const hemiLight = new THREE.HemisphereLight(0xe8e8e8, 0x303030, 0.7);
    scene.add(hemiLight);

    // Procedural Mining Tunnel
    const miningTunnelRig = createTunnelRigByPreset(currentPresetId, proceduralParams);
    miningTunnelRigRef.current = miningTunnelRig;
    scene.add(miningTunnelRig.root);
    miningTunnelRig.setDisplayMode(shadingMode);

    // Gizmo handles
    const gizmoGroup = new THREE.Group();
    gizmoGroupRef.current = gizmoGroup;
    gizmoGroup.position.copy(miningTunnelRig.root.position);
    gizmoGroup.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 4, 0xee3333, 0.8, 0.4));
    gizmoGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 4, 0x33cc33, 0.8, 0.4));
    gizmoGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 4, 0x3366ee, 0.8, 0.4));
    scene.add(gizmoGroup);

    // Ruler 3D laser line
    const rulerGeo = new THREE.BufferGeometry();
    const rulerMat = new THREE.LineBasicMaterial({ color: 0xff0055, linewidth: 3, depthTest: false });
    const rulerLine = new THREE.Line(rulerGeo, rulerMat);
    rulerLine.visible = false;
    scene.add(rulerLine);
    rulerLineRef.current = rulerLine;

    // Resize handling
    const handleResize = () => {
      if (!mount || !renderer || !camera) return;
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    // Render & Animation Loop
    let animationFrameId = 0;
    let lastTime = performance.now();

    const render = (now: number) => {
      const delta = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      const time = now / 1000;

      // 1. Animate procedural tunnel & rolling cart
      if (miningTunnelRigRef.current) {
        miningTunnelRigRef.current.animate(time, isPlayingRef.current, currentFrameRef.current);
      }

      // 2. Camera Positioning
      const tour = activeTourRef.current;
      const frame = currentFrameRef.current;
      const shouldFollowTour = navModeRef.current !== 'walk'
        && isTourPlaybackEnabledRef.current
        && !manualNavigationRef.current
        && tour
        && tour.keyframes.length > 0
        // A paused/default viewport must remain manually orbitable. The tour
        // camera is only restored for playback or an explicit non-zero frame.
        && (isPlayingRef.current || frame > 0);
      if (shouldFollowTour) {
        // TOUR PATH ANIMATION (Follows user's recorded tour path automatically!)
        const tourCam = interpolateCameraTour(tour.keyframes, frame, tour.durationFrames);
        camera.position.set(tourCam.position.x, tourCam.position.y, tourCam.position.z);
        camera.lookAt(tourCam.target.x, tourCam.target.y, tourCam.target.z);
        if (tourCam.fov && camera.fov !== tourCam.fov) {
          camera.fov = tourCam.fov;
          camera.updateProjectionMatrix();
        }
      } else if (navModeRef.current === 'walk') {
        // WALK MODE (First-Person Walkthrough inside Tunnel Drift)
        const speed = isWalkingRef.current.shift ? 7.5 : 3.2;
        const forward = new THREE.Vector3(-Math.sin(walkYawRef.current), 0, -Math.cos(walkYawRef.current)).normalize();
        const right = new THREE.Vector3(Math.cos(walkYawRef.current), 0, -Math.sin(walkYawRef.current)).normalize();

        const desiredVelocity = new THREE.Vector3();
        if (isWalkingRef.current.w) desiredVelocity.add(forward);
        if (isWalkingRef.current.s) desiredVelocity.sub(forward);
        if (isWalkingRef.current.d) desiredVelocity.add(right);
        if (isWalkingRef.current.a) desiredVelocity.sub(right);
        if (desiredVelocity.lengthSq() > 0) desiredVelocity.normalize().multiplyScalar(speed);
        walkVelocityRef.current.lerp(desiredVelocity, Math.min(1, delta * 14));
        const moveVec = walkVelocityRef.current.clone().multiplyScalar(delta);
        walkPosRef.current.add(moveVec);

        // Clamp walk bounds
        const clamped = clampWalkPosition(walkPosRef.current);
        walkPosRef.current.set(clamped.x, clamped.y, clamped.z);

        // Apply head-bob when moving
        const bob = walkVelocityRef.current.lengthSq() > 0.02 ? Math.sin(time * 10) * 0.04 : 0;
        camera.position.set(walkPosRef.current.x, walkPosRef.current.y + bob, walkPosRef.current.z);

        const lookTarget = new THREE.Vector3(
          camera.position.x - Math.sin(walkYawRef.current) * Math.cos(walkPitchRef.current) * 10,
          camera.position.y + Math.sin(walkPitchRef.current) * 10,
          camera.position.z - Math.cos(walkYawRef.current) * Math.cos(walkPitchRef.current) * 10
        );
        camera.lookAt(lookTarget);
      } else {
        // ORBIT MODE (Classic C4D Orbit & Pan)
        camera.position.setFromSpherical(sphericalRef.current).add(targetRef.current);
        camera.lookAt(targetRef.current);
      }

      // Flashlight target update
      if (flashlightRef.current) {
        flashlightRef.current.visible = flashlightOnRef.current;
        if (flashlightOnRef.current) {
          const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
          flashlightRef.current.target.position.copy(camera.position).addScaledVector(forwardDir, 20);
        }
      }

      if (!coveredByWorldRef.current) renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      renderer.dispose();
    };
  }, [clampWalkPosition]);

  // The scene initialization effect can rebuild the Three.js scene when a
  // tour changes. Re-attach the annotation group after that rebuild.
  useEffect(() => {
    if (sceneRef.current && surveyMarkersGroupRef.current) {
      sceneRef.current.add(surveyMarkersGroupRef.current);
    }
    rebuildAnnotationGroup();
    rebuildGasMarkGroup();
  }, [activeTour, rebuildAnnotationGroup, rebuildGasMarkGroup]);

  // Update wireframe / shading mode
  useEffect(() => {
    if (!miningTunnelRigRef.current) return;
    miningTunnelRigRef.current.setDisplayMode(shadingMode);
  }, [shadingMode]);

  const paintGasOnModelPointer = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isGasBrushActive || !onAddGasMark || !cameraRef.current) return;
    const interactiveRoot = externalModelGroupRef.current || (!activeProjectId ? miningTunnelRigRef.current?.root : null);
    if (!interactiveRoot) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);
    const hit = raycaster.intersectObject(interactiveRoot, true)[0];
    if (!hit) return;

    const point = hit.point;
    const last = gasLastStampRef.current;
    if (last?.space === 'world' && last.z !== undefined && Math.hypot(point.x - last.x, point.y - last.y, point.z - last.z) < gasBrushRadius * 0.2) return;
    gasLastStampRef.current = { space: 'world', x: point.x, y: point.y, z: point.z };
    onAddGasMark({
      id: `gas_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      assetId: activeAsset?.kind === 'model' ? activeAsset.id : null,
      frame: currentFrame,
      space: 'world',
      position: { x: Number(point.x.toFixed(4)), y: Number(point.y.toFixed(4)), z: Number(point.z.toFixed(4)) },
      radius: gasBrushRadius,
      concentration: gasConcentration,
      color: gasBrushColor,
      strokeId: gasStrokeRef.current || `gas_stroke_${Date.now()}`,
      createdAt: new Date().toISOString(),
    });
  }, [activeAsset, activeProjectId, currentFrame, gasBrushColor, gasBrushRadius, gasConcentration, isGasBrushActive, onAddGasMark]);

  const paintGasOnMediaPointer = useCallback((event: React.PointerEvent<HTMLDivElement>, assetId: string) => {
    if (!isGasBrushActive || !onAddGasMark) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const last = gasLastStampRef.current;
    if (last?.space === 'media' && Math.hypot(x - last.x, y - last.y) < 0.018) return;
    gasLastStampRef.current = { space: 'media', x, y };
    onAddGasMark({
      id: `gas_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      assetId,
      frame: currentFrame,
      timeSeconds: activeAsset?.kind === 'video' ? Number(videoTimeRef.current.toFixed(3)) : undefined,
      space: 'media',
      screen: { x: Number(x.toFixed(5)), y: Number(y.toFixed(5)) },
      radius: gasBrushRadius,
      concentration: gasConcentration,
      color: gasBrushColor,
      strokeId: gasStrokeRef.current || `gas_stroke_${Date.now()}`,
      createdAt: new Date().toISOString(),
    });
  }, [activeAsset?.kind, currentFrame, gasBrushColor, gasBrushRadius, gasConcentration, isGasBrushActive, onAddGasMark]);

  const handleGasMediaPointerDown = (event: React.PointerEvent<HTMLDivElement>, assetId: string) => {
    if (!isGasBrushActive || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gasStrokeRef.current = `gas_stroke_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    gasLastStampRef.current = null;
    isGasBrushingRef.current = true;
    paintGasOnMediaPointer(event, assetId);
  };

  const handleGasMediaPointerMove = (event: React.PointerEvent<HTMLDivElement>, assetId: string) => {
    if (isGasBrushingRef.current) paintGasOnMediaPointer(event, assetId);
  };

  const handleGasMediaPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    isGasBrushingRef.current = false;
    gasLastStampRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (err) {}
  };

  // Keyboard navigation for Walk Mode (WASD + Space/Shift, F flashlight, V mode toggle)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName) || target?.isContentEditable) return;

      const zoomIn = e.key === '+' || e.key === '=' || e.code === 'NumpadAdd' || e.key === 'PageUp';
      const zoomOut = e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract' || e.key === 'PageDown';
      if ((zoomIn || zoomOut) && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        if (navMode === 'walk') {
          const forward = new THREE.Vector3(-Math.sin(walkYawRef.current), 0, -Math.cos(walkYawRef.current));
          walkPosRef.current.addScaledVector(forward, zoomIn ? 0.9 : -0.9);
          const clamped = clampWalkPosition(walkPosRef.current);
          walkPosRef.current.set(clamped.x, clamped.y, clamped.z);
        } else {
          manualNavigationRef.current = true;
          const factor = zoomIn ? 0.86 : 1.16;
          sphericalRef.current.radius = Math.max(4, Math.min(320, sphericalRef.current.radius * factor));
        }
        return;
      }

      if (e.key === 'v' || e.key === 'V') {
        setNavMode((prev) => {
          if (prev === 'orbit') {
            resetWalkPosition(true);
            return 'walk';
          }
          isWalkingRef.current.w = false;
          isWalkingRef.current.a = false;
          isWalkingRef.current.s = false;
          isWalkingRef.current.d = false;
          return 'orbit';
        });
      } else if (e.key === 'f' || e.key === 'F') {
        setFlashlightOn((prev) => !prev);
      } else if (e.key === 'k' || e.key === 'K') {
        handleRecordViewClick();
      }

      if (navMode === 'walk') {
        const movementKey = e.code === 'KeyW' || e.code === 'KeyS' || e.code === 'KeyA' || e.code === 'KeyD' || e.key.startsWith('Arrow');
        if (movementKey) e.preventDefault();
        if (e.code === 'KeyW' || e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') isWalkingRef.current.w = true;
        if (e.code === 'KeyS' || e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') isWalkingRef.current.s = true;
        if (e.code === 'KeyA' || e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') isWalkingRef.current.a = true;
        if (e.code === 'KeyD' || e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') isWalkingRef.current.d = true;
        if (e.shiftKey) isWalkingRef.current.shift = true;
      } else if (e.key.startsWith('Arrow') && cameraRef.current) {
        e.preventDefault();
        manualNavigationRef.current = true;
        const orbitStep = e.shiftKey ? 0.16 : 0.08;
        if (e.key === 'ArrowLeft') sphericalRef.current.theta += orbitStep;
        if (e.key === 'ArrowRight') sphericalRef.current.theta -= orbitStep;
        if (e.key === 'ArrowUp') sphericalRef.current.phi = Math.max(0.05, sphericalRef.current.phi - orbitStep);
        if (e.key === 'ArrowDown') sphericalRef.current.phi = Math.min(Math.PI - 0.05, sphericalRef.current.phi + orbitStep);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyW' || e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') isWalkingRef.current.w = false;
      if (e.code === 'KeyS' || e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') isWalkingRef.current.s = false;
      if (e.code === 'KeyA' || e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') isWalkingRef.current.a = false;
      if (e.code === 'KeyD' || e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') isWalkingRef.current.d = false;
      if (!e.shiftKey) isWalkingRef.current.shift = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [navMode, handleRecordViewClick, resetWalkPosition]);
 
  // Dynamically Rebuild Rig when preset or proceduralParams changes
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setRigLoad({ params: proceduralParams, state: 'loading' });
    const frame = requestAnimationFrame(() => { timer = setTimeout(() => {
    if (cancelled) return;
    try {
    const newRig = createTunnelRigByPreset(currentPresetId, proceduralParams);
    if (miningTunnelRigRef.current) scene.remove(miningTunnelRigRef.current.root);
    miningTunnelRigRef.current = newRig;
    scene.add(newRig.root);
    const rootId = getPresetRootId(currentPresetId);
    const visibility = flattenSceneObjects(sceneObjects);
    newRig.root.visible = !activeProjectId && !clearView && (visibility.get(rootId)?.visibleInEditor ?? false);
    newRig.root.traverse((node) => {
      if (node === newRig.root) return;
      const id = node.userData?.selectionId || node.name;
      node.visible = visibility.has(id) && Boolean(visibility.get(id)?.visibleInEditor);
    });
    newRig.setDisplayMode(shadingMode);

    if (gizmoGroupRef.current) {
      gizmoGroupRef.current.position.copy(newRig.root.position);
    }
    if (!cancelled) setRigLoad({ params: proceduralParams, state: 'ready' });
    } catch (error) {
      if (!cancelled) setRigLoad({ params: proceduralParams, state: 'error', message: 'This model could not be prepared. Please retry.' });
    }
    }, 0); });
    return () => { cancelled = true; cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [currentPresetId, proceduralParams, connectedViewerReload]);

  // Give the selected sample-scene part a clear, full-surface highlight. The
  // materials are cloned only for selected meshes so shared materials elsewhere
  // in the model keep their original appearance.
  useEffect(() => {
    const root = miningTunnelRigRef.current?.root;
    if (!root || !highlightedSelectionId || activeProjectId || clearView) return;

    const selectedNodes: THREE.Object3D[] = [];
    root.traverse((node) => {
      const id = node.userData?.selectionId || node.name;
      if (id === highlightedSelectionId) selectedNodes.push(node);
    });

    const selectedMeshes = new Set<THREE.Mesh>();
    selectedNodes.forEach((node) => node.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) selectedMeshes.add(child as THREE.Mesh);
    }));

    const originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    selectedMeshes.forEach((mesh) => {
      originalMaterials.set(mesh, mesh.material);
      const highlight = (material: THREE.Material) => {
        const clone = material.clone() as THREE.MeshStandardMaterial;
        if (clone.color) clone.color.set(0xff8a24);
        if (clone.emissive) {
          clone.emissive.set(0xff5a00);
          clone.emissiveIntensity = 0.85;
        }
        clone.needsUpdate = true;
        return clone;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(highlight) : highlight(mesh.material);
    });

    return () => {
      originalMaterials.forEach((material, mesh) => {
        const current = mesh.material;
        if (Array.isArray(current)) current.forEach((item) => item.dispose());
        else current.dispose();
        mesh.material = material;
      });
    };
  }, [highlightedSelectionId, currentPresetId, proceduralParams, activeProjectId, clearView, sceneObjects, rigLoad.state]);

  // Sync Shading Mode with Rig
  useEffect(() => {
    if (miningTunnelRigRef.current) {
      miningTunnelRigRef.current.setDisplayMode(shadingMode);
    }
  }, [shadingMode]);

  // Pointer Interactions: Orbit, Pan, Zoom, Look, Raycast
  const focusCameraAtPointer = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cameraRef.current || navMode === 'walk') return;
    const interactiveRoot = externalModelGroupRef.current || (!activeProjectId ? miningTunnelRigRef.current?.root : null);
    if (!interactiveRoot) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);
    const hit = raycaster.intersectObject(interactiveRoot, true)[0];
    if (!hit) return;
    targetRef.current.copy(hit.point);
    sphericalRef.current.radius = Math.max(4, Math.min(220, sphericalRef.current.radius));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    if (activePointersRef.current.size >= 2 && navMode !== 'walk') {
      const pointers = [...activePointersRef.current.values()];
      pinchDistanceRef.current = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
      dragModeRef.current = 'zoom';
      return;
    }

    const interactiveRoot = externalModelGroupRef.current || (!activeProjectId ? miningTunnelRigRef.current?.root : null);

    if (isGasBrushActive) {
      gasStrokeRef.current = `gas_stroke_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      gasLastStampRef.current = null;
      isGasBrushingRef.current = true;
      paintGasOnModelPointer(e);
      isDraggingRef.current = false;
      dragModeRef.current = 'none';
      return;
    }

    if (isAnnotationMode && cameraRef.current && interactiveRoot) {
      const rect = canvas.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);
      const hits = raycaster.intersectObject(interactiveRoot, true);
      if (hits.length > 0) {
        const point = hits[0].point;
        setPendingAnnotationPosition({ x: Number(point.x.toFixed(3)), y: Number(point.y.toFixed(3)), z: Number(point.z.toFixed(3)) });
        setAnnotationNote('');
      }
      isDraggingRef.current = false;
      dragModeRef.current = 'none';
      return;
    }

    if (isRulerActive && cameraRef.current && sceneRef.current && interactiveRoot) {
      // 3D Laser Ruler Measurement
      const rect = canvas.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);
      const hits = raycaster.intersectObject(interactiveRoot, true);
      if (hits.length > 0) {
        const pt = hits[0].point;
        if (rulerPoints.length === 0 || rulerPoints.length >= 2) {
          setRulerPoints([pt]);
          setMeasuredDistance(null);
          if (rulerLineRef.current) rulerLineRef.current.visible = false;
        } else if (rulerPoints.length === 1) {
          const newPts = [rulerPoints[0], pt];
          setRulerPoints(newPts);
          const dist = calculateDistanceMeters(newPts[0], newPts[1]);
          setMeasuredDistance(dist);
          if (rulerLineRef.current) {
            rulerLineRef.current.geometry.setFromPoints([
              new THREE.Vector3(newPts[0].x, newPts[0].y, newPts[0].z),
              new THREE.Vector3(newPts[1].x, newPts[1].y, newPts[1].z),
            ]);
            rulerLineRef.current.visible = true;
          }
        }
      }
      return;
    }

    if (navMode === 'walk') {
      dragModeRef.current = 'look';
      if (e.button === 0 && cameraRef.current && interactiveRoot) {
        const rect = canvas.getBoundingClientRect();
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1, -((e.clientY-rect.top)/rect.height)*2+1), cameraRef.current);
        if (!ray.intersectObject(interactiveRoot, true).length) {
          setHighlightedSelectionId(null);
          onSelectObject(null);
        }
      }
    } else {
      // Any direct pointer navigation takes ownership from a paused tour path.
      manualNavigationRef.current = true;
      if (e.button === 0 && activeTool === 'live_selection' && !e.shiftKey && interactiveRoot && cameraRef.current) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);
        const hit = raycaster.intersectObject(interactiveRoot, true)[0]?.object;
        const pickedId = hit ? resolveSelectableObjectId(hit, getPresetRootId(currentPresetId)) : null;
        setHighlightedSelectionId(pickedId);
        onSelectObject(pickedId);
        // Selection is a click action, but the same gesture can still become
        // an orbit drag so choosing Live Selection never freezes navigation.
        dragModeRef.current = 'orbit';
        return;
      }
      // Orbit owns the normal left-drag gesture. Hold Shift when a Move/Rotate/Scale
      // tool should transform the selected object, so the viewer can never feel stuck
      // just because an object-editing tool was active on load.
      if (e.button === 0 && e.shiftKey && !e.altKey && activeTool !== 'live_selection' && selectedObject && !activeProjectId && cameraRef.current && miningTunnelRigRef.current) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);
        const intersects = raycaster.intersectObject(miningTunnelRigRef.current.root, true);
        if (intersects.length > 0) {
          const hit = intersects[0].object;
          const rootId = getPresetRootId(currentPresetId);
          const hitId = resolveSelectableObjectId(hit, rootId);
          if (selectedObject.id === hitId) {
            transformDragRef.current = {
              position: { ...selectedObject.position },
              rotation: { ...selectedObject.rotation },
              scale: { ...selectedObject.scale },
            };
            dragModeRef.current = 'transform';
            return;
          }
        }
      }
      if (e.button === 2 || (e.button === 0 && e.altKey) || e.button === 1) {
        dragModeRef.current = 'pan';
      } else {
        dragModeRef.current = 'orbit';

        // Raycasting for object selection
        if (cameraRef.current && interactiveRoot) {
          const rect = canvas.getBoundingClientRect();
          const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);
          const intersects = raycaster.intersectObject(interactiveRoot, true);
          if (intersects.length > 0) {
            const hit = intersects[0].object;
            const pickedId = resolveSelectableObjectId(hit, getPresetRootId(currentPresetId));
            setHighlightedSelectionId(pickedId);
            onSelectObject(pickedId);
          } else {
            setHighlightedSelectionId(null);
            onSelectObject(null);
          }
        }
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointersRef.current.has(e.pointerId)) activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointersRef.current.size >= 2 && cameraRef.current && navMode !== 'walk') {
      const pointers = [...activePointersRef.current.values()];
      const distance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
      const previousDistance = pinchDistanceRef.current ?? distance;
      sphericalRef.current.radius = Math.max(4, Math.min(320, sphericalRef.current.radius - (distance - previousDistance) * 0.035));
      pinchDistanceRef.current = distance;
      dragModeRef.current = 'zoom';
      return;
    }
    if (isGasBrushingRef.current && isGasBrushActive) {
      paintGasOnModelPointer(e);
      return;
    }
    if (!isDraggingRef.current || !cameraRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    if (navMode === 'walk' || dragModeRef.current === 'look') {
      walkYawRef.current -= dx * 0.005;
      walkPitchRef.current = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, walkPitchRef.current - dy * 0.005));
    } else if (dragModeRef.current === 'transform' && transformDragRef.current && selectedObject && onUpdateTransform) {
      const start = transformDragRef.current;
      if (activeTool === 'move') {
        onUpdateTransform(
          { ...start.position, x: start.position.x + dx * 0.6, y: start.position.y - dy * 0.6 },
          start.rotation,
          start.scale
        );
      } else if (activeTool === 'rotate') {
        onUpdateTransform(start.position, { ...start.rotation, y: start.rotation.y + dx * 0.6, x: start.rotation.x + dy * 0.4 }, start.scale);
      } else if (activeTool === 'scale') {
        const factor = Math.max(0.1, Math.min(10, 1 + (dx - dy) * 0.005));
        onUpdateTransform(start.position, start.rotation, { x: start.scale.x * factor, y: start.scale.y * factor, z: start.scale.z * factor });
      }
    } else if (dragModeRef.current === 'orbit') {
      sphericalRef.current.theta -= dx * 0.007;
      sphericalRef.current.phi = Math.max(0.05, Math.min(Math.PI - 0.05, sphericalRef.current.phi - dy * 0.007));
    } else if (dragModeRef.current === 'pan') {
      const panFactor = sphericalRef.current.radius * 0.0018;
      const cam = cameraRef.current;
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 1);
      targetRef.current.addScaledVector(right, -dx * panFactor);
      targetRef.current.addScaledVector(up, dy * panFactor);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) pinchDistanceRef.current = null;
    isGasBrushingRef.current = false;
    gasLastStampRef.current = null;
    isDraggingRef.current = false;
    dragModeRef.current = 'none';
    transformDragRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch (err) {}
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) pinchDistanceRef.current = null;
    isDraggingRef.current = false;
    dragModeRef.current = 'none';
    transformDragRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch (err) {}
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (navMode === 'walk') {
      // Step forward or backward with mouse wheel in walk mode
      const forward = new THREE.Vector3(-Math.sin(walkYawRef.current), 0, -Math.cos(walkYawRef.current));
      walkPosRef.current.addScaledVector(forward, -Math.sign(e.deltaY) * 1.5);
      const clamped = clampWalkPosition(walkPosRef.current);
      walkPosRef.current.set(clamped.x, clamped.y, clamped.z);
    } else {
      manualNavigationRef.current = true;
      const normalizedDelta = Math.max(-120, Math.min(120, e.deltaY));
      const zoomFactor = Math.exp(normalizedDelta * 0.0018);
      sphericalRef.current.radius = Math.max(4, Math.min(320, sphericalRef.current.radius * zoomFactor));
    }
  };

  const handleCaptureScreenshot = () => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    onCaptureReferenceImage?.(dataUrl, `MiningSight_Keyframe_${Date.now()}.png`);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `MiningSight_3D_${Date.now()}.png`;
    a.click();
  };

  const handleMapOverlayClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!mapMarkingEnabled || !onMapPointPicked) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onMapPointPicked({
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    });
  };

  const handleAddVideoMarker = () => {
    if (!activeAsset || activeAsset.kind !== 'video' || !onAddMediaMarker) return;
    const note = window.prompt(`Marker note at ${videoTimeRef.current.toFixed(2)} seconds:`);
    if (note?.trim()) onAddMediaMarker(videoTimeRef.current, note.trim());
  };

  const handleSaveAnnotation = () => {
    if (!pendingAnnotationPosition || !onAddKeyframeAnnotation) return;
    const cameraState = captureCurrentCameraState();
    if (!cameraState || !annotationNote.trim()) return;
    onAddKeyframeAnnotation(pendingAnnotationPosition, annotationNote, cameraState);
    setPendingAnnotationPosition(null);
    setAnnotationNote('');
    setIsAnnotationMode(false);
  };

  return (
    <div
      ref={mountRef}
      data-onboarding-target="viewport"
      className="relative w-full h-full select-none overflow-hidden bg-[#555555]"
      onContextMenu={(e) => e.preventDefault()}
    >
      {viewerLoadError && <div role="alert" className="absolute top-10 left-1/2 z-[90] flex max-w-[90%] -translate-x-1/2 items-center gap-3 border border-[#713333] bg-[#321d1d]/90 px-3 py-2 text-[10px] text-[#ffb0b0]">
        <span title={viewerLoadName}>{viewerLoadError}</span>
        <button onClick={() => setConnectedViewerReload((value) => value + 1)} className="shrink-0 text-white hover:text-[#e88724]">Retry</button>
      </div>}
      {/* 3D WebGL Canvas */}
      <canvas
        ref={canvasRef}
        className={`w-full h-full block outline-none ${
          isGasBrushActive ? 'cursor-cell' : isAnnotationMode ? 'cursor-crosshair' : isRulerActive ? 'cursor-cell' : activeTool === 'live_selection' && navMode !== 'walk' ? 'cursor-crosshair' : navMode === 'walk' ? 'cursor-grab active:cursor-grabbing' : 'cursor-grab active:cursor-grabbing'
        }`}
        style={{ touchAction: 'none', cursor: activeTool === 'live_selection' && navMode !== 'walk' ? liveSelectionCursor : undefined }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onDoubleClick={focusCameraAtPointer}
        onWheel={handleWheel}
      />

      {showMap && mapGeometry && (
        <div className="pointer-events-auto absolute inset-0 z-[70] bg-[#171717]">
          <UndergroundMapEditor
            geometry={mapGeometry}
            fullViewport
            onChange={(nextGeometry) => onMapGeometryChange?.(nextGeometry)}
            onStatusChange={onMapEditorStatus}
            mapMarkingEnabled={mapMarkingEnabled}
            onMapMarkingChange={onMapMarkingChange}
            onMapPointPicked={onMapPointPicked}
            onMapFeaturePicked={onMapFeaturePicked}
            mapSelection={mapSelection}
          />
        </div>
      )}

      {activeProjectId && !activeAsset && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none">
          <ViewerOverlay title="Project view" minimized={Boolean(minimizedOverlays.projectEmpty)} onToggle={() => toggleOverlay('projectEmpty')} className="max-w-sm mx-4">
            <div className="text-[#e88724] text-[12px] font-bold">Project view is empty</div>
            <div className="mt-1 text-[10px] text-[#bbb]">Upload a model, video, or image, then click its file in Project Assets to render it here.</div>
          </ViewerOverlay>
        </div>
      )}
      {activeAsset && !['model', 'world', 'video', 'image'].includes(activeAsset.kind) && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none">
          <ViewerOverlay title="File preview" minimized={Boolean(minimizedOverlays.unsupported)} onToggle={() => toggleOverlay('unsupported')}>
            <div className="text-[#ddd] text-[12px] font-bold">{activeAsset.name}</div>
            <div className="mt-1 text-[10px] text-[#aaa]">This file is stored in the project but has no 3D preview.</div>
          </ViewerOverlay>
        </div>
      )}

      {/* Media assets use the same bounded viewport as the 3D canvas. The navigation bar stays visible,
          while the media stage scales with the panel instead of opening a floating/full-screen player. */}
      {activeAsset?.kind === 'video' && (
        <div
          data-media-stage
          className="absolute inset-x-0 top-7 bottom-0 z-[6] flex min-h-0 flex-col overflow-hidden border-t border-[#252525] bg-[#202020] pointer-events-auto"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        >
          {minimizedOverlays.video ? (
            <div className="flex h-full items-end justify-start p-3">
              <button onClick={() => toggleOverlay('video')} className="rounded-[3px] border border-[#555] bg-black/70 px-2 py-1 text-[9px] text-[#ddd] shadow-lg hover:bg-black/90 cursor-pointer">
                <span className="mr-1 text-[#e88724] font-bold">+</span> Restore video view
              </button>
            </div>
          ) : (
            <>
              <div data-workspace-chrome className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-black/55 px-2 py-1 text-[9px] text-[#ccc] backdrop-blur-md">
                <span className="min-w-0 truncate font-bold uppercase tracking-wide">Video view · {activeAsset.name}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <button onClick={handleAddVideoMarker} className="rounded-[2px] bg-[#ffb347] px-1.5 py-0.5 font-bold text-black hover:bg-[#ffc46b] cursor-pointer">Mark {videoTime.toFixed(1)}s</button>
                  <span className="text-[#999]">{mediaMarkers.filter((marker) => marker.assetId === activeAsset.id).length} markers</span>
                  <button onClick={() => toggleOverlay('video')} className="px-1 text-[#aaa] hover:text-white cursor-pointer" title="Minimize video view">−</button>
                </div>
              </div>
              <div
                className={`relative min-h-0 flex-1 overflow-hidden bg-black ${isGasBrushActive ? 'cursor-cell' : ''}`}
                onPointerDown={(event) => handleGasMediaPointerDown(event, activeAsset.id)}
                onPointerMove={(event) => handleGasMediaPointerMove(event, activeAsset.id)}
                onPointerUp={handleGasMediaPointerUp}
                onPointerCancel={handleGasMediaPointerUp}
              >
                <video
                  key={connectedViewerReload}
                  ref={videoRef}
                  src={activeAsset.url}
                  playsInline
                  disablePictureInPicture
                  className="block h-full w-full object-cover"
                  onLoadedMetadata={(event) => {
                    setVideoDuration(event.currentTarget.duration || 0);
                    event.currentTarget.playbackRate = playbackSpeed;
                  }}
                  onLoadedData={() => setAssetLoadState('ready')}
                  onError={() => { setAssetLoadState('error'); setAssetLoadMessage(`Could not open ${activeAsset.name}.`); }}
                  onPlay={() => onSetPlayback?.(true)}
                  onPause={() => onSetPlayback?.(false)}
                  onEnded={() => onSetPlayback?.(false)}
                  onTimeUpdate={(event) => {
                    const time = event.currentTarget.currentTime;
                    videoTimeRef.current = time;
                    setVideoTime(time);
                  }}
                />
                {gasMarks.filter((mark) => mark.space === 'media' && mark.assetId === activeAsset.id && mark.screen && Math.abs((mark.timeSeconds ?? 0) - videoTime) <= Math.max(0.15, videoDuration / Math.max(1, timelineMaxFrame - timelineMinFrame) / 2)).map((mark) => (
                  <span key={mark.id} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${(mark.screen?.x || 0) * 100}%`, top: `${(mark.screen?.y || 0) * 100}%`, width: `${Math.max(28, Math.min(320, mark.radius * 64))}px`, height: `${Math.max(28, Math.min(320, mark.radius * 64))}px`, opacity: Math.max(0.08, Math.min(0.7, 0.08 + mark.concentration * 0.62)), background: `radial-gradient(circle, ${mark.color} 0%, ${mark.color}99 28%, ${mark.color}22 62%, transparent 76%)`, filter: 'blur(1px)', mixBlendMode: 'screen' }} />
                ))}
                {mediaMarkers.filter((marker) => marker.assetId === activeAsset.id).length > 0 && <div className="absolute bottom-2 left-2 z-10 max-h-20 max-w-[min(420px,70%)] overflow-y-auto space-y-0.5 rounded-[3px] border border-white/15 bg-black/70 px-2 py-1.5 text-[8.5px] shadow-xl backdrop-blur-sm">{mediaMarkers.filter((marker) => marker.assetId === activeAsset.id).map((marker) => <button key={marker.id} onClick={() => { if (videoRef.current) videoRef.current.currentTime = marker.timeSeconds; setVideoTime(marker.timeSeconds); videoTimeRef.current = marker.timeSeconds; }} className="block w-full truncate text-left text-[#d8c19e] hover:text-white cursor-pointer" title={marker.note}><span className="text-[#ffb347]">{marker.timeSeconds.toFixed(2)}s</span> · {marker.note}</button>)}</div>}
              </div>
            </>
          )}
        </div>
      )}
      {activeAsset?.kind === 'image' && (
        <div
          data-media-stage
          className="absolute inset-x-0 top-7 bottom-0 z-[6] flex min-h-0 flex-col overflow-hidden border-t border-[#252525] bg-[#202020] pointer-events-auto"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        >
          {minimizedOverlays.image ? (
            <div className="flex h-full items-end justify-start p-3">
              <button onClick={() => toggleOverlay('image')} className="rounded-[3px] border border-[#555] bg-black/70 px-2 py-1 text-[9px] text-[#ddd] shadow-lg hover:bg-black/90 cursor-pointer">
                <span className="mr-1 text-[#e88724] font-bold">+</span> Restore image view
              </button>
            </div>
          ) : (
            <>
              <div data-workspace-chrome className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-black/55 px-2 py-1 text-[9px] text-[#ccc] backdrop-blur-md">
                <span className="min-w-0 truncate font-bold uppercase tracking-wide">Image view · {activeAsset.name}</span>
                <button onClick={() => toggleOverlay('image')} className="px-1 text-[#aaa] hover:text-white cursor-pointer" title="Minimize image view">−</button>
              </div>
              <div
                className={`relative min-h-0 flex-1 overflow-hidden bg-black ${isGasBrushActive ? 'cursor-cell' : ''}`}
                onPointerDown={(event) => handleGasMediaPointerDown(event, activeAsset.id)}
                onPointerMove={(event) => handleGasMediaPointerMove(event, activeAsset.id)}
                onPointerUp={handleGasMediaPointerUp}
                onPointerCancel={handleGasMediaPointerUp}
              >
                <img key={connectedViewerReload} src={activeAsset.url} alt={activeAsset.name} onLoad={() => setAssetLoadState('ready')} onError={() => { setAssetLoadState('error'); setAssetLoadMessage(`Could not open ${activeAsset.name}.`); }} className="block h-full w-full object-cover" />
                {gasMarks.filter((mark) => mark.space === 'media' && mark.assetId === activeAsset.id && mark.frame === currentFrame && mark.screen).map((mark) => (
                  <span key={mark.id} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${(mark.screen?.x || 0) * 100}%`, top: `${(mark.screen?.y || 0) * 100}%`, width: `${Math.max(28, Math.min(320, mark.radius * 64))}px`, height: `${Math.max(28, Math.min(320, mark.radius * 64))}px`, opacity: Math.max(0.08, Math.min(0.7, 0.08 + mark.concentration * 0.62)), background: `radial-gradient(circle, ${mark.color} 0%, ${mark.color}99 28%, ${mark.color}22 62%, transparent 76%)`, filter: 'blur(1px)', mixBlendMode: 'screen' }} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {activeAsset?.kind === 'world' && (
        <div
          data-media-stage
          className="absolute inset-x-0 top-7 bottom-0 z-[6] flex min-h-0 flex-col overflow-hidden border-t border-[#252525] bg-[#202020] pointer-events-auto"
        >
          {minimizedOverlays.world ? (
            <div className="flex h-full items-end justify-start p-3">
              <button onClick={() => toggleOverlay('world')} className="rounded-[3px] border border-[#555] bg-black/70 px-2 py-1 text-[9px] text-[#ddd] shadow-lg hover:bg-black/90 cursor-pointer">
                <span className="mr-1 text-[#e88724] font-bold">+</span> Restore connected model
              </button>
            </div>
          ) : (
            <>
              <div data-workspace-chrome className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-black/65 px-2 py-1 text-[9px] text-[#ccc] backdrop-blur-md">
                <span className="min-w-0 truncate font-bold uppercase tracking-wide">{activeAsset.provider === 'gomera' ? 'GOMERA X' : activeAsset.provider === 'gemini' ? 'Gemini scene' : 'World Labs Marble'} · {activeAsset.name}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <button onClick={() => setConnectedViewerReload((value) => value + 1)} className="text-[#ccc] hover:text-white" title="Reload connected model">Reload</button>
                  <a href={activeAsset.remoteUrl || activeAsset.url} target="_blank" rel="noreferrer" className="text-[#9bcaf0] hover:text-white hover:underline">Open externally</a>
                  <button onClick={() => toggleOverlay('world')} className="px-1 text-[#aaa] hover:text-white cursor-pointer" title="Minimize connected model">−</button>
                </div>
              </div>
              <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
                <iframe
                  ref={worldFrameRef}
                  key={`${activeAsset.id}-${connectedViewerReload}`}
                  onError={() => { setAssetLoadState('error'); setAssetLoadMessage('The remote viewer connection failed.'); }}
                  src={toEmbeddedWebViewerUrl(activeAsset.remoteUrl || activeAsset.url)}
                  title={`${activeAsset.provider || 'provider'} model: ${activeAsset.name}`}
                  className="block h-full w-full border-0 bg-black"
                  allow="fullscreen; accelerometer; gyroscope; xr-spatial-tracking"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-pointer-lock allow-popups allow-downloads allow-presentation"
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Top Viewport Navigation and Mode Bar */}
      <div data-workspace-chrome data-onboarding-target="viewport-controls" aria-label="Viewport controls" className="absolute top-0 left-0 right-0 h-8 bg-[#383838]/95 border-b border-[#252525] flex items-center justify-start gap-2 px-2 text-[11px] text-[#cfcfcf] z-[80] backdrop-blur-sm overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x [scrollbar-width:thin] [scrollbar-color:#777_transparent]">
        {/* Left Controls: Preset Selector, Menus, Orbit vs Walk, Flashlight, Ruler, Hotspots */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 min-w-max">
          {/* SCENE PRESET SELECTOR (Classic Diorama vs Rugged Timbered Photo vs AI Custom) */}
          <div className="relative">
            <button
              onClick={() => {
                setPresetMenuOpen(!presetMenuOpen);
                setViewMenuOpen(false);
                setDisplayMenuOpen(false);
                setCameraMenuOpen(false);
                setHotspotMenuOpen(false);
              }}
              className="bg-[#272727] hover:bg-[#404040] text-[#e88724] font-semibold px-2 py-0.5 rounded-[2px] border border-[#484848] flex items-center space-x-1 cursor-pointer transition-colors shadow-sm"
              title="Switch 3D procedural scene architecture"
            >
              <Layers className="w-3 h-3 text-[#e88724]" />
              <span>
                Scene: {TUNNEL_PRESETS[currentPresetId]?.name.split(' ')[0]} ▾
              </span>
            </button>
            {presetMenuOpen && (
              <div className="absolute top-7 left-0 w-64 bg-[#2b2b2b] border border-[#181818] shadow-2xl py-1.5 z-40 text-[11px] text-[#e0e0e0] rounded-[2px]">
                <div className="px-3 py-1 text-[9px] text-[#888] font-bold uppercase tracking-wider border-b border-[#3d3d3d] mb-1">
                  Available 3D Tunnel Scenes
                </div>
                {Object.values(TUNNEL_PRESETS).map((preset) => {
                  const isSelected = currentPresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => {
                        if (onSelectPreset) onSelectPreset(preset.id);
                        setPresetMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 hover:bg-[#e88724] hover:text-black cursor-pointer transition-colors flex items-start justify-between ${
                        isSelected ? 'bg-[#38332a] text-[#e88724] font-bold' : ''
                      }`}
                    >
                      <div>
                        <div className="font-semibold">{preset.name}</div>
                        <div className={`text-[9.5px] line-clamp-1 ${isSelected ? 'text-[#e88724]/80' : 'text-[#888]'}`}>
                          {preset.subtitle}
                        </div>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-[#e88724] shrink-0 mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Project map toggle */}
          <button
            onClick={onToggleMap}
            disabled={!mapGeometry}
            className={`px-1.5 py-0.5 cursor-pointer flex items-center space-x-1 border-b-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${showMap ? 'border-[#e88724] text-[#ffb35d] font-bold' : 'border-transparent text-[#b7d7e9] hover:border-[#777] hover:text-white'}`}
            title={showMap ? 'Hide project map' : 'Show project map'}
          >
            <MapIcon className="w-3 h-3" />
          </button>

          {/* Quick Photo Reference Comparison Button */}
          <button
            onClick={() => setShowReferenceModal(true)}
            className="hover:text-white hover:bg-[#484848] px-1.5 py-0.5 rounded-[2px] cursor-pointer flex items-center space-x-1 text-[#88bbdd] border border-transparent hover:border-[#555]"
            title="Inspect original photo reference and 3D structural mapping"
          >
            <ImageIcon className="w-3 h-3" />
            <span>Photo Ref</span>
          </button>

          {/* Quick Scene Parameters Sliders Button */}
          <button
            onClick={() => setShowParametersModal(true)}
            className="hover:text-white hover:bg-[#484848] px-1.5 py-0.5 rounded-[2px] cursor-pointer flex items-center space-x-1 text-[#e0cf85] border border-transparent hover:border-[#555]"
            title="Tune procedural timber sets, lagging tiers, and rock strata"
          >
            <SlidersIcon className="w-3 h-3 text-[#e88724]" />
            <span>Tune 3D</span>
          </button>

          <span className="text-[#555]">|</span>

          {/* View Menu */}
          <div className="relative">
            <button
              onClick={() => {
                setViewMenuOpen(!viewMenuOpen);
                setCameraMenuOpen(false);
                setDisplayMenuOpen(false);
                setHotspotMenuOpen(false);
                setPresetMenuOpen(false);
              }}
              className="hover:text-white hover:bg-[#505050] px-1.5 py-0.5 rounded-[2px] cursor-pointer"
            >
              View ▾
            </button>
            {viewMenuOpen && (
              <div className="absolute top-7 left-0 w-48 bg-[#303030] border border-[#202020] shadow-xl py-1 z-30 text-[11px] text-[#e0e0e0] rounded-[2px]">
                <button
                  onClick={() => {
                    alignCameraToPhotoReference();
                    setViewMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black cursor-pointer text-[#88bbdd] font-semibold"
                >
                  Photo Reference Viewpoint
                </button>
                <button
                  onClick={() => {
                    setOrbitView(33, 1.18, 0.44, { x: -0.5, y: 3.0, z: 0 });
                    setViewMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black cursor-pointer"
                >
                  Default Diorama Frame
                </button>
                <button
                  onClick={() => {
                    resetWalkPosition(true);
                    onSetPlayback?.(false);
                    setNavMode('walk');
                    setViewMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black cursor-pointer"
                >
                  Enter Walk Mode (Tunnel Entrance)
                </button>
                <button
                  onClick={() => {
                    setShowGrid(!showGrid);
                    setViewMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black cursor-pointer flex items-center space-x-1"
                >
                  {showGrid && <Check className="w-3 h-3 text-[#e88724]" />}
                  <span>{showGrid ? 'Hide Floor Grid' : 'Show Floor Grid'}</span>
                </button>
                <button
                  onClick={() => {
                    setClearView((current) => !current);
                    setViewMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black cursor-pointer flex items-center space-x-1"
                >
                  {clearView && <Check className="w-3 h-3 text-[#e88724]" />}
                  <span>{clearView ? 'Restore Scene View' : 'Clear View (Objects)'}</span>
                </button>
                <div className="my-1 border-t border-[#454545]" />
                <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-[#888]">Representation</div>
                {([
                  ['gouraud', 'Textured Shading'],
                  ['gouraud_lines', 'Shading with Lines'],
                  ['wireframe', 'Wireframe Mesh'],
                  ['points', 'Point Cloud Vertices'],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setShadingMode(mode);
                      setViewMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black cursor-pointer flex items-center justify-between"
                  >
                    <span>{label}</span>
                    {shadingMode === mode && <Check className="w-3 h-3 text-[#e88724]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Camera positioning and reset menu */}
          <div className="relative">
            <button
              onClick={() => {
                setCameraMenuOpen(!cameraMenuOpen);
                setViewMenuOpen(false);
                setDisplayMenuOpen(false);
                setHotspotMenuOpen(false);
                setPresetMenuOpen(false);
              }}
              className="hover:text-white hover:bg-[#505050] px-1.5 py-0.5 rounded-[2px] cursor-pointer flex items-center space-x-1"
              title="Position, focus, and reset the camera"
            >
              <Camera className="w-3 h-3 text-[#88bbdd]" />
              <span>Camera ▾</span>
            </button>
            {cameraMenuOpen && (
              <div className="absolute top-7 left-0 w-52 bg-[#303030] border border-[#202020] shadow-xl py-1 z-[60] text-[11px] text-[#e0e0e0] rounded-[2px]">
                <button onClick={() => { setOrbitView(33, 1.18, 0.44, { x: -0.5, y: 3.0, z: 0 }); setCameraMenuOpen(false); }} className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black cursor-pointer">Reset Orbit Camera</button>
                <button onClick={() => { setOrbitView(33, Math.PI / 2, 0, { x: -0.5, y: 3.0, z: 0 }); setCameraMenuOpen(false); }} className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black cursor-pointer">Front View</button>
                <button onClick={() => { setOrbitView(33, 0.42, 0.44, { x: -0.5, y: 2.5, z: 0 }); setCameraMenuOpen(false); }} className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black cursor-pointer">Top View</button>
                <button onClick={() => { focusSelectedObject(); setCameraMenuOpen(false); }} disabled={!selectedObject} className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black disabled:text-[#666] disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed">Frame Selected Object</button>
                <div className="my-1 border-t border-[#454545]" />
                <button onClick={() => { alignCameraToPhotoReference(); setCameraMenuOpen(false); }} className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black cursor-pointer">Photo Reference Walk View</button>
                <button onClick={() => { resetWalkPosition(true); onSetPlayback?.(false); setNavMode('walk'); setCameraMenuOpen(false); }} className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black cursor-pointer">Walk Entrance View</button>
              </div>
            )}
          </div>

          {/* Shading Display Menu */}
          <div className="relative">
            <button
              onClick={() => {
                setDisplayMenuOpen(!displayMenuOpen);
                setViewMenuOpen(false);
                setCameraMenuOpen(false);
                setHotspotMenuOpen(false);
              }}
              className="hover:text-white hover:bg-[#505050] px-1.5 py-0.5 rounded-[2px] cursor-pointer"
            >
              Display ▾
            </button>
            {displayMenuOpen && (
              <div className="absolute top-7 left-0 w-48 bg-[#303030] border border-[#202020] shadow-xl py-1 z-30 text-[11px] text-[#e0e0e0] rounded-[2px]">
                <button
                  onClick={() => {
                    setShadingMode('gouraud');
                    setDisplayMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black cursor-pointer flex items-center justify-between"
                >
                  <span>Textured Shading</span>
                  {shadingMode === 'gouraud' && <Check className="w-3 h-3 text-[#e88724]" />}
                </button>
                <button
                  onClick={() => {
                    setShadingMode('gouraud_lines');
                    setDisplayMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black cursor-pointer flex items-center justify-between"
                >
                  <span>Shading with Lines</span>
                  {shadingMode === 'gouraud_lines' && <Check className="w-3 h-3 text-[#e88724]" />}
                </button>
                <button
                  onClick={() => {
                    setShadingMode('wireframe');
                    setDisplayMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black cursor-pointer flex items-center justify-between"
                >
                  <span>Wireframe Mesh</span>
                  {shadingMode === 'wireframe' && <Check className="w-3 h-3 text-[#e88724]" />}
                </button>
                <button
                  onClick={() => {
                    setShadingMode('points');
                    setDisplayMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black cursor-pointer flex items-center justify-between"
                >
                  <span>Point Cloud Vertices</span>
                  {shadingMode === 'points' && <Check className="w-3 h-3 text-[#e88724]" />}
                </button>
              </div>
            )}
          </div>

          {/* HOTSPOTS DROPDOWN (Replacing the 5 bottom floating buttons) */}
          <div className="relative">
            <button
              onClick={() => {
                setHotspotMenuOpen(!hotspotMenuOpen);
                setViewMenuOpen(false);
                setDisplayMenuOpen(false);
                setCameraMenuOpen(false);
              }}
              className="hover:text-white hover:bg-[#505050] px-1.5 py-0.5 rounded-[2px] cursor-pointer flex items-center space-x-1"
              title="Inspect geological and structural tunnel hotspots"
            >
              <Target className="w-3 h-3 text-[#e88724]" />
              <span>Hotspots ▾</span>
            </button>
            {hotspotMenuOpen && (
              <div className="absolute top-7 left-0 w-60 bg-[#303030] border border-[#202020] shadow-xl py-1 z-30 text-[11px] text-[#e0e0e0] rounded-[2px]">
                <div className="px-3 py-1 text-[9.5px] text-[#888] font-bold uppercase tracking-wider border-b border-[#3d3d3d] mb-1">
                  Geological & Structural Hotspots
                </div>
                {hotspots.map((h) => {
                  const CategoryIcon = h.category === 'geology' ? Sparkles : h.category === 'support' ? Layers : Box;
                  return (
                    <button
                      key={h.id}
                      onClick={() => {
                        manualNavigationRef.current = true;
                        setSelectedHotspot(h);
                        restoreOverlay('hotspot');
                        targetRef.current.set(h.position.x, h.position.y, h.position.z);
                        const walkTarget = new THREE.Vector3(h.position.x + 3.0, h.position.y + 0.5, h.position.z + 4.0);
                        walkPosRef.current.copy(walkTarget);
                        walkYawRef.current = Math.atan2(-(h.position.x - walkTarget.x), -(h.position.z - walkTarget.z));
                        walkPitchRef.current = -0.04;
                        sphericalRef.current.set(12, Math.PI / 3, Math.PI / 4);
                        onSetPlayback?.(false);
                        setHotspotMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#e88724] hover:text-black cursor-pointer flex items-center space-x-2 transition-colors"
                    >
                      <CategoryIcon className="w-3.5 h-3.5 text-[#e88724] flex-shrink-0" />
                      <span className="truncate">{h.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="h-3.5 w-[1px] bg-[#555] mx-0.5" />

          {/* CAMERA NAVIGATION MODE TOGGLE (Orbit vs Walkable Tunnel) */}
          <div className="flex items-center bg-[#242424] p-0.5 rounded-[2px] border border-[#444]">
            <button
              onClick={() => {
                manualNavigationRef.current = true;
                setNavMode('orbit');
              }}
              className={`px-2 py-0.5 text-[10px] rounded-[1px] font-bold cursor-pointer transition-colors flex items-center space-x-1 ${
                navMode === 'orbit' ? 'bg-[#3b516b] text-white shadow-sm' : 'text-[#888] hover:text-white'
              }`}
              title="C4D Orbit/Pan Camera Mode"
            >
              <RotateCw className="w-3 h-3" />
              <span>Orbit</span>
            </button>
            <button
              onClick={() => {
                setNavMode('walk');
                resetWalkPosition(true);
              }}
              className={`px-2 py-0.5 text-[10px] rounded-[1px] font-bold cursor-pointer transition-colors flex items-center space-x-1 ${
                navMode === 'walk' ? 'bg-[#e88724] text-black shadow-sm' : 'text-[#888] hover:text-white'
              }`}
              title="First-Person Walkable Drift Tour (WASD + Mouse Look)"
            >
              <Footprints className="w-3 h-3" />
              <span>Walk Mode</span>
            </button>
          </div>

          {/* Miner's Headlamp Toggle (F) */}
          <button
            onClick={() => setFlashlightOn(!flashlightOn)}
            className={`px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold border transition-colors flex items-center space-x-1 cursor-pointer ${
              flashlightOn
                ? 'bg-[#ffe082] text-black border-[#ffd54f]'
                : 'bg-[#2b2b2b] text-[#888] border-[#444] hover:text-white'
            }`}
            title="Toggle Miner's Headlamp Flashlight (Hotkey: F)"
          >
            <Lightbulb className="w-3 h-3" />
            <span className="hidden sm:inline">{flashlightOn ? 'Lamp ON' : 'Lamp'}</span>
          </button>

          {/* 3D Laser Measurement Ruler */}
          <button
            onClick={() => {
              setIsRulerActive(!isRulerActive);
              setIsAnnotationMode(false);
              setRulerPoints([]);
              setMeasuredDistance(null);
              if (rulerLineRef.current) rulerLineRef.current.visible = false;
            }}
            className={`px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold border transition-colors flex items-center space-x-1 cursor-pointer ${
              isRulerActive
                ? 'bg-[#ff0055] text-white border-[#ff3377]'
                : 'bg-[#2b2b2b] text-[#888] border-[#444] hover:text-white'
            }`}
            title="3D Laser Distance Ruler (Click two points on tunnel walls)"
          >
            <Ruler className="w-3 h-3" />
            <span className="hidden sm:inline">Ruler</span>
          </button>

          {/* Keyframe marker / note tool */}
          <button
            onClick={() => {
              setIsAnnotationMode((prev) => !prev);
              setIsGasBrushActive(false);
              setIsRulerActive(false);
              setPendingAnnotationPosition(null);
              setAnnotationNote('');
            }}
            className={`px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold border transition-colors flex items-center space-x-1 cursor-pointer ${
              isAnnotationMode
                ? 'bg-[#ffb347] text-black border-[#ffb347]'
                : 'bg-[#2b2b2b] text-[#ffb347] border-[#76552b] hover:text-white'
            }`}
            title="Place a note marker on the model and save it to the current camera keyframe"
          >
            <Crosshair className="w-3 h-3" />
            <span className="hidden sm:inline">Mark</span>
          </button>

          {/* Gas plume brush: soft, revisit-able concentration marks for models and media. */}
          <button
            onClick={() => {
              setIsGasBrushActive((prev) => !prev);
              setIsAnnotationMode(false);
              setIsRulerActive(false);
              setPendingAnnotationPosition(null);
            }}
            className={`px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold border transition-colors flex items-center space-x-1 cursor-pointer ${
              isGasBrushActive ? 'bg-[#83d8c7] text-black border-[#83d8c7]' : 'bg-[#2b2b2b] text-[#83d8c7] border-[#3d766e] hover:text-white'
            }`}
            title="Paint a faint coloured gas/smoke zone on the current model or media frame"
          >
            <Sparkles className="w-3 h-3" />
            <span className="hidden sm:inline">Gas Brush</span>
          </button>
        </div>

        {/* Right Controls: Record Keyframe, Screenshot, Fullscreen */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 min-w-max shrink-0 ml-1">
          {/* Quick Record Keyframe Button */}
          <button
            onClick={handleRecordViewClick}
            className="px-2 py-0.5 bg-[#e88724] hover:bg-[#ff9933] text-black font-bold rounded-[2px] text-[10px] cursor-pointer transition-colors flex items-center space-x-1 shadow-sm"
            title="Record current camera position and angle into active animation path (Hotkey: K)"
          >
            <Camera className="w-3 h-3" />
            <span>+ Keyframe (K)</span>
          </button>

          {/* Screenshot PNG */}
          <button
            onClick={handleCaptureScreenshot}
            className="w-6 h-5 bg-[#2e2e2e] hover:bg-[#444] text-[#ddd] rounded-[2px] flex items-center justify-center cursor-pointer border border-[#444]"
            title="Save Viewport Snapshot PNG"
          >
            <Camera className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Mode Status Banner / Reticle */}
      {navMode === 'walk' && (
        <div className="absolute top-9 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center">
          <ViewerOverlay title="Walk mode" minimized={Boolean(minimizedOverlays.walkBanner)} onToggle={() => toggleOverlay('walkBanner')}>
            <div className="text-center flex items-center space-x-2">
            <Footprints className="w-3.5 h-3.5 text-[#e88724]" />
            <span className="text-[#e88724] font-bold text-[11px]">Walk Mode Active</span>
            <span className="text-[#bbb] text-[10px] hidden sm:inline">
              • WASD or Arrows to walk • Drag to look • Shift sprint • F lamp
            </span>
            </div>
          </ViewerOverlay>
          <div className="mt-28 w-3 h-3 border border-white/40 rounded-full flex items-center justify-center pointer-events-none">
            <div className="w-1 h-1 bg-[#e88724] rounded-full" />
          </div>
        </div>
      )}

      {/* Onscreen Walk Controls D-Pad (Touch & Mouse Click Friendly) */}
      {navMode === 'walk' && showOnscreenWalkControls && (
        <ViewerOverlay title="Walk controls" minimized={Boolean(minimizedOverlays.walkControls)} onToggle={() => toggleOverlay('walkControls')} className="absolute bottom-3 right-3 z-20">
          <div className="flex flex-col items-center space-y-1">
            <span className="text-[9px] text-[#888] font-mono">WALK D-PAD</span>
            <button
            onPointerDown={(event) => { event.preventDefault(); isWalkingRef.current.w = true; }}
            onPointerUp={() => (isWalkingRef.current.w = false)}
            onPointerCancel={() => (isWalkingRef.current.w = false)}
            onPointerLeave={() => (isWalkingRef.current.w = false)}
            className="w-8 h-8 bg-[#333] hover:bg-[#e88724] hover:text-black text-white font-bold rounded flex items-center justify-center active:bg-[#e88724]"
            title="Walk Forward"
          >
            <ChevronUp className="w-4 h-4" />
            </button>
            <div className="flex space-x-1">
            <button
              onPointerDown={(event) => { event.preventDefault(); isWalkingRef.current.a = true; }}
              onPointerUp={() => (isWalkingRef.current.a = false)}
              onPointerCancel={() => (isWalkingRef.current.a = false)}
              onPointerLeave={() => (isWalkingRef.current.a = false)}
              className="w-8 h-8 bg-[#333] hover:bg-[#e88724] hover:text-black text-white font-bold rounded flex items-center justify-center active:bg-[#e88724]"
              title="Strafe Left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onPointerDown={(event) => { event.preventDefault(); isWalkingRef.current.s = true; }}
              onPointerUp={() => (isWalkingRef.current.s = false)}
              onPointerCancel={() => (isWalkingRef.current.s = false)}
              onPointerLeave={() => (isWalkingRef.current.s = false)}
              className="w-8 h-8 bg-[#333] hover:bg-[#e88724] hover:text-black text-white font-bold rounded flex items-center justify-center active:bg-[#e88724]"
              title="Walk Backward"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              onPointerDown={(event) => { event.preventDefault(); isWalkingRef.current.d = true; }}
              onPointerUp={() => (isWalkingRef.current.d = false)}
              onPointerCancel={() => (isWalkingRef.current.d = false)}
              onPointerLeave={() => (isWalkingRef.current.d = false)}
              className="w-8 h-8 bg-[#333] hover:bg-[#e88724] hover:text-black text-white font-bold rounded flex items-center justify-center active:bg-[#e88724]"
              title="Strafe Right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            </div>
            <button
            onClick={() => {
              const next = !walkSprint;
              setWalkSprint(next);
              isWalkingRef.current.shift = next;
            }}
            className={`w-full py-0.5 text-[9px] font-bold rounded border ${
              walkSprint ? 'bg-[#e88724] text-black border-[#e88724]' : 'bg-[#222] text-[#888] border-[#444]'
            }`}
          >
            Sprint {walkSprint ? 'ON' : 'OFF'}
            </button>
          </div>
        </ViewerOverlay>
      )}

      {/* 3D Ruler Measurement HUD Callout */}
      {isRulerActive && (
        <ViewerOverlay title="3D ruler" minimized={Boolean(minimizedOverlays.ruler)} onToggle={() => toggleOverlay('ruler')} className="absolute top-9 left-3 z-20 text-[11px] text-[#f0f0f0]">
          <div className="flex items-center space-x-1.5 text-[#ff3377] font-bold">
            <Ruler className="w-3.5 h-3.5" />
            <span>3D Laser Measurement</span>
          </div>
          <p className="text-[10px] text-[#aaa]">
            {rulerPoints.length === 0 && 'Click first point on tunnel surface.'}
            {rulerPoints.length === 1 && 'Point 1 set. Click second point to measure distance.'}
            {rulerPoints.length === 2 && measuredDistance !== null && (
              <span className="text-[#00e5ff] font-mono text-[13px] font-bold">
                Distance: {measuredDistance.toFixed(2)} m ({(measuredDistance * 100).toFixed(0)} cm)
              </span>
            )}
          </p>
        </ViewerOverlay>
      )}

      {isAnnotationMode && !pendingAnnotationPosition && (
        <ViewerOverlay title="Place note" minimized={Boolean(minimizedOverlays.annotationHint)} onToggle={() => toggleOverlay('annotationHint')} className="absolute top-9 left-3 z-20 text-[10px] text-[#f0f0f0]">Click a point on the model to place a keyframe note.</ViewerOverlay>
      )}

      {isGasBrushActive && (
        <ViewerOverlay title="Gas brush" minimized={Boolean(minimizedOverlays.gasBrush)} onToggle={() => toggleOverlay('gasBrush')} className="absolute top-9 left-3 z-30 w-64 text-[10px] text-[#ddd] space-y-2">
          <div className="text-[#83d8c7] font-bold">Paint gas / smoke zone</div>
          <div className="text-[9px] text-[#aaa]">Click-drag over a model or video. Marks return at this frame/time.</div>
          <label className="flex items-center justify-between gap-2">
            <span className="text-[#aaa]">Colour</span>
            <input type="color" value={gasBrushColor} onChange={(event) => setGasBrushColor(event.target.value)} className="h-6 w-10 cursor-pointer rounded border border-[#555] bg-transparent" />
          </label>
          <label className="block">
            <div className="flex justify-between text-[#aaa]"><span>Brush size</span><span className="font-mono text-[#83d8c7]">{gasBrushRadius.toFixed(2)}</span></div>
            <input type="range" min="0.35" max="3.5" step="0.05" value={gasBrushRadius} onChange={(event) => setGasBrushRadius(Number(event.target.value))} className="w-full accent-[#83d8c7] cursor-pointer" />
          </label>
          <label className="block">
            <div className="flex justify-between text-[#aaa]"><span>Concentration</span><span className="font-mono text-[#83d8c7]">{Math.round(gasConcentration * 100)}%</span></div>
            <input type="range" min="0.05" max="1" step="0.05" value={gasConcentration} onChange={(event) => setGasConcentration(Number(event.target.value))} className="w-full accent-[#83d8c7] cursor-pointer" />
          </label>
          <div className="border-t border-[#444] pt-1 text-[9px] text-[#888]">The plume is intentionally faint; increase concentration to make the gas denser.</div>
        </ViewerOverlay>
      )}

      {pendingAnnotationPosition && (
        <ViewerOverlay title="Keyframe note" minimized={Boolean(minimizedOverlays.annotationForm)} onToggle={() => toggleOverlay('annotationForm')} className="absolute top-9 left-3 z-30 w-64 text-[11px] space-y-2">
          <div className="flex items-center justify-between text-[#ffb347] font-bold">
            <span>Note at current keyframe</span>
            <button
              onClick={() => setPendingAnnotationPosition(null)}
              className="text-[#888] hover:text-white cursor-pointer"
              title="Cancel marker"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-[9px] text-[#888] font-mono">
            {pendingAnnotationPosition.x.toFixed(2)}, {pendingAnnotationPosition.y.toFixed(2)}, {pendingAnnotationPosition.z.toFixed(2)} m
          </div>
          <textarea
            autoFocus
            value={annotationNote}
            onChange={(e) => setAnnotationNote(e.target.value)}
            placeholder="Describe what was observed here…"
            rows={3}
            className="w-full resize-none bg-[#1d1d1d] border border-[#4b4b4b] rounded-[2px] p-1.5 text-[10px] text-white outline-none focus:border-[#ffb347]"
          />
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => setPendingAnnotationPosition(null)}
              className="px-2 py-0.5 bg-[#444] text-[#ccc] rounded-[2px] text-[10px] cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAnnotation}
              disabled={!annotationNote.trim()}
              className="px-2 py-0.5 bg-[#ffb347] disabled:bg-[#76552b] disabled:text-[#aaa] text-black rounded-[2px] text-[10px] font-bold cursor-pointer disabled:cursor-not-allowed"
            >
              Save Marker
            </button>
          </div>
        </ViewerOverlay>
      )}

      {keyframeAnnotations.length > 0 && !pendingAnnotationPosition && (
        <ViewerOverlay title="Keyframe notes" minimized={Boolean(minimizedOverlays.notes)} onToggle={() => toggleOverlay('notes')} className="absolute top-12 right-3 z-20 w-64 text-[10px] space-y-1.5">
          <div className="flex items-center justify-between border-b border-[#444] pb-1 text-[#ffb347] font-bold">
            <span>Keyframe Notes</span>
            <span className="text-[#999] font-mono">{keyframeAnnotations.length}</span>
          </div>
          {keyframeAnnotations.map((annotation) => (
            <div key={annotation.id} className="border-l-2 border-[#ffb347] pl-1.5 text-[#ddd] leading-relaxed">
              {annotation.note}
            </div>
          ))}
        </ViewerOverlay>
      )}

      {/* Hotspot Geotechnical Inspection Card */}
      {selectedHotspot && (
        <ViewerOverlay title="Hotspot inspection" minimized={Boolean(minimizedOverlays.hotspot)} onToggle={() => toggleOverlay('hotspot')} className="absolute top-12 right-3 z-30 w-72 text-[11px] text-[#ddd] space-y-2">
          <div className="flex items-center justify-between border-b border-[#444] pb-1.5">
            <div className="flex items-center space-x-1.5">
              {selectedHotspot.category === 'geology' ? (
                <Sparkles className="w-3.5 h-3.5 text-[#e88724]" />
              ) : selectedHotspot.category === 'support' ? (
                <Layers className="w-3.5 h-3.5 text-[#cca060]" />
              ) : (
                <Box className="w-3.5 h-3.5 text-[#60a5fa]" />
              )}
              <span className="font-bold text-[#f5f5f5] text-[11.5px]">{selectedHotspot.name}</span>
            </div>
            <button
              onClick={() => setSelectedHotspot(null)}
              className="text-[#888] hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[10px] text-[#bbb] leading-relaxed">{selectedHotspot.description}</p>
          <div className="space-y-1 bg-[#202020] p-1.5 rounded-[2px]">
            {selectedHotspot.details.map((d, idx) => (
              <div key={idx} className="flex justify-between text-[10px] gap-2">
                <span className="text-[#888] flex-shrink-0">{d.label}:</span>
                <span className="font-mono text-[#4ade80] font-medium text-right">{d.value}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => {
                targetRef.current.set(selectedHotspot.position.x, selectedHotspot.position.y, selectedHotspot.position.z);
                walkPosRef.current.set(selectedHotspot.position.x + 3.0, selectedHotspot.position.y + 0.5, selectedHotspot.position.z + 4.0);
                sphericalRef.current.set(12, Math.PI / 3, Math.PI / 4);
              }}
              className="px-2 py-0.5 bg-[#3a3a3a] hover:bg-[#e88724] hover:text-black text-white rounded-[2px] text-[10px] cursor-pointer font-bold flex items-center space-x-1"
            >
              <Crosshair className="w-3 h-3" />
              <span>Focus View</span>
            </button>
            <button
              onClick={() => {
                if (onRecordCurrentView) {
                  onRecordCurrentView({
                    position: {
                      x: selectedHotspot.position.x + 3.0,
                      y: selectedHotspot.position.y + 0.5,
                      z: selectedHotspot.position.z + 4.0,
                    },
                    target: { ...selectedHotspot.position },
                    fov: 42,
                  });
                }
              }}
              className="px-2 py-0.5 bg-[#e88724] hover:bg-[#ff9933] text-black rounded-[2px] text-[10px] font-bold cursor-pointer"
            >
              + Add to Tour
            </button>
          </div>
        </ViewerOverlay>
      )}

      {/* Top Left Projection Name */}
      <div className="absolute top-9 left-3 text-[11px] text-[#d0d0d0] font-sans tracking-wide pointer-events-none drop-shadow">
        {navMode === 'walk' ? 'Perspective (First-Person Walkthrough)' : 'Perspective (Orbit)'}
        {navMode === 'orbit' && <span className="ml-2 text-[9px] text-[#999]">Drag to orbit · Shift-drag to edit object · double-click to focus · wheel / +/- to zoom</span>}
      </div>

      {/* Bottom Left 3D Coordinate Axis Indicator */}
      <div className="absolute bottom-3 left-3 pointer-events-none flex flex-col items-center">
        <svg width="44" height="44" viewBox="0 0 50 50">
          <circle cx="16" cy="34" r="2" fill="#fff" opacity="0.8" />
          <line x1="16" y1="34" x2="16" y2="12" stroke="#4ade80" strokeWidth="2" />
          <text x="13" y="10" fill="#4ade80" fontSize="10" fontWeight="bold">Y</text>
          <line x1="16" y1="34" x2="36" y2="40" stroke="#f87171" strokeWidth="2" />
          <text x="38" y="44" fill="#f87171" fontSize="10" fontWeight="bold">X</text>
          <line x1="16" y1="34" x2="30" y2="22" stroke="#60a5fa" strokeWidth="2" />
          <text x="32" y="20" fill="#60a5fa" fontSize="10" fontWeight="bold">Z</text>
        </svg>
      </div>

      {/* Bottom Right Grid Spacing Indicator */}
      <div className="absolute bottom-2.5 right-24 text-[11px] text-[#c0c0c0] font-sans tracking-wide pointer-events-none">
        Grid : 100 cm (1 m)
      </div>

      {/* Reference Photo Comparison Modal */}
      <ReferencePhotoModal
        isOpen={showReferenceModal}
        onClose={() => setShowReferenceModal(false)}
        onApplyPreset={() => {
          if (onSelectPreset) onSelectPreset('rugged_timbered_photo');
        }}
        onAlignCameraToPhoto={alignCameraToPhotoReference}
        onOpenSceneOptions={() => setShowParametersModal(true)}
        currentParams={proceduralParams}
      />

      {/* Procedural Scene Sliders Modal */}
      <SceneParametersModal
        isOpen={showParametersModal}
        onClose={() => setShowParametersModal(false)}
        params={proceduralParams}
        onApplyParams={(newP) => {
          if (onUpdateProceduralParams) onUpdateProceduralParams(newP);
        }}
      />
      {liveStreamOpen && (
        <LiveStreamViewer
          onClose={() => onCloseLiveStream?.()}
          onCapture={(dataUrl, name) => onCaptureReferenceImage?.(dataUrl, name)}
          onSaveFile={onSaveLiveFile}
          sourceUrl={liveStreamSourceUrl || undefined}
        />
      )}
    </div>
  );
};
