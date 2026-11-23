import * as THREE from 'three';
import type { C4DSceneObject } from '../types/c4d';
import type { ProjectAsset } from '../types/project';
import type { ShadingDisplayMode } from './miningTunnelGenerator';
import { flattenObjects, importedRootId } from './modelEditing';

export class ImportedModelController {
  readonly tree: C4DSceneObject;
  readonly nodes = new Map<string, THREE.Object3D>();
  private meshes: THREE.Mesh[] = [];
  private materials = new Map<THREE.Material, { color?: THREE.Color; emissive?: THREE.Color; intensity?: number; visible: boolean }>();
  private points = new Map<THREE.Mesh, THREE.Points>();
  private lines = new Map<THREE.Mesh, THREE.LineSegments>();
  private selectedId: string | null = null;

  constructor(readonly root: THREE.Group, readonly asset: Pick<ProjectAsset, 'id' | 'name'>) {
    const build = (node: THREE.Object3D, path: string): C4DSceneObject => {
      const id = path ? `${importedRootId(asset.id)}/${path}` : importedRootId(asset.id);
      node.userData.selectionId = id;
      this.nodes.set(id, node);
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        this.meshes.push(mesh);
        const clone = (original: THREE.Material) => {
          const material = original.clone() as THREE.MeshStandardMaterial;
          this.materials.set(material, { color: material.color?.clone(), emissive: material.emissive?.clone(), intensity: material.emissiveIntensity, visible: material.visible });
          return material;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
      }
      return {
        id, importedAssetId: asset.id, name: path ? node.name || (mesh.isMesh ? 'Mesh part' : 'Group') : asset.name,
        type: (node as THREE.Camera).isCamera ? 'camera' : (node as THREE.Light).isLight ? 'light' : 'group',
        position: { x: node.position.x * 100, y: node.position.y * 100, z: node.position.z * 100 },
        rotation: { x: THREE.MathUtils.radToDeg(node.rotation.x), y: THREE.MathUtils.radToDeg(node.rotation.y), z: THREE.MathUtils.radToDeg(node.rotation.z) },
        scale: { x: node.scale.x, y: node.scale.y, z: node.scale.z },
        visibleInEditor: node.visible, visibleInRenderer: node.visible, locked: false, expanded: !path,
        materialIds: [], children: node.children.map((child, index) => build(child, path ? `${path}/${index}` : String(index))),
      };
    };
    this.tree = build(root, '');
  }

  applyScene(objects: C4DSceneObject[], clearView = false) {
    const states = new Map(flattenObjects(objects).map((object) => [object.id, object]));
    this.nodes.forEach((node, id) => {
      const state = states.get(id);
      node.visible = Boolean(state?.visibleInEditor) && !(node === this.root && clearView);
      if (!state) return;
      node.position.set(state.position.x / 100, state.position.y / 100, state.position.z / 100);
      node.rotation.set(THREE.MathUtils.degToRad(state.rotation.x), THREE.MathUtils.degToRad(state.rotation.y), THREE.MathUtils.degToRad(state.rotation.z));
      node.scale.set(state.scale.x, state.scale.y, state.scale.z);
    });
    this.root.updateMatrixWorld(true);
  }

  setDisplayMode(mode: ShadingDisplayMode) {
    for (const mesh of this.meshes) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        const surface = material as THREE.MeshStandardMaterial;
        surface.wireframe = mode === 'wireframe';
        surface.visible = mode !== 'points' && (this.materials.get(material)?.visible ?? true);
        surface.needsUpdate = true;
      }
      if (mode === 'points' && !this.points.has(mesh)) {
        const base = materials[0] as THREE.MeshStandardMaterial;
        const points = new THREE.Points(mesh.geometry, new THREE.PointsMaterial({
          color: base.color || 0xbac9da, size: 0.055, sizeAttenuation: true,
          vertexColors: Boolean(mesh.geometry.getAttribute('color')),
        }));
        points.userData.selectionId = mesh.userData.selectionId;
        points.userData.importedOverlay = true;
        mesh.add(points); this.points.set(mesh, points);
      }
      if (mode === 'gouraud_lines' && !this.lines.has(mesh)) {
        const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), new THREE.LineBasicMaterial({ color: 0x212833 }));
        lines.userData.selectionId = mesh.userData.selectionId;
        lines.userData.importedOverlay = true;
        mesh.add(lines); this.lines.set(mesh, lines);
      }
      if (this.points.has(mesh)) this.points.get(mesh)!.visible = mode === 'points';
      if (this.lines.has(mesh)) this.lines.get(mesh)!.visible = mode === 'gouraud_lines';
    }
    this.setSelection(this.selectedId);
  }

  setSelection(id: string | null) {
    this.selectedId = id;
    const selected = id ? this.nodes.get(id) : null;
    const isSelected = (mesh: THREE.Mesh) => {
      for (let node: THREE.Object3D | null = mesh; node; node = node.parent) if (node === selected) return true;
      return false;
    };
    for (const mesh of this.meshes) {
      const chosen = isSelected(mesh);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const surface = material as THREE.MeshStandardMaterial, original = this.materials.get(material);
        if (surface.color && original?.color) surface.color.copy(original.color);
        if (surface.emissive && original?.emissive) {
          surface.emissive.copy(chosen ? new THREE.Color(0xff7b20) : original.emissive);
          surface.emissiveIntensity = chosen ? 0.7 : original.intensity ?? 0;
        } else if (chosen && surface.color) surface.color.lerp(new THREE.Color(0xff8a24), 0.5);
      }
      const points = this.points.get(mesh);
      if (points) (points.material as THREE.PointsMaterial).color.copy(chosen ? new THREE.Color(0xff8a24) : ((Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial).color || new THREE.Color(0xbac9da));
    }
  }

  intersections(ray: THREE.Raycaster): THREE.Intersection[] {
    const visible = (object: THREE.Object3D) => {
      for (let node: THREE.Object3D | null = object; node; node = node.parent) if (!node.visible) return false;
      return true;
    };
    // Invisible/deleted parts must never intercept picking, even in point mode.
    return ray.intersectObjects(this.meshes.filter(visible), false);
  }

  dispose() {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    this.root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      for (const material of mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    geometries.forEach((geometry) => geometry.dispose()); materials.forEach((material) => material.dispose()); textures.forEach((texture) => texture.dispose());
    this.nodes.clear(); this.points.clear(); this.lines.clear(); this.materials.clear();
  }
}
