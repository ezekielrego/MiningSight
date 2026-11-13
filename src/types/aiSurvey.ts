export interface SurveyImageItem {
  id: string;
  name: string;
  dataUrl: string;
  distanceFromLast: number; // in meters (critical for 3D measurement)
  stationId: string;
  depthBelowSurface: number; // in meters
  headingAzimuth: number; // in degrees (0-360)
  pitchAngle: number; // in degrees (-90 to +90)
  rockStrata: string;
  rqdPercent: number; // Rock Quality Designation %
  fractureSpacingCm: number;
}

export interface PhotogrammetryConstants {
  sensorFocalLengthMm: number;
  gsdMmPerPixel: number;
  overlapPercentage: number;
  convergenceToleranceMm: number;
}

export interface SurveyAnalysisResult {
  surveySummary: {
    siteName: string;
    geotechnicalUnit: string;
    rockMassRating: number;
    rockClass: string;
    faultOrientation: string;
    convergenceAssessment: string;
  };
  measurements: {
    totalDriftLengthMeters: number;
    averageTunnelWidthMeters: number;
    averageTunnelHeightMeters: number;
    volumetricExcavationM3: number;
    estimatedConvergenceMm: number;
  };
  goldVeinSeam: {
    gradeEstimateGramsPerTonne: number;
    strikeDip: string;
    averageVeinThicknessCm: number;
    estimatedGoldOreTonnage: number;
    mineralizedZoneDescription: string;
  };
  structuralAlerts: string[];
  meshGeneratedPoints: Array<{
    stationId: string;
    x: number;
    y: number;
    z: number;
    color: string;
    label: string;
  }>;
  suggested3DAction: string;
}

export interface SurveyRecord {
  id: string;
  timestamp: string;
  projectTitle: string;
  imagesCount: number;
  totalBaselineDistance: number;
  notes: string;
  result: SurveyAnalysisResult;
  source: string;
}

export interface StatusAlert {
  type: 'idle' | 'loading' | 'error' | 'success' | 'warning';
  message: string;
  details?: string;
  timestamp?: string;
  errorCode?: string;
}

export interface ReconstructionBrief {
  reconstructionName?: string;
  targetMode: 'new-part' | 'extend-current' | 'rebuild-scene';
  basePresetId: string;
  selectedObjectId?: string | null;
  selectedObjectName?: string | null;
  activeAssetName?: string | null;
  referenceImageName?: string;
  mapName?: string;
  mapText?: string;
  mapGeometry?: ReconstructionMapGeometry | null;
  mapSelection?: ReconstructionMapSelection | null;
  nextPartDistanceMeters?: number;
  dimensions?: {
    widthMeters?: number;
    heightMeters?: number;
    lengthMeters?: number;
  };
  prompt: string;
  updatedAt: string;
}

export interface ReconstructionMapPoint {
  id: string;
  label: string;
  x: number;
  y: number;
  kind?: 'station' | 'start' | 'end' | 'feature';
}

export interface ReconstructionMapSegment {
  id: string;
  from: string;
  to: string;
  label?: string;
  color?: string;
  width?: number;
  widthMeters?: number;
}

export type ReconstructionMapLayerId = 'excavations' | 'geology' | 'ventilation' | 'utilities' | 'annotations' | 'survey';

export interface ReconstructionMapLayer {
  id: ReconstructionMapLayerId;
  name: string;
  visible: boolean;
  editable: boolean;
  color: string;
}

export interface ReconstructionMapFeature {
  id: string;
  type: 'tunnel' | 'decline' | 'drive' | 'crosscut' | 'shaft' | 'raise' | 'winze' | 'junction' | 'ore-body' | 'fault' | 'stope' | 'mined-out' | 'rock-fill' | 'boundary' | 'utility' | 'annotation';
  layer: ReconstructionMapLayerId;
  label: string;
  points: Array<{ x: number; y: number }>;
  closed?: boolean;
  widthMeters?: number;
  hatch?: 'diagonal' | 'cross' | 'dots' | 'none';
  stroke?: string;
  fill?: string;
  opacity?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  metadata?: Record<string, string | number | boolean>;
}

