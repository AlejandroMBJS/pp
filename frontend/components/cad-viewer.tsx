"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { renderDxf, renderDxfFromUrl } from "../lib/cad-renderer/dxf-renderer";
import { loadSTL, load3MF, convertDwgToDxf } from "../lib/cad-renderer/model-loaders";
import { AlertCircle, Grid3X3, Move3D, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { FileData, ViewerFileType } from "../lib/cad-renderer/cad-types";

export type { FileData, ViewerFileType };

function browserSafeURL(rawUrl: string) {
  if (typeof window === "undefined" || !rawUrl) return rawUrl;
  try {
    const current = new URL(window.location.origin);
    const candidate = new URL(rawUrl, current.origin);
    const internalPath =
      candidate.pathname.startsWith("/uploads/") || candidate.pathname.startsWith("/api/");
    const localHost = ["localhost", "127.0.0.1", "0.0.0.0", "backend", "frontend", "gateway"].includes(
      candidate.hostname
    );
    if ((internalPath || localHost) && candidate.origin !== current.origin) {
      return `${current.origin}${candidate.pathname}${candidate.search}`;
    }
    return candidate.toString();
  } catch {
    return rawUrl;
  }
}

interface CadViewerProps {
  fileUrl: string;
  fileType: string;
  fileName: string;
  previewUrl?: string;
  rawPreviewUrl?: string;
  token?: string;
}

export function CadViewer({ fileUrl, fileType, fileName, rawPreviewUrl, token }: CadViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const axesRef = useRef<THREE.AxesHelper | null>(null);
  const frameRef = useRef<number | null>(null);
  const fitTargetRef = useRef<{
    center: THREE.Vector3;
    size: THREE.Vector3;
    type: ViewerFileType;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [showGrid, setShowGrid] = useState(false);
  const [showAxes, setShowAxes] = useState(false);

  const onProgress = (pct: number, label: string) => {
    setProgress(pct);
    setProgressLabel(label);
  };

  // ── Scene init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      100000
    );
    camera.position.set(0, 0, 500);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.zoomToCursor = true;
    controls.zoomSpeed = 1;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 1.2);
    hemi.position.set(0, 20, 0);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(8, 12, 10);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x93c5fd, 0.8);
    rim.position.set(-10, 6, -8);
    scene.add(rim);

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      rendererRef.current.setSize(w, h);
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      clearModel(scene, groupRef);
      clearDecorations(scene, gridRef, axesRef);
      controls.dispose();
      renderer.dispose();
      if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // ── Load model ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canLoad = (fileUrl || (fileType.toLowerCase() === "dwg" && rawPreviewUrl));
    if (!canLoad || !sceneRef.current || !cameraRef.current || !controlsRef.current) return;

    const load = async () => {
      setError(null);
      setLoading(true);
      setProgress(0);
      setProgressLabel("Starting…");
      fitTargetRef.current = null;
      clearModel(sceneRef.current!, groupRef);
      clearDecorations(sceneRef.current!, gridRef, axesRef);

      try {
        const ext = fileType.toLowerCase().replace(/^\./, "");
        let group: THREE.Group;
        let resolvedType: ViewerFileType;

        if (ext === "dwg") {
          if (rawPreviewUrl && token) {
            // Use server pre-converted DXF preview — avoids re-downloading/converting
            const headers = { Authorization: `Bearer ${token}` };
            group = await renderDxfFromUrl(browserSafeURL(rawPreviewUrl), headers, onProgress);
          } else {
            // Fallback: upload to backend convert endpoint
            onProgress(5, "Downloading DWG…");
            const res = await fetch(fileUrl);
            const blob = await res.blob();
            onProgress(20, "Converting DWG → DXF…");
            const file = new File([blob], "model.dwg", { type: "application/octet-stream" });
            const dxfText = await convertDwgToDxf(file);
            group = await renderDxf(dxfText, onProgress, 40);
          }
          resolvedType = "dxf";
        } else if (ext === "dxf") {
          onProgress(5, "Downloading DXF…");
          const text = await fetch(fileUrl).then((r) => r.text());
          group = await renderDxf(text, onProgress, 15);
          resolvedType = "dxf";
        } else if (ext === "stl") {
          onProgress(10, "Loading STL…");
          const buf = await fetch(fileUrl).then((r) => r.arrayBuffer());
          group = await loadSTL(buf);
          resolvedType = "stl";
        } else if (ext === "3mf") {
          onProgress(10, "Loading 3MF…");
          const buf = await fetch(fileUrl).then((r) => r.arrayBuffer());
          group = await load3MF(buf);
          resolvedType = "3mf";
        } else {
          throw new Error(`Unsupported format: ${ext}`);
        }

        if (group.children.length === 0) {
          throw new Error("The file was processed but does not contain renderable geometry.");
        }

        sceneRef.current!.add(group);
        groupRef.current = group;

        const box = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        fitTargetRef.current = { center, size, type: resolvedType };

        updateDecorations(sceneRef.current!, box, size, resolvedType, showGrid, showAxes, gridRef, axesRef);
        fitCamera(cameraRef.current!, controlsRef.current!, center, size, resolvedType);
        onProgress(100, "Ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not render the file.");
        console.error("CadViewer load error:", err);
      } finally {
        setLoading(false);
      }
    };

    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl, fileType, rawPreviewUrl, token, showGrid, showAxes]);

  const zoomByFactor = (factor: number) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    const nextOffset = offset.multiplyScalar(factor);
    const nextDistance = THREE.MathUtils.clamp(nextOffset.length(), controls.minDistance, controls.maxDistance);

    if (nextOffset.lengthSq() > 0) {
      nextOffset.setLength(nextDistance);
      camera.position.copy(controls.target).add(nextOffset);
      controls.update();
    }
  };

  const handleZoomIn = () => zoomByFactor(0.85);
  const handleZoomOut = () => zoomByFactor(1.15);
  const handleReset = () => {
    if (fitTargetRef.current && cameraRef.current && controlsRef.current) {
      fitCamera(cameraRef.current, controlsRef.current, fitTargetRef.current.center, fitTargetRef.current.size, fitTargetRef.current.type);
    }
  };

  return (
    <div className="relative w-full h-full bg-[#020617] overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />

      {/* Top-right toggles */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5 rounded-full border border-white/10 bg-[#020617]/80 px-2 py-1.5 backdrop-blur-md">
        <button
          onClick={() => setShowGrid((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${showGrid ? "bg-blue-500/20 text-blue-300" : "text-white/40 hover:text-white/70"}`}
        >
          <Grid3X3 size={12} />
          Grid
        </button>
        <button
          onClick={() => setShowAxes((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${showAxes ? "bg-blue-500/20 text-blue-300" : "text-white/40 hover:text-white/70"}`}
        >
          <Move3D size={12} />
          Axes
        </button>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full border border-white/10 bg-[#020617]/80 p-1.5 backdrop-blur-md">
        <button onClick={handleZoomIn} className="rounded-full p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white">
          <ZoomIn size={16} />
        </button>
        <button onClick={handleZoomOut} className="rounded-full p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white">
          <ZoomOut size={16} />
        </button>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <button onClick={handleReset} className="rounded-full p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white">
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Top-left filename chip */}
      <div className="absolute top-4 left-4 rounded-lg border border-white/10 bg-[#020617]/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white/50 backdrop-blur-md">
        {fileName || "No file"}
      </div>

      {/* Progress / loading overlay */}
      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-20">
          <div className="w-[min(480px,90%)] rounded-2xl border border-white/10 bg-[#020617]/90 px-5 py-4 backdrop-blur-md">
            {/* Label + pct */}
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">
                {progressLabel || "Loading…"}
              </span>
              <span className="text-[10px] font-black tabular-nums text-blue-400">
                {progress}%
              </span>
            </div>
            {/* Bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-x-4 top-16 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 backdrop-blur-md">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="text-xs">{error}</span>
        </div>
      )}
    </div>
  );
}

// ── Scene helpers ─────────────────────────────────────────────────────────────

function fitCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  center: THREE.Vector3,
  size: THREE.Vector3,
  type: ViewerFileType
) {
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  camera.near = Math.max(0.001, maxDim / 1000);
  camera.far = Math.max(1000, maxDim * 100);
  camera.updateProjectionMatrix();

  const fov = THREE.MathUtils.degToRad(camera.fov);
  const dist = Math.max(maxDim / (2 * Math.tan(fov / 2)), maxDim) * (type === "dxf" ? 1.8 : 2.2);

  if (type === "dxf") {
    camera.position.set(center.x, center.y, center.z + dist);
  } else {
    camera.position.set(center.x + dist, center.y + dist * 0.7, center.z + dist);
  }

  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();
}

function updateDecorations(
  scene: THREE.Scene,
  box: THREE.Box3,
  size: THREE.Vector3,
  type: ViewerFileType,
  showGrid: boolean,
  showAxes: boolean,
  gridRef: React.MutableRefObject<THREE.GridHelper | null>,
  axesRef: React.MutableRefObject<THREE.AxesHelper | null>
) {
  clearDecorations(scene, gridRef, axesRef);
  const maxDim = Math.max(size.x, size.y, size.z, 1);

  if (showGrid) {
    const span = Math.max(size.x, size.z, size.y, 20);
    const divs = Math.max(8, Math.min(40, Math.round(span / 10)));
    const grid = new THREE.GridHelper(Math.max(span * 2, 40), divs, 0x2a3441, 0x1b2530);
    const mats = Array.isArray(grid.material) ? grid.material : [grid.material];
    mats.forEach((m) => { m.transparent = true; m.opacity = type === "dxf" ? 0.18 : 0.26; m.depthWrite = false; });
    if (type === "dxf") {
      grid.rotation.x = Math.PI / 2;
      grid.position.z = box.min.z - Math.max(size.x, size.y, 1) * 0.01;
    } else {
      grid.position.y = box.min.y - Math.max(size.y, 1) * 0.02;
    }
    gridRef.current = grid;
    scene.add(grid);
  }

  if (showAxes && type !== "dxf") {
    const axes = new THREE.AxesHelper(Math.max(maxDim * 0.2, 25));
    axes.position.set(box.min.x - maxDim * 0.12, box.min.y - maxDim * 0.02, box.min.z - maxDim * 0.12);
    axesRef.current = axes;
    scene.add(axes);
  }
}

function clearModel(scene: THREE.Scene, groupRef: React.MutableRefObject<THREE.Group | null>) {
  if (!groupRef.current) return;
  scene.remove(groupRef.current);
  disposeObject(groupRef.current);
  groupRef.current = null;
}

function clearDecorations(
  scene: THREE.Scene,
  gridRef: React.MutableRefObject<THREE.GridHelper | null>,
  axesRef: React.MutableRefObject<THREE.AxesHelper | null>
) {
  if (gridRef.current) { scene.remove(gridRef.current); disposeLines(gridRef.current); gridRef.current = null; }
  if (axesRef.current) { scene.remove(axesRef.current); disposeLines(axesRef.current); axesRef.current = null; }
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    if (!mesh.material) return;
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
  });
}

function disposeLines(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const line = child as THREE.LineSegments;
    line.geometry?.dispose();
    if (!line.material) return;
    (Array.isArray(line.material) ? line.material : [line.material]).forEach((m) => m.dispose());
  });
}
