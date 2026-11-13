import * as THREE from 'three';
import { MiningTunnelRig, ShadingDisplayMode } from './miningTunnelGenerator';

export const BRANCH_ROOT = 'Branching_Deep_Mine_Drift';
export const BRANCH_PARTS = ['Branch_Rock', 'Branch_Weak_Zone_Timbers', 'Branch_Entrance_Rail'];

// Illustrative mine geometry in metres, not a surveyed excavation or support design.
export function createBranchingDrift(): MiningTunnelRig {
  const root = new THREE.Group();
  root.name = BRANCH_ROOT;
  root.userData.selectionId = BRANCH_ROOT;
  const rock = new THREE.MeshStandardMaterial({ color: '#776451', roughness: 0.98, side: THREE.DoubleSide, vertexColors: true });
  const timber = new THREE.MeshStandardMaterial({ color: '#59402c', roughness: 0.95 });
  const iron = new THREE.MeshStandardMaterial({ color: '#504038', roughness: 0.9, metalness: 0.45 });
  const gold = new THREE.MeshStandardMaterial({ color: '#a18c66', roughness: 1 });
  const paths = [
    [[0, 20, 2.6], [0.8, 8, 2.5], [-1, -8, 2.35], [0.5, -26, 2.7], [0, -42, 3.8]],
    [[0, -42, 3.8], [-6, -52, 2.6], [-13, -67, 2.1], [-18, -84, 1.65], [-17, -101, 1.5]],
    [[0, -42, 3.8], [7, -52, 2.5], [17, -63, 2.05], [24, -79, 1.7], [28, -96, 1.4]],
  ];
  const segments = paths.flatMap(path => path.slice(1).map((b, i) => ({ a: path[i], b })));
  const field = (x: number, y: number, z: number) => {
    let d = 1000;
    for (const { a, b } of segments) {
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
      const radius = THREE.MathUtils.lerp(a[2], b[2], t);
      const lateral = Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
      const arch = Math.hypot(lateral / radius, (y - 1.35) / (radius * 0.91)) - 1;
      d = Math.min(d, Math.max(arch * radius, -y + 0.04));
    }
    const fracture = Math.sin(x * 3.7 + z * 1.3) * Math.sin(y * 4.1 - z * 2.7) * 0.09
      + Math.sin(z * 0.8 + x * 1.7 + y * 2.3) * 0.10;
    return d + (y > 0.35 ? fracture : 0);
  };
  // A single union surface keeps the junction open: no overlapping tube end walls.
  const positions: number[] = [], colors: number[] = [];
  const step = 0.8, nx = 68, ny = 10, nz = 164;
  const corners = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
  const tetra = [[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
  const edges = [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
  const samples = new Float32Array((nx + 1) * (ny + 1) * (nz + 1));
  const index = (x: number,y: number,z: number) => (z * (ny + 1) + y) * (nx + 1) + x;
  const point = (x: number,y: number,z: number) => new THREE.Vector3(-23.2 + x * step, -0.8 + y * step, -106 + z * step);
  for (let z=0;z<=nz;z++) for(let y=0;y<=ny;y++) for(let x=0;x<=nx;x++) {
    const p=point(x,y,z); samples[index(x,y,z)]=field(p.x,p.y,p.z);
  }
  const addTriangle = (a: THREE.Vector3,b: THREE.Vector3,c: THREE.Vector3) => {
    if ((a.z+b.z+c.z)/3 > 19.6) return; // Open portal, with closed advancing headings.
    for (const p of [a,b,c]) {
      positions.push(p.x,p.y,p.z);
      const strata = 0.76 + 0.14 * Math.sin(p.y * 9 + p.z * 0.32) + 0.08 * Math.sin(p.x * 17 + p.z * 21);
      colors.push(strata, strata * 0.94, strata * 0.85);
    }
  };
  for(let z=0;z<nz;z++) for(let y=0;y<ny;y++) for(let x=0;x<nx;x++) {
    const values=corners.map(c=>samples[index(x+c[0],y+c[1],z+c[2])]);
    if(values.every(v=>v>=0)||values.every(v=>v<0)) continue;
    const pts=corners.map(c=>point(x+c[0],y+c[1],z+c[2]));
    for(const tet of tetra) {
      const hits: THREE.Vector3[]=[];
      for(const [i,j] of edges) {
        const a=tet[i], b=tet[j];
        if((values[a]<0)===(values[b]<0)) continue;
        hits.push(pts[a].clone().lerp(pts[b],values[a]/(values[a]-values[b])));
      }
      if(hits.length===3) addTriangle(hits[0],hits[1],hits[2]);
      if(hits.length===4) {
        const center=hits.reduce((s,p)=>s.add(p),new THREE.Vector3()).multiplyScalar(0.25);
        const u=hits[0].clone().sub(center).normalize();
        const n=hits[1].clone().sub(center).cross(u).normalize(), v=n.clone().cross(u);
        hits.sort((a,b)=>Math.atan2(a.clone().sub(center).dot(v),a.clone().sub(center).dot(u))-Math.atan2(b.clone().sub(center).dot(v),b.clone().sub(center).dot(u)));
        addTriangle(hits[0],hits[1],hits[2]); addTriangle(hits[0],hits[2],hits[3]);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  const tunnelMesh=new THREE.Mesh(geometry,rock);
  tunnelMesh.name=BRANCH_PARTS[0]; tunnelMesh.userData.selectionId=BRANCH_PARTS[0];
  root.add(tunnelMesh);
  const supports=new THREE.Group(); supports.name=BRANCH_PARTS[1]; supports.userData.selectionId=BRANCH_PARTS[1]; root.add(supports);
  const beam=(parent: THREE.Group,a: THREE.Vector3,b: THREE.Vector3,width: number,mat: THREE.Material) => {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,a.distanceTo(b),width),mat);
    mesh.userData.selectionId=parent.userData.selectionId;
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());
    mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh);
  };
  segments.forEach(({a,b},i)=> {
    if(![0,2,3,5,8,10].includes(i)) return;
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    for(let s=2;s<length-1;s+=3.4) {
      const t=s/length, cx=THREE.MathUtils.lerp(a[0],b[0],t), cz=THREE.MathUtils.lerp(a[1],b[1],t);
      const r=THREE.MathUtils.lerp(a[2],b[2],t), h=1.35+r*0.78, w=r*0.78;
      const side=new THREE.Vector3(-(b[1]-a[1])/length,0,(b[0]-a[0])/length);
      const p=(offset: number,y: number)=>new THREE.Vector3(cx+side.x*offset,y,cz+side.z*offset);
      beam(supports,p(-w,0.1),p(-w*0.9,h),0.22,timber);
      beam(supports,p(w,0.1),p(w*0.9,h),0.22,timber);
      beam(supports,p(-w,h),p(w,h),0.28,timber);
      for(const sign of [-1,1]) beam(supports,p(sign*w*0.92,h-0.65),p(sign*(w-0.6),h-0.05),0.14,timber);
    }
  });
  const rail=new THREE.Group(); rail.name=BRANCH_PARTS[2]; rail.userData.selectionId=BRANCH_PARTS[2]; rail.visible=false;
  for(const x of [-0.55,0.55]) beam(rail,new THREE.Vector3(x,0.15,13),new THREE.Vector3(x,0.15,20),0.08,iron);
  for(let z=13;z<=20;z+=0.85) beam(rail,new THREE.Vector3(-0.9,0.07,z),new THREE.Vector3(0.9,0.07,z),0.12,timber);
  root.add(rail);
  const wire=new THREE.LineSegments(new THREE.WireframeGeometry(geometry),new THREE.LineBasicMaterial({color:0x222a31,transparent:true,opacity:0.25})); wire.visible=false; tunnelMesh.add(wire);
  const dots=new THREE.Points(geometry,new THREE.PointsMaterial({color:0xbba88e,size:0.035})); dots.visible=false; tunnelMesh.add(dots);
  const setDisplayMode=(mode: ShadingDisplayMode)=> {
    rock.wireframe=timber.wireframe=iron.wireframe=mode==='wireframe';
    wire.visible=mode==='gouraud_lines'; dots.visible=mode==='points';
  };
  return {root,tunnelMesh,mineCart:new THREE.Group(),wheels:[],lanterns:[],lanternLights:[],materials:{rock,timber,iron,gold},animate:()=>{},setDisplayMode,setWireframe:enabled=>setDisplayMode(enabled?'wireframe':'gouraud')};
}