export interface ReconstructionMapGeometry {
  name: string;
  source: 'gemini' | 'manual' | 'text-fallback';
  points: ReconstructionMapPoint[];
  segments: ReconstructionMapSegment[];
  features?: ReconstructionMapFeature[];
  layers?: ReconstructionMapLayer[];
  metadata?: {
    title?: string;
    level?: string;
    datum?: string;
    scale?: string;
    date?: string;
    revision?: string;
    coordinateSystem?: string;
  };
  accuracy?: 'illustrative' | 'calibrated' | 'surveyed';
  assumptions?: string[];
}

export interface ReconstructionMapSelection {
  start?: { x: number; y: number; label?: string };
  end?: { x: number; y: number; label?: string };
  featureId?: string;
  featureLabel?: string;
}

/** The shared long-drift plan used to orient the built-in MiningSight scenes. */
const webaLayers: ReconstructionMapLayer[] = [
  { id: 'excavations', name: 'Excavations', visible: true, editable: true, color: '#374151' },
  { id: 'geology', name: 'Geology & stopes', visible: true, editable: true, color: '#dc2626' },
  { id: 'ventilation', name: 'Ventilation', visible: true, editable: true, color: '#2563eb' },
  { id: 'utilities', name: 'Utilities', visible: true, editable: true, color: '#eab308' },
  { id: 'annotations', name: 'Annotations & hazards', visible: true, editable: true, color: '#ef4444' },
  { id: 'survey', name: 'Survey measurements', visible: true, editable: true, color: '#16a34a' },
];

