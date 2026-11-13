import type { ReconstructionMapGeometry } from '../types/aiSurvey';

export const SINGLE_IMAGE_RECONSTRUCTION_PROMPT = `Reconstruct the attached tunnel photograph as a detailed, editable MiningSight internal scene.
Match the visible tunnel profile, proportions, camera perspective, floor slope, wall and roof irregularity, rock fractures, surface colour, and material weathering.
Reproduce visible timber or steel supports with their actual arrangement, spacing, cross sections, braces, joints, lagging, and damaged or missing portions. Leave unsupported areas unsupported.
Use separate selectable objects for the ground, left wall, right wall, roof, supports, and any visible service or equipment. Keep the tunnel navigable in orbit and walk modes.
Use the editable map and dimensions below as working constraints. Do not invent branches, hidden geometry, surveyed distances, support counts, geology classifications, or structural safety ratings from one photograph. Record uncertain details as assumptions for review.
Only include rails, carts, lamps, pipes, cables, debris, and other props when visible in the reference or explicitly requested. Match visible colour and texture without baking a flat photograph over the scene.
Save the reference image, this complete command, map, dimensions, assumptions, and resulting scene together. Produce a new private named scene unless an extension was explicitly requested.`;

export function createSingleImageMapDraft(imageName: string, dimensions: { width: number; height: number; length: number }) {
  const { width, height, length } = dimensions;
  const reference = imageName || 'Uploaded tunnel photograph';
  const assumptions = [
    'Single-image illustration; no survey calibration has been supplied.',
    'Width, height and length are editable working values, not measurements extracted from the photograph.',
    'The straight centreline is a planning placeholder. Actual bends, branches and hidden extent require reference evidence or user correction.',
  ];
  const points: ReconstructionMapGeometry['points'] = [
    { id: 'photo-entry', label: 'Visible near section · 0 m', x: 0.5, y: 0.85, kind: 'start' },
    { id: 'photo-middle', label: `Working midpoint · ${length / 2} m`, x: 0.5, y: 0.5, kind: 'station' },
    { id: 'photo-end', label: `Working far section · ${length} m`, x: 0.5, y: 0.15, kind: 'end' },
  ];
  const geometry: ReconstructionMapGeometry = {
    name: `Single-image plan · ${reference}`,
    source: 'manual', accuracy: 'illustrative', assumptions,
    metadata: { title: `Tunnel reference: ${reference}`, scale: 'Uncalibrated · editable working dimensions', coordinateSystem: 'Local illustrative centreline', revision: 'Draft' },
    points,
    segments: points.slice(1).map((point, index) => ({ id: `photo-segment-${index}`, from: points[index].id, to: point.id, label: `Reference tunnel · working width ${width} m`, color: '#e88724', width: 8, widthMeters: width })),
    features: [{ id: 'photo-tunnel', type: 'tunnel', layer: 'excavations', label: 'Reference tunnel · review geometry', points: points.map(({ x, y }) => ({ x, y })), widthMeters: width, stroke: '#e88724', metadata: { referenceImage: reference, workingHeightMeters: height, workingLengthMeters: length, surveyed: false } }],
  };
  const text = `REFERENCE: ${reference}
PURPOSE: Internal selectable tunnel reconstruction from this image only.
ACCURACY: Illustrative. Replace working values with measured or calibrated data when available.
WORKING DIMENSIONS: width ${width} m; height ${height} m; visible/reconstructed length ${length} m.
MAP: Near section 0 m -> midpoint ${length / 2} m -> far section ${length} m. Straight planning placeholder; edit to match the reference before construction.
PROFILE: Match visible wall, roof, and floor shapes; confirm what cannot be seen.
SUPPORTS: Record visible support positions, counts, materials, spacing, braces, lagging, weathering, and unsupported stretches during image review.
SURFACES: Match rock relief, fractures, floor texture, colour variation, and visible wear.
BRANCHES/BENDS: Not inferred. Add only with visible evidence or explicit instructions.
OBJECTS: Separate selectable ground, walls, roof, supports, and visible services. Include only evidenced or requested props.
CAMERA: Align the review keyframe with the uploaded photograph; preserve orbit and walk access.
OPEN QUESTIONS: Confirm scale, hidden extent, support dimensions, and any obscured features.
DELIVERY: Private named scene, editable map, exact reference image and instructions, and documented assumptions.`;
  return { geometry, text };
}
