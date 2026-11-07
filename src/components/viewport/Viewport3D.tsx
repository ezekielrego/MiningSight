import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createMiningTunnel, MiningTunnelRig, ShadingDisplayMode } from '../../scene/miningTunnelGenerator';
import { C4DMaterial, C4DSceneObject, ToolMode, Vector3D } from '../../types/c4d';
import { degToRad } from '../../utils/math3d';

interface Viewport3DProps {
  selectedObject: C4DSceneObject | null;
  onSelectObject: (objId: string | null) => void;
  activeTool: ToolMode;
  activeLeftMode?: ToolMode;
  materials: C4DMaterial[];
  isPlaying: boolean;
  currentFrame: number;
  onUpdateTransform?: (pos: Vector3D, rot: Vector3D, scale: Vector3D) => void;
}

export const Viewport3D: React.FC<Viewport3DProps> = ({
  selectedObject,
  onSelectObject,
  activeTool,
  activeLeftMode,
  materials,
  isPlaying,
  currentFrame,
  onUpdateTransform,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Three.js internal references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const miningTunnelRigRef = useRef<MiningTunnelRig | null>(null);
  const gizmoGroupRef = useRef<THREE.Group | null>(null);

  // Camera navigation state
  const isDraggingRef = useRef<boolean>(false);
  const dragModeRef = useRef<'orbit' | 'pan' | 'zoom' | 'none'>('none');
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Spherical camera coordinates looking directly into the illuminated mining diorama interior
  const sphericalRef = useRef<THREE.Spherical>(new THREE.Spherical(33, 1.18, 0.44));
  const targetRef = useRef<THREE.Vector3>(new THREE.Vector3(-0.5, 3.0, 0));

  // Shading mode state
  const [shadingMode, setShadingMode] = useState<ShadingDisplayMode>('gouraud');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [displayMenuOpen, setDisplayMenuOpen] = useState<boolean>(false);
  const [cameraMenuOpen, setCameraMenuOpen] = useState<boolean>(false);
  const [viewMenuOpen, setViewMenuOpen] = useState<boolean>(false);

  // Synchronize Left Tool Palette modes (Model, Polygon, Edge, Point) with 3D mesh display
  useEffect(() => {
    if (!activeLeftMode) return;
    if (activeLeftMode === 'polygon') {
      setShadingMode('gouraud_lines');
    } else if (activeLeftMode === 'edge') {
      setShadingMode('wireframe');
    } else if (activeLeftMode === 'point') {
      setShadingMode('points');
    } else if (activeLeftMode === 'model') {
      setShadingMode('gouraud');
    }
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
  }, [materials]);

  // Sync selected object transformation to 3D scene
  useEffect(() => {
    if (!miningTunnelRigRef.current || !selectedObject) return;
    const tunnel = miningTunnelRigRef.current.root;

    // Convert C4D cm units and degrees to Three.js
    tunnel.position.set(selectedObject.position.x * 0.01, selectedObject.position.y * 0.01, selectedObject.position.z * 0.01);
    tunnel.rotation.set(
      degToRad(selectedObject.rotation.x),
      degToRad(selectedObject.rotation.y),
      degToRad(selectedObject.rotation.z)
    );
    tunnel.scale.set(selectedObject.scale.x, selectedObject.scale.y, selectedObject.scale.z);
    tunnel.visible = selectedObject.visibleInEditor;

    if (gizmoGroupRef.current) {
      gizmoGroupRef.current.position.copy(tunnel.position);
      gizmoGroupRef.current.visible = selectedObject.visibleInEditor && (activeTool === 'move' || activeTool === 'rotate' || activeTool === 'scale');
    }
  }, [selectedObject, activeTool]);

  // Setup WebGL Scene
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
    // Classic Cinema 4D Viewport Background: neutral medium slate grey #626262
    scene.background = new THREE.Color(0x626262);

    // Studio Environment map (skip on software WebGL to avoid texImage3D driver warnings)
    if (!isSoftwareGl) {
      try {
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
        pmremGenerator.dispose();
      } catch (e) {
        // Fallback
      }
    }

    // Camera
    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / mount.clientHeight, 0.5, 2000);
    cameraRef.current = camera;
    // Spherical camera coordinates matching Cinema 4D reference screenshot
    const updateCameraPos = () => {
      camera.position.setFromSpherical(sphericalRef.current).add(targetRef.current);
      camera.lookAt(targetRef.current);
    };
    updateCameraPos();

    // Cinema 4D Ground Grid
    const gridHelper = new THREE.GridHelper(160, 80, 0x3d3d3d, 0x4f4f4f);
    gridHelper.position.y = -6.0;
    scene.add(gridHelper);

    // Main axes cross
    const axisCrossGeo = new THREE.BufferGeometry();
    const axisCrossPoints = [
      new THREE.Vector3(-80, -6.0, 0),
      new THREE.Vector3(80, -6.0, 0),
      new THREE.Vector3(0, -6.0, -80),
      new THREE.Vector3(0, -6.0, 80),
    ];
    axisCrossGeo.setFromPoints(axisCrossPoints);
    const axisCrossMat = new THREE.LineBasicMaterial({ color: 0x343434, depthTest: true });
    const axisCross = new THREE.LineSegments(axisCrossGeo, axisCrossMat);
    scene.add(axisCross);

    // Studio Lighting Rig
    const keyLight = new THREE.DirectionalLight(0xfff8f0, 2.2);
    keyLight.position.set(25, 45, 30);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd0e0ff, 1.4);
    fillLight.position.set(-35, 25, -25);
    scene.add(fillLight);

    const hemiLight = new THREE.HemisphereLight(0xe8e8e8, 0x404040, 0.8);
    scene.add(hemiLight);

    // Add Procedural Mining Tunnel Model
    const miningTunnelRig = createMiningTunnel();
    miningTunnelRigRef.current = miningTunnelRig;
    scene.add(miningTunnelRig.root);

    // Transform Gizmo Handles (Move/Rotate indicator)
    const gizmoGroup = new THREE.Group();
    gizmoGroupRef.current = gizmoGroup;
    gizmoGroup.position.copy(miningTunnelRig.root.position);

    // Red X axis arrow
    const arrowX = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 4, 0xee3333, 0.8, 0.4);
    gizmoGroup.add(arrowX);
    // Green Y axis arrow
    const arrowY = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 4, 0x33cc33, 0.8, 0.4);
    gizmoGroup.add(arrowY);
    // Blue Z axis arrow
    const arrowZ = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 4, 0x3366ee, 0.8, 0.4);
    gizmoGroup.add(arrowZ);

    scene.add(gizmoGroup);

    // Initial resize
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

    // Animation & Render Loop using performance.now (no THREE.Clock warning)
    let animationFrameId = 0;
    let lastTime = performance.now();

    const render = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      const time = now / 1000;

      if (miningTunnelRigRef.current) {
        miningTunnelRigRef.current.animate(time, isPlaying, currentFrame);
      }

      updateCameraPos();
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      renderer.dispose();
    };
  }, [isPlaying, currentFrame]);

  // Update wireframe / shading mode
  useEffect(() => {
    if (!miningTunnelRigRef.current) return;
    miningTunnelRigRef.current.setDisplayMode(shadingMode);
  }, [shadingMode]);

  // Pointer interactions for 3D Camera & Raycasting
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    // Determine drag mode:
    // Left button = Orbit
    // Right button OR Alt+Left button = Pan
    // Middle button = Pan
    if (e.button === 2 || (e.button === 0 && e.altKey)) {
      dragModeRef.current = 'pan';
    } else if (e.button === 1) {
      dragModeRef.current = 'pan';
    } else if (e.button === 0) {
      dragModeRef.current = 'orbit';

      // Raycast to check if clicking mining tunnel or mine cart
      if (cameraRef.current && sceneRef.current && miningTunnelRigRef.current) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);
        const intersects = raycaster.intersectObjects(miningTunnelRigRef.current.root.children, true);
        if (intersects.length > 0) {
          const hit = intersects[0].object;
          if (hit.name.includes('Cart') || hit.parent?.name.includes('Cart')) {
            onSelectObject('Mine_Cart_Ore');
          } else {
            onSelectObject('Mining_Tunnel_Complex');
          }
        }
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || !cameraRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    if (dragModeRef.current === 'orbit') {
      sphericalRef.current.theta -= dx * 0.007;
      sphericalRef.current.phi = Math.max(0.05, Math.min(Math.PI - 0.05, sphericalRef.current.phi - dy * 0.007));
    } else if (dragModeRef.current === 'pan') {
      const panFactor = sphericalRef.current.radius * 0.0018;
      const cam = cameraRef.current;
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 1);
      targetRef.current.addScaledVector(right, -dx * panFactor);
      targetRef.current.addScaledVector(up, dy * panFactor);
    } else if (dragModeRef.current === 'zoom') {
      sphericalRef.current.radius = Math.max(5, Math.min(250, sphericalRef.current.radius + (dy - dx) * 0.15));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false;
    dragModeRef.current = 'none';
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch (err) {}
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    sphericalRef.current.radius = Math.max(8, Math.min(200, sphericalRef.current.radius + e.deltaY * 0.05));
  };

  // Viewport navigation tool buttons (Pan, Zoom, Orbit, Reset)
  const handleNavTool = (tool: 'pan' | 'zoom' | 'orbit' | 'reset') => {
    if (tool === 'reset') {
      sphericalRef.current.set(46, Math.PI / 3.4, Math.PI / 4.2);
      targetRef.current.set(0, 0, 0);
    } else if (tool === 'zoom') {
      sphericalRef.current.radius = Math.max(10, sphericalRef.current.radius - 8);
    } else if (tool === 'pan') {
      targetRef.current.y += 2;
    } else if (tool === 'orbit') {
      sphericalRef.current.theta += Math.PI / 8;
    }
  };

  return (
    <div
      ref={mountRef}
      className="relative w-full h-full select-none overflow-hidden bg-[#626262]"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 3D WebGL Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-crosshair outline-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      />

      {/* Top Viewport Toolbar */}
      <div className="absolute top-0 left-0 right-0 h-6 bg-[#444444] border-b border-[#2d2d2d] flex items-center justify-between px-2 text-[11px] text-[#cfcfcf] z-10">
        <div className="flex items-center space-x-3">
          {/* Docking handle dots */}
          <div className="flex space-x-0.5 opacity-60">
            <span className="w-1 h-1 bg-[#888] rounded-full inline-block"></span>
            <span className="w-1 h-1 bg-[#888] rounded-full inline-block"></span>
            <span className="w-1 h-1 bg-[#888] rounded-full inline-block"></span>
          </div>

          {/* View Menu */}
          <div className="relative">
            <button
              onClick={() => {
                setViewMenuOpen(!viewMenuOpen);
                setCameraMenuOpen(false);
                setDisplayMenuOpen(false);
              }}
              className="hover:text-white hover:bg-[#555] px-1.5 py-0.5 rounded-sm"
            >
              View
            </button>
            {viewMenuOpen && (
              <div className="absolute top-6 left-0 w-36 bg-[#383838] border border-[#222] shadow-lg py-1 z-30 text-[11px] text-[#e0e0e0]">
                <button
                  onClick={() => {
                    handleNavTool('reset');
                    setViewMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black"
                >
                  Frame Default
                </button>
                <button
                  onClick={() => {
                    sphericalRef.current.set(38, Math.PI / 3.4, Math.PI / 4.2);
                    targetRef.current.set(0, 0, 0);
                    setViewMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black"
                >
                  Frame Selected
                </button>
                <button
                  onClick={() => {
                    setShowGrid(!showGrid);
                    setViewMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black"
                >
                  {showGrid ? '✓ Hide Grid' : 'Show Grid'}
                </button>
              </div>
            )}
          </div>

          {/* Cameras Menu */}
          <div className="relative">
            <button
              onClick={() => {
                setCameraMenuOpen(!cameraMenuOpen);
                setViewMenuOpen(false);
                setDisplayMenuOpen(false);
              }}
              className="hover:text-white hover:bg-[#555] px-1.5 py-0.5 rounded-sm"
            >
              Cameras
            </button>
            {cameraMenuOpen && (
              <div className="absolute top-6 left-0 w-40 bg-[#383838] border border-[#222] shadow-lg py-1 z-30 text-[11px] text-[#e0e0e0]">
                <button
                  onClick={() => {
                    sphericalRef.current.set(46, Math.PI / 3.4, Math.PI / 4.2);
                    setCameraMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black"
                >
                  ✓ Perspective
                </button>
                <button
                  onClick={() => {
                    sphericalRef.current.set(50, 0.05, 0);
                    setCameraMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black"
                >
                  Top (Orthographic)
                </button>
                <button
                  onClick={() => {
                    sphericalRef.current.set(50, Math.PI / 2, Math.PI / 2);
                    setCameraMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black"
                >
                  Right (Orthographic)
                </button>
                <button
                  onClick={() => {
                    sphericalRef.current.set(50, Math.PI / 2, 0);
                    setCameraMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black"
                >
                  Front (Orthographic)
                </button>
              </div>
            )}
          </div>

          {/* Display Menu */}
          <div className="relative">
            <button
              onClick={() => {
                setDisplayMenuOpen(!displayMenuOpen);
                setViewMenuOpen(false);
                setCameraMenuOpen(false);
              }}
              className="hover:text-white hover:bg-[#555] px-1.5 py-0.5 rounded-sm"
            >
              Display
            </button>
            {displayMenuOpen && (
              <div className="absolute top-6 left-0 w-48 bg-[#383838] border border-[#222] shadow-lg py-1 z-30 text-[11px] text-[#e0e0e0]">
                <button
                  onClick={() => {
                    setShadingMode('gouraud');
                    setDisplayMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black"
                >
                  {shadingMode === 'gouraud' ? '✓ ' : '  '}Gouraud Shading
                </button>
                <button
                  onClick={() => {
                    setShadingMode('gouraud_lines');
                    setDisplayMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black"
                >
                  {shadingMode === 'gouraud_lines' ? '✓ ' : '  '}Gouraud Shading (Lines)
                </button>
                <button
                  onClick={() => {
                    setShadingMode('wireframe');
                    setDisplayMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black"
                >
                  {shadingMode === 'wireframe' ? '✓ ' : '  '}Wireframe Mode
                </button>
                <button
                  onClick={() => {
                    setShadingMode('points');
                    setDisplayMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 hover:bg-[#e88724] hover:text-black"
                >
                  {shadingMode === 'points' ? '✓ ' : '  '}Points (Vertices)
                </button>
              </div>
            )}
          </div>

          <span className="hover:text-white hover:bg-[#555] px-1.5 py-0.5 rounded-sm cursor-pointer">Options</span>
          <span className="hover:text-white hover:bg-[#555] px-1.5 py-0.5 rounded-sm cursor-pointer">Filter</span>
          <span className="hover:text-white hover:bg-[#555] px-1.5 py-0.5 rounded-sm cursor-pointer">Panel</span>
        </div>

        {/* Top-Right Viewport Navigation Icons (Classic Cinema 4D Viewport controls) */}
        <div className="flex items-center space-x-1 pr-1">
          {/* Pan Camera Button */}
          <button
            title="Pan Camera (Move)"
            onClick={() => handleNavTool('pan')}
            className="w-5 h-5 flex items-center justify-center hover:bg-[#606060] rounded text-[#ddd] active:text-[#e88724]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="5 9 2 12 5 15"></polyline>
              <polyline points="9 5 12 2 15 5"></polyline>
              <polyline points="15 19 12 22 9 19"></polyline>
              <polyline points="19 9 22 12 19 15"></polyline>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <line x1="12" y1="2" x2="12" y2="22"></line>
            </svg>
          </button>

          {/* Zoom Camera Button */}
          <button
            title="Zoom Camera"
            onClick={() => handleNavTool('zoom')}
            className="w-5 h-5 flex items-center justify-center hover:bg-[#606060] rounded text-[#ddd] active:text-[#e88724]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <circle cx="12" cy="12" r="9"></circle>
            </svg>
          </button>

          {/* Orbit Camera Button */}
          <button
            title="Rotate / Orbit Camera"
            onClick={() => handleNavTool('orbit')}
            className="w-5 h-5 flex items-center justify-center hover:bg-[#606060] rounded text-[#ddd] active:text-[#e88724]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
            </svg>
          </button>

          {/* Split / 4-Quad Toggle */}
          <button
            title="Toggle Views"
            onClick={() => handleNavTool('reset')}
            className="w-5 h-5 flex items-center justify-center hover:bg-[#606060] rounded text-[#ddd] active:text-[#e88724]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="8" height="8"></rect>
              <rect x="13" y="3" width="8" height="8"></rect>
              <rect x="3" y="13" width="8" height="8"></rect>
              <rect x="13" y="13" width="8" height="8"></rect>
            </svg>
          </button>
        </div>
      </div>

      {/* Top Left Viewport Projection Name */}
      <div className="absolute top-8 left-3 text-[11px] text-[#d0d0d0] font-sans tracking-wide pointer-events-none drop-shadow-sm">
        Perspective
      </div>

      {/* Bottom Left 3D Coordinate Axis Indicator (Red X, Green Y, Blue Z tripod) */}
      <div className="absolute bottom-3 left-3 pointer-events-none flex flex-col items-center">
        <svg width="44" height="44" viewBox="0 0 50 50">
          {/* Origin center */}
          <circle cx="16" cy="34" r="2" fill="#fff" opacity="0.8" />
          {/* Y Axis (Green, pointing up) */}
          <line x1="16" y1="34" x2="16" y2="12" stroke="#4ade80" strokeWidth="2" />
          <text x="13" y="10" fill="#4ade80" fontSize="10" fontWeight="bold">Y</text>
          {/* X Axis (Red, pointing right-down) */}
          <line x1="16" y1="34" x2="36" y2="40" stroke="#f87171" strokeWidth="2" />
          <text x="38" y="44" fill="#f87171" fontSize="10" fontWeight="bold">X</text>
          {/* Z Axis (Blue, pointing left-up / depth) */}
          <line x1="16" y1="34" x2="30" y2="22" stroke="#60a5fa" strokeWidth="2" />
          <text x="32" y="20" fill="#60a5fa" fontSize="10" fontWeight="bold">Z</text>
        </svg>
      </div>

      {/* Bottom Right Grid Spacing Indicator */}
      <div className="absolute bottom-2.5 right-3 text-[11px] text-[#c0c0c0] font-sans tracking-wide pointer-events-none">
        Grid Spacing : 1000 cm
      </div>
    </div>
  );
};