export const createDefaultReconstructionMap = (): ReconstructionMapGeometry => ({
  name: 'WEBA Mine Underground Plan · 210 mL',
  source: 'manual',
  accuracy: 'illustrative',
  metadata: { title: 'WEBA MINE — UNDERGROUND PLAN', level: '210 mL', datum: 'Mine Grid (Local)', scale: '1 : 2 000', date: '06 Nov 2026', revision: 'A', coordinateSystem: 'Local mine grid; normalize before survey use' },
  layers: webaLayers.map((layer) => ({ ...layer })),
  points: [
    { id: 'surface', label: 'Main decline to surface', x: 0.28, y: 0.08, kind: 'start' },
    { id: 'decline_mid', label: 'Decline station', x: 0.39, y: 0.28, kind: 'station' },
    { id: 'decline_low', label: 'Crosscut access', x: 0.49, y: 0.46, kind: 'station' },
    { id: 'central_junction', label: 'Ventilation / gas monitoring junction', x: 0.57, y: 0.58, kind: 'feature' },
    { id: 'service_junction', label: 'Service drive junction', x: 0.67, y: 0.57, kind: 'feature' },
    { id: 'stope_access', label: 'Stope access S1', x: 0.69, y: 0.66, kind: 'feature' },
    { id: 'footwall', label: 'Footwall drive / next part', x: 0.86, y: 0.78, kind: 'end' },
    { id: 'haulage_start', label: 'Haulage drive', x: 0.35, y: 0.80, kind: 'station' },
    { id: 'haulage_junction', label: 'Loading bay connection', x: 0.49, y: 0.66, kind: 'feature' },
    { id: 'raise_base', label: 'Raise base', x: 0.69, y: 0.48, kind: 'feature' },
    { id: 'raise_top', label: 'Raise to 195 mL', x: 0.70, y: 0.27, kind: 'end' },
    { id: 'west_branch', label: 'West branch face', x: 0.62, y: 0.69, kind: 'end' },
    { id: 'east_branch', label: 'East branch face', x: 0.82, y: 0.59, kind: 'end' },
    { id: 'ore_pass', label: 'Ore pass Ø 2.0 m', x: 0.61, y: 0.72, kind: 'feature' },
    { id: 'sump', label: 'Sump', x: 0.60, y: 0.79, kind: 'feature' },
    { id: 'pump', label: 'Pump station', x: 0.70, y: 0.79, kind: 'feature' },
  ],
  segments: [
    { id: 'main_seg_01', from: 'surface', to: 'decline_mid', label: 'Main decline 1:7', color: '#374151', width: 9, widthMeters: 4.5 },
    { id: 'main_seg_02', from: 'decline_mid', to: 'decline_low', label: 'Main decline', color: '#374151', width: 8, widthMeters: 4.5 },
    { id: 'main_seg_03', from: 'decline_low', to: 'central_junction', label: 'Development drive', color: '#374151', width: 8, widthMeters: 4.5 },
    { id: 'main_seg_04', from: 'central_junction', to: 'service_junction', label: 'Main level drive', color: '#374151', width: 10, widthMeters: 5.0 },
    { id: 'main_seg_05', from: 'service_junction', to: 'stope_access', label: 'Stope access', color: '#374151', width: 7, widthMeters: 4.0 },
    { id: 'main_seg_06', from: 'stope_access', to: 'footwall', label: 'Footwall drive', color: '#374151', width: 9, widthMeters: 4.5 },
    { id: 'haulage_seg', from: 'haulage_start', to: 'haulage_junction', label: 'Haulage drive to loading bay', color: '#374151', width: 8, widthMeters: 4.5 },
    { id: 'raise_seg', from: 'raise_base', to: 'raise_top', label: 'Raise to 195 mL', color: '#374151', width: 5, widthMeters: 3.0 },
    { id: 'west_seg', from: 'stope_access', to: 'west_branch', label: 'West crosscut', color: '#374151', width: 5, widthMeters: 3.5 },
    { id: 'east_seg', from: 'service_junction', to: 'east_branch', label: 'East service drive', color: '#374151', width: 5, widthMeters: 3.5 },
  ],
  features: [
    { id: 'feature_main_decline', type: 'decline', layer: 'excavations', label: 'Main Decline (1:7) to Surface', points: [{ x: 0.28, y: 0.08 }, { x: 0.39, y: 0.28 }, { x: 0.49, y: 0.46 }, { x: 0.57, y: 0.58 }], widthMeters: 4.5, stroke: '#111827', lineStyle: 'solid' },
    { id: 'feature_main_level', type: 'drive', layer: 'excavations', label: 'Main development drive', points: [{ x: 0.57, y: 0.58 }, { x: 0.67, y: 0.57 }, { x: 0.69, y: 0.66 }, { x: 0.86, y: 0.78 }], widthMeters: 4.5, stroke: '#111827', lineStyle: 'solid' },
    { id: 'feature_haulage', type: 'drive', layer: 'excavations', label: 'Haulage drive to loading bay', points: [{ x: 0.35, y: 0.80 }, { x: 0.42, y: 0.72 }, { x: 0.49, y: 0.66 }], widthMeters: 4.5, stroke: '#111827', lineStyle: 'solid' },
    { id: 'feature_crosscuts', type: 'crosscut', layer: 'excavations', label: 'Crosscuts and service drives', points: [{ x: 0.49, y: 0.66 }, { x: 0.57, y: 0.66 }, { x: 0.69, y: 0.66 }, { x: 0.82, y: 0.59 }], widthMeters: 3.5, stroke: '#111827', lineStyle: 'solid' },
    { id: 'feature_raise', type: 'raise', layer: 'excavations', label: 'Raise to 195 mL (ventilation)', points: [{ x: 0.69, y: 0.48 }, { x: 0.70, y: 0.39 }, { x: 0.70, y: 0.27 }], widthMeters: 3.0, stroke: '#111827', lineStyle: 'dashed' },
    { id: 'feature_stope', type: 'stope', layer: 'geology', label: 'Stope S2 mined-out', points: [{ x: 0.74, y: 0.62 }, { x: 0.82, y: 0.53 }, { x: 0.91, y: 0.50 }, { x: 0.86, y: 0.74 }, { x: 0.76, y: 0.78 }], closed: true, hatch: 'diagonal', stroke: '#dc2626', fill: '#fecaca', opacity: 0.58 },
    { id: 'feature_ore', type: 'ore-body', layer: 'geology', label: 'Ore Zone (Quartz–Sulphide)', points: [{ x: 0.86, y: 0.52 }, { x: 0.95, y: 0.48 }, { x: 0.98, y: 0.70 }, { x: 0.88, y: 0.81 }, { x: 0.84, y: 0.67 }], closed: true, hatch: 'dots', stroke: '#92400e', fill: '#fde68a', opacity: 0.46 },
    { id: 'feature_ventilation', type: 'utility', layer: 'ventilation', label: 'Fresh-air ventilation route', points: [{ x: 0.49, y: 0.46 }, { x: 0.57, y: 0.58 }, { x: 0.67, y: 0.57 }, { x: 0.70, y: 0.39 }], stroke: '#2563eb', lineStyle: 'dashed' },
    { id: 'feature_return_air', type: 'utility', layer: 'ventilation', label: 'Return-air route', points: [{ x: 0.67, y: 0.57 }, { x: 0.76, y: 0.57 }, { x: 0.86, y: 0.64 }], stroke: '#dc2626', lineStyle: 'dashed' },
    { id: 'feature_power', type: 'utility', layer: 'utilities', label: 'Electrical cable route', points: [{ x: 0.57, y: 0.61 }, { x: 0.69, y: 0.66 }, { x: 0.70, y: 0.79 }], stroke: '#eab308', lineStyle: 'solid' },
    { id: 'feature_water', type: 'utility', layer: 'utilities', label: 'Water pipeline', points: [{ x: 0.57, y: 0.64 }, { x: 0.70, y: 0.72 }, { x: 0.70, y: 0.79 }], stroke: '#2563eb', lineStyle: 'solid' },
    { id: 'feature_hazard', type: 'annotation', layer: 'annotations', label: 'Hazard / restricted area', points: [{ x: 0.65, y: 0.67 }], stroke: '#ef4444', fill: '#facc15', closed: true },
  ],
  assumptions: ['Initial editable demonstration geometry traced conceptually from Weba Mine Underground Plan.png.', 'Coordinates, lengths, widths, scale, and station positions are illustrative until calibrated against genuine survey data.'],
});

