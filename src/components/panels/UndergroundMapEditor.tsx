import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DraggableViewerItem } from '../viewport/DraggableViewerItem';
import {
  Check,
  Download,
  Eraser,
  FileDown,
  Hand,
  MousePointer2,
  Ruler,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  createEmptyReconstructionMap,
  ReconstructionMapFeature,
  ReconstructionMapGeometry,
  ReconstructionMapLayerId,
  ReconstructionMapPoint,
  ReconstructionMapSelection,
} from '../../types/aiSurvey';

type EditorTool = 'select' | 'draw-line' | 'draw-area' | 'point' | 'pan' | 'calibrate';

interface UndergroundMapEditorProps {
  geometry: ReconstructionMapGeometry;
  onChange: (geometry: ReconstructionMapGeometry) => void;
  onStatusChange?: (message: string) => void;
  fullViewport?: boolean;
  mapMarkingEnabled?: boolean;
  onMapMarkingChange?: (enabled: boolean) => void;
  onMapPointPicked?: (point: { x: number; y: number }) => void;
  onMapFeaturePicked?: (feature: ReconstructionMapFeature) => void;
  mapSelection?: ReconstructionMapSelection | null;
}

const defaultLayerColors: Record<ReconstructionMapLayerId, string> = {
  excavations: '#374151',
  geology: '#dc2626',
  ventilation: '#2563eb',
  utilities: '#eab308',
  annotations: '#ef4444',
  survey: '#16a34a',
};

const layerNames: Record<ReconstructionMapLayerId, string> = {
  excavations: 'Excavations',
  geology: 'Geology',
  ventilation: 'Ventilation',
  utilities: 'Utilities',
  annotations: 'Annotations',
  survey: 'Survey',
};

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const linePath = (points: Array<{ x: number; y: number }>, closed = false) => {
  if (!points.length) return '';
  return `${points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')}${closed ? ' Z' : ''}`;
};

const downloadBlob = (content: BlobPart, name: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};

