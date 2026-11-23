import type { C4DSceneObject, Vector3D } from '../types/c4d';

export type ModelEditOperation =
  | { type: 'hide' | 'show' | 'remove'; targetId: string }
  | { type: 'transform'; targetId: string; position?: Vector3D; rotation?: Vector3D; scale?: Vector3D };

export interface ModelEditProposal {
  version: 1;
  assetId: string;
  guidance: string;
  operations: ModelEditOperation[];
}

export const importedRootId = (assetId: string) => `imported:${assetId}`;

export function flattenObjects(objects: C4DSceneObject[]): C4DSceneObject[] {
  return objects.flatMap((object) => [object, ...flattenObjects(object.children || [])]);
}

export function updateSceneObject(objects: C4DSceneObject[], id: string, update: (object: C4DSceneObject) => C4DSceneObject): C4DSceneObject[] {
  return objects.map((object) => object.id === id ? update(object) : object.children
    ? { ...object, children: updateSceneObject(object.children, id, update) } : object);
}

export function validTransform(vector: unknown, kind: 'position' | 'rotation' | 'scale'): vector is Vector3D {
  if (!vector || typeof vector !== 'object') return false;
  return ['x', 'y', 'z'].every((axis) => {
    const value = (vector as Record<string, unknown>)[axis];
    return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= (kind === 'scale' ? 10000 : 1e9)
      && (kind !== 'scale' || Math.abs(value) >= 0.0001);
  });
}

export function validateModelEditProposal(value: unknown, objects: C4DSceneObject[], assetId: string): ModelEditProposal {
  if (!value || typeof value !== 'object') throw new Error('An edit proposal must be a JSON object.');
  const data = value as ModelEditProposal;
  if (data.version !== 1 || data.assetId !== assetId) throw new Error('This proposal targets a different model or unsupported version.');
  if (typeof data.guidance !== 'string' || !data.guidance.trim() || data.guidance.length > 8000) throw new Error('Include the guidance explaining these edits.');
  if (!Array.isArray(data.operations) || !data.operations.length || data.operations.length > 500) throw new Error('A proposal must contain between 1 and 500 edits.');
  // Validate sequentially, so operations cannot target children removed earlier.
  let next = objects;
  const operations: ModelEditOperation[] = [];
  for (const operation of data.operations) {
    if (!operation || typeof operation.targetId !== 'string') throw new Error('Each edit needs a part ID.');
    const all = flattenObjects(next);
    const target = all.find((object) => object.id === operation.targetId && object.importedAssetId === assetId);
    if (!target) throw new Error(`Part is unavailable in this model: ${operation.targetId}`);
    const lockedAncestor = (items: C4DSceneObject[], locked = false): boolean => items.some((item) => item.id === target.id
      ? locked || item.locked : lockedAncestor(item.children || [], locked || item.locked));
    if (lockedAncestor(next)) throw new Error(`Part is locked: ${target.name}`);
    let clean: ModelEditOperation;
    if (operation.type === 'transform') {
      const fields = ['position', 'rotation', 'scale'] as const;
      if (!fields.some((field) => operation[field] !== undefined)) throw new Error('A transform must specify position, rotation or scale.');
      clean = { type: 'transform', targetId: target.id };
      for (const field of fields) {
        if (operation[field] !== undefined) {
          if (!validTransform(operation[field], field)) throw new Error(`Invalid ${field} for ${target.name}. Positions use centimetres; rotations use degrees.`);
          clean[field] = { ...operation[field]! };
        }
      }
    } else if (['hide', 'show', 'remove'].includes(operation.type)) clean = { type: operation.type, targetId: target.id };
    else throw new Error('Unsupported edit. Allowed operations: hide, show, remove, transform.');
    operations.push(clean);
    next = applyModelEdits(next, [clean]);
  }
  return { version: 1, assetId, guidance: data.guidance.trim(), operations };
}

export function applyModelEdits(objects: C4DSceneObject[], operations: ModelEditOperation[]): C4DSceneObject[] {
  let next = objects;
  for (const operation of operations) {
    if (operation.type === 'remove' && !next.some((object) => object.id === operation.targetId)) {
      const remove = (items: C4DSceneObject[]): C4DSceneObject[] => items.filter((item) => item.id !== operation.targetId)
        .map((item) => item.children ? { ...item, children: remove(item.children) } : item);
      next = remove(next);
    } else next = updateSceneObject(next, operation.targetId, (object) => operation.type === 'transform'
      ? { ...object, position: operation.position || object.position, rotation: operation.rotation || object.rotation, scale: operation.scale || object.scale }
      : { ...object, visibleInEditor: operation.type === 'show', visibleInRenderer: operation.type === 'show' });
  }
  return next;
}

export function editableModelContext(objects: C4DSceneObject[], assetId: string) {
  const parts: Array<Pick<C4DSceneObject, 'id' | 'name' | 'type' | 'locked' | 'position' | 'rotation' | 'scale'> & { parentId: string | null; visible: boolean; effectiveVisible: boolean }> = [];
  const collect = (items: C4DSceneObject[], parentId: string | null, locked = false, visible = true) => {
    for (const object of items) {
      const effectiveLocked = locked || object.locked;
      const effectiveVisible = visible && object.visibleInEditor;
      if (object.importedAssetId === assetId) parts.push({
        id: object.id, parentId, name: object.name, type: object.type, locked: effectiveLocked,
        visible: object.visibleInEditor, effectiveVisible, position: object.position, rotation: object.rotation, scale: object.scale,
      });
      collect(object.children || [], object.id, effectiveLocked, effectiveVisible);
    }
  };
  collect(objects, null);
  return {
    version: 1, assetId, units: { position: 'centimetres, local to parent', rotation: 'Euler XYZ degrees, local to parent', scale: 'ratio' },
    allowedOperations: ['hide', 'show', 'remove', 'transform'], parts,
    instructions: 'Return a modelEditProposal with version, assetId, guidance and operations. Use exact part IDs. Do not invent parts. Ask for clarification when guidance is ambiguous. All proposals require human preview and confirmation; no file deletion or executable code is supported.',
  };
}