export const createEmptyReconstructionMap = (name = 'New project map'): ReconstructionMapGeometry => ({
  name,
  source: 'manual',
  accuracy: 'illustrative',
  layers: webaLayers.map((layer) => ({ ...layer })),
  points: [],
  segments: [],
  features: [],
  assumptions: ['Empty project map. Add a map file, describe the route, or draw the route manually in the viewer.'],
});

/**
 * Generates an authentic simulated geological borehole/tunnel survey image with
 * rock strata, mineral veins, and metric measurement grid in base64 data URL format.
 */
export function generateSampleGeologicalImage(
  title: string,
  strata: string,
  depth: number,
  station: string
): string {
  if (typeof document === 'undefined') {
    return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="100%" height="100%" fill="#2d2925"/></svg>';
  }
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Base rock backdrop
  const grad = ctx.createLinearGradient(0, 0, 0, 480);
  grad.addColorStop(0, '#2d2925');
  grad.addColorStop(0.5, '#443e39');
  grad.addColorStop(1, '#2b2723');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 640, 480);

  // Sedimentary strata bands
  for (let y = 0; y < 480; y += 16) {
    const darkness = 0.2 + 0.3 * Math.sin(y * 0.08);
    ctx.fillStyle = `rgba(20, 18, 15, ${darkness})`;
    ctx.fillRect(0, y, 640, 10 + Math.sin(y * 0.2) * 6);
  }

  // Craggy fractures and fault joints
  ctx.strokeStyle = 'rgba(15, 12, 10, 0.75)';
  ctx.lineWidth = 2;
  for (let f = 0; f < 12; f++) {
    ctx.beginPath();
    let sx = 40 + f * 48;
    let sy = 20;
    ctx.moveTo(sx, sy);
    for (let step = 0; step < 8; step++) {
      sx += (Math.sin(f + step) * 35) + 8;
      sy += 55;
      ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  // Golden quartz mineral vein
  ctx.strokeStyle = 'rgba(235, 175, 45, 0.85)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(100, 30);
  ctx.bezierCurveTo(240, 120, 200, 340, 420, 450);
  ctx.stroke();

  // Mineral sparkles
  ctx.fillStyle = 'rgba(255, 220, 110, 0.9)';
  for (let i = 0; i < 40; i++) {
    const px = 120 + Math.random() * 320;
    const py = 50 + Math.random() * 380;
    ctx.beginPath();
    ctx.arc(px, py, 1.5 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Metric survey crosshair grid & fiducial markers
  ctx.strokeStyle = 'rgba(0, 220, 255, 0.35)';
  ctx.lineWidth = 0.8;
  for (let x = 60; x < 640; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 480);
    ctx.stroke();
  }
  for (let y = 60; y < 480; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(640, y);
    ctx.stroke();
  }

  // Survey HUD overlay
  ctx.fillStyle = 'rgba(12, 16, 20, 0.75)';
  ctx.fillRect(10, 10, 260, 68);
  ctx.strokeStyle = 'rgba(0, 200, 255, 0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(10, 10, 260, 68);

  ctx.fillStyle = '#00e5ff';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`SURVEY ID: ${station}`, 18, 28);
  ctx.fillStyle = '#ffaa24';
  ctx.font = '10px monospace';
  ctx.fillText(`STRATA: ${strata}`, 18, 44);
  ctx.fillStyle = '#ddd';
  ctx.fillText(`DEPTH: -${depth.toFixed(1)}m RL | METRIC GSD: 1.2mm`, 18, 60);

  // Crosshair center
  ctx.strokeStyle = '#e88724';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(320, 240, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(320, 210);
  ctx.lineTo(320, 270);
  ctx.moveTo(290, 240);
  ctx.lineTo(350, 240);
  ctx.stroke();

  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Returns a ready-to-use sample dataset of geological survey images with distance tags.
 */
export function getDefaultSampleSurveyImages(): SurveyImageItem[] {
  return [
    {
      id: 'img_st01',
      name: 'Drift_Face_ST01_Baseline.jpg',
      dataUrl: generateSampleGeologicalImage('ST-01 Drift Face', 'Granodiorite Wall', 140.0, 'ST-01'),
      distanceFromLast: 0.0,
      stationId: 'ST-01',
      depthBelowSurface: 140.0,
      headingAzimuth: 115,
      pitchAngle: -4,
      rockStrata: 'Granodiorite Footwall',
      rqdPercent: 82,
      fractureSpacingCm: 35,
    },
    {
      id: 'img_st02',
      name: 'Tunnel_Advance_ST02_2.8m.jpg',
      dataUrl: generateSampleGeologicalImage('ST-02 Quartz Seam', 'Auriferous Quartzite', 142.4, 'ST-02'),
      distanceFromLast: 2.8,
      stationId: 'ST-02',
      depthBelowSurface: 142.4,
      headingAzimuth: 118,
      pitchAngle: -3,
      rockStrata: 'Auriferous Quartzite Seam',
      rqdPercent: 74,
      fractureSpacingCm: 22,
    },
    {
      id: 'img_st03',
      name: 'Ore_Vein_ST03_2.6m.jpg',
      dataUrl: generateSampleGeologicalImage('ST-03 Shear Contact', 'Pyrite-Silica Breccia', 144.8, 'ST-03'),
      distanceFromLast: 2.6,
      stationId: 'ST-03',
      depthBelowSurface: 144.8,
      headingAzimuth: 121,
      pitchAngle: -5,
      rockStrata: 'Pyrite-Silica Breccia Contact',
      rqdPercent: 68,
      fractureSpacingCm: 18,
    },
  ];
}
