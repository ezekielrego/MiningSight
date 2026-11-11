import React, { useState, useEffect } from 'react';
import {
  Camera,
  CheckCircle2,
  BarChart2,
  Folder,
  Check,
  AlertTriangle,
  ArrowRight,
  Edit3,
  Trash2,
  Download,
  RefreshCw,
  Zap,
  Sparkles,
  Layers,
  Upload,
  RotateCcw,
  Cloud,
  Server,
  ImagePlus,
  X,
  Info,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import {
  SurveyImageItem,
  PhotogrammetryConstants,
  SurveyAnalysisResult,
  SurveyRecord,
  StatusAlert,
  getDefaultSampleSurveyImages,
  ReconstructionBrief,
  ReconstructionMapGeometry,
  ReconstructionMapSelection,
} from '../../types/aiSurvey';
import { ProjectAsset, ProjectProvider } from '../../types/project';

interface AIGeologicalMapperPanelProps {
  onStatusChange: (status: StatusAlert) => void;
  onApply3DMarkers?: (points: Array<{ stationId: string; x: number; y: number; z: number; color: string; label: string }>) => void;
  projectTitle?: string;
  currentPresetId?: string;
  onSelectPreset?: (presetId: any) => void;
  onApplyCustomScene?: (params: any, context?: { targetMode: ReconstructionBrief['targetMode']; nextPartDistanceMeters: number; basePresetId: string }) => void;
  authToken?: string | null;
  onOpenAuth?: () => void;
  selectedObjectId?: string | null;
  selectedObjectName?: string | null;
  activeAssetName?: string | null;
  savedReconstructionBrief?: ReconstructionBrief | null;
  onSaveReconstructionBrief?: (brief: ReconstructionBrief) => void;
  capturedReferenceImage?: { dataUrl: string; name: string } | null;
  mapGeometry?: ReconstructionMapGeometry | null;
  mapSelection?: ReconstructionMapSelection | null;
  mapMarkingEnabled?: boolean;
  mapDrawingMode?: boolean;
  onMapGeometryChange?: (geometry: ReconstructionMapGeometry | null) => void;
  onMapMarkingChange?: (enabled: boolean) => void;
  onMapDrawingChange?: (enabled: boolean) => void;
  onProviderAssetReady?: (provider: ProjectProvider, asset: ProjectAsset) => void;
}

type WorldProvider = 'marble' | 'gomera';
type WorldMode = 'text' | 'image' | 'multi-image';
type GomeraUploadSource = 'ai-panel' | 'gomera-file-manager';

interface WorldImageInput {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  size: number;
  azimuth: number;
}

const geminiModelOptions = [
  { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash · fast stable' },
  { value: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash · stronger reasoning' },
  { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash · multimodal balance' },
  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash · legacy stable' },
  { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite · lowest cost' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash · preview' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro · preview reasoning' },
];

const marbleModelOptions = [
  { value: 'marble-1.1', label: 'Marble 1.1 · recommended' },
  { value: 'marble-1.1-plus', label: 'Marble 1.1 Plus · dynamic size' },
  { value: 'marble-1.0', label: 'Marble 1.0' },
  { value: 'marble-1.0-draft', label: 'Marble 1.0 Draft' },
];

interface AISettingsState {
  geminiConfigured: boolean;
  marbleConfigured: boolean;
  geminiModel: string;
  marbleModel: string;
}

export const AIGeologicalMapperPanel: React.FC<AIGeologicalMapperPanelProps> = ({
  onStatusChange,
  onApply3DMarkers,
  projectTitle = 'Mining Site - Surface & Subsurface Mapping',
  currentPresetId,
  onSelectPreset,
  onApplyCustomScene,
  authToken = null,
  onOpenAuth,
  selectedObjectId = null,
  selectedObjectName = null,
  activeAssetName = null,
  savedReconstructionBrief = null,
  onSaveReconstructionBrief,
  capturedReferenceImage = null,
  mapGeometry = null,
  mapSelection = null,
  mapMarkingEnabled = false,
  mapDrawingMode = false,
  onMapGeometryChange,
  onMapMarkingChange,
  onMapDrawingChange,
  onProviderAssetReady,
}) => {
  const [activeTab, setActiveTab] = useState<'input' | 'preview' | 'analysis' | 'records' | 'reconstruct'>('input');
  const [images, setImages] = useState<SurveyImageItem[]>(getDefaultSampleSurveyImages());
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [notes, setNotes] = useState<string>(
    'Synthesize drift convergence, identify gold vein mineralization contacts, assess rock mass quality rating (RMR), and calculate volumetric excavation.'
  );

  // AI 3D Scene Reconstruction state
  const [reconstructImage, setReconstructImage] = useState<string>('/assets/reference/rugged_timbered_mine_reference.png');
  const [reconstructImageName, setReconstructImageName] = useState('rugged_timbered_mine_reference.png');
  const [reconstructReferenceLoading, setReconstructReferenceLoading] = useState(false);
  const [reconstructTargetMode, setReconstructTargetMode] = useState<ReconstructionBrief['targetMode']>('extend-current');
  const [reconstructBasePresetId, setReconstructBasePresetId] = useState(currentPresetId || 'rugged_timbered_photo');
  const [reconstructMapName, setReconstructMapName] = useState('');
  const [reconstructMapText, setReconstructMapText] = useState('');
  const [reconstructMapImage, setReconstructMapImage] = useState('');
  const [reconstructMapImageName, setReconstructMapImageName] = useState('');
  const [reconstructMapLoading, setReconstructMapLoading] = useState(false);
  const [mapInterpreting, setMapInterpreting] = useState(false);
  const [mapDropActive, setMapDropActive] = useState(false);
  const [nextPartDistanceMeters, setNextPartDistanceMeters] = useState(2.5);
  const [partWidthMeters, setPartWidthMeters] = useState(4.6);
  const [partHeightMeters, setPartHeightMeters] = useState(4.6);
  const [partLengthMeters, setPartLengthMeters] = useState(8);
  const [briefSavedMessage, setBriefSavedMessage] = useState('');
  const [reconstructPrompt, setReconstructPrompt] = useState<string>(
    'Synthesize square timber sets with 4-tier side lagging, inward batter angle, a clear packed earthen wheel-cart path, and unlined rock cavern adit bore. Do not add rails, carts, or loose stones.'
  );
  const [isReconstructing, setIsReconstructing] = useState<boolean>(false);
  const [reconstructResult, setReconstructResult] = useState<any>(null);

  // AI World Studio providers. The API keys remain server-side; this state only drives the UI.
  const [worldProvider, setWorldProvider] = useState<WorldProvider>('marble');
  const [worldMode, setWorldMode] = useState<WorldMode>('text');
  const [worldModel, setWorldModel] = useState('marble-1.1');
  const [worldDisplayName, setWorldDisplayName] = useState('MiningSight AI World');
  const [worldPrompt, setWorldPrompt] = useState(
    'Generate a navigable underground timbered mining drift with square timber sets, four tiers of side lagging, an inward batter angle, a clear packed earthen wheel-cart path, and an unlined rock cavern heading. Do not add rails, carts, or loose stones.'
  );
  const [worldImages, setWorldImages] = useState<WorldImageInput[]>([]);
  const [worldReconstructImages, setWorldReconstructImages] = useState(false);
  const [worldIsPano, setWorldIsPano] = useState<'auto' | 'true' | 'false'>('auto');
  const [worldDisableRecaption, setWorldDisableRecaption] = useState(false);
  const [worldDragActive, setWorldDragActive] = useState(false);
  const [worldGenerating, setWorldGenerating] = useState(false);
  const [worldProgress, setWorldProgress] = useState(0);
  const [worldStatus, setWorldStatus] = useState('Ready to generate a world.');
  const [worldResult, setWorldResult] = useState<any>(null);
  const [worldError, setWorldError] = useState('');
  const [worldConfigured, setWorldConfigured] = useState<boolean | null>(null);
  const [worldCredits, setWorldCredits] = useState<number | null>(null);
  const [marbleWorlds, setMarbleWorlds] = useState<any[]>([]);
  const [marbleWorldsLoading, setMarbleWorldsLoading] = useState(false);
  const [marbleWorldsPublicOnly, setMarbleWorldsPublicOnly] = useState(true);
  const [marbleWorldsMessage, setMarbleWorldsMessage] = useState('');
  const [gomeraCaptureName, setGomeraCaptureName] = useState('MiningSight GOMERA capture');
  const [gomeraUploadSource, setGomeraUploadSource] = useState<GomeraUploadSource>('gomera-file-manager');
  const [aiSettings, setAiSettings] = useState<AISettingsState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsGeminiKey, setSettingsGeminiKey] = useState('');
  const [settingsMarbleKey, setSettingsMarbleKey] = useState('');
  const [settingsGeminiModel, setSettingsGeminiModel] = useState('gemini-3.8-flash');
  const [settingsMarbleModel, setSettingsMarbleModel] = useState('marble-1.1');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [worldFilesLoading, setWorldFilesLoading] = useState(false);

  const [constants, setConstants] = useState<PhotogrammetryConstants>({
    sensorFocalLengthMm: 35,
    gsdMmPerPixel: 1.2,
    overlapPercentage: 75,
    convergenceToleranceMm: 5.0,
  });

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<SurveyAnalysisResult | null>(null);
  const [records, setRecords] = useState<SurveyRecord[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);

  // Load saved records from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('mining_site_ai_records');
      if (saved) {
        setRecords(JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Could not read saved survey records:', e);
    }
  }, []);

  useEffect(() => {
    if (savedReconstructionBrief) {
      setReconstructTargetMode(savedReconstructionBrief.targetMode);
      setReconstructBasePresetId(savedReconstructionBrief.basePresetId || currentPresetId || 'rugged_timbered_photo');
      setReconstructImageName(savedReconstructionBrief.referenceImageName || 'rugged_timbered_mine_reference.png');
      setReconstructMapName(savedReconstructionBrief.mapName || '');
      setReconstructMapText(savedReconstructionBrief.mapText || '');
      onMapGeometryChange?.(savedReconstructionBrief.mapGeometry || null);
      setNextPartDistanceMeters(Number(savedReconstructionBrief.nextPartDistanceMeters) || 2.5);
      setPartWidthMeters(Number(savedReconstructionBrief.dimensions?.widthMeters) || 4.6);
      setPartHeightMeters(Number(savedReconstructionBrief.dimensions?.heightMeters) || 4.6);
      setPartLengthMeters(Number(savedReconstructionBrief.dimensions?.lengthMeters) || 8);
      if (savedReconstructionBrief.prompt) setReconstructPrompt(savedReconstructionBrief.prompt);
    } else {
      let localBrief: ReconstructionBrief | null = null;
      try {
        const raw = localStorage.getItem(`miningsight_reconstruction_brief_${projectTitle}`);
        if (raw) localBrief = JSON.parse(raw) as ReconstructionBrief;
      } catch {}
      if (localBrief) {
        setReconstructTargetMode(localBrief.targetMode);
        setReconstructBasePresetId(localBrief.basePresetId || currentPresetId || 'rugged_timbered_photo');
        setReconstructImageName(localBrief.referenceImageName || 'rugged_timbered_mine_reference.png');
        setReconstructMapName(localBrief.mapName || '');
        setReconstructMapText(localBrief.mapText || '');
        onMapGeometryChange?.(localBrief.mapGeometry || null);
        setNextPartDistanceMeters(Number(localBrief.nextPartDistanceMeters) || 2.5);
        setPartWidthMeters(Number(localBrief.dimensions?.widthMeters) || 4.6);
        setPartHeightMeters(Number(localBrief.dimensions?.heightMeters) || 4.6);
        setPartLengthMeters(Number(localBrief.dimensions?.lengthMeters) || 8);
        if (localBrief.prompt) setReconstructPrompt(localBrief.prompt);
      } else if (currentPresetId) {
        setReconstructBasePresetId(currentPresetId);
      }
    }
  }, [currentPresetId, savedReconstructionBrief, onMapGeometryChange]);

  useEffect(() => {
    if (!capturedReferenceImage) return;
    setReconstructImage(capturedReferenceImage.dataUrl);
    setReconstructImageName(capturedReferenceImage.name);
    setActiveTab('reconstruct');
    onStatusChange({
      type: 'success',
      message: 'Keyframe screenshot attached to the MiningSight-compatible reconstruction brief.',
      details: 'The captured viewer position is now the active visual reference.',
      timestamp: new Date().toLocaleTimeString(),
    });
  }, [capturedReferenceImage, onStatusChange]);

  // Save records to localStorage
  const saveRecordToHistory = (res: SurveyAnalysisResult, source: string) => {
    const totalDist = images.reduce((acc, curr, idx) => acc + (idx === 0 ? 0 : Number(curr.distanceFromLast || 0)), 0);
    const newRecord: SurveyRecord = {
      id: `rec_${Date.now()}`,
      timestamp: new Date().toLocaleString(),
      projectTitle,
      imagesCount: images.length,
      totalBaselineDistance: Number(totalDist.toFixed(2)),
      notes,
      result: res,
      source,
    };
    const updated = [newRecord, ...records.slice(0, 19)];
    setRecords(updated);
    try {
      localStorage.setItem('mining_site_ai_records', JSON.stringify(updated));
    } catch (e) {}
  };

  // Image Tag Update Handlers
  const handleUpdateImageTag = (index: number, key: keyof SurveyImageItem, value: any) => {
    setImages((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  };

  const handleAddCustomImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file, fIdx) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const newIdx = images.length + fIdx + 1;
        const newImg: SurveyImageItem = {
          id: `img_${Date.now()}_${fIdx}`,
          name: file.name,
          dataUrl,
          distanceFromLast: 2.5,
          stationId: `ST-${newIdx < 10 ? '0' : ''}${newIdx}`,
          depthBelowSurface: 140 + newIdx * 2.5,
          headingAzimuth: 115,
          pitchAngle: -4,
          rockStrata: 'Auriferous Quartzite Seam',
          rqdPercent: 75,
          fractureSpacingCm: 25,
        };
        setImages((prev) => [...prev, newImg]);
        onStatusChange({
          type: 'success',
          message: `Uploaded image "${file.name}" with default 2.5m distance tag.`,
          timestamp: new Date().toLocaleTimeString(),
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveImage = (index: number) => {
    if (images.length <= 1) {
      onStatusChange({
        type: 'warning',
        message: 'At least one survey image must remain in the photogrammetry set.',
        timestamp: new Date().toLocaleTimeString(),
      });
      return;
    }
    const filtered = images.filter((_, idx) => idx !== index);
    setImages(filtered);
    setSelectedImageIndex(Math.max(0, index - 1));
  };

  // Total baseline distance
  const totalBaselineDistance = images.reduce((acc, curr, idx) => {
    return acc + (idx === 0 ? 0 : Number(curr.distanceFromLast || 0));
  }, 0);

  // Validate before sending
  const validateSurvey = (): { valid: boolean; error?: string } => {
    if (images.length === 0) {
      return { valid: false, error: 'Please add at least one survey image.' };
    }
    for (let i = 1; i < images.length; i++) {
      const d = images[i].distanceFromLast;
      if (d === undefined || d === null || isNaN(Number(d)) || Number(d) <= 0) {
        return {
          valid: false,
          error: `Image #${i + 1} (${images[i].name}) requires a positive "Distance from Last Image" tag for 3D reconstruction.`,
        };
      }
    }
    return { valid: true };
  };

  // Trigger Send to Gemini AI
  const handleExecuteAI = async () => {
    const validation = validateSurvey();
    if (!validation.valid) {
      setShowPreviewModal(false);
      onStatusChange({
        type: 'error',
        message: validation.error || 'Validation error in survey inputs.',
        details: 'The photogrammetry solver requires all sequential image tags to have an explicit linear distance (meters) to compute 3D scale and convergence.',
        errorCode: 'ERR_MISSING_DISTANCE',
        timestamp: new Date().toLocaleTimeString(),
      });
      return;
    }

    if (!authToken || (aiSettings && !aiSettings.geminiConfigured)) {
      setActiveTab('reconstruct');
      openProviderSettings();
      onStatusChange({
        type: 'warning',
        message: 'Gemini API key required before survey analysis.',
        details: authToken ? 'Open Provider API keys & model preferences and save a Gemini key.' : 'Sign in with Google, then save a Gemini key in Provider API keys & model preferences.',
        timestamp: new Date().toLocaleTimeString(),
      });
      if (!authToken) onOpenAuth?.();
      return;
    }

    const activeGeminiModel = aiSettings?.geminiModel || settingsGeminiModel || 'gemini-3.8-flash';

    setShowPreviewModal(false);
    setIsProcessing(true);

    onStatusChange({
      type: 'loading',
      message: `[Step 1/3] Uploading ${images.length} survey frames & distance tags to ${activeGeminiModel}...`,
      details: `Computing ${totalBaselineDistance.toFixed(2)}m baseline drift convergence, rock quality rating, and 3D subsurface coordinates.`,
      timestamp: new Date().toLocaleTimeString(),
    });

    try {
      const response = await fetch('/api/reconstruction/ai/photogrammetry-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({
          images,
          notes,
          constants,
          projectTitle,
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        if (response.status === 428 && json.provider === 'gemini') {
          openProviderSettings();
          if (!authToken) onOpenAuth?.();
        }
        throw new Error(json.message || json.error || 'Server processing error.');
      }

      setAnalysisResult(json.data);
      saveRecordToHistory(json.data, json.source);
      setActiveTab('analysis');

      onStatusChange({
        type: 'success',
        message: `AI 3D Survey Analysis generated successfully (${json.source}). Total baseline: ${totalBaselineDistance.toFixed(2)}m.`,
        details: json.notice || `Generated ${json.data.meshGeneratedPoints?.length || 0} survey stations and RMR rating ${json.data.surveySummary?.rockMassRating}.`,
        timestamp: new Date().toLocaleTimeString(),
      });

      // Optionally auto-apply markers
      if (onApply3DMarkers && json.data.meshGeneratedPoints) {
        onApply3DMarkers(json.data.meshGeneratedPoints);
      }
    } catch (err: any) {
      onStatusChange({
        type: 'error',
        message: `AI Photogrammetry failed: ${err.message}`,
        details: 'Ensure distance tags are numbers > 0 and check server connectivity. If the provider key is missing, open Provider API keys & model preferences.',
        errorCode: 'ERR_AI_PROCESSING',
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const readFileAsDataUrl = (file: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the reference image.'));
    reader.readAsDataURL(file);
  });

  const handleReconstructionReference = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setWorldError('Use a screenshot or reference image in JPG, PNG, or WebP format.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setWorldError('Reference screenshots must be 25 MB or smaller.');
      return;
    }
    setReconstructReferenceLoading(true);
    try {
      setReconstructImage(await readFileAsDataUrl(file));
      setReconstructImageName(file.name);
      setWorldError('');
    } catch (error: any) {
      setWorldError(error.message || 'Could not read the reference screenshot.');
    } finally {
      setReconstructReferenceLoading(false);
    }
  };

  const handleReconstructionMap = async (file?: File) => {
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const accepted = isImage || file.type.startsWith('text/') || /\.(json|geojson|csv|txt|md|yaml|yml)$/i.test(file.name);
    if (!accepted) {
      setWorldError('Maps must be an image, JSON, GeoJSON, CSV, TXT, Markdown, YAML, or YML file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setWorldError('Reference maps must be 5 MB or smaller.');
      return;
    }
    setReconstructMapLoading(true);
    try {
      setReconstructMapName(file.name);
      if (isImage) {
        setReconstructMapImage(await readFileAsDataUrl(file));
        setReconstructMapImageName(file.name);
      } else {
        const text = await file.text();
        setReconstructMapText(text.slice(0, 120000));
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed.points) && Array.isArray(parsed.segments)) {
            onMapGeometryChange?.({
              ...parsed,
              name: String(parsed.name || file.name),
              source: parsed.source === 'gemini' || parsed.source === 'text-fallback' ? parsed.source : 'manual',
              points: parsed.points,
              segments: parsed.segments,
            } as ReconstructionMapGeometry);
            onMapMarkingChange?.(false);
            onStatusChange({ type: 'success', message: 'Editable MiningSight map JSON reopened.', details: 'Layers, features, points, widths, and metadata were restored.', timestamp: new Date().toLocaleTimeString() });
          }
        } catch {
          // Plain JSON/GeoJSON remains available as readable input for Gemini.
        }
      }
      setWorldError('');
    } catch (error: any) {
      setWorldError(error.message || 'Could not read the reference map.');
    } finally {
      setReconstructMapLoading(false);
    }
  };

  const handleMapDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setMapDropActive(false);
    void handleReconstructionMap(event.dataTransfer.files?.[0]);
  };

  const interpretReconstructionMap = async () => {
    if (!authToken || (aiSettings && !aiSettings.geminiConfigured)) {
      openProviderSettings();
      if (!authToken) onOpenAuth?.();
      onStatusChange({
        type: 'warning',
        message: 'Gemini API key required before interpreting a map.',
        details: 'Open Provider API keys & model preferences and save a Gemini key.',
        timestamp: new Date().toLocaleTimeString(),
      });
      return;
    }
    if (!reconstructMapImage && !reconstructMapText.trim()) {
      setWorldError('Attach a map image or paste readable map text first.');
      return;
    }
    setMapInterpreting(true);
    setWorldError('');
    try {
      const response = await fetch('/api/reconstruction/ai/reconstruction-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ image: reconstructMapImage, mapName: reconstructMapName || reconstructMapImageName, mapText: reconstructMapText }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success || !json.mapGeometry) {
        if (response.status === 428) openProviderSettings();
        throw new Error(json.message || 'Map interpretation failed.');
      }
      onMapGeometryChange?.(json.mapGeometry as ReconstructionMapGeometry);
      onMapMarkingChange?.(false);
      onStatusChange({
        type: 'success',
        message: 'Gemini converted the reference map into a 2D route overlay.',
        details: `${json.mapGeometry.points?.length || 0} points and ${json.mapGeometry.segments?.length || 0} thick-line segments are now visible in the viewer.`,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (error: any) {
      setWorldError(error.message || 'Could not interpret the reference map.');
      onStatusChange({ type: 'error', message: `Map interpretation failed: ${error.message}`, timestamp: new Date().toLocaleTimeString() });
    } finally {
      setMapInterpreting(false);
    }
  };

  const buildReconstructionBrief = (): ReconstructionBrief => ({
    targetMode: reconstructTargetMode,
    basePresetId: reconstructBasePresetId,
    selectedObjectId,
    selectedObjectName,
    activeAssetName,
    referenceImageName: reconstructImageName,
    mapName: reconstructMapName || undefined,
    mapText: reconstructMapText || undefined,
    mapGeometry,
    mapSelection,
    nextPartDistanceMeters,
    dimensions: {
      widthMeters: partWidthMeters,
      heightMeters: partHeightMeters,
      lengthMeters: partLengthMeters,
    },
    prompt: reconstructPrompt,
    updatedAt: new Date().toISOString(),
  });

  const saveReconstructionBrief = () => {
    const brief = buildReconstructionBrief();
    onSaveReconstructionBrief?.(brief);
    try {
      localStorage.setItem(`miningsight_reconstruction_brief_${projectTitle}`, JSON.stringify(brief));
    } catch {}
    setBriefSavedMessage('Brief saved to this project.');
    window.setTimeout(() => setBriefSavedMessage(''), 2500);
    onStatusChange({
      type: 'success',
      message: 'MiningSight-compatible reconstruction brief saved.',
      details: 'The reference map, distance constraint, dimensions, selected scene, and instructions will travel with the project snapshot.',
      timestamp: new Date().toLocaleTimeString(),
    });
  };

  // Generate a MiningSight-compatible reconstruction plan via Gemini AI Vision.
  const handleReconstructScene = async () => {
    if (!authToken || (aiSettings && !aiSettings.geminiConfigured)) {
      setActiveTab('reconstruct');
      openProviderSettings();
      onStatusChange({
        type: 'warning',
        message: 'Gemini API key required for MiningSight Compatible Reconstruction.',
        details: authToken ? 'Open Provider API keys & model preferences and save a Gemini key.' : 'Sign in with Google, then save a Gemini key in Provider API keys & model preferences.',
        timestamp: new Date().toLocaleTimeString(),
      });
      if (!authToken) onOpenAuth?.();
      return;
    }
    if (reconstructTargetMode !== 'rebuild-scene' && (!reconstructMapText.trim() && !mapGeometry && !reconstructMapImage || !Number.isFinite(nextPartDistanceMeters) || nextPartDistanceMeters <= 0)) {
      setWorldError('For a new part or extension, attach or interpret a reference map and set a positive distance from the current endpoint.');
      return;
    }
    if (!reconstructPrompt.trim()) {
      setWorldError('Describe the geometry, materials, curve, tunnel behaviour, and what must not be generated.');
      return;
    }
    setIsReconstructing(true);
    setWorldError('');
    let referenceImage = '';
    try {
      referenceImage = reconstructImage.startsWith('data:')
        ? reconstructImage
        : await fetch(reconstructImage).then((response) => {
          if (!response.ok) throw new Error('Could not load the default reference image.');
          return response.blob();
        }).then(readFileAsDataUrl);
      onStatusChange({
        type: 'loading',
        message: 'Gemini is reading the reference, map, selected scene, and next-part dimensions...',
        details: `${reconstructTargetMode === 'extend-current' ? 'Extending' : reconstructTargetMode === 'new-part' ? 'Building a new part' : 'Rebuilding'} ${reconstructBasePresetId}.`,
        timestamp: new Date().toLocaleTimeString(),
      });
      const resp = await fetch('/api/reconstruction/ai/reconstruct-scene-from-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({
          image: referenceImage,
          imageName: reconstructImageName,
          fieldNotes: reconstructPrompt,
          targetMode: reconstructTargetMode,
          basePresetId: reconstructBasePresetId,
          selectedObjectId,
          selectedObjectName,
          activeAssetName,
          referenceMapName: reconstructMapName,
          referenceMapText: reconstructMapText,
          referenceMapImage: reconstructMapImage,
          mapGeometry,
          mapSelection,
          nextPartDistanceMeters,
          dimensions: {
            widthMeters: partWidthMeters,
            heightMeters: partHeightMeters,
            lengthMeters: partLengthMeters,
          },
        }),
      });

      const json = await resp.json();
      if (!resp.ok || !json.success) {
        if (resp.status === 428 && json.provider === 'gemini') {
          openProviderSettings();
          if (!authToken) onOpenAuth?.();
        }
        throw new Error(json.message || 'Scene reconstruction failed');
      }

      setReconstructResult(json.data);
      onStatusChange({
        type: 'success',
        message: 'MiningSight-compatible reconstruction plan generated.',
        details: `${json.data.reconstructionPlan || 'Generated procedural geometry parameters'} · ${json.data.procedural3DParams.timberSetCount} timber sets · ${json.data.procedural3DParams.laggingPlankTiers}-tier lagging.`,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err: any) {
      onStatusChange({
        type: 'error',
        message: `MiningSight-compatible reconstruction failed: ${err.message}`,
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsReconstructing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
    fetch('/api/reconstruction/ai/worldlabs/status', headers ? { headers } : undefined)
      .then((response) => response.json())
      .then((json) => {
        if (cancelled) return;
        setWorldConfigured(Boolean(json.configured));
        setWorldCredits(typeof json.credits === 'number' ? json.credits : null);
      })
      .catch(() => {
        if (!cancelled) setWorldConfigured(false);
      });
    if (!authToken) {
      setAiSettings(null);
      return () => { cancelled = true; };
    }
    setSettingsLoading(true);
    fetch('/api/reconstruction/ai/settings', { headers: { Authorization: `Bearer ${authToken}` } })
      .then((response) => response.json())
      .then((json) => {
        if (cancelled || !json.success || !json.settings) return;
        setAiSettings(json.settings);
        setSettingsGeminiModel(json.settings.geminiModel || 'gemini-3.8-flash');
        setSettingsMarbleModel(json.settings.marbleModel || 'marble-1.1');
        setWorldModel(json.settings.marbleModel || 'marble-1.1');
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSettingsLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  const saveAISettings = async () => {
    if (!authToken) {
      onOpenAuth?.();
      return;
    }
    setSettingsSaving(true);
    setSettingsMessage('');
    try {
      const response = await fetch('/api/reconstruction/ai/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          geminiApiKey: settingsGeminiKey.trim() || undefined,
          marbleApiKey: settingsMarbleKey.trim() || undefined,
          geminiModel: settingsGeminiModel,
          marbleModel: settingsMarbleModel,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.message || 'Could not save AI settings.');
      setAiSettings(json.settings);
      setWorldConfigured(Boolean(json.settings.marbleConfigured));
      setWorldModel(json.settings.marbleModel || settingsMarbleModel);
      setSettingsGeminiKey('');
      setSettingsMarbleKey('');
      setSettingsMessage('Saved securely. New generations will use your selected models.');
    } catch (error: any) {
      setSettingsMessage(error.message || 'Could not save AI settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const loadMarbleWorlds = async () => {
    if (!authToken) {
      onOpenAuth?.();
      return;
    }
    setMarbleWorldsLoading(true);
    setMarbleWorldsMessage('');
    try {
      const response = await fetch('/api/ai/worldlabs/worlds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ publicOnly: marbleWorldsPublicOnly, pageSize: 100 }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.message || 'Could not list Marble worlds.');
      setMarbleWorlds(Array.isArray(json.worlds) ? json.worlds : []);
      setMarbleWorldsMessage(`${Array.isArray(json.worlds) ? json.worlds.length : 0} ${marbleWorldsPublicOnly ? 'public' : ''} world${json.worlds?.length === 1 ? '' : 's'} found.`);
    } catch (error: any) {
      setMarbleWorldsMessage(error.message || 'Could not list Marble worlds.');
    } finally {
      setMarbleWorldsLoading(false);
    }
  };

  const openProviderSettings = () => {
    setActiveTab('reconstruct');
    setSettingsOpen(true);
    setSettingsMessage('');
    window.setTimeout(() => document.getElementById('provider-api-settings')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0);
  };

  const readWorldFile = (file: File): Promise<WorldImageInput> => new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      reject(new Error(`${file.name} is not supported. Use JPG, PNG, or WebP.`));
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      reject(new Error(`${file.name} is larger than the 100 MB app upload guardrail.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({
      id: `world_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: file.name,
      mimeType: file.type,
      dataUrl: String(reader.result || ''),
      size: file.size,
      azimuth: 0,
    });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });

  const addWorldFiles = async (fileList: FileList | File[]) => {
    const selected = Array.from(fileList);
    if (!selected.length) return;
    const selectedCount = selected.length;
    const nextMode: WorldMode = worldProvider === 'marble'
      ? (worldMode === 'text' ? (selectedCount > 1 ? 'multi-image' : 'image') : (worldMode === 'image' && selectedCount > 1 ? 'multi-image' : worldMode))
      : worldMode;
    const maxImages = worldProvider === 'gomera' ? 337 : nextMode === 'multi-image' ? (worldReconstructImages ? 8 : 4) : 1;
    const available = Math.max(0, maxImages - (nextMode === 'image' ? 0 : worldImages.length));
    const filesToRead = selected.slice(0, available || (nextMode === 'image' ? 1 : 0));
    if (selected.length > filesToRead.length) {
      setWorldError(`This mode accepts ${maxImages} image${maxImages === 1 ? '' : 's'}; extra files were not added.`);
    } else {
      setWorldError('');
    }
    setWorldFilesLoading(true);
    try {
      const loaded = await Promise.all(filesToRead.map(readWorldFile));
      const withAzimuth = loaded.map((image, index) => ({ ...image, azimuth: (worldImages.length + index) * 90 }));
      setWorldMode(nextMode);
      setWorldImages(nextMode === 'image' ? withAzimuth.slice(0, 1) : [...worldImages, ...withAzimuth]);
      setWorldStatus(`${loaded.length} image${loaded.length === 1 ? '' : 's'} ready for ${worldProvider === 'marble' ? 'Marble' : 'GOMERA'}.`);
    } catch (error: any) {
      setWorldError(error.message || 'Could not read the selected images.');
    } finally {
      setWorldFilesLoading(false);
    }
  };

  const removeWorldImage = (id: string) => {
    setWorldImages((current) => current.filter((image) => image.id !== id));
  };

  const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const startGomeraFileManagerUpload = async (): Promise<string> => {
    if (!authToken) throw new Error('Sign in with Google before using the GOMERA file manager.');
    const authHeaders = { Authorization: `Bearer ${authToken}` };
    const sessionResponse = await fetch('/api/reconstruction/ai/gomera-file-manager/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ fileCount: worldImages.length }),
    });
    const session = await sessionResponse.json().catch(() => ({}));
    if (!sessionResponse.ok || !session.uploadId) throw new Error(session.message || session.error || 'Could not open the GOMERA file-manager upload session.');
    const uploadId = session.uploadId as string;
    const chunkSize = 512 * 1024;
    for (let imageIndex = 0; imageIndex < worldImages.length; imageIndex += 1) {
      const image = worldImages[imageIndex];
      const response = await fetch(image.dataUrl);
      const blob = await response.blob();
      const totalChunks = Math.ceil(blob.size / chunkSize);
      const fileId = crypto.randomUUID();
      for (let part = 0; part < totalChunks; part += 1) {
        let uploaded = false;
        let lastError = 'Chunk upload failed.';
        for (let attempt = 1; attempt <= 3 && !uploaded; attempt += 1) {
          try {
            const query = new URLSearchParams({ part: String(part), total: String(totalChunks), size: String(blob.size), name: image.name });
            setWorldStatus(`GOMERA file manager · ${image.name} · part ${part + 1}/${totalChunks}${attempt > 1 ? ` · retry ${attempt}/3` : ''}`);
            setWorldProgress(Math.max(2, Math.round(((imageIndex + (part + 0.5) / totalChunks) / worldImages.length) * 25)));
            const chunkResponse = await fetch(`/api/reconstruction/ai/gomera-file-manager/session/${encodeURIComponent(uploadId)}/chunks/${encodeURIComponent(fileId)}?${query.toString()}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/octet-stream', ...authHeaders },
              body: blob.slice(part * chunkSize, Math.min(blob.size, (part + 1) * chunkSize)),
            });
            const chunkJson = await chunkResponse.json().catch(() => ({}));
            if (!chunkResponse.ok) throw new Error(chunkJson.message || chunkJson.error || `Chunk ${part + 1} failed (${chunkResponse.status}).`);
            uploaded = true;
          } catch (error: any) {
            lastError = error.message || lastError;
            if (attempt < 3) await wait(attempt * 750);
          }
        }
        if (!uploaded) throw new Error(`${image.name} stopped at part ${part + 1}/${totalChunks}: ${lastError}`);
      }
      setWorldProgress(Math.max(4, Math.round(((imageIndex + 1) / worldImages.length) * 25)));
    }
    const jobResponse = await fetch('/api/reconstruction/ai/gomera-file-manager/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ uploadId }),
    });
    const job = await jobResponse.json().catch(() => ({}));
    if (!jobResponse.ok || !job.jobId) throw new Error(job.message || job.error || 'GOMERA did not start a reconstruction job.');
    return job.jobId as string;
  };

  const handleWorldGenerate = async () => {
    setWorldError('');
    setWorldResult(null);
    if (worldProvider === 'marble' && (!authToken || (aiSettings && !aiSettings.marbleConfigured))) {
      openProviderSettings();
      setWorldError(authToken ? 'Save a World Labs Marble API key in Provider settings before generating.' : 'Sign in with Google, then save a World Labs Marble API key in Provider settings.');
      if (!authToken) onOpenAuth?.();
      return;
    }
    if (worldProvider === 'marble') {
      const maxImages = worldReconstructImages ? 8 : 4;
      if (worldMode === 'text' && !worldPrompt.trim()) {
        setWorldError('A text prompt is required for text-to-world generation.');
        return;
      }
      if (worldPrompt.length > 4000) {
        setWorldError('Keep the prompt under the 4,000-character application guardrail.');
        return;
      }
      if (worldMode === 'image' && worldImages.length !== 1) {
        setWorldError('Single-image mode requires exactly one image.');
        return;
      }
      if (worldMode === 'multi-image' && (worldImages.length < 2 || worldImages.length > maxImages)) {
        setWorldError(`Multi-image mode requires 2-${maxImages} images with the current reconstruction setting.`);
        return;
      }
    } else if (!worldImages.length) {
      setWorldError('Add at least one image before starting a GOMERA reconstruction.');
      return;
    }

    setWorldGenerating(true);
    setWorldProgress(2);
    setWorldStatus(worldProvider === 'marble' ? 'Uploading references to World Labs…' : 'Uploading capture to GOMERA…');
    try {
      if (worldProvider === 'marble') {
        const response = await fetch('/api/reconstruction/ai/worldlabs/generate', {
          method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
          body: JSON.stringify({
            mode: worldMode,
            model: worldModel,
            displayName: worldDisplayName,
            prompt: worldPrompt,
            reconstructImages: worldReconstructImages,
            disableRecaption: worldDisableRecaption,
            isPano: worldIsPano === 'auto' ? 'auto' : worldIsPano === 'true',
            images: worldImages.map(({ name, mimeType, dataUrl, azimuth }) => ({ name, mimeType, dataUrl, azimuth })),
          }),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) {
          if (response.status === 428 && json.provider === 'marble') {
            openProviderSettings();
            if (!authToken) onOpenAuth?.();
          }
          throw new Error(json.message || json.error || 'World Labs request failed.');
        }
        let operation = json.operation;
        setWorldProgress(12);
        setWorldStatus('World Labs is generating the navigable world. This can take several minutes…');
        const operationId = operation?.operation_id || operation?.name;
        if (!operationId) throw new Error('World Labs did not return an operation ID.');
        for (let attempt = 0; attempt < 180; attempt += 1) {
          if (operation?.done) break;
          await wait(4000);
          const statusResponse = await fetch(`/api/reconstruction/ai/worldlabs/operations/${encodeURIComponent(operationId)}`, authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : undefined);
          const statusJson = await statusResponse.json().catch(() => ({}));
          if (!statusResponse.ok || !statusJson.success) {
            if (statusResponse.status === 428 && statusJson.provider === 'marble') openProviderSettings();
            throw new Error(statusJson.message || 'Could not read World Labs operation status.');
          }
          operation = statusJson.operation;
          const reported = Number(operation?.metadata?.progress ?? operation?.progress);
          setWorldProgress(Number.isFinite(reported) ? Math.max(12, Math.min(98, reported)) : Math.min(96, 12 + attempt * 2));
          if (operation?.error) throw new Error(operation.error.message || 'World Labs generation failed.');
          if (operation?.done) break;
        }
        if (!operation?.done) throw new Error('World Labs generation is still running. Check the operation again from the AI panel.');
        const world = operation.response?.world || operation.response || operation.result?.world || operation.result || operation;
        setWorldResult({ provider: 'marble', operation, world });
        const worldId = String(world.world_id || world.id || operationId);
        const remoteUrl = world.world_marble_url || world.marble_url || world.world_url || `https://marble.worldlabs.ai/world/${encodeURIComponent(worldId)}`;
        onProviderAssetReady?.('worldlabs', {
          id: `worldlabs_${worldId}`,
          name: String(world.display_name || worldId).slice(0, 160),
          type: 'model/world',
          kind: 'world',
          size: 0,
          uploadedAt: new Date().toISOString(),
          url: remoteUrl,
          remoteUrl,
          thumbnailUrl: world.assets?.thumbnail_url || world.thumbnail_url || '',
          provider: 'worldlabs',
        });
        setWorldProgress(100);
        setWorldStatus('Marble world ready.');
        onStatusChange({ type: 'success', message: 'World Labs Marble world generated successfully.', timestamp: new Date().toLocaleTimeString() });
      } else {
        let jobId: string | undefined;
        if (gomeraUploadSource === 'gomera-file-manager') {
          jobId = await startGomeraFileManagerUpload();
        } else {
          const response = await fetch('/api/reconstruction/ai/gomera-reconstruction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              captureName: gomeraCaptureName,
              images: worldImages.map(({ name, mimeType, dataUrl }) => ({ name, mimeType, dataUrl })),
            }),
          });
          const json = await response.json().catch(() => ({}));
          if (!response.ok || !json.success) throw new Error(json.message || json.error || 'GOMERA request failed.');
          jobId = json.jobId;
        }
        if (!jobId) throw new Error('GOMERA did not return a reconstruction job ID.');
        setWorldProgress(20);
        setWorldStatus('GOMERA is reconstructing the capture…');
        let task: any = null;
        for (let attempt = 0; attempt < 240; attempt += 1) {
          await wait(5000);
          const statusResponse = await fetch(`/api/reconstruction/ai/gomera-reconstruction/${encodeURIComponent(jobId)}`);
          const statusJson = await statusResponse.json().catch(() => ({}));
          if (!statusResponse.ok || !statusJson.success) throw new Error(statusJson.message || 'Could not read GOMERA status.');
          task = statusJson.task;
          const code = task?.status?.code;
          const percent = Math.max(0, Math.min(100, Number(task?.progress || 0)));
          setWorldProgress(20 + Math.round(percent * 0.8));
          setWorldStatus(code === 40 ? 'GOMERA model ready.' : `GOMERA reconstruction in progress · ${Math.round(percent)}%`);
          if (code === 40) break;
          if (code === 30 || code === 50) throw new Error(task?.status?.errorMessage || 'GOMERA reconstruction failed.');
        }
        if (task?.status?.code !== 40) throw new Error('GOMERA reconstruction is still running. Check the job again from the AI panel.');
        const modelUrl = `/api/reconstruction/ai/gomera-reconstruction/${encodeURIComponent(jobId)}/model`;
        setWorldResult({ provider: 'gomera', jobId, task, modelUrl });
        onProviderAssetReady?.('gomera', {
          id: `gomera_${jobId}`,
          name: `${gomeraCaptureName || 'GOMERA reconstruction'}.glb`,
          type: 'model/gltf-binary',
          kind: 'model',
          size: 0,
          uploadedAt: new Date().toISOString(),
          url: modelUrl,
          remoteUrl: modelUrl,
          provider: 'gomera',
        });
        setWorldProgress(100);
        onStatusChange({ type: 'success', message: 'GOMERA reconstruction completed successfully.', timestamp: new Date().toLocaleTimeString() });
      }
    } catch (error: any) {
      setWorldError(error.message || 'AI world generation failed.');
      setWorldStatus('Generation failed.');
      onStatusChange({ type: 'error', message: `AI world generation failed: ${error.message}`, timestamp: new Date().toLocaleTimeString() });
    } finally {
      setWorldGenerating(false);
    }
  };

  const selectedImg = images[selectedImageIndex] || images[0];

  return (
    <div className="w-full h-full flex flex-col bg-[#2e2e2e] text-[#d6d6d6] text-[11px] select-none font-sans overflow-hidden border-l border-[#222]">
      {/* Top Header */}
      <div className="h-7 bg-[#383838] border-b border-[#222] px-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-[#e88724] animate-pulse"></span>
          <span className="font-bold text-[#f0f0f0] tracking-tight">AI Photogrammetry & Subsurface Mapping</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={openProviderSettings} className="px-1.5 py-0.5 rounded-[2px] border border-[#76552b] bg-[#2b2118] text-[9px] font-bold text-[#ffb35d] hover:bg-[#e88724] hover:text-black active:scale-[0.98] cursor-pointer" title="Open Gemini and World Labs API key settings">API Keys</button>
          <span className="text-[10px] text-[#e88724] font-mono px-1 py-0.5 bg-[#252525] rounded-[2px] border border-[#444]">
            {aiSettings?.geminiModel || settingsGeminiModel || 'Gemini 3.8 Flash'}
          </span>
        </div>
      </div>

      {/* Sub Tabs - Responsive flex-wrap / horizontal scroll */}
      <div className="min-h-7 bg-[#292929] border-b border-[#222] flex items-center px-1 py-1 gap-1 flex-wrap flex-shrink-0">
        <button
          onClick={() => setActiveTab('input')}
          className={`px-2 py-0.5 text-[10.5px] rounded-[2px] font-medium transition-colors cursor-pointer flex items-center space-x-1 ${
            activeTab === 'input' ? 'bg-[#e88724] text-black font-bold shadow-sm' : 'text-[#bbb] hover:bg-[#3d3d3d] hover:text-white'
          }`}
          title="Survey Input Images & Distance Tags"
        >
          <Camera className="w-3 h-3" />
          <span>Input</span>
          <span className={`text-[9px] px-1 rounded-full font-mono ${activeTab === 'input' ? 'bg-black text-[#e88724]' : 'bg-[#444] text-[#aaa]'}`}>
            {images.length}
          </span>
        </button>
        <button
          onClick={() => {
            const val = validateSurvey();
            if (!val.valid) {
              onStatusChange({
                type: 'error',
                message: val.error || 'Validation error in survey inputs.',
                timestamp: new Date().toLocaleTimeString(),
              });
            } else {
              setActiveTab('preview');
            }
          }}
          className={`px-2 py-0.5 text-[10.5px] rounded-[2px] font-medium transition-colors cursor-pointer flex items-center space-x-1 ${
            activeTab === 'preview' ? 'bg-[#e88724] text-black font-bold shadow-sm' : 'text-[#bbb] hover:bg-[#3d3d3d] hover:text-white'
          }`}
          title="Preview and Validate Survey Parameters"
        >
          <CheckCircle2 className="w-3 h-3" />
          <span>Confirm</span>
        </button>
        <button
          onClick={() => setActiveTab('analysis')}
          className={`px-2 py-0.5 text-[10.5px] rounded-[2px] font-medium transition-colors cursor-pointer flex items-center space-x-1 ${
            activeTab === 'analysis' ? 'bg-[#e88724] text-black font-bold shadow-sm' : 'text-[#bbb] hover:bg-[#3d3d3d] hover:text-white'
          }`}
          title="3D Photogrammetry & Geological Analysis"
        >
          <BarChart2 className="w-3 h-3" />
          <span>3D Analysis</span>
          {analysisResult && <Check className="w-3 h-3 text-[#55dd88]" />}
        </button>
        <button
          onClick={() => setActiveTab('records')}
          className={`px-2 py-0.5 text-[10.5px] rounded-[2px] font-medium transition-colors cursor-pointer flex items-center space-x-1 ${
            activeTab === 'records' ? 'bg-[#e88724] text-black font-bold shadow-sm' : 'text-[#bbb] hover:bg-[#3d3d3d] hover:text-white'
          }`}
          title="Saved Survey History & Records"
        >
          <Folder className="w-3 h-3" />
          <span>History</span>
          <span className={`text-[9px] px-1 rounded-full font-mono ${activeTab === 'records' ? 'bg-black text-[#e88724]' : 'bg-[#444] text-[#aaa]'}`}>
            {records.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('reconstruct')}
          className={`px-2 py-0.5 text-[10.5px] rounded-[2px] font-medium transition-colors cursor-pointer flex items-center space-x-1 ${
            activeTab === 'reconstruct' ? 'bg-[#e88724] text-black font-bold shadow-sm' : 'text-[#bbb] hover:bg-[#3d3d3d] hover:text-white'
          }`}
          title="Reconstruct 3D Scenes from Photo References with AI"
        >
          <Sparkles className="w-3 h-3 text-[#e88724]" />
          <span>AI 3D Scene</span>
        </button>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2.5">
        {/* TAB 1: INPUT & TAGS */}
        {activeTab === 'input' && (
          <div className="space-y-2.5">
            {/* Action Bar */}
            <div className="flex items-center justify-between bg-[#383838] p-1.5 rounded-[2px] border border-[#242424] flex-wrap gap-1">
              <div className="flex items-center space-x-1.5 flex-wrap gap-1">
                <label className="px-2 py-1 bg-[#444] hover:bg-[#505050] text-[#f0f0f0] rounded-[2px] cursor-pointer border border-[#555] active:bg-[#333] flex items-center space-x-1 text-[10.5px]">
                  <Upload className="w-3 h-3" />
                  <span>Upload Images</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleAddCustomImage}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={() => {
                    const samples = getDefaultSampleSurveyImages();
                    setImages(samples);
                    setSelectedImageIndex(0);
                    onStatusChange({
                      type: 'success',
                      message: 'Loaded geological borehole & tunnel survey sample set (ST-01, ST-02, ST-03).',
                      timestamp: new Date().toLocaleTimeString(),
                    });
                  }}
                  className="px-2 py-1 bg-[#333] hover:bg-[#444] text-[#e88724] rounded-[2px] border border-[#484848] text-[10.5px] flex items-center space-x-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Sample Set</span>
                </button>
              </div>

              <div className="text-[10.5px] text-[#aaa]">
                Total Drift Span: <span className="text-[#e88724] font-bold">{totalBaselineDistance.toFixed(2)} m</span>
              </div>
            </div>

            {/* Thumbnail Strip with Sequence & Distance Tags */}
            <div className="space-y-1">
              <span className="text-[10px] text-[#999] uppercase font-semibold tracking-wider">
                Survey Frame Sequence & Distance Tags
              </span>
              <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 bg-[#242424] p-1.5 rounded-[2px] border border-[#1e1e1e]">
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    onClick={() => setSelectedImageIndex(idx)}
                    className={`flex-shrink-0 w-28 bg-[#323232] rounded-[2px] border p-1 cursor-pointer transition-all ${
                      selectedImageIndex === idx
                        ? 'border-[#e88724] ring-1 ring-[#e88724]'
                        : 'border-[#3f3f3f] hover:border-[#666]'
                    }`}
                  >
                    <div className="w-full h-16 bg-[#1a1a1a] rounded-[1px] overflow-hidden relative mb-1">
                      <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
                      <span className="absolute top-0.5 left-0.5 bg-black/80 text-[9px] px-1 py-0.2 rounded text-[#00e5ff] font-mono">
                        #{idx + 1}
                      </span>
                    </div>

                    <div className="text-[10px] truncate text-[#ddd] font-medium">{img.stationId}</div>

                    <div className="flex items-center justify-between mt-0.5 text-[9.5px]">
                      <span className="text-[#888]">Dist:</span>
                      <span className="font-bold text-[#e88724]">
                        {idx === 0 ? '0.0m (Start)' : `+${img.distanceFromLast}m`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Selected Image Tagging Editor */}
            {selectedImg && (
              <div className="bg-[#353535] p-2 rounded-[2px] border border-[#262626] space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-[#444]">
                  <span className="font-bold text-[#f0f0f0]">
                    Frame #{selectedImageIndex + 1}: {selectedImg.name}
                  </span>
                  <button
                    onClick={() => handleRemoveImage(selectedImageIndex)}
                    title="Remove Image"
                    className="text-[#f87171] hover:text-white hover:bg-[#802020] px-1.5 py-0.5 rounded text-[10px] cursor-pointer"
                  >
                    Delete Frame
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                  {/* Distance from last image (KEY REQUIREMENT!) */}
                  <div className="col-span-2 bg-[#2a2a2a] p-1.5 rounded-[2px] border border-[#e88724]/40 flex items-center justify-between">
                    <div>
                      <span className="text-[#e88724] font-bold uppercase text-[10px] tracking-wide block">
                        Distance From Last Image (Baseline Offset)
                      </span>
                      <span className="text-[9.5px] text-[#888]">
                        Linear meter distance from prior camera position
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        disabled={selectedImageIndex === 0}
                        value={selectedImageIndex === 0 ? 0 : selectedImg.distanceFromLast}
                        onChange={(e) =>
                          handleUpdateImageTag(
                            selectedImageIndex,
                            'distanceFromLast',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className={`w-20 bg-[#1e1e1e] border text-center font-mono font-bold text-[12px] px-1 py-0.5 rounded-[2px] ${
                          selectedImageIndex === 0
                            ? 'text-[#888] border-[#333]'
                            : 'text-[#e88724] border-[#e88724] focus:outline-none'
                        }`}
                      />
                      <span className="text-[#aaa] font-bold">m</span>
                    </div>
                  </div>

                  {/* Station ID */}
                  <div>
                    <label className="text-[#888] block text-[9.5px]">Station Identifier</label>
                    <input
                      type="text"
                      value={selectedImg.stationId}
                      onChange={(e) => handleUpdateImageTag(selectedImageIndex, 'stationId', e.target.value)}
                      className="w-full bg-[#242424] border border-[#444] px-1.5 py-0.5 rounded-[2px] text-[#eee] font-mono"
                    />
                  </div>

                  {/* Subsurface Depth RL */}
                  <div>
                    <label className="text-[#888] block text-[9.5px]">Subsurface Depth (m RL)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={selectedImg.depthBelowSurface}
                      onChange={(e) =>
                        handleUpdateImageTag(selectedImageIndex, 'depthBelowSurface', parseFloat(e.target.value) || 0)
                      }
                      className="w-full bg-[#242424] border border-[#444] px-1.5 py-0.5 rounded-[2px] text-[#eee] font-mono"
                    />
                  </div>

                  {/* Compass Heading Azimuth */}
                  <div>
                    <label className="text-[#888] block text-[9.5px]">Compass Azimuth (°)</label>
                    <input
                      type="number"
                      min="0"
                      max="360"
                      value={selectedImg.headingAzimuth}
                      onChange={(e) =>
                        handleUpdateImageTag(selectedImageIndex, 'headingAzimuth', parseInt(e.target.value, 10) || 0)
                      }
                      className="w-full bg-[#242424] border border-[#444] px-1.5 py-0.5 rounded-[2px] text-[#eee] font-mono"
                    />
                  </div>

                  {/* Camera Pitch */}
                  <div>
                    <label className="text-[#888] block text-[9.5px]">Camera Pitch (°)</label>
                    <input
                      type="number"
                      min="-90"
                      max="90"
                      value={selectedImg.pitchAngle}
                      onChange={(e) =>
                        handleUpdateImageTag(selectedImageIndex, 'pitchAngle', parseInt(e.target.value, 10) || 0)
                      }
                      className="w-full bg-[#242424] border border-[#444] px-1.5 py-0.5 rounded-[2px] text-[#eee] font-mono"
                    />
                  </div>

                  {/* Rock Strata Selector */}
                  <div className="col-span-2">
                    <label className="text-[#888] block text-[9.5px]">Geological Rock Strata</label>
                    <select
                      value={selectedImg.rockStrata}
                      onChange={(e) => handleUpdateImageTag(selectedImageIndex, 'rockStrata', e.target.value)}
                      className="w-full bg-[#242424] border border-[#444] px-1.5 py-0.5 rounded-[2px] text-[#eee]"
                    >
                      <option value="Auriferous Quartzite Seam">Auriferous Quartzite Seam (Gold-bearing)</option>
                      <option value="Granodiorite Footwall">Granodiorite Footwall (Competent Granite)</option>
                      <option value="Pyrite-Silica Breccia Contact">Pyrite-Silica Breccia Contact (Sulfide zone)</option>
                      <option value="Sedimentary Cavern Granite">Sedimentary Cavern Granite / Strata</option>
                      <option value="Siliceous Shale & Fault Gouge">Siliceous Shale & Fault Gouge (Sheared)</option>
                    </select>
                  </div>

                  {/* RQD % and Fracture Spacing */}
                  <div>
                    <label className="text-[#888] block text-[9.5px]">RQD (Rock Quality %)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={selectedImg.rqdPercent}
                      onChange={(e) =>
                        handleUpdateImageTag(selectedImageIndex, 'rqdPercent', parseInt(e.target.value, 10) || 0)
                      }
                      className="w-full bg-[#242424] border border-[#444] px-1.5 py-0.5 rounded-[2px] text-[#eee] font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[#888] block text-[9.5px]">Joint Fracture Spacing (cm)</label>
                    <input
                      type="number"
                      min="1"
                      value={selectedImg.fractureSpacingCm}
                      onChange={(e) =>
                        handleUpdateImageTag(selectedImageIndex, 'fractureSpacingCm', parseInt(e.target.value, 10) || 0)
                      }
                      className="w-full bg-[#242424] border border-[#444] px-1.5 py-0.5 rounded-[2px] text-[#eee] font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Photogrammetric Constants */}
            <div className="bg-[#353535] p-2 rounded-[2px] border border-[#262626] space-y-1.5">
              <span className="font-bold text-[#f0f0f0] block text-[10.5px]">
                Photogrammetry Calibration Constants
              </span>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span className="text-[#888] block">Focal Length (mm)</span>
                  <input
                    type="number"
                    value={constants.sensorFocalLengthMm}
                    onChange={(e) =>
                      setConstants({ ...constants, sensorFocalLengthMm: parseFloat(e.target.value) || 35 })
                    }
                    className="w-full bg-[#242424] border border-[#444] px-1.5 py-0.5 rounded-[2px] text-[#eee] font-mono"
                  />
                </div>
                <div>
                  <span className="text-[#888] block">GSD (mm / px)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={constants.gsdMmPerPixel}
                    onChange={(e) =>
                      setConstants({ ...constants, gsdMmPerPixel: parseFloat(e.target.value) || 1.2 })
                    }
                    className="w-full bg-[#242424] border border-[#444] px-1.5 py-0.5 rounded-[2px] text-[#eee] font-mono"
                  />
                </div>
                <div>
                  <span className="text-[#888] block">Frame Overlap (%)</span>
                  <input
                    type="number"
                    value={constants.overlapPercentage}
                    onChange={(e) =>
                      setConstants({ ...constants, overlapPercentage: parseInt(e.target.value, 10) || 75 })
                    }
                    className="w-full bg-[#242424] border border-[#444] px-1.5 py-0.5 rounded-[2px] text-[#eee] font-mono"
                  />
                </div>
                <div>
                  <span className="text-[#888] block">Convergence Tol. (mm)</span>
                  <input
                    type="number"
                    step="0.5"
                    value={constants.convergenceToleranceMm}
                    onChange={(e) =>
                      setConstants({ ...constants, convergenceToleranceMm: parseFloat(e.target.value) || 5.0 })
                    }
                    className="w-full bg-[#242424] border border-[#444] px-1.5 py-0.5 rounded-[2px] text-[#eee] font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Field Notes & Instructions */}
            <div className="bg-[#353535] p-2 rounded-[2px] border border-[#262626] space-y-1">
              <span className="font-bold text-[#f0f0f0] block text-[10.5px]">
                Surveyor Notes & AI Instructions
              </span>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Special instructions for geological synthesis, fault orientation, or 3D mesh modification..."
                className="w-full bg-[#242424] border border-[#444] p-1.5 rounded-[2px] text-[#ddd] text-[10.5px] focus:outline-none focus:border-[#e88724]"
              />
            </div>

            {/* Validate & Proceed Button */}
            <button
              onClick={() => {
                const val = validateSurvey();
                if (!val.valid) {
                  onStatusChange({
                    type: 'error',
                    message: val.error || 'Validation error in survey inputs.',
                    timestamp: new Date().toLocaleTimeString(),
                  });
                } else {
                  setShowPreviewModal(true);
                }
              }}
              className="w-full py-1.5 bg-[#e88724] hover:bg-[#ff9933] text-black font-bold rounded-[2px] text-[11px] shadow transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <span>Review Survey & Proceed to Confirmation</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* TAB 2: PREVIEW & CONFIRM */}
        {(activeTab === 'preview' || showPreviewModal) && (
          <div className="space-y-3 bg-[#333] p-2.5 rounded-[2px] border border-[#444]">
            <div className="flex items-center justify-between pb-1.5 border-b border-[#444]">
              <span className="font-bold text-[#f0f0f0] text-[12px]">
                Pre-Execution Survey Validation & Confirmation
              </span>
              <span className="text-[10px] text-[#55dd88] font-bold flex items-center space-x-1">
                <Check className="w-3 h-3" />
                <span>Ready for {aiSettings?.geminiModel || settingsGeminiModel || 'Gemini 3.8 Flash'}</span>
              </span>
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-3 gap-2 bg-[#252525] p-2 rounded-[2px] border border-[#1e1e1e] text-center">
              <div>
                <span className="text-[#888] text-[9.5px] block">Survey Frames</span>
                <span className="text-[#00e5ff] font-mono text-[13px] font-bold">{images.length} Photos</span>
              </div>
              <div>
                <span className="text-[#888] text-[9.5px] block">Baseline Length</span>
                <span className="text-[#e88724] font-mono text-[13px] font-bold">{totalBaselineDistance.toFixed(2)} m</span>
              </div>
              <div>
                <span className="text-[#888] text-[9.5px] block">Average Spacing</span>
                <span className="text-[#55dd88] font-mono text-[13px] font-bold">
                  {(totalBaselineDistance / Math.max(1, images.length - 1)).toFixed(2)} m
                </span>
              </div>
            </div>

            {/* Validation Checklist */}
            <div className="space-y-1 text-[10px] text-[#ccc] bg-[#2a2a2a] p-2 rounded-[2px]">
              <div className="flex items-center space-x-1.5 text-[#55dd88]">
                <Check className="w-3.5 h-3.5 flex-shrink-0" />
                <span>All distance tags from previous images verified and calibrated.</span>
              </div>
              <div className="flex items-center space-x-1.5 text-[#55dd88]">
                <Check className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Photogrammetric focal length & GSD parameters confirmed.</span>
              </div>
              <div className="flex items-center space-x-1.5 text-[#55dd88]">
                <Check className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Rock strata & RQD classification tagged on every station.</span>
              </div>
            </div>

            {/* Frame Sequence Preview */}
            <div className="space-y-1">
              <span className="text-[10px] text-[#888] uppercase font-semibold">Survey Path Sequence</span>
              <div className="space-y-1">
                {images.map((img, idx) => (
                  <div key={img.id} className="flex items-center justify-between bg-[#282828] px-2 py-1 rounded-[1px] border border-[#383838]">
                    <div className="flex items-center space-x-2">
                      <span className="w-4 h-4 rounded-full bg-[#444] text-[#fff] text-[9px] flex items-center justify-center font-mono">
                        {idx + 1}
                      </span>
                      <span className="font-mono text-[#ddd]">{img.stationId}</span>
                      <span className="text-[#888] text-[9.5px]">({img.rockStrata})</span>
                    </div>
                    <div className="text-right font-mono">
                      <span className="text-[#e88724] font-bold">
                        {idx === 0 ? 'Baseline Origin' : `+${img.distanceFromLast} m`}
                      </span>
                      <span className="text-[#888] text-[9px] ml-2">Depth: -{img.depthBelowSurface}m</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Confirmation Buttons */}
            <div className="flex items-center space-x-2 pt-2 border-t border-[#444]">
              <button
                disabled={isProcessing}
                onClick={handleExecuteAI}
                aria-busy={isProcessing}
                className="flex-1 py-2 bg-[#e88724] hover:bg-[#ff9933] active:scale-[0.99] text-black font-black rounded-[2px] text-[11px] uppercase tracking-wide cursor-pointer disabled:opacity-50 disabled:cursor-wait shadow flex items-center justify-center space-x-1.5"
              >
                <span>{isProcessing ? `${aiSettings?.geminiModel || settingsGeminiModel || 'Gemini 3.8 Flash'} Processing...` : 'Confirm & Generate 3D Subsurface Mapping'}</span>
                {!isProcessing && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  setActiveTab('input');
                }}
                className="px-3 py-2 bg-[#444] hover:bg-[#555] text-white rounded-[2px] text-[11px]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: 3D ANALYSIS RESULTS */}
        {activeTab === 'analysis' && (
          <div className="space-y-2.5">
            {!analysisResult ? (
              <div className="bg-[#333] p-6 text-center rounded-[2px] border border-[#444] space-y-2">
                <Sparkles className="w-6 h-6 text-[#888] mx-auto" />
                <div className="font-bold text-[#eee]">No Survey Analysis Run Yet</div>
                <p className="text-[10px] text-[#888] max-w-xs mx-auto">
                  Tag survey images with inter-frame distances and execute {aiSettings?.geminiModel || settingsGeminiModel || 'Gemini 3.8 Flash'} to synthesize 3D drift geometry.
                </p>
                <button
                  onClick={() => setActiveTab('input')}
                  className="px-3 py-1 bg-[#e88724] text-black font-bold rounded-[2px] cursor-pointer"
                >
                  Go to Survey Input
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* Geological Summary Card */}
                <div className="bg-[#353535] p-2.5 rounded-[2px] border border-[#282828] space-y-1.5">
                  <div className="flex items-center justify-between pb-1 border-b border-[#444]">
                    <span className="font-bold text-[#00e5ff] text-[11.5px]">
                      {analysisResult.surveySummary.siteName}
                    </span>
                    <span className="px-1.5 py-0.2 bg-[#1c5530] text-[#55ff88] text-[9.5px] font-bold rounded">
                      {analysisResult.surveySummary.rockClass}
                    </span>
                  </div>
                  <p className="text-[#ccc] text-[10.5px] leading-relaxed">
                    {analysisResult.surveySummary.geotechnicalUnit}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-[10px] pt-1">
                    <div>
                      <span className="text-[#888]">Rock Mass Rating (RMR):</span>{' '}
                      <span className="text-[#e88724] font-bold">{analysisResult.surveySummary.rockMassRating} / 100</span>
                    </div>
                    <div>
                      <span className="text-[#888]">Fault Orientation:</span>{' '}
                      <span className="text-[#ddd] font-mono">{analysisResult.surveySummary.faultOrientation}</span>
                    </div>
                  </div>
                </div>

                {/* Measurements & Volumetrics */}
                <div className="bg-[#353535] p-2 rounded-[2px] border border-[#282828] space-y-1.5">
                  <span className="font-bold text-[#f0f0f0] block text-[10.5px]">
                    Subsurface 3D Dimensions & Volumetrics
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="bg-[#262626] p-1.5 rounded">
                      <span className="text-[#888] block">Total Drift Length</span>
                      <span className="text-[#e88724] font-bold font-mono text-[12px]">
                        {analysisResult.measurements.totalDriftLengthMeters} m
                      </span>
                    </div>
                    <div className="bg-[#262626] p-1.5 rounded">
                      <span className="text-[#888] block">Excavation Volume</span>
                      <span className="text-[#00e5ff] font-bold font-mono text-[12px]">
                        {analysisResult.measurements.volumetricExcavationM3} m³
                      </span>
                    </div>
                    <div className="bg-[#262626] p-1.5 rounded">
                      <span className="text-[#888] block">Drift Cross-Section</span>
                      <span className="text-[#ddd] font-mono">
                        {analysisResult.measurements.averageTunnelWidthMeters}m W × {analysisResult.measurements.averageTunnelHeightMeters}m H
                      </span>
                    </div>
                    <div className="bg-[#262626] p-1.5 rounded">
                      <span className="text-[#888] block">Convergence Deformation</span>
                      <span className="text-[#55dd88] font-mono font-bold">
                        {analysisResult.measurements.estimatedConvergenceMm} mm
                      </span>
                    </div>
                  </div>
                </div>

                {/* Gold Vein Seam Grade */}
                <div className="bg-[#353535] p-2 rounded-[2px] border border-[#e88724]/40 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#ffaa24] text-[10.5px] flex items-center space-x-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Mineralized Gold Vein Estimate</span>
                    </span>
                    <span className="text-[11px] font-bold text-[#ffaa24] bg-[#222] px-1.5 py-0.5 rounded border border-[#e88724]">
                      {analysisResult.goldVeinSeam.gradeEstimateGramsPerTonne} g/t Au
                    </span>
                  </div>
                  <p className="text-[10px] text-[#ccc]">
                    {analysisResult.goldVeinSeam.mineralizedZoneDescription}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-[#aaa]">
                    <span>Vein Thickness: <strong>{analysisResult.goldVeinSeam.averageVeinThicknessCm} cm</strong></span>
                    <span>Ore Tonnage: <strong>{analysisResult.goldVeinSeam.estimatedGoldOreTonnage} t</strong></span>
                  </div>
                </div>

                {/* Structural Safety Alerts */}
                {analysisResult.structuralAlerts?.length > 0 && (
                  <div className="bg-[#353535] p-2 rounded-[2px] border border-[#282828] space-y-1">
                    <span className="font-bold text-[#f87171] text-[10.5px] block">
                      Geotechnical Hazards & Ground Support
                    </span>
                    <ul className="space-y-1 text-[10px] text-[#ddd]">
                      {analysisResult.structuralAlerts.map((alert, aIdx) => (
                        <li key={aIdx} className="flex items-start space-x-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-[#f87171] mt-0.5 flex-shrink-0" />
                          <span>{alert}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Apply to 3D Viewport Action */}
                <div className="pt-1">
                  <button
                    onClick={() => {
                      if (onApply3DMarkers && analysisResult.meshGeneratedPoints) {
                        onApply3DMarkers(analysisResult.meshGeneratedPoints);
                        onStatusChange({
                          type: 'success',
                          message: `Applied ${analysisResult.meshGeneratedPoints.length} survey station markers to 3D mining tunnel complex.`,
                          timestamp: new Date().toLocaleTimeString(),
                        });
                      }
                    }}
                    className="w-full py-1.5 bg-[#4ea3e8] hover:bg-[#60b3f8] text-black font-bold rounded-[2px] text-[11px] transition-colors cursor-pointer flex items-center justify-center space-x-1.5"
                  >
                    <span>Sync Station Markers into 3D Viewport Complex</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: HISTORY & RECORDS */}
        {activeTab === 'records' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-[#3e3e3e]">
              <span className="font-bold text-[#eee] text-[11px]">Survey History Records ({records.length})</span>
              {records.length > 0 && (
                <button
                  onClick={() => {
                    if (window.confirm('Clear all saved survey history records?')) {
                      setRecords([]);
                      localStorage.removeItem('mining_site_ai_records');
                      onStatusChange({
                        type: 'success',
                        message: 'Cleared survey history records.',
                        timestamp: new Date().toLocaleTimeString(),
                      });
                    }
                  }}
                  className="text-[10px] text-[#f87171] hover:underline cursor-pointer"
                >
                  Clear All
                </button>
              )}
            </div>

            {records.length === 0 ? (
              <div className="text-center py-6 text-[#777] text-[10.5px]">
                No prior survey records saved yet. Process a survey to add entries here.
              </div>
            ) : (
              <div className="space-y-2">
                {records.map((rec) => (
                  <div key={rec.id} className="bg-[#353535] p-2 rounded-[2px] border border-[#262626] space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-mono text-[#00e5ff] font-medium">{rec.timestamp}</span>
                      <span className="text-[#e88724] font-bold">{rec.totalBaselineDistance} m span</span>
                    </div>
                    <div className="text-[10.5px] text-[#eee] font-medium flex items-center justify-between">
                      <span>{rec.result.surveySummary.siteName} - RMR {rec.result.surveySummary.rockMassRating}</span>
                      <span className="text-[#4ade80] text-[9.5px]">{rec.imagesCount} frames</span>
                    </div>
                    <p className="text-[9.5px] text-[#aaa] line-clamp-2 bg-[#282828] p-1 rounded-[2px]">{rec.notes}</p>
                    <div className="flex items-center justify-between pt-1 text-[10px] gap-1 flex-wrap">
                      <span className="text-[#ffaa24] font-bold">
                        {rec.result.goldVeinSeam.gradeEstimateGramsPerTonne} g/t Au
                      </span>
                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={() => {
                            const newNotes = window.prompt('Edit record notes:', rec.notes);
                            if (newNotes !== null) {
                              const updated = records.map((r) => (r.id === rec.id ? { ...r, notes: newNotes } : r));
                              setRecords(updated);
                              localStorage.setItem('mining_site_ai_records', JSON.stringify(updated));
                            }
                          }}
                          title="Edit record notes"
                          className="px-1.5 py-0.5 bg-[#444] hover:bg-[#555] text-[#ddd] rounded-[2px] text-[9.5px] cursor-pointer flex items-center space-x-1"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => {
                            const blob = new Blob([JSON.stringify(rec, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `survey_${rec.id}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          title="Export survey record JSON"
                          className="px-1.5 py-0.5 bg-[#444] hover:bg-[#555] text-[#ddd] rounded-[2px] text-[9.5px] cursor-pointer flex items-center space-x-1"
                        >
                          <Download className="w-3 h-3" />
                          <span>Export</span>
                        </button>
                        <button
                          onClick={() => {
                            setAnalysisResult(rec.result);
                            setActiveTab('analysis');
                            if (onApply3DMarkers && rec.result.meshGeneratedPoints) {
                              onApply3DMarkers(rec.result.meshGeneratedPoints);
                            }
                            onStatusChange({
                              type: 'success',
                              message: `Restored survey record from ${rec.timestamp}.`,
                              timestamp: new Date().toLocaleTimeString(),
                            });
                          }}
                          title="Load this record into active 3D analysis"
                          className="px-2 py-0.5 bg-[#e88724] hover:bg-[#ff9933] text-black font-bold rounded-[2px] text-[9.5px] cursor-pointer flex items-center space-x-1"
                        >
                          <span>Restore</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => {
                            const filtered = records.filter((r) => r.id !== rec.id);
                            setRecords(filtered);
                            localStorage.setItem('mining_site_ai_records', JSON.stringify(filtered));
                            onStatusChange({
                              type: 'idle',
                              message: 'Deleted survey record.',
                              timestamp: new Date().toLocaleTimeString(),
                            });
                          }}
                          title="Delete this record"
                          className="p-1 hover:bg-[#aa2222] text-[#f87171] hover:text-white rounded-[2px] text-[9.5px] cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: AI 3D SCENE RECONSTRUCTION FROM PHOTO REFERENCE */}
        {activeTab === 'reconstruct' && (
          <div className="space-y-3">
            {/* AI World Studio: provider selection, guarded inputs, and async result handling */}
            <div className="bg-[#242424] border border-[#4b3825] rounded-[3px] overflow-hidden shadow-lg">
              <div className="px-2.5 py-2 bg-gradient-to-r from-[#3a2b1d] to-[#292929] border-b border-[#5d4227] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded bg-[#e88724] text-black flex items-center justify-center shadow-inner">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-[#f6d2a7] text-[12px]">AI World Studio</div>
                    <div className="text-[9.5px] text-[#b7a28d]">Generate navigable worlds or survey meshes from your own references</div>
                  </div>
                </div>
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${worldProvider === 'gomera' || worldConfigured === true ? 'text-[#62e28a] bg-[#14271a] border-[#2b5934]' : 'text-[#e7b36e] bg-[#302417] border-[#604522]'}`}>
                  {worldProvider === 'gomera' ? 'GOMERA INDEPENDENT' : worldConfigured === true ? 'MARBLE CONNECTED' : worldConfigured === false ? 'MARBLE KEY REQUIRED' : 'CHECKING MARBLE'}
                </span>
              </div>

              <div className="p-2.5 space-y-2.5">
                <div id="provider-api-settings" className="bg-[#1d1d1d] border border-[#454545] rounded-[3px] overflow-hidden">
                  <button
                    onClick={() => setSettingsOpen((current) => !current)}
                    className="w-full px-2 py-1.5 flex items-center justify-between gap-2 text-left hover:bg-[#292929] cursor-pointer"
                  >
                    <span className="text-[10.5px] font-bold text-[#f0c18b]">Provider API keys &amp; model preferences</span>
                    <span className="text-[8.5px] font-mono text-[#999]">
                      {settingsLoading ? 'CHECKING…' : `Gemini ${aiSettings?.geminiConfigured ? 'READY' : 'NEEDS KEY'} · Marble ${aiSettings?.marbleConfigured ? 'READY' : 'NEEDS KEY'} · GOMERA READY`}
                    </span>
                  </button>
                  {settingsOpen && (
                    <div className="border-t border-[#3d3d3d] p-2 space-y-2">
                      {!authToken ? (
                        <div className="flex items-center justify-between gap-2 bg-[#302417] border border-[#604522] rounded p-1.5 text-[9.5px] text-[#e7b36e]">
                          <span>Sign in with Google to save your own provider keys and model preferences.</span>
                          <button onClick={onOpenAuth} className="shrink-0 px-2 py-1 bg-[#e88724] hover:bg-[#ff9933] text-black font-bold rounded cursor-pointer">Sign in</button>
                        </div>
                      ) : (
                        <>
                          <div className="text-[9px] text-[#9da9b0] leading-relaxed">Keys are encrypted on the server and never returned to the browser after saving. Leave a key blank to keep the saved value.</div>
                          <div className="flex items-start gap-1.5 bg-[#1b2429] border border-[#2d4854] rounded p-1.5 text-[9px] text-[#9fc0cc] leading-relaxed"><Info className="w-3 h-3 mt-0.5 flex-shrink-0" /><span>Provider requirements are separate: World Labs Marble needs only a Marble key; GOMERA X does not use Gemini or a Gemini key; MiningSight Compatible Reconstruction, map interpretation, and survey analysis require Gemini.</span></div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[8.5px] text-[#82909a]">
                            <span className="text-[#9da9b0]">API docs:</span>
                            <a href="https://docs.worldlabs.ai/api" target="_blank" rel="noreferrer" className="text-[#9bcaf0] hover:text-white hover:underline">World Labs Marble</a>
                            <a href="https://ai.google.dev/gemini-api/docs" target="_blank" rel="noreferrer" className="text-[#9bcaf0] hover:text-white hover:underline">Gemini</a>
                            <a href="https://docs.webodm.org/api/reference/" target="_blank" rel="noreferrer" className="text-[#9bcaf0] hover:text-white hover:underline">GOMERA / WebODM</a>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="text-[9.5px] text-[#999]">Gemini API key
                              <input type="password" value={settingsGeminiKey} onChange={(event) => setSettingsGeminiKey(event.target.value)} placeholder={aiSettings?.geminiConfigured ? 'Saved key · leave blank to keep' : 'Paste Gemini API key'} autoComplete="off" className="mt-0.5 w-full bg-[#171717] border border-[#414141] rounded px-1.5 py-1 text-[#eee] text-[10px] focus:outline-none focus:border-[#e88724]" />
                            </label>
                            <label className="text-[9.5px] text-[#999]">Gemini preferred model
                              <select value={settingsGeminiModel} onChange={(event) => setSettingsGeminiModel(event.target.value)} className="mt-0.5 w-full bg-[#171717] border border-[#414141] rounded px-1.5 py-1 text-[#eee] text-[10px] focus:outline-none focus:border-[#e88724]">
                                {geminiModelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                              </select>
                            </label>
                            <label className="text-[9.5px] text-[#999]">World Labs Marble API key
                              <input type="password" value={settingsMarbleKey} onChange={(event) => setSettingsMarbleKey(event.target.value)} placeholder={aiSettings?.marbleConfigured ? 'Saved key · leave blank to keep' : 'Paste Marble API key'} autoComplete="off" className="mt-0.5 w-full bg-[#171717] border border-[#414141] rounded px-1.5 py-1 text-[#eee] text-[10px] focus:outline-none focus:border-[#e88724]" />
                            </label>
                            <label className="text-[9.5px] text-[#999]">Marble preferred model
                              <select value={settingsMarbleModel} onChange={(event) => { setSettingsMarbleModel(event.target.value); setWorldModel(event.target.value); }} className="mt-0.5 w-full bg-[#171717] border border-[#414141] rounded px-1.5 py-1 text-[#eee] text-[10px] focus:outline-none focus:border-[#e88724]">
                                {marbleModelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                              </select>
                            </label>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[8.5px] text-[#777]">Provider usage is billed to the account behind each key.</span>
                            <button onClick={() => void saveAISettings()} disabled={settingsSaving || settingsLoading} aria-busy={settingsSaving} className="shrink-0 px-2.5 py-1.5 bg-[#e88724] hover:bg-[#ff9933] active:scale-[0.98] disabled:opacity-50 text-black font-bold rounded-[2px] cursor-pointer">{settingsSaving ? 'Saving…' : 'Save keys & preferences'}</button>
                          </div>
                          {settingsMessage && <div className="text-[9px] text-[#8ee5a0]">{settingsMessage}</div>}
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-[#1d1d1d] border border-[#454545] rounded-[3px] p-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-bold text-[#f0c18b]">Existing Marble worlds</div>
                      <div className="text-[8.5px] text-[#82909a]">Use the saved key to check your account and catch shareable public URLs.</div>
                    </div>
                    <button onClick={() => void loadMarbleWorlds()} disabled={marbleWorldsLoading || !authToken} aria-busy={marbleWorldsLoading} className="shrink-0 px-2 py-1 bg-[#303b33] hover:bg-[#415647] disabled:opacity-50 text-[#c8ead0] text-[9px] font-bold rounded-[2px] cursor-pointer">
                      {marbleWorldsLoading ? 'Checking…' : 'Load worlds'}
                    </button>
                  </div>
                  <label className="flex items-center gap-1 text-[8.5px] text-[#9da9b0] cursor-pointer">
                    <input type="checkbox" checked={marbleWorldsPublicOnly} onChange={(event) => setMarbleWorldsPublicOnly(event.target.checked)} className="accent-[#e88724]" />
                    public worlds only
                  </label>
                  {marbleWorldsMessage && <div className="text-[8.5px] text-[#9fc0cc]">{marbleWorldsMessage}</div>}
                  {marbleWorlds.length > 0 && <div className="max-h-36 overflow-y-auto space-y-1.5 pr-0.5">
                    {marbleWorlds.map((world) => {
                      const worldId = world.world_id || world.id || 'world';
                      const marbleUrl = world.world_marble_url || `https://marble.worldlabs.ai/world/${worldId}`;
                      return <div key={worldId} className="flex items-center gap-1.5 border border-[#343434] bg-[#171717] rounded p-1.5">
                        {world.assets?.thumbnail_url && <img src={world.assets.thumbnail_url} alt="" className="w-9 h-7 object-cover rounded border border-[#444]" />}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[9px] text-[#ddd]">{world.display_name || worldId}</div>
                          <div className="text-[8px] text-[#82909a]">{world.permission?.public ? 'PUBLIC' : 'PRIVATE'} · {world.model || 'Marble'}</div>
                        </div>
                        <a href={marbleUrl} target="_blank" rel="noreferrer" className="shrink-0 text-[8.5px] text-[#9bcaf0] hover:text-white hover:underline">Open URL</a>
                      </div>;
                    })}
                  </div>}
                </div>

                <div className="grid grid-cols-2 gap-1.5 bg-[#1c1c1c] p-1 rounded border border-[#353535]">
                  <button
                    onClick={() => setWorldProvider('marble')}
                    className={`px-2 py-2 rounded-[2px] text-left cursor-pointer transition-colors ${worldProvider === 'marble' ? 'bg-[#e88724] text-black shadow' : 'text-[#bbb] hover:bg-[#333]'}`}
                  >
                    <span className="flex items-center gap-1.5 font-bold text-[10.5px]"><Cloud className="w-3.5 h-3.5" /> World Labs Marble</span>
                    <span className={`block text-[9px] mt-0.5 ${worldProvider === 'marble' ? 'text-black/70' : 'text-[#777]'}`}>AI-generated navigable worlds</span>
                  </button>
                  <button
                    onClick={() => setWorldProvider('gomera')}
                    className={`px-2 py-2 rounded-[2px] text-left cursor-pointer transition-colors ${worldProvider === 'gomera' ? 'bg-[#e88724] text-black shadow' : 'text-[#bbb] hover:bg-[#333]'}`}
                  >
                    <span className="flex items-center gap-1.5 font-bold text-[10.5px]"><Server className="w-3.5 h-3.5" /> GOMERA X</span>
                    <span className={`block text-[9px] mt-0.5 ${worldProvider === 'gomera' ? 'text-black/70' : 'text-[#777]'}`}>Independent photogrammetry reconstruction · no Gemini</span>
                  </button>
                </div>

                {worldProvider === 'marble' ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      {(['text', 'image', 'multi-image'] as WorldMode[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setWorldMode(mode)}
                          className={`flex-1 py-1.5 rounded-[2px] border text-[10px] font-semibold cursor-pointer transition-colors ${worldMode === mode ? 'border-[#e88724] bg-[#513317] text-[#ffb35d]' : 'border-[#414141] bg-[#303030] text-[#aaa] hover:text-white'}`}
                        >
                          {mode === 'text' ? 'Text to World' : mode === 'image' ? 'Single Image' : 'Multi-Image'}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[9.5px] text-[#999]">World name (max 64)
                        <input value={worldDisplayName} maxLength={64} onChange={(event) => setWorldDisplayName(event.target.value)} className="mt-0.5 w-full bg-[#1c1c1c] border border-[#414141] rounded px-1.5 py-1 text-[#eee] text-[10.5px] focus:outline-none focus:border-[#e88724]" />
                      </label>
                      <label className="text-[9.5px] text-[#999]">Marble model
                        <select value={worldModel} onChange={(event) => setWorldModel(event.target.value)} className="mt-0.5 w-full bg-[#1c1c1c] border border-[#414141] rounded px-1.5 py-1 text-[#eee] text-[10.5px] focus:outline-none focus:border-[#e88724]">
                          {marbleModelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                    </div>
                  </>
                ) : (
                  <div className="space-y-1.5">
                    <label className="block text-[9.5px] text-[#999]">GOMERA capture name
                      <input value={gomeraCaptureName} maxLength={120} onChange={(event) => setGomeraCaptureName(event.target.value)} className="mt-0.5 w-full bg-[#1c1c1c] border border-[#414141] rounded px-1.5 py-1 text-[#eee] text-[10.5px] focus:outline-none focus:border-[#e88724]" />
                    </label>
                    <label className="block text-[9.5px] text-[#999]">GOMERA 3D generation upload path
                      <select value={gomeraUploadSource} onChange={(event) => setGomeraUploadSource(event.target.value as GomeraUploadSource)} className="mt-0.5 w-full bg-[#1c1c1c] border border-[#414141] rounded px-1.5 py-1 text-[#eee] text-[10px] focus:outline-none focus:border-[#e88724]">
                        <option value="gomera-file-manager">GOMERA file manager · chunked and retryable</option>
                        <option value="ai-panel">AI panel upload · one request</option>
                      </select>
                    </label>
                  </div>
                )}

                <div
                  onDragOver={(event) => { event.preventDefault(); setWorldDragActive(true); }}
                  onDragLeave={() => setWorldDragActive(false)}
                  onDrop={(event) => { event.preventDefault(); setWorldDragActive(false); void addWorldFiles(event.dataTransfer.files); }}
                  className={`rounded-[3px] border border-dashed p-2.5 transition-colors ${worldDragActive ? 'border-[#e88724] bg-[#3b2919]' : 'border-[#505050] bg-[#1c1c1c]'}`}
                >
                  <label className="flex flex-col items-center justify-center min-h-[68px] cursor-pointer">
                    <input type="file" multiple={worldProvider === 'gomera' || worldMode === 'multi-image'} accept="image/jpeg,image/png,image/webp" disabled={worldFilesLoading || worldGenerating} className="hidden" onChange={(event) => { if (event.target.files) void addWorldFiles(event.target.files); event.currentTarget.value = ''; }} />
                    {worldFilesLoading ? <Loader2 className="w-5 h-5 mb-1 animate-spin text-[#e88724]" /> : <ImagePlus className={`w-5 h-5 mb-1 ${worldDragActive ? 'text-[#ffb35d]' : 'text-[#e88724]'}`} />}
                    <span className="text-[10.5px] text-[#ddd] font-semibold">{worldFilesLoading ? 'Reading image files…' : 'Drop reference images here or click to browse'}</span>
                    <span className="text-[9px] text-[#888] mt-0.5">JPG, PNG, WebP · up to 100 MB each · {worldProvider === 'gomera' ? '1–337 images' : worldMode === 'text' ? 'optional for text mode' : worldMode === 'image' ? 'exactly 1 image' : `2–${worldReconstructImages ? 8 : 4} images`}</span>
                  </label>
                </div>

                {worldImages.length > 0 && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {worldImages.map((image, index) => (
                      <div key={image.id} className="flex items-center gap-1.5 bg-[#303030] border border-[#414141] rounded p-1.5 min-w-0">
                        <img src={image.dataUrl} alt={image.name} className="w-10 h-10 object-cover rounded border border-[#555] flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[9.5px] text-[#ddd] truncate" title={image.name}>{image.name}</div>
                          <div className="text-[8.5px] text-[#888]">{(image.size / 1024 / 1024).toFixed(1)} MB</div>
                          {worldProvider === 'marble' && worldMode === 'multi-image' && (
                            <label className="flex items-center gap-1 text-[8.5px] text-[#999] mt-0.5">Azimuth
                              <input type="number" min="-360" max="360" value={image.azimuth} onChange={(event) => setWorldImages((current) => current.map((item) => item.id === image.id ? { ...item, azimuth: Number(event.target.value) || 0 } : item))} className="w-12 bg-[#1b1b1b] border border-[#4b4b4b] rounded px-1 text-[#eee]" />°
                            </label>
                          )}
                        </div>
                        <button onClick={() => removeWorldImage(image.id)} className="p-1 text-[#999] hover:text-[#ff8c8c] cursor-pointer" title={`Remove ${image.name}`}><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}

                {worldProvider === 'marble' && (
                  <>
                    <label className="block text-[9.5px] text-[#999]">World description / reconstruction instructions
                      <textarea value={worldPrompt} maxLength={4000} onChange={(event) => setWorldPrompt(event.target.value)} rows={4} className="mt-0.5 w-full resize-y bg-[#1c1c1c] border border-[#414141] rounded px-1.5 py-1.5 text-[#ddd] text-[10.5px] leading-relaxed focus:outline-none focus:border-[#e88724]" placeholder="Describe the world, geometry, materials, lighting, and what must not appear…" />
                      <span className={`block text-right text-[8.5px] mt-0.5 ${worldPrompt.length > 3800 ? 'text-[#ffb35d]' : 'text-[#777]'}`}>{worldPrompt.length}/4000</span>
                    </label>
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[9px] text-[#aaa]">
                      {worldMode === 'multi-image' && <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={worldReconstructImages} onChange={(event) => setWorldReconstructImages(event.target.checked)} className="accent-[#e88724]" /> reconstruction mode (up to 8 images)</label>}
                      {worldMode === 'image' && <label className="flex items-center gap-1">Panorama <select value={worldIsPano} onChange={(event) => setWorldIsPano(event.target.value as 'auto' | 'true' | 'false')} className="bg-[#1c1c1c] border border-[#444] rounded px-1 py-0.5 text-[#ddd]"><option value="auto">Auto</option><option value="true">Yes</option><option value="false">No</option></select></label>}
                      <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={worldDisableRecaption} onChange={(event) => setWorldDisableRecaption(event.target.checked)} className="accent-[#e88724]" /> keep prompt literal</label>
                    </div>
                    <div className="flex items-start gap-1.5 bg-[#1b2429] border border-[#2d4854] rounded p-1.5 text-[9px] text-[#9fc0cc] leading-relaxed"><Info className="w-3 h-3 mt-0.5 flex-shrink-0" /><span>Marble accepts JPG, PNG, and WebP. Text mode needs a prompt; single-image mode needs 1 image; multi-image needs 2–4, or 2–8 with reconstruction mode. World Labs does not publish a text maximum in the current schema; MiningSight applies a 4,000-character guardrail.</span></div>
                  </>
                )}

                {worldProvider === 'gomera' && <div className="flex items-start gap-1.5 bg-[#1b2429] border border-[#2d4854] rounded p-1.5 text-[9px] text-[#9fc0cc] leading-relaxed"><Info className="w-3 h-3 mt-0.5 flex-shrink-0" /><span>{gomeraUploadSource === 'gomera-file-manager' ? 'GOMERA is independent of Gemini. This uses the same chunked GOMERA 3D-generation file-manager API as the companion viewer. Each image is sent in 512 KB parts with automatic retries, then submitted to WebODM. Google sign-in is used only to protect the user upload session.' : 'GOMERA is independent of Gemini. This sends the selected images directly through the GOMERA 3D-generation API; no Gemini key is checked. Use the chunked file-manager path for larger or less reliable uploads.'}</span></div>}

                {worldError && <div className="flex items-start justify-between gap-2 bg-[#321d1d] border border-[#713333] text-[#ffb0b0] rounded p-1.5 text-[9.5px]"><div className="flex items-start gap-1.5 min-w-0"><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /><span>{worldError}</span></div>{/key|sign in/i.test(worldError) && <button onClick={() => /sign in/i.test(worldError) && !authToken ? onOpenAuth?.() : openProviderSettings()} className="shrink-0 rounded-[2px] bg-[#e88724] px-1.5 py-1 text-[8.5px] font-bold text-black hover:bg-[#ff9933] active:scale-[0.98] cursor-pointer">{/sign in/i.test(worldError) && !authToken ? 'Sign in' : 'Open API keys'}</button>}</div>}

                {worldGenerating && <div className="space-y-1"><div className="flex items-center justify-between text-[9.5px] text-[#bbb]"><span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin text-[#e88724]" />{worldStatus}</span><span className="font-mono text-[#e88724]">{worldProgress}%</span></div><div className="h-1.5 bg-[#171717] rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-[#b85d17] to-[#ffb04d] transition-all" style={{ width: `${worldProgress}%` }} /></div></div>}

                <div className="flex items-center gap-2">
                  <button onClick={handleWorldGenerate} disabled={worldGenerating || worldFilesLoading} aria-busy={worldGenerating} className="flex-1 py-2 bg-[#e88724] hover:bg-[#ff9933] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-[2px] flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-colors">
                    {worldGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : worldProvider === 'marble' ? <Cloud className="w-3.5 h-3.5" /> : <Server className="w-3.5 h-3.5" />}
                    <span>{worldGenerating ? 'Generating…' : worldProvider === 'marble' ? 'Generate Marble World' : 'Start GOMERA Reconstruction'}</span>
                  </button>
                  {worldProvider === 'marble' && worldCredits !== null && <span className="text-[9px] text-[#999] whitespace-nowrap">Credits: <span className="text-[#e88724] font-mono">{worldCredits}</span></span>}
                </div>
                {worldProvider === 'marble' && worldConfigured === false && <div className="text-[9px] text-[#caa37a]">{authToken ? 'Save a World Labs Marble API key in Provider settings before generating.' : 'Sign in with Google, then save a World Labs Marble API key in Provider settings.'}</div>}
                {!worldGenerating && worldStatus !== 'Ready to generate a world.' && <div className="text-[9px] text-[#888]">{worldStatus}</div>}
              </div>
            </div>

            {worldResult?.provider === 'marble' && (() => {
              const world = worldResult.world || {};
              const marbleUrl = world.world_marble_url || world.marble_url || world.world_url;
              const thumbnail = world.assets?.thumbnail_url || world.thumbnail_url;
              const spzUrls = world.assets?.splats?.spz_urls || {};
              return <div className="bg-[#1f2620] border border-[#2e4d35] p-2.5 rounded-[3px] space-y-2 text-[10px]">
                <div className="flex items-center justify-between text-[#4ade80] font-bold"><span>Marble world ready</span><span className="font-mono text-[9px] text-[#88bbdd]">{world.world_id || world.id || 'World Labs'}</span></div>
                {thumbnail && <img src={thumbnail} alt="Generated Marble world thumbnail" className="w-full max-h-40 object-cover rounded border border-[#315438]" />}
                <div className="grid grid-cols-2 gap-1.5">
                  {marbleUrl && <a href={marbleUrl} target="_blank" rel="noreferrer" className="px-2 py-1.5 bg-[#315438] hover:bg-[#3d6847] text-[#b7f7c4] rounded flex items-center justify-center gap-1 font-semibold"><ExternalLink className="w-3 h-3" /> Open Marble World</a>}
                  {spzUrls.full_res && <a href={spzUrls.full_res} target="_blank" rel="noreferrer" className="px-2 py-1.5 bg-[#303b33] hover:bg-[#415647] text-[#c8ead0] rounded flex items-center justify-center gap-1"><Download className="w-3 h-3" /> Full-res SPZ</a>}
                </div>
              </div>;
            })()}

            {worldResult?.provider === 'gomera' && <div className="bg-[#1f2620] border border-[#2e4d35] p-2.5 rounded-[3px] space-y-2 text-[10px]"><div className="flex items-center justify-between text-[#4ade80] font-bold"><span>GOMERA model ready</span><span className="font-mono text-[9px] text-[#88bbdd]">Job {worldResult.jobId}</span></div><a href={worldResult.modelUrl} className="w-full px-2 py-1.5 bg-[#315438] hover:bg-[#3d6847] text-[#b7f7c4] rounded flex items-center justify-center gap-1 font-semibold"><Download className="w-3 h-3" /> Download reconstructed GLB</a></div>}

            <div className="bg-[#242424] border border-[#383838] p-2.5 rounded-[3px] space-y-2">
              <div className="flex items-center justify-between border-b border-[#333] pb-1.5">
                <span className="font-bold text-[#e88724] flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>MiningSight Compatible Scene Builder (Gemini / local rig)</span>
                </span>
                <span className="text-[9.5px] font-mono text-[#4ade80] bg-[#1a2e1f] px-1.5 py-0.5 rounded border border-[#2b5934]">
                  Active Photo Rig
                </span>
              </div>
              <p className="text-[#aaa] text-[10.5px] leading-relaxed">
                Transform real underground survey photographs into interactive, physically-scaled 3D procedural scenes with structural shoring sets, lagging retention planks, and geological adit headings.
              </p>
            </div>

            {/* MiningSight-compatible reconstruction brief: preserved alongside the archived survey milestone. */}
            <div className="bg-[#252525] border border-[#4b3825] p-2.5 rounded-[3px] space-y-2.5">
              <div className="flex items-start justify-between gap-2 border-b border-[#3d3d3d] pb-1.5">
                <div>
                  <div className="font-bold text-[#f6d2a7] text-[11.5px]">MiningSight Compatible Reconstruction</div>
                  <div className="text-[9.5px] text-[#999] mt-0.5">Make a new mesh part, extend the current scene, or rebuild a complete selectable procedural model.</div>
                </div>
                <span className="shrink-0 rounded border border-[#315438] bg-[#1a2e1f] px-1.5 py-0.5 text-[8.5px] font-mono text-[#72e28e]">GEMINI REQUIRED</span>
              </div>

              <div className="grid grid-cols-3 gap-1">
                {([
                  ['extend-current', 'Extend current'],
                  ['new-part', 'Build next part'],
                  ['rebuild-scene', 'Rebuild scene'],
                ] as Array<[ReconstructionBrief['targetMode'], string]>).map(([mode, label]) => (
                  <button key={mode} onClick={() => setReconstructTargetMode(mode)} className={`rounded border px-1.5 py-1.5 text-[9.5px] font-semibold cursor-pointer ${reconstructTargetMode === mode ? 'border-[#e88724] bg-[#513317] text-[#ffb35d]' : 'border-[#414141] bg-[#303030] text-[#aaa] hover:text-white'}`}>
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 text-[9.5px]">
                <label className="text-[#999]">Base scene / model
                  <select value={reconstructBasePresetId} onChange={(event) => setReconstructBasePresetId(event.target.value)} className="mt-0.5 w-full bg-[#1c1c1c] border border-[#414141] rounded px-1.5 py-1 text-[#eee] text-[10px]">
                    <option value="rugged_timbered_photo">Rugged Timbered Mine Tunnel</option>
                    <option value="classic_diorama">Classic Diorama Mining Tunnel</option>
                    <option value="ai_custom">Current AI custom scene</option>
                  </select>
                </label>
                <div className="rounded border border-[#414141] bg-[#1c1c1c] px-1.5 py-1 text-[9px] text-[#999]">
                  <span className="block">Current selection</span>
                  <span className="mt-0.5 block truncate text-[#e88724]" title={selectedObjectName || activeAssetName || 'Nothing selected'}>{selectedObjectName || activeAssetName || 'Nothing selected'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label
                  onDragOver={(event) => { event.preventDefault(); setMapDropActive(true); }}
                  onDragLeave={() => setMapDropActive(false)}
                  onDrop={handleMapDrop}
                  className={`rounded border border-dashed p-2 text-center cursor-pointer transition-colors ${mapDropActive ? 'border-[#e88724] bg-[#3b2918]' : 'border-[#505050] bg-[#1c1c1c] hover:border-[#e88724]'}`}
                >
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={reconstructReferenceLoading || isReconstructing} onChange={(event) => { void handleReconstructionReference(event.target.files?.[0]); event.currentTarget.value = ''; }} />
                  <ImagePlus className="mx-auto mb-1 h-4 w-4 text-[#e88724]" />
                  <span className="block truncate text-[9.5px] text-[#ddd]">{reconstructReferenceLoading ? 'Reading screenshot…' : reconstructImageName}</span>
                  <span className="mt-0.5 block text-[8.5px] text-[#888]">Replace reference screenshot</span>
                </label>
                <label className="rounded border border-dashed border-[#505050] bg-[#1c1c1c] p-2 text-center cursor-pointer hover:border-[#e88724]">
                  <input type="file" accept="image/jpeg,image/png,image/webp,.json,.geojson,.csv,.txt,.md,.yaml,.yml,text/plain,application/json" className="hidden" disabled={reconstructMapLoading || isReconstructing || mapInterpreting} onChange={(event) => { void handleReconstructionMap(event.target.files?.[0]); event.currentTarget.value = ''; }} />
                  <Upload className="mx-auto mb-1 h-4 w-4 text-[#e88724]" />
                  <span className="block truncate text-[9.5px] text-[#ddd]">{mapDropActive ? 'Drop map here' : reconstructMapName || 'Attach map image or data'}</span>
                  <span className="mt-0.5 block text-[8.5px] text-[#888]">Drag/drop image, JSON, GeoJSON, CSV, TXT · {reconstructMapImage || reconstructMapText ? 'ready to interpret' : 'required for extensions'}</span>
                </label>
              </div>

              <div className="grid grid-cols-4 gap-1.5 text-[9px]">
                <label className="text-[#999] col-span-1">Next part offset (m)
                  <input type="number" min="0.01" step="0.1" value={nextPartDistanceMeters} onChange={(event) => setNextPartDistanceMeters(Number(event.target.value) || 0)} className="mt-0.5 w-full bg-[#1c1c1c] border border-[#e88724]/60 rounded px-1.5 py-1 text-[#eee] font-mono" />
                </label>
                <label className="text-[#999]">Width (m)
                  <input type="number" min="0.1" step="0.1" value={partWidthMeters} onChange={(event) => setPartWidthMeters(Number(event.target.value) || 0)} className="mt-0.5 w-full bg-[#1c1c1c] border border-[#414141] rounded px-1.5 py-1 text-[#eee] font-mono" />
                </label>
                <label className="text-[#999]">Height (m)
                  <input type="number" min="0.1" step="0.1" value={partHeightMeters} onChange={(event) => setPartHeightMeters(Number(event.target.value) || 0)} className="mt-0.5 w-full bg-[#1c1c1c] border border-[#414141] rounded px-1.5 py-1 text-[#eee] font-mono" />
                </label>
                <label className="text-[#999]">Length (m)
                  <input type="number" min="0.1" step="0.1" value={partLengthMeters} onChange={(event) => setPartLengthMeters(Number(event.target.value) || 0)} className="mt-0.5 w-full bg-[#1c1c1c] border border-[#414141] rounded px-1.5 py-1 text-[#eee] font-mono" />
                </label>
              </div>

              <textarea value={reconstructMapText} onChange={(event) => setReconstructMapText(event.target.value)} rows={3} maxLength={120000} placeholder="Paste a readable map or section here: station IDs, chainages, distances, width/height, curve radius, heading, and the next part location…" className="w-full resize-y bg-[#1c1c1c] border border-[#414141] rounded px-1.5 py-1.5 text-[10px] text-[#ddd] leading-relaxed focus:outline-none focus:border-[#e88724]" />

              <div className="flex flex-wrap items-center gap-1.5 rounded border border-[#3f3427] bg-[#211d18] px-2 py-1.5 text-[9px]">
                <span className="mr-auto text-[#cbb79d]">{mapGeometry?.points.length ? `Map overlay ready · ${mapGeometry.points.length} points` : 'Empty map · add a file, describe it, or draw it manually.'}</span>
                <button onClick={interpretReconstructionMap} disabled={mapInterpreting || isReconstructing || (!reconstructMapImage && !reconstructMapText.trim())} className="rounded border border-[#e88724] bg-[#e88724] px-2 py-1 font-bold text-black disabled:cursor-wait disabled:opacity-50 cursor-pointer">
                  {mapInterpreting ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Reading map…</span> : 'Interpret map with Gemini'}
                </button>
                <button onClick={() => { onMapDrawingChange?.(false); onMapMarkingChange?.(!mapMarkingEnabled); }} disabled={!mapGeometry || mapInterpreting || mapDrawingMode} className={`rounded border px-2 py-1 font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${mapMarkingEnabled && !mapDrawingMode ? 'border-[#55dd88] bg-[#214a31] text-[#a8f2bb]' : 'border-[#555] bg-[#303030] text-[#ddd]'}`}>
                  {mapMarkingEnabled ? 'Finish next-section pick' : 'Pick next section'}
                </button>
                <button onClick={() => { const next = !mapDrawingMode; onMapDrawingChange?.(next); onMapMarkingChange?.(next); }} disabled={!mapGeometry || mapInterpreting} className={`rounded border px-2 py-1 font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${mapDrawingMode ? 'border-[#4ea3e8] bg-[#203b53] text-[#a7d8ff]' : 'border-[#555] bg-[#303030] text-[#ddd]'}`}>
                  {mapDrawingMode ? 'Finish manual drawing' : 'Draw map manually'}
                </button>
                {mapSelection?.start && <span className="text-[#8ee8a5]">Start set</span>}
                {mapSelection?.end && <span className="text-[#ff9d9d]">End set</span>}
                {mapSelection?.featureLabel && <span className="w-full basis-full truncate text-[#ffb35d]">Next section: {mapSelection.featureLabel}</span>}
              </div>

              <div className="flex items-center justify-between gap-2 text-[9px]">
                <span className="text-[#999]">{reconstructTargetMode === 'rebuild-scene' ? 'Map is optional for a complete rebuild.' : 'A map and positive next-part offset are required to extend or add a part.'}</span>
                <button onClick={saveReconstructionBrief} className="shrink-0 rounded border border-[#555] bg-[#3a3a3a] px-2 py-1 font-semibold text-[#ddd] hover:bg-[#e88724] hover:text-black cursor-pointer">{briefSavedMessage || 'Save brief'}</button>
              </div>

            </div>

            {/* Reference Image Card */}
            <div className="bg-[#252525] border border-[#3a3a3a] p-2.5 rounded-[3px] space-y-2">
              <div className="font-semibold text-white flex items-center justify-between">
                <span>Reference Photograph</span>
                <span className="text-[9.5px] text-[#888] font-mono truncate max-w-[55%]" title={reconstructImageName}>{reconstructImageName}</span>
              </div>

              <div className="relative rounded overflow-hidden border border-[#444] bg-[#181818] flex items-center justify-center max-h-[160px]">
                <img
                  src={reconstructImage}
                  alt="Reference Mine Tunnel"
                  className="max-h-[160px] object-contain select-none"
                />
                <div className="absolute top-1.5 left-1.5 bg-black/80 text-[#e88724] font-mono text-[9px] px-1.5 py-0.5 rounded border border-[#444]">
                  4-Tier Side Lagging • Inward Batter • Adit Bore
                </div>
              </div>

              {/* Field Notes / AI Prompt */}
              <div>
                <label className="block text-[10px] text-[#888] mb-1 font-semibold">
                  Field Notes & Structural Reconstruction Instructions:
                </label>
                <textarea
                  value={reconstructPrompt}
                  onChange={(e) => setReconstructPrompt(e.target.value)}
                  rows={2}
                  className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded p-1.5 text-[10.5px] text-[#ddd] focus:outline-none focus:border-[#e88724]"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 pt-1">
                <button
                  onClick={handleReconstructScene}
                  disabled={isReconstructing}
                  aria-busy={isReconstructing}
                  className="flex-1 py-1.5 bg-[#e88724] hover:bg-[#ff9933] active:scale-[0.99] disabled:opacity-50 disabled:cursor-wait text-black font-bold rounded-[2px] flex items-center justify-center space-x-1.5 cursor-pointer shadow-md transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isReconstructing ? 'Generating compatible reconstruction...' : 'Generate MiningSight-Compatible Reconstruction'}</span>
                </button>

                <button
                  onClick={() => {
                    if (onSelectPreset) {
                      onSelectPreset('rugged_timbered_photo');
                      onStatusChange({
                        type: 'success',
                        message: 'Loaded Rugged Timbered Drift (Photo Reference) into 3D Viewport!',
                        timestamp: new Date().toLocaleTimeString(),
                      });
                    }
                  }}
                  className="px-3 py-1.5 bg-[#3a3a3a] hover:bg-[#4a4a4a] text-white rounded-[2px] border border-[#505050] flex items-center space-x-1 cursor-pointer"
                  title="Directly load the pre-built reference photo model"
                >
                  <Check className="w-3.5 h-3.5 text-[#e88724]" />
                  <span>Load Photo Model</span>
                </button>
              </div>
            </div>

            {/* Reconstruct Result Preview */}
            {reconstructResult && (
              <div className="bg-[#1f2620] border border-[#2e4d35] p-2.5 rounded-[3px] space-y-2 text-[10.5px]">
                <div className="font-bold text-[#4ade80] flex items-center justify-between">
                  <span>MiningSight-Compatible Reconstruction Plan</span>
                  <span className="font-mono text-[9px] text-[#88bbdd]">AI Vision Extraction</span>
                </div>

                {reconstructResult.reconstructionPlan && <div className="rounded border border-[#2b4430] bg-[#181d19] px-2 py-1 text-[9.5px] leading-relaxed text-[#b8d9c0]">{reconstructResult.reconstructionPlan}</div>}

                <ul className="space-y-1 text-[#ccc] list-disc list-inside">
                  {reconstructResult.detectedFeatures?.map((f: string, i: number) => (
                    <li key={i} className="line-clamp-1">{f}</li>
                  ))}
                </ul>

                <div className="bg-[#181d19] p-2 rounded border border-[#2b4430] grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <span className="text-[#888]">Timber Sets:</span>{' '}
                    <span className="font-mono text-[#e88724]">{reconstructResult.procedural3DParams.timberSetCount} frames</span>
                  </div>
                  <div>
                    <span className="text-[#888]">Lagging Planks:</span>{' '}
                    <span className="font-mono text-[#e88724]">{reconstructResult.procedural3DParams.laggingPlankTiers} tiers/side</span>
                  </div>
                  <div>
                    <span className="text-[#888]">Batter Incline:</span>{' '}
                    <span className="font-mono text-[#e88724]">{reconstructResult.procedural3DParams.postBatterAngleDeg}° inward</span>
                  </div>
                  <div>
                    <span className="text-[#888]">Unlined Adit Bore:</span>{' '}
                    <span className="font-mono text-[#e88724]">{reconstructResult.procedural3DParams.unlinedAditLength}m depth</span>
                  </div>
                </div>

                {onApplyCustomScene && (
                  <button
                    onClick={() => {
                      onApplyCustomScene(reconstructResult.procedural3DParams, { targetMode: reconstructTargetMode, nextPartDistanceMeters, basePresetId: reconstructBasePresetId });
                      saveReconstructionBrief();
                      onStatusChange({
                        type: 'success',
                        message: 'Applied MiningSight-compatible mesh parameters to the active 3D viewport.',
                        details: 'The generated part plan was also saved with the reconstruction brief.',
                        timestamp: new Date().toLocaleTimeString(),
                      });
                    }}
                    className="w-full py-1.5 bg-[#4ade80] hover:bg-[#6ee7b7] text-black font-bold rounded-[2px] flex items-center justify-center space-x-1 cursor-pointer transition-colors shadow"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Apply Custom AI Parameters to 3D Viewport</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify({ brief: buildReconstructionBrief(), result: reconstructResult }, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${projectTitle.replace(/[^a-z0-9_-]+/gi, '_')}_miningsight_compatible_reconstruction.json`;
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="w-full py-1.5 bg-[#303030] hover:bg-[#444] text-[#ddd] border border-[#555] font-semibold rounded-[2px] flex items-center justify-center space-x-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Compatible Reconstruction Plan (.json)</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
