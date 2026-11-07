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
import { CameraTourManager } from './components/panels/CameraTourManager';
import { MarkHistoryItem, MarkHistoryPanel } from './components/panels/MarkHistoryPanel';
import { StatusBar } from './components/layout/StatusBar';
import { DockLayout, UpperTabType } from './components/layout/DockLayout';
import { PictureViewerModal } from './components/modals/PictureViewerModal';
import { RenderSettingsModal } from './components/modals/RenderSettingsModal';
import { HelpGuideModal } from './components/modals/HelpGuideModal';
import { OnboardingGuide } from './components/modals/OnboardingGuide';
import { calculateCartZ, stepFrame } from './utils/math3d';
import { CameraKeyframe, CameraTour, KeyframeAnnotation } from './types/cameraTour';
import { getDefaultCameraTours } from './utils/cameraAnimation';
import { TunnelPresetId, ProceduralTunnelParams } from './types/tunnelScene';
import { TUNNEL_PRESETS, getCombinedSceneObjects, getAllCombinedMaterials } from './scene/tunnelPresetRegistry';
import { AuthUser, GasMark, MediaMarker, ProjectAsset, ProjectSummary, StorageQuota } from './types/project';

declare global {
  interface Window {
    google?: any;
  }
}

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
  const [activeUpperTab, setActiveUpperTab] = useState<UpperTabType>('Objects');
  const [activeTool, setActiveTool] = useState<ToolMode>('move');
  const [activeLeftMode, setActiveLeftMode] = useState<ToolMode>('model');
  const [isSnapping, setIsSnapping] = useState<boolean>(false);
  const [isWorldSpace, setIsWorldSpace] = useState<boolean>(true);
  const [axisLocks, setAxisLocks] = useState({ x: true, y: true, z: true });
  const [isSoloMode, setIsSoloMode] = useState<boolean>(false);
  const soloVisibilityRef = useRef<Record<string, boolean>>({});

  // Camera Tours & Animation Paths State ("load animation set / follow path automatically / save & edit & delete")
  const [tours, setTours] = useState<CameraTour[]>(() => {
    try {
      const saved = localStorage.getItem('mining_site_camera_tours');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return getDefaultCameraTours();
  });
  const [activeTourId, setActiveTourId] = useState<string>(() => {
    return getDefaultCameraTours()[0].id;
  });
  const [isTourPlaybackEnabled, setIsTourPlaybackEnabled] = useState<boolean>(true);

  // Survey Station 3D markers from photogrammetry AI
  const [surveyStationMarkers, setSurveyStationMarkers] = useState<Array<{
    stationId: string;
    x: number;
    y: number;
    z: number;
    color: string;
    label: string;
  }>>([]);

  // Save tours to localStorage
  const saveTours = useCallback((newTours: CameraTour[]) => {
    setTours(newTours);
    try {
      localStorage.setItem('mining_site_camera_tours', JSON.stringify(newTours));
    } catch (e) {}
  }, []);

  const activeTour = tours.find((t) => t.id === activeTourId) || tours[0];

  // Attention-grabbing Status Bar state
  const [statusAlert, setStatusAlert] = useState<StatusAlert>({
    type: 'idle',
    message: 'move elements. Hold down SHIFT to quantize movement / add to the selection in point mode, CTRL to remove.',
  });

  // Modal dialogs
  const [showPictureViewer, setShowPictureViewer] = useState<boolean>(false);
  const [showRenderSettings, setShowRenderSettings] = useState<boolean>(false);
  const [showHelpGuide, setShowHelpGuide] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return localStorage.getItem('miningsight_onboarding_completed') !== 'true';
    } catch (error) {
      return true;
    }
  });

  const openOnboarding = useCallback(() => {
    setShowHelpGuide(false);
    setShowOnboarding(true);
  }, []);

  const closeOnboarding = useCallback(() => {
    try {
      localStorage.setItem('miningsight_onboarding_completed', 'true');
    } catch (error) {}
    setShowOnboarding(false);
  }, []);

  const openHelpGuide = useCallback(() => {
    setShowOnboarding(false);
    setShowHelpGuide(true);
  }, []);

  // Hidden File input for opening saved .c4d.json projects
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Server-backed project and media library state
  const [projectName, setProjectName] = useState('Mining Site');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectAssets, setProjectAssets] = useState<ProjectAsset[]>([]);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [mediaMarkers, setMediaMarkers] = useState<MediaMarker[]>([]);
  const [gasMarks, setGasMarks] = useState<GasMark[]>([]);
  const gasMarksRef = useRef<GasMark[]>([]);
  const gasMarksSaveTimerRef = useRef<number | null>(null);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('Mining Site Project');
  const [newProjectFiles, setNewProjectFiles] = useState<File[]>([]);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem('miningsight_auth_token'));
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [storageQuota, setStorageQuota] = useState<StorageQuota | null>(null);
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[] | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ active: boolean; fileName: string; completed: number; total: number; percent: number; status: string; canRetry?: boolean }>({ active: false, fileName: '', completed: 0, total: 0, percent: 0, status: '' });
  const [uploadRetryAction, setUploadRetryAction] = useState<(() => void) | null>(null);

  // Active Scene Preset ('classic_diorama' | 'rugged_timbered_photo' | 'ai_custom')
  const [currentPresetId, setCurrentPresetId] = useState<TunnelPresetId>('rugged_timbered_photo');
  const [proceduralParams, setProceduralParams] = useState<ProceduralTunnelParams>(
    TUNNEL_PRESETS.rugged_timbered_photo.defaultParams
  );

  // Materials for Mining Tunnel - combined so all materials are accessible in Material Manager
  const [materials, setMaterials] = useState<C4DMaterial[]>(getAllCombinedMaterials());
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>('mat_photo_rock');

  // Scene Hierarchy Objects for Mining Tunnel - BOTH models always listed in side nav panel
  const [objects, setObjects] = useState<C4DSceneObject[]>(getCombinedSceneObjects('rugged_timbered_photo'));
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>('Rugged_Timbered_Mine_Tunnel_Photo');

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
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const classifyAsset = (file: File): ProjectAsset['kind'] => {
    if (file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogg)$/i.test(file.name)) return 'video';
    if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|tif?f)$/i.test(file.name)) return 'image';
    if (file.type.includes('gltf') || file.type.includes('glb') || file.type.includes('model') || /\.(glb|gltf|obj|fbx|ply)$/i.test(file.name)) return 'model';
    if (file.type.includes('pdf') || /\.(pdf|txt|csv|json)$/i.test(file.name)) return 'document';
    return 'other';
  };

  useEffect(() => {
    if (!authToken) return;
    fetch('/api/reconstruction/ai/auth/me', { headers: { Authorization: `Bearer ${authToken}` } })
      .then((response) => response.json())
      .then((json) => {
        if (json.success && json.user) setAuthUser(json.user);
        else {
          localStorage.removeItem('miningsight_auth_token');
          setAuthToken(null);
        }
      })
      .catch(() => {});
  }, [authToken]);

  const handleGoogleCredential = useCallback(async (credential: string) => {
    setAuthBusy(true);
    setAuthError('');
    try {
      const response = await fetch('/api/reconstruction/ai/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.message || 'Google sign-in failed.');
      localStorage.setItem('miningsight_auth_token', json.token);
      setAuthToken(json.token);
      setAuthUser(json.user);
      setShowAuthModal(false);
    } catch (error: any) {
      setAuthError(error.message || 'Google sign-in failed.');
    } finally {
      setAuthBusy(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/reconstruction/ai/auth/google/config')
      .then((response) => response.json())
      .then((json) => setGoogleClientId(json.clientId || ''))
      .catch(() => setGoogleClientId(''));
  }, []);

  useEffect(() => {
    if (!showAuthModal || authUser || !googleClientId || !googleButtonRef.current) return;
    const renderGoogleButton = () => {
      if (!window.google || !googleButtonRef.current) return;
      googleButtonRef.current.innerHTML = '';
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response: { credential: string }) => void handleGoogleCredential(response.credential),
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', logo_alignment: 'left', width: 320 });
    };
    if (window.google) {
      renderGoogleButton();
      return;
    }
    const script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    script?.addEventListener('load', renderGoogleButton);
    return () => script?.removeEventListener('load', renderGoogleButton);
  }, [authUser, googleClientId, handleGoogleCredential, showAuthModal]);

  const handleLogout = async () => {
    if (authToken) await fetch('/api/reconstruction/ai/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } }).catch(() => {});
    localStorage.removeItem('miningsight_auth_token');
    setAuthToken(null);
    setAuthUser(null);
    setActiveProjectId(null);
    setProjects([]);
    setProjectAssets([]);
    setActiveAssetId(null);
      gasMarksRef.current = [];
      setGasMarks([]);
  };

  const buildProjectData = useCallback(() => ({
    projectName,
    version: 'R19.068',
    timestamp: new Date().toISOString(),
    currentPresetId,
    proceduralParams,
    objects,
    materials,
    timeline: { ...timeline, playbackSpeed, isPlaying: false },
    tours,
    mediaMarkers,
    gasMarks,
    assets: projectAssets,
  }), [projectName, currentPresetId, proceduralParams, objects, materials, timeline, playbackSpeed, tours, mediaMarkers, gasMarks, projectAssets]);

  useEffect(() => {
    if (!authToken) {
      setProjects([]);
      setStorageQuota(null);
      return;
    }
    let cancelled = false;
    fetch('/api/reconstruction/ai/projects', { headers: { Authorization: `Bearer ${authToken}` } })
      .then((response) => response.json())
      .then((json) => {
        if (!cancelled && json.success && Array.isArray(json.projects)) setProjects(json.projects);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authToken]);

  const refreshStorageQuota = useCallback(async () => {
    if (!authToken) {
      setStorageQuota(null);
      return;
    }
    const response = await fetch('/api/reconstruction/ai/storage', { headers: { Authorization: `Bearer ${authToken}` } });
    const json = await response.json().catch(() => ({}));
    if (response.ok && json.success && json.storage) setStorageQuota(json.storage);
  }, [authToken]);

  useEffect(() => {
    void refreshStorageQuota();
  }, [refreshStorageQuota]);

  const saveProjectSnapshot = useCallback(async (projectId: string, nextName = projectName, assetsOverride?: ProjectAsset[], dataOverride?: Record<string, any>) => {
    const response = await fetch(`/api/reconstruction/ai/projects/${encodeURIComponent(projectId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      body: JSON.stringify({ projectName: nextName, projectData: { ...(dataOverride || buildProjectData()), projectName: nextName, assets: assetsOverride || projectAssets } }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) throw new Error(json.message || 'Project save failed.');
    if (json.project) setProjects((current) => [json.project, ...current.filter((project) => project.id !== json.project.id)]);
  }, [authToken, buildProjectData, projectName, projectAssets]);

  const ensureActiveProject = useCallback(async () => {
    if (activeProjectId) return activeProjectId;
    const response = await fetch('/api/reconstruction/ai/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      body: JSON.stringify({ projectName, projectData: buildProjectData() }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) throw new Error(json.message || 'Could not create the server project.');
    const id = json.project.id as string;
    setActiveProjectId(id);
    setProjects((current) => [json.project, ...current.filter((project) => project.id !== id)]);
    return id;
  }, [activeProjectId, authToken, buildProjectData, projectName]);

  const uploadAssetWithProgress = useCallback(async (projectId: string, file: File, index: number, total: number): Promise<ProjectAsset> => {
    if (!authToken) throw new Error('AUTH_REQUIRED');
    const authHeaders = { Authorization: `Bearer ${authToken}` };
    const baseUrl = `/api/reconstruction/ai/projects/${encodeURIComponent(projectId)}/assets/upload-session`;
    const sessionResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'X-File-Name': file.name,
        'X-File-Size': String(file.size),
        'X-Asset-Type': file.type || 'application/octet-stream',
        'X-Asset-Kind': classifyAsset(file),
      },
    });
    const session = await sessionResponse.json().catch(() => ({}));
    if (!sessionResponse.ok || !session.success) throw new Error(session.message || session.error || `Could not start upload for ${file.name}.`);
    const chunkSize = Number(session.chunkSize) || 512 * 1024;
    const totalChunks = Math.ceil(file.size / chunkSize);
    for (let part = 0; part < totalChunks; part += 1) {
      let uploaded = false;
      let lastError = `Chunk ${part + 1} failed.`;
      for (let attempt = 1; attempt <= 3 && !uploaded; attempt += 1) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 120000);
        try {
          setUploadProgress({ active: true, fileName: file.name, completed: index, total, percent: Math.round(((index + part / totalChunks) / total) * 100), status: `Uploading ${file.name} · part ${part + 1}/${totalChunks}${attempt > 1 ? ` · retry ${attempt}/3` : ''}` });
          const response = await fetch(`${baseUrl}/${encodeURIComponent(session.uploadId)}/chunks/${part}`, {
            method: 'POST',
            headers: { ...authHeaders, 'Content-Type': 'application/octet-stream' },
            body: file.slice(part * chunkSize, Math.min(file.size, (part + 1) * chunkSize)),
            signal: controller.signal,
          });
          const json = await response.json().catch(() => ({}));
          if (!response.ok || !json.success) throw new Error(json.message || json.error || `Chunk ${part + 1} failed (${response.status}).`);
          uploaded = true;
        } catch (error: any) {
          lastError = error?.name === 'AbortError' ? `Chunk ${part + 1} timed out.` : error.message || lastError;
          if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, attempt * 750));
        } finally {
          window.clearTimeout(timeout);
        }
      }
      if (!uploaded) throw new Error(`${file.name}: ${lastError}`);
      setUploadProgress({ active: true, fileName: file.name, completed: index, total, percent: Math.round(((index + (part + 1) / totalChunks) / total) * 100), status: `Uploaded ${file.name} · part ${part + 1}/${totalChunks}` });
    }
    const completeResponse = await fetch(`${baseUrl}/${encodeURIComponent(session.uploadId)}/complete`, { method: 'POST', headers: authHeaders });
    const complete = await completeResponse.json().catch(() => ({}));
    if (!completeResponse.ok || !complete.success || !complete.asset) throw new Error(complete.message || complete.error || `Could not finalize upload for ${file.name}.`);
    return complete.asset as ProjectAsset;
  }, [authToken, classifyAsset]);

  const handleUploadAssets = useCallback(async (fileList: FileList | File[], forcedProjectId?: string, forcedProjectName?: string, forcedProjectData?: Record<string, any>) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    if (!authToken || !authUser) {
      setPendingUploadFiles(files);
      setAuthError('Sign in or create an account to upload files.');
      setShowAuthModal(true);
      return;
    }
    try {
      setUploadRetryAction(null);
      const requestedBytes = files.reduce((total, file) => total + file.size, 0);
      if (storageQuota && requestedBytes > storageQuota.remainingBytes) {
        throw new Error(`These files need ${Math.ceil(requestedBytes / (1024 * 1024))} MB, but only ${Math.floor(storageQuota.remainingBytes / (1024 * 1024))} MB remain in your 2 GB quota.`);
      }
      const projectId = forcedProjectId || await ensureActiveProject();
      const uploaded: ProjectAsset[] = [];
      setUploadProgress({ active: true, fileName: files[0].name, completed: 0, total: files.length, percent: 0, status: 'Preparing upload', canRetry: false });
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (file.size > 2 * 1024 * 1024 * 1024) throw new Error(`${file.name} is larger than the 2 GB per-user storage limit.`);
        uploaded.push(await uploadAssetWithProgress(projectId, file, index, files.length));
      }
      const nextAssets = [...projectAssets, ...uploaded];
      // Uploading adds files to the project library but does not render one
      // automatically. The user must explicitly select the asset to load it.
      setProjectAssets(nextAssets);
      const savedName = forcedProjectName || projectName;
      await saveProjectSnapshot(projectId, savedName, nextAssets, forcedProjectData);
      await refreshStorageQuota();
      setUploadRetryAction(null);
      setStatusAlert({ type: 'success', message: `Uploaded ${uploaded.length} asset${uploaded.length === 1 ? '' : 's'} to ${savedName}.`, details: 'The files are stored on the server and linked to this project.', timestamp: new Date().toLocaleTimeString() });
    } catch (error: any) {
      setUploadRetryAction(() => () => {
        setUploadRetryAction(null);
        void handleUploadAssets(files, forcedProjectId, forcedProjectName, forcedProjectData);
      });
      setUploadProgress((current) => ({ ...current, active: false, canRetry: true, status: 'Upload paused — retry from the last selected files' }));
      const errorMessage = String(error?.message || 'Unknown upload error');
      const errorCode = errorMessage.includes('PROJECT_SAVE') ? 'ERR_PROJECT_SAVE' : errorMessage.includes('VALIDATION') ? 'ERR_UPLOAD_VALIDATION' : errorMessage.includes('QUOTA') ? 'ERR_STORAGE_QUOTA' : 'ERR_ASSET_UPLOAD';
      setStatusAlert({ type: 'error', message: `Asset upload failed: ${errorMessage}`, details: 'Use Retry to restart this batch. The original server response is shown above.', errorCode, timestamp: new Date().toLocaleTimeString() });
    } finally {
      setUploadProgress((current) => ({ ...current, active: false, status: current.status || 'Upload complete' }));
    }
  }, [authToken, authUser, ensureActiveProject, projectAssets, projectName, refreshStorageQuota, saveProjectSnapshot, storageQuota, uploadAssetWithProgress]);

  useEffect(() => {
    if (!authUser || !pendingUploadFiles) return;
    const files = pendingUploadFiles;
    setPendingUploadFiles(null);
    void handleUploadAssets(files);
  }, [authUser, handleUploadAssets, pendingUploadFiles]);

  const handleSelectServerProject = useCallback(async (projectId: string) => {
    // Clear the previous project's asset view immediately while the selected project loads.
    setActiveProjectId(projectId);
    setProjectAssets([]);
    setActiveAssetId(null);
    gasMarksRef.current = [];
    setGasMarks([]);
    try {
      const response = await fetch(`/api/reconstruction/ai/projects/${encodeURIComponent(projectId)}`, { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.message || 'Could not load project.');
      const project = json.project;
      setActiveProjectId(project.projectId || projectId);
      setProjectName(project.projectName || 'Mining Site');
      setObjects(Array.isArray(project.objects) ? project.objects : getCombinedSceneObjects(project.currentPresetId || 'rugged_timbered_photo'));
      setSelectedObjectId(Array.isArray(project.objects) && project.objects[0] ? project.objects[0].id : 'Rugged_Timbered_Mine_Tunnel_Photo');
      setMaterials(Array.isArray(project.materials) ? project.materials : getAllCombinedMaterials());
      setProjectAssets(Array.isArray(project.assets) ? project.assets : []);
      setMediaMarkers(Array.isArray(project.mediaMarkers) ? project.mediaMarkers : []);
      const loadedGasMarks = Array.isArray(project.gasMarks) ? project.gasMarks : [];
      gasMarksRef.current = loadedGasMarks;
      setGasMarks(loadedGasMarks);
      setActiveAssetId(null);
      if (project.currentPresetId && TUNNEL_PRESETS[project.currentPresetId as TunnelPresetId]) setCurrentPresetId(project.currentPresetId);
      if (project.proceduralParams) setProceduralParams(project.proceduralParams);
      if (project.timeline) {
        setTimeline({ ...project.timeline, isPlaying: false });
        setPlaybackSpeed(Number(project.timeline.playbackSpeed) || 1);
      }
      if (Array.isArray(project.tours) && project.tours.length) {
        saveTours(project.tours);
        setActiveTourId(project.tours[0].id);
      }
      setStatusAlert({ type: 'success', message: `Loaded server project “${project.projectName}”.`, details: `${project.assets?.length || 0} linked assets are available in the Objects panel.`, timestamp: new Date().toLocaleTimeString() });
    } catch (error: any) {
      setStatusAlert({ type: 'error', message: `Project load failed: ${error.message}`, timestamp: new Date().toLocaleTimeString() });
    }
  }, [authToken, saveTours]);

  const handleCreateProject = useCallback(async () => {
    const name = newProjectName.trim();
    if (!name) return;
    if (!authUser || !authToken) {
      setAuthError('Sign in or create an account before creating a server project.');
      setShowAuthModal(true);
      return;
    }
    try {
      const response = await fetch('/api/reconstruction/ai/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ projectName: name, projectData: { projectName: name, assets: [] } }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.message || 'Could not create project.');
      const nextProject = json.project as ProjectSummary;
      setProjectName(name);
      setActiveProjectId(nextProject.id);
      setProjects((current) => [nextProject, ...current.filter((project) => project.id !== nextProject.id)]);
      setObjects(getCombinedSceneObjects('rugged_timbered_photo'));
      setMaterials(getAllCombinedMaterials());
      setCurrentPresetId('rugged_timbered_photo');
      setProceduralParams(TUNNEL_PRESETS.rugged_timbered_photo.defaultParams);
      setProjectAssets([]);
      setMediaMarkers([]);
      gasMarksRef.current = [];
      setGasMarks([]);
      setActiveAssetId(null);
      setTimeline({ currentFrame: 0, minFrame: 0, previewMaxFrame: 90, projectMaxFrame: 90, isPlaying: false, fps: 30, loop: true });
      setPlaybackSpeed(1);
      setTours(getDefaultCameraTours());
      setActiveTourId(getDefaultCameraTours()[0].id);
      setShowNewProjectDialog(false);
      setStatusAlert({ type: 'success', message: `Created new project “${name}”.`, details: 'Upload models, images, and videos from the Objects panel.', timestamp: new Date().toLocaleTimeString() });
      if (newProjectFiles.length) {
        await handleUploadAssets(newProjectFiles, nextProject.id, name, {
          projectName: name,
          version: 'R19.068',
          currentPresetId: 'rugged_timbered_photo',
          proceduralParams: TUNNEL_PRESETS.rugged_timbered_photo.defaultParams,
          objects: getCombinedSceneObjects('rugged_timbered_photo'),
          materials: getAllCombinedMaterials(),
          timeline: { currentFrame: 0, minFrame: 0, previewMaxFrame: 90, projectMaxFrame: 90, isPlaying: false, fps: 30, loop: true, playbackSpeed: 1 },
          tours: getDefaultCameraTours(),
          mediaMarkers: [],
          gasMarks: [],
        });
        setNewProjectFiles([]);
      }
    } catch (error: any) {
      setStatusAlert({ type: 'error', message: `Project creation failed: ${error.message}`, timestamp: new Date().toLocaleTimeString() });
    }
  }, [authToken, authUser, handleUploadAssets, newProjectFiles, newProjectName]);

  const handleAddMediaMarker = useCallback((timeSeconds: number, note: string) => {
    if (!activeAssetId) return;
    const marker: MediaMarker = {
      id: `media_marker_${Date.now()}`,
      assetId: activeAssetId,
      timeSeconds: Number(timeSeconds.toFixed(3)),
      frame: timeline.currentFrame,
      note,
      createdAt: new Date().toISOString(),
    };
    const nextMarkers = [...mediaMarkers, marker];
    setMediaMarkers(nextMarkers);
    if (activeProjectId) void saveProjectSnapshot(activeProjectId, projectName, projectAssets, { ...buildProjectData(), mediaMarkers: nextMarkers });
    setStatusAlert({ type: 'success', message: `Saved video marker at ${marker.timeSeconds.toFixed(2)}s.`, details: note, timestamp: new Date().toLocaleTimeString() });
  }, [activeAssetId, activeProjectId, buildProjectData, mediaMarkers, projectAssets, projectName, saveProjectSnapshot]);

  const queueGasMarksSave = useCallback((nextMarks: GasMark[]) => {
    if (gasMarksSaveTimerRef.current) window.clearTimeout(gasMarksSaveTimerRef.current);
    if (activeProjectId) {
      gasMarksSaveTimerRef.current = window.setTimeout(() => {
        void saveProjectSnapshot(activeProjectId, projectName, projectAssets, { ...buildProjectData(), gasMarks: gasMarksRef.current });
      }, 700);
    }
  }, [activeProjectId, buildProjectData, projectAssets, projectName, saveProjectSnapshot]);

  const handleAddGasMark = useCallback((mark: GasMark) => {
    const nextMarks = [...gasMarksRef.current, mark];
    gasMarksRef.current = nextMarks;
    setGasMarks(nextMarks);
    queueGasMarksSave(nextMarks);
  }, [queueGasMarksSave]);

  const persistTours = useCallback((nextTours: CameraTour[]) => {
    saveTours(nextTours);
    if (activeProjectId) void saveProjectSnapshot(activeProjectId, projectName, projectAssets, { ...buildProjectData(), tours: nextTours });
  }, [activeProjectId, buildProjectData, projectAssets, projectName, saveProjectSnapshot, saveTours]);

  const handleJumpToMark = useCallback((item: MarkHistoryItem) => {
    setActiveAssetId(item.assetId ?? null);
    setTimeline((previous) => ({ ...previous, currentFrame: item.frame, isPlaying: false }));
    if (item.tourId) setActiveTourId(item.tourId);
    setStatusAlert({ type: 'idle', message: `Returned to ${item.title}.`, details: item.timeSeconds !== undefined ? `Video marker at ${item.timeSeconds.toFixed(2)} seconds.` : `Frame ${item.frame}.`, timestamp: new Date().toLocaleTimeString() });
  }, []);

  const handleEditMark = useCallback((item: MarkHistoryItem) => {
    if (item.kind === 'keyframe-note' && item.tourId && item.keyframeId) {
      const currentTour = tours.find((tour) => tour.id === item.tourId);
      const currentKeyframe = currentTour?.keyframes.find((keyframe) => keyframe.id === item.keyframeId);
      const currentNote = currentKeyframe?.annotations?.find((annotation) => annotation.id === item.id)?.note || '';
      const nextNote = window.prompt('Edit marker note:', currentNote);
      if (nextNote === null || !nextNote.trim() || !currentTour || !currentKeyframe) return;
      const nextTours = tours.map((tour) => tour.id !== item.tourId ? tour : {
        ...tour,
        keyframes: tour.keyframes.map((keyframe) => keyframe.id !== item.keyframeId ? keyframe : {
          ...keyframe,
          annotations: (keyframe.annotations || []).map((annotation) => annotation.id === item.id ? { ...annotation, note: nextNote.trim() } : annotation),
        }),
      });
      persistTours(nextTours);
      return;
    }
    if (item.kind === 'media-marker') {
      const currentMarker = mediaMarkers.find((marker) => marker.id === item.id);
      if (!currentMarker) return;
      const nextNote = window.prompt('Edit media marker note:', currentMarker.note);
      if (nextNote === null || !nextNote.trim()) return;
      const nextMarkers = mediaMarkers.map((marker) => marker.id === item.id ? { ...marker, note: nextNote.trim() } : marker);
      setMediaMarkers(nextMarkers);
      if (activeProjectId) void saveProjectSnapshot(activeProjectId, projectName, projectAssets, { ...buildProjectData(), mediaMarkers: nextMarkers });
      return;
    }
    const currentGasMark = gasMarksRef.current.find((mark) => mark.id === item.id);
    if (!currentGasMark) return;
    const nextConcentration = window.prompt('Gas concentration (5-100):', String(Math.round(currentGasMark.concentration * 100)));
    if (nextConcentration === null) return;
    const concentrationValue = Number(nextConcentration);
    if (!Number.isFinite(concentrationValue)) return;
    const concentration = Math.max(0.05, Math.min(1, concentrationValue / 100));
    const nextColor = window.prompt('Gas colour (hex):', currentGasMark.color);
    if (nextColor === null || !/^#[0-9a-f]{6}$/i.test(nextColor.trim())) return;
    const nextMarks = gasMarksRef.current.map((mark) => mark.id === item.id ? { ...mark, concentration, color: nextColor.trim() } : mark);
    gasMarksRef.current = nextMarks;
    setGasMarks(nextMarks);
    queueGasMarksSave(nextMarks);
  }, [activeProjectId, buildProjectData, mediaMarkers, persistTours, projectAssets, projectName, queueGasMarksSave, saveProjectSnapshot, tours]);

  const handleDeleteMark = useCallback((item: MarkHistoryItem) => {
    if (!window.confirm(`Delete this ${item.kind === 'gas-mark' ? 'gas mark' : 'marker'}?`)) return;
    if (item.kind === 'keyframe-note' && item.tourId && item.keyframeId) {
      const nextTours = tours.map((tour) => tour.id !== item.tourId ? tour : {
        ...tour,
        keyframes: tour.keyframes.map((keyframe) => keyframe.id !== item.keyframeId ? keyframe : {
          ...keyframe,
          annotations: (keyframe.annotations || []).filter((annotation) => annotation.id !== item.id),
        }),
      });
      persistTours(nextTours);
    } else if (item.kind === 'media-marker') {
      const nextMarkers = mediaMarkers.filter((marker) => marker.id !== item.id);
      setMediaMarkers(nextMarkers);
      if (activeProjectId) void saveProjectSnapshot(activeProjectId, projectName, projectAssets, { ...buildProjectData(), mediaMarkers: nextMarkers });
    } else {
      const nextMarks = gasMarksRef.current.filter((mark) => mark.id !== item.id);
      gasMarksRef.current = nextMarks;
      setGasMarks(nextMarks);
      queueGasMarksSave(nextMarks);
    }
    setStatusAlert({ type: 'success', message: 'Mark deleted from history and the viewer.', timestamp: new Date().toLocaleTimeString() });
  }, [activeProjectId, buildProjectData, mediaMarkers, persistTours, projectAssets, projectName, queueGasMarksSave, saveProjectSnapshot, tours]);

  const handleToggleSolo = () => {
    if (!selectedObjectId) {
      setStatusAlert({ type: 'idle', message: 'Select an object before enabling Solo Mode.' });
      return;
    }
    const selectedRoot = objects.find(
      (obj) => obj.id === selectedObjectId || obj.children?.some((child) => child.id === selectedObjectId)
    );
    if (!selectedRoot) return;

    if (!isSoloMode) {
      soloVisibilityRef.current = Object.fromEntries(objects.map((obj) => [obj.id, obj.visibleInEditor]));
      setObjects((prev) => prev.map((obj) => ({ ...obj, visibleInEditor: obj.id === selectedRoot.id })));
      setSelectedObjectId(selectedRoot.id);
      setIsSoloMode(true);
      setStatusAlert({ type: 'idle', message: `Solo Mode: isolated ${selectedRoot.name}.` });
    } else {
      setObjects((prev) =>
        prev.map((obj) => ({
          ...obj,
          visibleInEditor: soloVisibilityRef.current[obj.id] ?? obj.visibleInEditor,
        }))
      );
      setIsSoloMode(false);
      setStatusAlert({ type: 'idle', message: 'Solo Mode disabled. Restored scene visibility.' });
    }
  };

  // Preset switching handler
  const handleSelectPreset = useCallback((presetId: TunnelPresetId, customParams?: ProceduralTunnelParams) => {
    setCurrentPresetId(presetId);
    const preset = TUNNEL_PRESETS[presetId];
    if (customParams) {
      setProceduralParams(customParams);
    } else {
      setProceduralParams(preset.defaultParams);
    }
    // Keep BOTH models in hierarchy while marking the active model visible with green dots
    setObjects(getCombinedSceneObjects(presetId));
    setMaterials(getAllCombinedMaterials());
    const rootId = presetId === 'classic_diorama' ? 'Mining_Tunnel_Complex' : 'Rugged_Timbered_Mine_Tunnel_Photo';
    setSelectedObjectId(rootId);

    setStatusAlert({
      type: 'success',
      message: `Active 3D Scene switched to "${preset.name}".`,
      details: preset.description,
      timestamp: new Date().toLocaleTimeString(),
    });
  }, []);

  const handleUpdateProceduralParams = useCallback((newParams: ProceduralTunnelParams) => {
    setProceduralParams(newParams);
    setCurrentPresetId('ai_custom');
    setStatusAlert({
      type: 'success',
      message: `Updated 3D Procedural Tunnel Parameters (${newParams.timberSetCount} timber sets, ${newParams.laggingPlankTiers} lagging tiers).`,
      timestamp: new Date().toLocaleTimeString(),
    });
  }, []);

  // Undo / Redo history stack
  const [historyStack, setHistoryStack] = useState<C4DSceneObject[][]>([]);
  const [redoStack, setRedoStack] = useState<C4DSceneObject[][]>([]);

  const activeKeyframe = activeTour?.keyframes.find((k) => k.frame === timeline.currentFrame);

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
    }, Math.max(16, 1000 / (timeline.fps * playbackSpeed)));
    return () => clearInterval(interval);
  }, [timeline.isPlaying, timeline.fps, playbackSpeed]);

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

  // Tour Management Handlers
  const handleAddTour = (name: string, description: string) => {
    const newTour: CameraTour = {
      id: `tour_${Date.now()}`,
      name,
      description,
      durationFrames: 90,
      loop: true,
      createdAt: new Date().toLocaleDateString(),
      keyframes: [],
    };
    saveTours([...tours, newTour]);
    setActiveTourId(newTour.id);
    setStatusAlert({
      type: 'success',
      message: `Created new camera animation tour "${name}".`,
      timestamp: new Date().toLocaleTimeString(),
    });
  };

  const handleUpdateTour = (updatedTour: CameraTour) => {
    const next = tours.map((t) => (t.id === updatedTour.id ? updatedTour : t));
    persistTours(next);
  };

  const handleDeleteTour = (tourId: string) => {
    const next = tours.filter((t) => t.id !== tourId);
    saveTours(next);
    if (activeTourId === tourId && next.length > 0) {
      setActiveTourId(next[0].id);
    }
    setStatusAlert({
      type: 'idle',
      message: 'Deleted camera tour.',
      timestamp: new Date().toLocaleTimeString(),
    });
  };

  const handleAddKeyframeFromCurrent = (camState?: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    fov: number;
  }, name?: string, frame?: number) => {
    if (!activeTour) return;
    const targetFrame = frame !== undefined ? frame : timeline.currentFrame;
    const defaultPos = camState?.position || { x: 14, y: 8, z: 18 };
    const defaultTgt = camState?.target || { x: -0.5, y: 2.0, z: 0 };
    const newKf: CameraKeyframe = {
      id: `kf_${Date.now()}`,
      name: name || `Waypoint @ ${targetFrame}F`,
      frame: targetFrame,
      position: defaultPos,
      target: defaultTgt,
      fov: camState?.fov || 42,
    };
    const nextKfs = [...activeTour.keyframes, newKf].sort((a, b) => a.frame - b.frame);
    handleUpdateTour({ ...activeTour, keyframes: nextKfs });
    setStatusAlert({
      type: 'success',
      message: `Recorded viewpoint into "${activeTour.name}" at Frame ${targetFrame}.`,
      timestamp: new Date().toLocaleTimeString(),
    });
  };

  const handleUpdateKeyframeFromCurrent = (keyframeId: string, camState?: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    fov: number;
  }) => {
    if (!activeTour) return;
    const pos = camState?.position || { x: 14, y: 8, z: 18 };
    const tgt = camState?.target || { x: -0.5, y: 2.0, z: 0 };
    const nextKfs = activeTour.keyframes.map((k) =>
      k.id === keyframeId ? { ...k, position: pos, target: tgt, fov: camState?.fov || k.fov } : k
    );
    handleUpdateTour({ ...activeTour, keyframes: nextKfs });
    setStatusAlert({
      type: 'success',
      message: `Updated keyframe waypoint with current view.`,
      timestamp: new Date().toLocaleTimeString(),
    });
  };

  // Attach every viewport note to the exact camera frame where it was placed.
  // If the user is between existing frames, create a frame at that position first.
  const handleAddKeyframeAnnotation = useCallback(
    (
      position: { x: number; y: number; z: number },
      note: string,
      camState: {
        position: { x: number; y: number; z: number };
        target: { x: number; y: number; z: number };
        fov: number;
      }
    ) => {
      if (!activeTour || !note.trim()) return;
      const targetFrame = timeline.currentFrame;
      const annotation: KeyframeAnnotation = {
        id: `annotation_${Date.now()}`,
        note: note.trim(),
        position,
        color: '#ffb347',
        createdAt: new Date().toISOString(),
      };
      const existingKeyframe = activeTour.keyframes.find((k) => k.frame === targetFrame);
      const nextKeyframes = existingKeyframe
        ? activeTour.keyframes.map((k) =>
            k.id === existingKeyframe.id
              ? { ...k, annotations: [...(k.annotations || []), annotation] }
              : k
          )
        : [
            ...activeTour.keyframes,
            {
              id: `kf_${Date.now()}`,
              name: `Marked View @ ${targetFrame}F`,
              frame: targetFrame,
              position: camState.position,
              target: camState.target,
              fov: camState.fov,
              annotations: [annotation],
            },
          ].sort((a, b) => a.frame - b.frame);

      persistTours(tours.map((tour) => (tour.id === activeTour.id ? { ...tour, keyframes: nextKeyframes } : tour)));
      setStatusAlert({
        type: 'success',
        message: `Saved marker to Frame ${targetFrame}.`,
        details: 'This note will return with the same camera keyframe.',
        timestamp: new Date().toLocaleTimeString(),
      });
    },
    [activeTour, persistTours, timeline.currentFrame, tours]
  );

  const handleDeleteKeyframe = (keyframeId: string) => {
    if (!activeTour) return;
    const nextKfs = activeTour.keyframes.filter((k) => k.id !== keyframeId);
    handleUpdateTour({ ...activeTour, keyframes: nextKfs });
    setStatusAlert({
      type: 'idle',
      message: 'Deleted keyframe waypoint.',
      timestamp: new Date().toLocaleTimeString(),
    });
  };

  const handleReorderKeyframe = (keyframeId: string, direction: 'up' | 'down') => {
    if (!activeTour) return;
    const idx = activeTour.keyframes.findIndex((k) => k.id === keyframeId);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= activeTour.keyframes.length) return;
    const nextKfs = [...activeTour.keyframes];
    const temp = nextKfs[idx];
    nextKfs[idx] = nextKfs[targetIdx];
    nextKfs[targetIdx] = temp;
    const tempFrame = nextKfs[idx].frame;
    nextKfs[idx].frame = nextKfs[targetIdx].frame;
    nextKfs[targetIdx].frame = tempFrame;
    handleUpdateTour({ ...activeTour, keyframes: nextKfs });
  };

  // Keyboard Shortcuts (Standard Cinema 4D keys + F8 Play/Pause)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid hotkeys when typing in input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'F1' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        openHelpGuide();
      } else if (e.code === 'Space' || e.key === 'F8' || e.code === 'F8') {
        e.preventDefault();
        setTimeline((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setShowNewProjectDialog(true);
      } else if (e.key === 'k' || e.key === 'K') {
        handleAddKeyframeFromCurrent();
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
    setObjects(getCombinedSceneObjects('rugged_timbered_photo'));
    setMaterials(getAllCombinedMaterials());
    setCurrentPresetId('rugged_timbered_photo');
    setSelectedObjectId('Rugged_Timbered_Mine_Tunnel_Photo');
    setSelectedMaterialId('mat_photo_rock');
    setTimeline((prev) => ({ ...prev, currentFrame: 0, isPlaying: false }));
    setStatusAlert({
      type: 'success',
      message: 'Mining Site project reverted to default surface & subsurface baseline.',
      details: 'Restored both 3D models: Rugged Timbered Drift (Photo Reference) and Classic Diorama Tunnel.',
    });
  }, [objects]);

  // Object Selection Handler with Auto-Scene Activation
  const handleSelectObject = useCallback((id: string | null) => {
    setSelectedObjectId(id);
    if (!id) return;

    const classicIds = [
      'Mining_Tunnel_Complex',
      'Rock_Tunnel_Mesh',
      'Timber_Support_Arches',
      'Railway_Tracks',
      'Mine_Cart_Ore',
      'Hanging_Work_Lights',
      'Ventilation_Duct'
    ];

    const photoIds = [
      'Rugged_Timbered_Mine_Tunnel_Photo',
      'Photo_Timber_Square_Sets',
      'Timber_Posts_Battered',
      'Timber_Lintel_Caps',
      'Longitudinal_Ceiling_Stringers',
      'Four_Tier_Side_Lagging_Planks',
      'Overhead_Roof_Lagging',
      'Unlined_Adit_Cavern_Heading',
      'Packed_Dirt_Cart_Path',
      'Workstation_Lantern_Brackets'
    ];

    if (classicIds.includes(id) && currentPresetId !== 'classic_diorama') {
      handleSelectPreset('classic_diorama');
      setStatusAlert({
        type: 'success',
        message: '3D Viewport switched to Classic Diorama Mining Tunnel.',
        details: 'Selected object: ' + id,
      });
    } else if (photoIds.includes(id) && currentPresetId === 'classic_diorama') {
      handleSelectPreset('rugged_timbered_photo');
      setStatusAlert({
        type: 'success',
        message: '3D Viewport switched to Rugged Timbered Drift (Photo Reference).',
        details: 'Selected object: ' + id,
      });
    }
  }, [currentPresetId, handleSelectPreset]);

  // Update object transform
  const handleUpdateTransform = useCallback(
    (pos: Vector3D, rot: Vector3D, scale: Vector3D) => {
      if (!selectedObjectId) return;
      pushUndoState();
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
    // If user clicked editor visibility on a root tunnel, switch active preset if currently inactive
    if (id === 'Mining_Tunnel_Complex' && target === 'editor') {
      if (currentPresetId !== 'classic_diorama') {
        handleSelectPreset('classic_diorama');
        return;
      }
    } else if (id === 'Rugged_Timbered_Mine_Tunnel_Photo' && target === 'editor') {
      if (currentPresetId === 'classic_diorama') {
        handleSelectPreset('rugged_timbered_photo');
        return;
      }
    }

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
            children: obj.children.map((c) => {
              if (c.id === id) {
                return target === 'editor'
                  ? { ...c, visibleInEditor: !c.visibleInEditor }
                  : { ...c, visibleInRenderer: !c.visibleInRenderer };
              }
              if (c.children) {
                return {
                  ...c,
                  children: c.children.map((sub) =>
                    sub.id === id
                      ? target === 'editor'
                        ? { ...sub, visibleInEditor: !sub.visibleInEditor }
                        : { ...sub, visibleInRenderer: !sub.visibleInRenderer }
                      : sub
                  ),
                };
              }
              return c;
            }),
          };
        }
        return obj;
      })
    );
  };

  // Toggle hierarchy expansion
  const handleToggleExpand = (id: string) => {
    setObjects((prev) =>
      prev.map((obj) => {
        if (obj.id === id) return { ...obj, expanded: !obj.expanded };
        if (obj.children) {
          return {
            ...obj,
            children: obj.children.map((c) => {
              if (c.id === id) return { ...c, expanded: !c.expanded };
              if (c.children) {
                return {
                  ...c,
                  children: c.children.map((sub) =>
                    sub.id === id ? { ...sub, expanded: !sub.expanded } : sub
                  ),
                };
              }
              return c;
            }),
          };
        }
        return obj;
      })
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
      setSurveyStationMarkers(points);
      setStatusAlert({
        type: 'success',
        message: `Synthesized ${points.length} 3D Survey Station markers into scene hierarchy and 3D viewport.`,
        details: 'Station spatial nodes mapped with sequential distance tags and drift coordinates.',
      });
    },
    [objects]
  );

  // Save locally and persist the same project snapshot on the server.
  const handleSaveProject = async () => {
    const projectData = buildProjectData();
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/[^a-z0-9_-]+/gi, '_')}_${new Date().toISOString().slice(0, 10)}.c4d.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (!authUser || !authToken) {
      setAuthError('Sign in or create an account to save this project on the server.');
      setShowAuthModal(true);
      setStatusAlert({ type: 'warning', message: 'Project exported locally. Server save requires sign in.', timestamp: new Date().toLocaleTimeString() });
      return;
    }
    try {
      const projectId = await ensureActiveProject();
      await saveProjectSnapshot(projectId);
      setStatusAlert({ type: 'success', message: `Project “${projectName}” saved locally and on the server.`, details: 'Scene hierarchy, materials, tours, markers, timeline, and asset links are included.', timestamp: new Date().toLocaleTimeString() });
    } catch (error: any) {
      setStatusAlert({ type: 'warning', message: `Project exported locally; server save unavailable.`, details: error.message, timestamp: new Date().toLocaleTimeString() });
    }
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
          if (parsed.projectName) setProjectName(parsed.projectName);
          if (parsed.materials) setMaterials(parsed.materials);
          if (parsed.timeline) setTimeline(parsed.timeline);
          if (Array.isArray(parsed.assets)) setProjectAssets(parsed.assets);
          if (Array.isArray(parsed.mediaMarkers)) setMediaMarkers(parsed.mediaMarkers);
          if (Array.isArray(parsed.gasMarks)) {
            gasMarksRef.current = parsed.gasMarks;
            setGasMarks(parsed.gasMarks);
          } else {
            gasMarksRef.current = [];
            setGasMarks([]);
          }
          if (parsed.tours && Array.isArray(parsed.tours)) {
            saveTours(parsed.tours);
            if (parsed.tours[0]?.id) setActiveTourId(parsed.tours[0].id);
          }
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

  // Selected Object lookup (recursive through all child levels)
  const findObjectById = (list: C4DSceneObject[], targetId: string | null): C4DSceneObject | null => {
    if (!targetId) return null;
    for (const item of list) {
      if (item.id === targetId) return item;
      if (item.children) {
        const found = findObjectById(item.children, targetId);
        if (found) return found;
      }
    }
    return null;
  };

  const selectedObject = findObjectById(objects, selectedObjectId);
  const activeAsset = projectAssets.find((asset) => asset.id === activeAssetId) || null;
  const markHistoryItems: MarkHistoryItem[] = [
    ...tours.flatMap((tour) => tour.keyframes.flatMap((keyframe) => (keyframe.annotations || []).map((annotation) => ({
      id: annotation.id,
      kind: 'keyframe-note' as const,
      title: `${tour.name} · ${keyframe.name}`,
      detail: '3D model camera keyframe',
      note: annotation.note,
      frame: keyframe.frame,
      tourId: tour.id,
      keyframeId: keyframe.id,
      createdAt: annotation.createdAt,
    })))),
    ...mediaMarkers.map((marker) => ({
      id: marker.id,
      kind: 'media-marker' as const,
      title: projectAssets.find((asset) => asset.id === marker.assetId)?.name || 'Video asset',
      detail: 'Video timeline marker',
      note: marker.note,
      frame: marker.frame ?? 0,
      timeSeconds: marker.timeSeconds,
      assetId: marker.assetId,
      createdAt: marker.createdAt,
    })),
    ...gasMarks.map((mark) => ({
      id: mark.id,
      kind: 'gas-mark' as const,
      title: mark.assetId ? projectAssets.find((asset) => asset.id === mark.assetId)?.name || 'Project asset' : 'Default 3D model',
      detail: mark.space === 'media' ? 'Media gas/smoke brush mark' : '3D surface gas/smoke brush mark',
      frame: mark.frame,
      timeSeconds: mark.timeSeconds,
      assetId: mark.assetId,
      color: mark.color,
      concentration: mark.concentration,
      radius: mark.radius,
      createdAt: mark.createdAt,
    })),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

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
        onNewProject={() => {
          setNewProjectName(`${projectName} Copy`);
          setNewProjectFiles([]);
          setShowNewProjectDialog(true);
        }}
        onRevertProject={handleRevertProject}
        onOpenAISurvey={() => {
          setActiveUpperTab('AI Survey');
          setStatusAlert({
            type: 'idle',
            message: 'Opened AI Photogrammetry Survey & Geological Mapping panel.',
          });
        }}
        onOpenTours={() => {
          setActiveUpperTab('Camera Tours');
          setStatusAlert({
            type: 'idle',
            message: 'Opened Camera Tours & Keyframe Path Animation panel.',
          });
        }}
        onTriggerRender={() => setShowPictureViewer(true)}
        currentPresetId={currentPresetId}
        onSelectPreset={handleSelectPreset}
        onOpenHelp={openHelpGuide}
        onOpenOnboarding={openOnboarding}
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

      {/* 3. Docking Layout: Central Viewport, Object Manager / Camera Tours / AI Survey, Attribute Manager, Timeline, Materials, Coordinates */}
      <DockLayout
        activeUpperTab={activeUpperTab}
        onUpperTabChange={setActiveUpperTab}
        tourKeyframeCount={activeTour?.keyframes.length || 0}
        markHistoryCount={markHistoryItems.length}
        cameraTourPanel={
          <CameraTourManager
            tours={tours}
            activeTourId={activeTourId}
            onSelectTour={setActiveTourId}
            onAddTour={handleAddTour}
            onUpdateTour={handleUpdateTour}
            onDeleteTour={handleDeleteTour}
            onAddKeyframeFromCurrent={(name, frame) => handleAddKeyframeFromCurrent(undefined, name, frame)}
            onUpdateKeyframeFromCurrent={(kfId) => handleUpdateKeyframeFromCurrent(kfId)}
            onDeleteKeyframe={handleDeleteKeyframe}
            onReorderKeyframe={handleReorderKeyframe}
            onJumpToKeyframe={(kf) => {
              setTimeline((prev) => ({ ...prev, currentFrame: kf.frame }));
            }}
            isTourPlaybackEnabled={isTourPlaybackEnabled}
            onToggleTourPlayback={setIsTourPlaybackEnabled}
            currentFrame={timeline.currentFrame}
            isPlaying={timeline.isPlaying}
            onTogglePlay={() => setTimeline((prev) => ({ ...prev, isPlaying: !prev.isPlaying }))}
          />
        }
        markHistoryPanel={
          <MarkHistoryPanel
            items={markHistoryItems}
            onJump={handleJumpToMark}
            onEdit={handleEditMark}
            onDelete={handleDeleteMark}
          />
        }
        aiSurveyPanel={
          <AIGeologicalMapperPanel
            projectTitle={`${projectName} - Surface & Subsurface Mapping`}
            onStatusChange={setStatusAlert}
            onApply3DMarkers={handleApply3DMarkers}
            currentPresetId={currentPresetId}
            onSelectPreset={handleSelectPreset}
            onApplyCustomScene={(p) => handleSelectPreset('ai_custom', p)}
            authToken={authToken}
            onOpenAuth={() => { setAuthError(''); setShowAuthModal(true); }}
          />
        }
        leftPalette={
          <LeftToolPalette
            activeMode={activeLeftMode}
            onSelectMode={setActiveLeftMode}
            isSnapping={isSnapping}
            onToggleSnapping={() => setIsSnapping((prev) => !prev)}
            isSoloMode={isSoloMode}
            onToggleSolo={handleToggleSolo}
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
            timelineMinFrame={timeline.minFrame}
            timelineMaxFrame={timeline.previewMaxFrame}
            playbackSpeed={playbackSpeed}
            onUpdateTransform={handleUpdateTransform}
            activeTour={activeTour}
            isTourPlaybackEnabled={isTourPlaybackEnabled}
            onRecordCurrentView={(cam) => handleAddKeyframeFromCurrent(cam)}
            keyframeAnnotations={activeKeyframe?.annotations || []}
            onAddKeyframeAnnotation={handleAddKeyframeAnnotation}
            surveyStationMarkers={surveyStationMarkers}
            onJumpToSurveyTab={() => setActiveUpperTab('AI Survey')}
            currentPresetId={currentPresetId}
            activeProjectId={activeProjectId}
            onSelectPreset={handleSelectPreset}
            proceduralParams={proceduralParams}
            onUpdateProceduralParams={handleUpdateProceduralParams}
            activeAsset={activeAsset}
            mediaMarkers={mediaMarkers}
            onAddMediaMarker={handleAddMediaMarker}
            gasMarks={gasMarks}
            onAddGasMark={handleAddGasMark}
            onSetPlayback={(isPlaying) => setTimeline((prev) => ({ ...prev, isPlaying }))}
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
            keyframeFrames={activeTour?.keyframes.map((k) => k.frame) || []}
            onRecordKeyframe={() => handleAddKeyframeFromCurrent()}
            tourName={activeTour?.name}
            isTourPlaybackEnabled={isTourPlaybackEnabled}
            playbackSpeed={playbackSpeed}
            onChangePlaybackSpeed={setPlaybackSpeed}
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
            onSelectObject={handleSelectObject}
            onToggleVisibility={handleToggleVisibility}
            onToggleExpand={handleToggleExpand}
            onDeleteObject={handleDeleteObject}
            onAddObject={handleAddObject}
            currentPresetId={currentPresetId}
            onSelectPreset={handleSelectPreset}
            onSaveProject={handleSaveProject}
            onOpenProject={handleOpenProjectClick}
            onNewProject={() => {
              setNewProjectName(`${projectName} Copy`);
              setNewProjectFiles([]);
              setShowNewProjectDialog(true);
            }}
            onRevertProject={handleRevertProject}
            projectName={projectName}
            activeProjectId={activeProjectId}
            projects={projects}
            projectAssets={projectAssets}
            activeAssetId={activeAssetId}
            onSelectServerProject={handleSelectServerProject}
            onUploadAssets={handleUploadAssets}
            onRetryUpload={uploadRetryAction || undefined}
            authUser={authUser}
            storageQuota={storageQuota}
            onOpenAuth={() => { setAuthError(''); setShowAuthModal(true); }}
            uploadProgress={uploadProgress}
            onSelectAsset={(asset) => {
              setActiveAssetId(asset.id);
              setStatusAlert({ type: 'idle', message: `Loaded ${asset.name} into the viewport.`, timestamp: new Date().toLocaleTimeString() });
            }}
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
        projectName={projectName}
        onRevert={handleRevertProject}
        onClearError={() =>
          setStatusAlert({
            type: 'idle',
            message: 'Ready. All systems operational.',
          })
        }
      />

      <HelpGuideModal
        isOpen={showHelpGuide}
        onClose={() => setShowHelpGuide(false)}
        onStartOnboarding={openOnboarding}
      />

      <OnboardingGuide
        isOpen={showOnboarding}
        onClose={closeOnboarding}
        onOpenAuth={() => {
          closeOnboarding();
          setAuthError('');
          setShowAuthModal(true);
        }}
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

      {showAuthModal && (
        <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAuthModal(false); }}>
          <div className="w-full max-w-sm bg-[#303030] border border-[#5b5b5b] rounded-[4px] shadow-2xl text-[#e5e5e5]">
            <div className="px-3 py-2 bg-[#3c3c3c] border-b border-[#222] flex items-center justify-between"><div><div className="font-bold text-[#f2b36d]">MiningSight Account</div><div className="text-[9px] text-[#999]">Private projects and uploads stay attached to your account.</div></div><button onClick={() => setShowAuthModal(false)} className="text-[#999] hover:text-white cursor-pointer">×</button></div>
            {authUser ? <div className="p-3 space-y-3"><div className="bg-[#1e2d23] border border-[#31543a] rounded p-2 text-[11px] text-[#bdeac7]">Signed in with Google as <span className="font-bold">{authUser.displayName || authUser.email || authUser.username}</span>.</div><button onClick={() => void handleLogout()} className="w-full py-1.5 bg-[#444] hover:bg-[#8a3434] text-white rounded text-[10.5px] cursor-pointer">Sign out</button></div> : <div className="p-3 space-y-3">
              <div className="flex items-center justify-center gap-2 text-[11px] text-[#ddd]"><span className="w-5 h-5 rounded-full bg-white text-[#4285f4] font-bold flex items-center justify-center shadow">G</span><span>Continue with Google</span></div>
              <div ref={googleButtonRef} className="min-h-[42px] flex items-center justify-center [&>div]:max-w-full" />
              {authBusy && <div className="text-center text-[10px] text-[#b8d7c0]">Signing in with Google…</div>}
              {!googleClientId && <div className="bg-[#3a2b1c] border border-[#765529] text-[#ffd59e] rounded p-1.5 text-[9.5px]">Google login is not configured on the server yet.</div>}
              {authError && <div className="bg-[#321d1d] border border-[#713333] text-[#ffb0b0] rounded p-1.5 text-[9.5px]">{authError}</div>}
              <div className="text-[8.5px] text-[#888] leading-relaxed">Google accounts only. Your projects and uploaded files are private to the Google account you use here.</div>
            </div>}
          </div>
        </div>
      )}

      {showNewProjectDialog && (
        <div className="fixed inset-0 z-[100] bg-black/65 flex items-center justify-center p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowNewProjectDialog(false); }}>
          <div className="w-full max-w-md bg-[#303030] border border-[#5b5b5b] rounded-[4px] shadow-2xl text-[#e5e5e5]">
            <div className="px-3 py-2 bg-[#3c3c3c] border-b border-[#222] flex items-center justify-between"><span className="font-bold text-[#f2b36d]">Create New Project</span><button onClick={() => setShowNewProjectDialog(false)} className="text-[#999] hover:text-white cursor-pointer">×</button></div>
            <div className="p-3 space-y-3">
              <label className="block text-[10px] text-[#aaa] uppercase tracking-wider font-bold">Project name
                <input autoFocus value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void handleCreateProject(); }} maxLength={120} className="mt-1 w-full bg-[#1d1d1d] border border-[#555] rounded px-2 py-1.5 text-[#eee] focus:outline-none focus:border-[#e88724]" placeholder="e.g. Kwekwe North Drift Survey" />
              </label>
              <label className="block border border-dashed border-[#555] rounded p-3 text-center cursor-pointer hover:border-[#e88724] hover:bg-[#3a2d20]">
                <span className="block text-[11px] text-[#ddd]">Add starting models, videos, images, or documents</span>
                <span className="block text-[9px] text-[#888] mt-1">Files are uploaded safely to the new server project after creation.</span>
                <input type="file" multiple accept=".glb,.gltf,.obj,.fbx,.ply,.mp4,.webm,.mov,.m4v,.png,.jpg,.jpeg,.webp,.tif,.tiff,.pdf,.json" className="hidden" onChange={(event) => setNewProjectFiles(event.target.files ? Array.from(event.target.files) : [])} />
              </label>
              {newProjectFiles.length > 0 && <div className="text-[10px] text-[#b8d7c0]">{newProjectFiles.length} file{newProjectFiles.length === 1 ? '' : 's'} queued: {newProjectFiles.slice(0, 3).map((file) => file.name).join(', ')}{newProjectFiles.length > 3 ? '…' : ''}</div>}
              <div className="flex justify-end gap-2 pt-1"><button onClick={() => setShowNewProjectDialog(false)} className="px-3 py-1.5 bg-[#444] hover:bg-[#505050] rounded text-[10.5px] cursor-pointer">Cancel</button><button onClick={() => void handleCreateProject()} disabled={!newProjectName.trim()} className="px-3 py-1.5 bg-[#e88724] hover:bg-[#ff9933] disabled:opacity-50 text-black font-bold rounded text-[10.5px] cursor-pointer">Create Project</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
