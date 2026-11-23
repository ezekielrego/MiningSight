// Public views expose scene data and token-free URLs, never the saved private
// asset URLs, account metadata, provider credentials or reconstruction inputs.
export function publicProjectPayload(project: any, projectId: string) {
  const data: Record<string, any> = {};
  for (const field of ['projectName', 'version', 'currentPresetId', 'proceduralParams', 'objects', 'materials', 'timeline', 'tours', 'mediaMarkers', 'gasMarks', 'updatedAt']) {
    if (project[field] !== undefined) data[field] = project[field];
  }
  data.projectId = `public_${projectId}`;
  data.readOnly = true;
  data.public = true;
  if (project.reconstructionBrief) data.reconstructionBrief = {
    mapGeometry: project.reconstructionBrief.mapGeometry || null,
    mapSelection: project.reconstructionBrief.mapSelection || null,
  };
  data.assets = (project.assets || []).map((asset: any) => ({
    id: asset.id, name: asset.name, kind: asset.kind, type: asset.type, size: asset.size, uploadedAt: asset.uploadedAt,
    url: `/api/reconstruction/ai/public/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset.id)}`,
  }));
  const clean = (value: any): any => {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !/^(token|access_token|authToken|apiKey|geminiApiKey|marbleApiKey|password|ownerId|userId|email)$/i.test(key))
      .map(([key, item]) => [key, clean(item)]));
    if (typeof value === 'string') return value.replace(/([?&])access_token=[^&#\s]*/gi, '$1').replace(/\?&/g, '?');
    return value;
  };
  return clean(data);
}