export const UndergroundMapEditor: React.FC<UndergroundMapEditorProps> = ({ geometry, onChange, onStatusChange, fullViewport = false, mapMarkingEnabled = false, onMapMarkingChange, onMapPointPicked, onMapFeaturePicked, mapSelection = null }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<EditorTool>('select');
  const [activeLayer, setActiveLayer] = useState<ReconstructionMapLayerId>('excavations');
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [draftPoints, setDraftPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 1, h: 1 });
  const [panState, setPanState] = useState<{ x: number; y: number; viewX: number; viewY: number } | null>(null);
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
  const [calibrationPoints, setCalibrationPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [knownDistanceMeters, setKnownDistanceMeters] = useState('');
  const [showMetadata, setShowMetadata] = useState(false);

  const layers = geometry.layers?.length ? geometry.layers : (Object.keys(layerNames) as ReconstructionMapLayerId[]).map((id) => ({
    id,
    name: layerNames[id],
    visible: true,
    editable: true,
    color: defaultLayerColors[id],
  }));
  const features = geometry.features || [];
  const selectedFeature = features.find((feature) => feature.id === selectedFeatureId) || null;
  const selectedPoint = geometry.points.find((point) => point.id === selectedPointId) || null;
  const visibleLayers = useMemo(() => new Set(layers.filter((layer) => layer.visible).map((layer) => layer.id)), [layers]);

  useEffect(() => {
    if (mapSelection?.featureId) setSelectedFeatureId(mapSelection.featureId);
  }, [mapSelection?.featureId]);

  const updateGeometry = (next: ReconstructionMapGeometry, message?: string) => {
    onChange(next);
    if (message) onStatusChange?.(message);
  };

  const pointFromEvent = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = viewBox.x + ((event.clientX - rect.left) / rect.width) * viewBox.w;
    const y = viewBox.y + ((event.clientY - rect.top) / rect.height) * viewBox.h;
    const step = 0.02;
    return {
      x: clamp(snapToGrid ? Math.round(x / step) * step : x),
      y: clamp(snapToGrid ? Math.round(y / step) * step : y),
    };
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (tool === 'pan' || event.button === 1 || event.altKey) {
      setPanState({ x: event.clientX, y: event.clientY, viewX: viewBox.x, viewY: viewBox.y });
      return;
    }
    if (mapMarkingEnabled && onMapPointPicked) {
      onMapPointPicked(pointFromEvent(event));
      return;
    }
    if (tool === 'select') {
      setSelectedFeatureId(null);
      setSelectedPointId(null);
      return;
    }
    const point = pointFromEvent(event);
    if (tool === 'calibrate') {
      const nextPoints = [...calibrationPoints, point].slice(-2);
      setCalibrationPoints(nextPoints);
      if (nextPoints.length === 2 && Number(knownDistanceMeters) > 0) {
        const dx = nextPoints[1].x - nextPoints[0].x;
        const dy = nextPoints[1].y - nextPoints[0].y;
        const normalizedDistance = Math.sqrt(dx * dx + dy * dy);
        const distance = Number(knownDistanceMeters);
        if (normalizedDistance > 0) {
          updateGeometry({
            ...geometry,
            accuracy: 'calibrated',
            metadata: { ...geometry.metadata, scale: `${distance.toFixed(2)} m across ${normalizedDistance.toFixed(3)} normalized map units` },
            assumptions: [...(geometry.assumptions || []).filter((item) => !item.toLowerCase().includes('illustrative')), `Calibrated from a supplied ${distance.toFixed(2)} m control distance.`],
          }, 'Map scale calibrated from the supplied control distance.');
          setCalibrationPoints([]);
          setTool('select');
        }
      }
      return;
    }
    if (tool === 'point') {
      const nextPoint: ReconstructionMapPoint = {
        id: `survey_point_${Date.now()}`,
        label: `Survey point ${geometry.points.length + 1}`,
        ...point,
        kind: 'station',
      };
      updateGeometry({ ...geometry, points: [...geometry.points, nextPoint] }, 'Survey point added to the map.');
      return;
    }
    setDraftPoints((items) => [...items, point]);
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (panState) {
      const rect = event.currentTarget.getBoundingClientRect();
      const dx = ((event.clientX - panState.x) / rect.width) * viewBox.w;
      const dy = ((event.clientY - panState.y) / rect.height) * viewBox.h;
      setViewBox((current) => ({ ...current, x: clamp(panState.viewX - dx, -1, 1), y: clamp(panState.viewY - dy, -1, 1) }));
      return;
    }
    if (!draggingPointId) return;
    const point = pointFromEvent(event);
    updateGeometry({
      ...geometry,
      points: geometry.points.map((item) => item.id === draggingPointId ? { ...item, ...point } : item),
      segments: geometry.segments,
    });
  };

  const finishPointer = () => {
    setPanState(null);
    setDraggingPointId(null);
  };

  const commitDraft = () => {
    if (draftPoints.length < 2) return;
    const isArea = tool === 'draw-area';
    const feature: ReconstructionMapFeature = {
      id: `drawn_feature_${Date.now()}`,
      type: isArea ? 'ore-body' : 'drive',
      layer: activeLayer,
      label: isArea ? 'Drawn ore / geological area' : 'Drawn underground drive',
      points: draftPoints,
      closed: isArea,
      widthMeters: isArea ? undefined : 4.5,
      hatch: isArea ? 'diagonal' : 'none',
      stroke: defaultLayerColors[activeLayer],
      fill: isArea ? '#fca5a5' : undefined,
      opacity: isArea ? 0.45 : 1,
      lineStyle: 'solid',
    };
    const next = { ...geometry, features: [...features, feature], accuracy: geometry.accuracy === 'surveyed' ? 'calibrated' : geometry.accuracy };
    updateGeometry(next, `${isArea ? 'Geological area' : 'Underground drive'} added to ${layerNames[activeLayer]}.`);
    setDraftPoints([]);
    setTool('select');
    setSelectedFeatureId(feature.id);
  };

  const deleteSelected = () => {
    if (selectedFeatureId) {
      updateGeometry({ ...geometry, features: features.filter((feature) => feature.id !== selectedFeatureId) }, 'Map feature deleted.');
      setSelectedFeatureId(null);
      return;
    }
    if (selectedPointId) {
      updateGeometry({
        ...geometry,
        points: geometry.points.filter((point) => point.id !== selectedPointId),
        segments: geometry.segments.filter((segment) => segment.from !== selectedPointId && segment.to !== selectedPointId),
      }, 'Map point deleted.');
      setSelectedPointId(null);
    }
  };

  useEffect(() => {
    const handleDeleteKey = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target as HTMLElement | null;
      if (target && (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable)) return;
      if (!selectedFeatureId && !selectedPointId) return;
      event.preventDefault();
      event.stopPropagation();
      deleteSelected();
    };

    window.addEventListener('keydown', handleDeleteKey);
    return () => window.removeEventListener('keydown', handleDeleteKey);
  }, [selectedFeatureId, selectedPointId, geometry, features]);

  const updateSelectedFeature = (patch: Partial<ReconstructionMapFeature>) => {
    if (!selectedFeature) return;
    updateGeometry({ ...geometry, features: features.map((feature) => feature.id === selectedFeature.id ? { ...feature, ...patch } : feature) });
  };

  const toggleLayer = (id: ReconstructionMapLayerId) => {
    const nextLayers = layers.map((layer) => layer.id === id ? { ...layer, visible: !layer.visible } : layer);
    updateGeometry({ ...geometry, layers: nextLayers });
  };

  const exportJson = () => downloadBlob(JSON.stringify(geometry, null, 2), `${geometry.name.replace(/[^a-z0-9_-]+/gi, '_')}.miningsight-map.json`, 'application/json');

  const exportSvg = () => {
    if (!svgRef.current) return;
    const source = new XMLSerializer().serializeToString(svgRef.current);
    downloadBlob(`<?xml version="1.0" encoding="UTF-8"?>${source}`, `${geometry.name.replace(/[^a-z0-9_-]+/gi, '_')}.svg`, 'image/svg+xml');
  };

  const exportPng = () => {
    if (!svgRef.current) return;
    const source = new XMLSerializer().serializeToString(svgRef.current);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1600;
      canvas.height = 1000;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => blob && downloadBlob(blob, `${geometry.name.replace(/[^a-z0-9_-]+/gi, '_')}.png`, 'image/png'));
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  };

  const exportPdf = () => {
    if (!svgRef.current) return;
    const popup = window.open('', '_blank', 'width=1200,height=900');
    if (!popup) return;
    popup.document.write(`<html><head><title>${geometry.name}</title><style>body{margin:0;font-family:Arial;color:#111}svg{width:100%;height:auto}h1{font-size:18px}</style></head><body><h1>${geometry.name}</h1>${new XMLSerializer().serializeToString(svgRef.current)}<script>window.onload=()=>window.print();</script></body></html>`);
    popup.document.close();
  };

  const updateMetadata = (key: keyof NonNullable<ReconstructionMapGeometry['metadata']>, value: string) => {
    updateGeometry({ ...geometry, metadata: { ...geometry.metadata, [key]: value } });
  };

  const textActionClass = (active = false) => `px-1.5 py-1 text-[10px] leading-none border-b-2 transition-colors ${active ? 'border-[#e88724] text-[#ffb35d] font-bold' : 'border-transparent text-[#aaa] hover:border-[#777] hover:text-white'} disabled:cursor-not-allowed disabled:opacity-30`;

  return (
    <div className={`${fullViewport ? 'h-full w-full' : ''} rounded border border-[#3f3f3f] bg-[#1b1b1b] text-[10px] text-[#ddd] overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-1 border-b border-[#3d3d3d] bg-[#242424] p-1.5">
        <span className="mr-1 font-bold uppercase tracking-wide text-[#f1c18b]">Interactive mine-plan editor</span>
        <button onClick={() => setTool('select')} className={textActionClass(tool === 'select')} title="Select and edit map geometry"><MousePointer2 className="inline h-3 w-3" /></button>
        <button onClick={() => { setTool('draw-line'); setDraftPoints([]); }} className={textActionClass(tool === 'draw-line')}>Draw tunnel</button>
        <button onClick={() => { setTool('draw-area'); setDraftPoints([]); }} className={textActionClass(tool === 'draw-area')}>Draw geology</button>
        <button onClick={() => setTool('point')} className={textActionClass(tool === 'point')}>Add point</button>
        <button onClick={() => setTool('pan')} className={textActionClass(tool === 'pan')} title="Pan map"><Hand className="inline h-3 w-3" /></button>
        <button onClick={() => { setTool('calibrate'); setCalibrationPoints([]); }} className={textActionClass(tool === 'calibrate')} title="Calibrate map scale using two points"><Ruler className="inline h-3 w-3" /> Calibrate</button>
        <button onClick={() => onMapMarkingChange?.(!mapMarkingEnabled)} className={textActionClass(mapMarkingEnabled)}>{mapMarkingEnabled ? 'Finish anchor picks' : 'Pick next section'}</button>
        <span className="h-4 w-px bg-[#555]" />
        <button onClick={deleteSelected} disabled={!selectedFeatureId && !selectedPointId} className={textActionClass(Boolean(selectedFeatureId || selectedPointId))} title="Delete selected geometry (Delete / Backspace)"><Trash2 className="h-3 w-3" /></button>
        <button onClick={() => setSnapToGrid((value) => !value)} className={textActionClass(snapToGrid)}>Snap {snapToGrid ? 'ON' : 'OFF'}</button>
        <div className="ml-auto flex gap-1">
          <button onClick={() => setViewBox((current) => ({ ...current, w: Math.max(0.25, current.w * 0.8), h: Math.max(0.25, current.h * 0.8) }))} className={textActionClass()} title="Zoom in"><ZoomIn className="h-3 w-3" /></button>
          <button onClick={() => setViewBox((current) => ({ ...current, w: Math.min(2.5, current.w * 1.25), h: Math.min(2.5, current.h * 1.25) }))} className={textActionClass()} title="Zoom out"><ZoomOut className="h-3 w-3" /></button>
          <button onClick={() => setViewBox({ x: 0, y: 0, w: 1, h: 1 })} className={textActionClass()}>Fit</button>
        </div>
      </div>

      <div className={`flex ${fullViewport ? 'h-[calc(100%-45px)]' : 'min-h-[360px]'} flex-col lg:flex-row`}>
        <div className="relative min-h-[360px] flex-1 overflow-hidden bg-[#f5f5f2]">
          <svg ref={svgRef} viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`} className={`h-full min-h-[360px] w-full ${tool === 'pan' ? 'cursor-grab' : tool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`} onPointerDown={handleCanvasPointerDown} onPointerMove={handleCanvasPointerMove} onPointerUp={finishPointer} onPointerLeave={finishPointer} onWheel={(event) => { event.preventDefault(); const direction = event.deltaY > 0 ? 1.12 : 0.88; setViewBox((current) => ({ ...current, w: Math.min(2.5, Math.max(0.25, current.w * direction)), h: Math.min(2.5, Math.max(0.25, current.h * direction)) })); }}>
            <defs>
              <pattern id="map-grid" width="0.05" height="0.05" patternUnits="userSpaceOnUse"><path d="M 0.05 0 L 0 0 0 0.05" fill="none" stroke="#d7d8d5" strokeWidth="0.001" /></pattern>
              <pattern id="map-diagonal-hatch" width="0.025" height="0.025" patternUnits="userSpaceOnUse" patternTransform="rotate(25)"><line x1="0" y1="0" x2="0" y2="0.025" stroke="#b91c1c" strokeWidth="0.006" /></pattern>
              <pattern id="map-dot-hatch" width="0.025" height="0.025" patternUnits="userSpaceOnUse"><circle cx="0.012" cy="0.012" r="0.003" fill="#92400e" /></pattern>
            </defs>
            <rect x="-1" y="-1" width="3" height="3" fill="#f5f5f2" />
            <rect x="0" y="0" width="1" height="1" fill="url(#map-grid)" />
            <text x="0.03" y="0.05" fill="#111827" fontSize="0.026" fontWeight="700">{geometry.metadata?.title || geometry.name}</text>
            <text x="0.03" y="0.08" fill="#6b7280" fontSize="0.016">{geometry.metadata?.level || 'UNSPECIFIED LEVEL'} · {geometry.metadata?.scale || 'SCALE NOT CALIBRATED'}</text>
            {features.filter((feature) => visibleLayers.has(feature.layer)).map((feature) => {
              const stroke = feature.stroke || defaultLayerColors[feature.layer];
              const path = linePath(feature.points, feature.closed);
              const width = feature.widthMeters ? Math.max(0.004, Math.min(0.035, feature.widthMeters / 220)) : 0.006;
              const isSelected = selectedFeatureId === feature.id;
              const fill = feature.closed ? (feature.hatch === 'diagonal' ? 'url(#map-diagonal-hatch)' : feature.hatch === 'dots' ? 'url(#map-dot-hatch)' : feature.fill || '#fca5a5') : 'none';
              return <g key={feature.id} onPointerDown={(event) => { if (mapMarkingEnabled) { event.stopPropagation(); setSelectedFeatureId(feature.id); setSelectedPointId(null); onMapFeaturePicked?.(feature); } }} onClick={(event) => { event.stopPropagation(); setSelectedFeatureId(feature.id); setSelectedPointId(null); }}>
                <path d={path} fill={fill} fillOpacity={feature.opacity ?? 0.5} stroke={isSelected ? '#f59e0b' : stroke} strokeWidth={isSelected ? width + 0.006 : width} strokeDasharray={feature.lineStyle === 'dashed' ? '0.018 0.012' : feature.lineStyle === 'dotted' ? '0.004 0.008' : undefined} strokeLinejoin="round" strokeLinecap="round" />
                {!feature.closed && <path d={path} fill="none" stroke={isSelected ? '#f59e0b' : stroke} strokeWidth="0.002" opacity="0.7" />}
                {isSelected && feature.points.map((point, index) => <circle key={`${feature.id}-handle-${index}`} cx={point.x} cy={point.y} r="0.012" fill="#ffffff" stroke="#f59e0b" strokeWidth="0.004" />)}
                <text x={feature.points[0]?.x || 0} y={(feature.points[0]?.y || 0) - 0.018} fill={stroke} fontSize="0.014" fontWeight="600">{feature.label}</text>
              </g>;
            })}
            {geometry.segments.map((segment) => {
              const from = geometry.points.find((point) => point.id === segment.from);
              const to = geometry.points.find((point) => point.id === segment.to);
              if (!from || !to) return null;
              return <line key={segment.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={segment.color || '#374151'} strokeWidth={Math.max(0.004, (segment.width || 5) / 260)} strokeLinecap="round" opacity="0.78" />;
            })}
            {geometry.points.filter((point) => visibleLayers.has('survey')).map((point) => <circle key={point.id} cx={point.x} cy={point.y} r={selectedPointId === point.id ? 0.018 : 0.009} fill={point.kind === 'start' ? '#16a34a' : point.kind === 'end' ? '#dc2626' : '#2563eb'} stroke={selectedPointId === point.id ? '#f59e0b' : '#ffffff'} strokeWidth="0.004" onClick={(event) => { event.stopPropagation(); setSelectedPointId(point.id); setSelectedFeatureId(null); }} onPointerDown={(event) => { event.stopPropagation(); if (tool === 'select') { setSelectedPointId(point.id); setDraggingPointId(point.id); } }} />)}
            {!mapSelection?.featureId && mapSelection?.start && <circle cx={mapSelection.start.x} cy={mapSelection.start.y} r="0.025" fill="none" stroke="#16a34a" strokeWidth="0.008" />}
            {!mapSelection?.featureId && mapSelection?.end && <circle cx={mapSelection.end.x} cy={mapSelection.end.y} r="0.025" fill="none" stroke="#dc2626" strokeWidth="0.008" />}
            {!mapSelection?.featureId && mapSelection?.start && mapSelection?.end && <line x1={mapSelection.start.x} y1={mapSelection.start.y} x2={mapSelection.end.x} y2={mapSelection.end.y} stroke="#111827" strokeWidth="0.004" strokeDasharray="0.015 0.01" />}
            {draftPoints.length > 0 && <path d={linePath(draftPoints, tool === 'draw-area')} fill={tool === 'draw-area' ? '#fca5a5' : 'none'} fillOpacity="0.35" stroke="#f59e0b" strokeWidth="0.008" strokeDasharray="0.014 0.01" />}
            {draftPoints.map((point, index) => <circle key={`draft-${index}`} cx={point.x} cy={point.y} r="0.012" fill="#f59e0b" />)}
            <g transform="translate(0.91 0.08)"><text x="0" y="0" fontSize="0.055" fontWeight="700" fill="#111827">N</text><path d="M 0.012 0.012 L 0.03 0.075 L 0.048 0.012 L 0.03 0.027 Z" fill="#111827" /></g>
            {draftPoints.length >= 2 && <foreignObject x="0.03" y="0.91" width="0.25" height="0.06"><button onClick={commitDraft} style={{ fontSize: '10px', padding: '4px 8px', background: '#e88724', border: '1px solid #9a5c1b', borderRadius: '3px', fontWeight: 700 }}>Finish geometry</button></foreignObject>}
          </svg>
          {geometry.accuracy !== 'surveyed' && <DraggableViewerItem id="Map accuracy" wholeSurface className="absolute bottom-2 left-2 z-10 rounded border border-[#a16207] bg-[#fffbeb]/95 px-2 py-1 text-[9px] font-semibold text-[#854d0e] shadow">{geometry.accuracy === 'calibrated' ? 'CALIBRATED — verify against survey control' : 'ILLUSTRATIVE — not survey-accurate'}</DraggableViewerItem>}
        </div>

        <aside className="w-full space-y-2 border-t border-[#3d3d3d] bg-[#202020] p-2 lg:w-56 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between"><span className="font-bold text-[#f1c18b]">Layers</span><Ruler className="h-3.5 w-3.5 text-[#e88724]" /></div>
          {layers.map((layer) => <button key={layer.id} onClick={() => toggleLayer(layer.id)} className={`flex w-full items-center gap-1.5 border-b px-1.5 py-1 text-left transition-colors ${activeLayer === layer.id ? 'border-[#e88724] text-[#ffb35d]' : 'border-transparent text-[#bbb] hover:border-[#777] hover:text-white'}`}><span className="h-2.5 w-2.5 rounded-full" style={{ background: layer.color }} /><span className="flex-1 truncate">{layer.name}</span>{layer.visible ? <Check className="h-3 w-3 text-[#55dd88]" /> : <Eraser className="h-3 w-3 text-[#777]" />}</button>)}
          <label className="block text-[#999]">Active drawing layer<select value={activeLayer} onChange={(event) => setActiveLayer(event.target.value as ReconstructionMapLayerId)} className="mt-0.5 w-full rounded border border-[#555] bg-[#171717] px-1 py-1 text-[#eee]">{layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>
          {selectedFeature && <div className="space-y-1 border-l-2 border-[#e88724] bg-[#2a2118] p-1.5"><div className="font-semibold text-[#ffb35d]">Selected feature</div><input value={selectedFeature.label} onChange={(event) => updateSelectedFeature({ label: event.target.value })} className="w-full rounded border border-[#555] bg-[#171717] px-1 py-1 text-[#eee]" />{!selectedFeature.closed && <label className="block text-[#aaa]">Width (m)<input type="number" min="0.1" step="0.1" value={selectedFeature.widthMeters || 4.5} onChange={(event) => updateSelectedFeature({ widthMeters: Number(event.target.value) || 0.1 })} className="mt-0.5 w-full rounded border border-[#555] bg-[#171717] px-1 py-1 text-[#eee]" /></label>}<button onClick={deleteSelected} className="w-full border-b border-transparent px-1 py-1 text-left text-[#ffaaaa] hover:border-[#ff7777]">Delete feature</button></div>}
          {selectedPoint && <div className="rounded border border-[#315438] bg-[#1a2e1f] p-1.5"><div className="font-semibold text-[#8ee8a5]">Selected survey point</div><div className="truncate text-[#ddd]">{selectedPoint.label}</div><div className="font-mono text-[9px] text-[#aaa]">x {selectedPoint.x.toFixed(3)} · y {selectedPoint.y.toFixed(3)}</div></div>}
          {tool === 'calibrate' && <div className="space-y-1 rounded border border-[#315438] bg-[#1a2e1f] p-1.5"><div className="font-semibold text-[#8ee8a5]">Scale calibration</div><label className="block text-[#aaa]">Known distance (m)<input type="number" min="0.01" step="0.1" value={knownDistanceMeters} onChange={(event) => setKnownDistanceMeters(event.target.value)} placeholder="e.g. 50" className="mt-0.5 w-full rounded border border-[#555] bg-[#171717] px-1 py-1 text-[#eee]" /></label><div className="text-[8.5px] text-[#aaa]">Click two points on the plan after entering a genuine surveyed distance. {calibrationPoints.length}/2 points selected.</div></div>}
          <button onClick={() => setShowMetadata((value) => !value)} className="w-full border-b border-transparent px-1.5 py-1 text-left text-[#bbb] hover:border-[#777] hover:text-white">{showMetadata ? 'Hide drawing metadata' : 'Edit drawing metadata'}</button>
          {showMetadata && <div className="space-y-1">{(['title', 'level', 'datum', 'scale', 'date', 'revision'] as const).map((key) => <label key={key} className="block text-[#999] capitalize">{key}<input value={geometry.metadata?.[key] || ''} onChange={(event) => updateMetadata(key, event.target.value)} className="mt-0.5 w-full rounded border border-[#555] bg-[#171717] px-1 py-1 text-[#eee]" /></label>)}<label className="block text-[#999]">Accuracy<select value={geometry.accuracy || 'illustrative'} onChange={(event) => updateGeometry({ ...geometry, accuracy: event.target.value as ReconstructionMapGeometry['accuracy'] })} className="mt-0.5 w-full rounded border border-[#555] bg-[#171717] px-1 py-1 text-[#eee]"><option value="illustrative">Illustrative</option><option value="calibrated">Calibrated (use the tool)</option></select></label><div className="text-[8.5px] leading-relaxed text-[#a16207]">Do not label a plan surveyed unless genuine survey control has been supplied. The editor defaults to illustrative.</div></div>}
          <div className="border-t border-[#444] pt-1.5"><div className="mb-1 font-semibold text-[#aaa]">Export editable plan</div><div className="grid grid-cols-2 gap-x-2"><button onClick={exportJson} className="border-b border-transparent px-1 py-1 text-left text-[#bbb] hover:border-[#777] hover:text-white"><Download className="mr-1 inline h-3 w-3" />JSON</button><button onClick={exportSvg} className="border-b border-transparent px-1 py-1 text-left text-[#bbb] hover:border-[#777] hover:text-white"><FileDown className="mr-1 inline h-3 w-3" />SVG</button><button onClick={exportPng} className="border-b border-transparent px-1 py-1 text-left text-[#bbb] hover:border-[#777] hover:text-white">PNG</button><button onClick={exportPdf} className="border-b border-transparent px-1 py-1 text-left text-[#bbb] hover:border-[#777] hover:text-white">PDF / Print</button></div></div>
          <div className="text-[8.5px] leading-relaxed text-[#888]">Select a point to drag it. Select a feature to edit its label and width. Use the layer buttons to hide or show independent map information.</div>
        </aside>
      </div>
    </div>
  );
};

