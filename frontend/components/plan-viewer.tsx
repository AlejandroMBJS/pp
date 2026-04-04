"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Edges, Float, Grid, OrbitControls, RoundedBox, useTexture, useGLTF } from "@react-three/drei";
import {
  AlertCircle, Download, ExternalLink, Eye, EyeOff,
  FileCode2, FileImage, FileText, LoaderCircle, Trash2, Upload,
} from "lucide-react";
import { CadViewer } from "./cad-viewer";

function GlbPreviewSheet({ assetUrl }: { assetUrl: string }) {
  const { scene } = useGLTF(assetUrl);
  const group = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 5 / (maxDim || 1);
    scene.scale.set(scale, scale, scale);
    scene.position.set(-center.x * scale, -center.y * scale, 0.5);
    return scene;
  }, [scene]);
  return <primitive object={group} />;
}

import { Mesh, CanvasTexture } from "three";
import { useWebGL } from "../hooks/use-webgl";
import * as pdfjs from "pdfjs-dist";
import DxfParser from "dxf-parser";
import * as THREE from "three";

if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Blueprint = {
  id: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number;
  url_archivo: string;
  url_preview?: string;
  status: string;
  scale: string;
  version: number;
  created_at: string;
};

type PlanViewerProps = {
  blueprints: Blueprint[];
  token?: string;
  onUpload?: (file: File) => Promise<void>;
  onDelete?: (blueprintId: string) => Promise<void>;
};

interface DxfLayerState {
  name: string;
  color: string;
  visible: boolean;
  isCustomColor?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizedType(type: string) {
  return type.toLowerCase();
}

function isImageFile(type: string) {
  return ["png", "jpg", "jpeg", "webp", "svg"].includes(normalizedType(type));
}

function isPdfFile(type: string) {
  return normalizedType(type) === "pdf";
}

const CAD_3D_TYPES = ["stl", "3mf"];

function isCadFile(type: string) {
  const t = normalizedType(type);
  return t === "dxf" || t === "dwg" || CAD_3D_TYPES.includes(t);
}

function isVectorCadFile(type: string) {
  const t = normalizedType(type);
  return t === "dxf" || t === "dwg";
}

function isModelCadFile(type: string) {
  return CAD_3D_TYPES.includes(normalizedType(type));
}

function isInlinePreviewable(type: string) {
  return isPdfFile(type) || isImageFile(type) || isCadFile(type) || normalizedType(type) === "glb";
}

/** AutoCAD Color Index → hex */
function aciToHex(aci: number): string {
  const table: Record<number, string> = {
    1: "#ef4444", 2: "#eab308", 3: "#22c55e", 4: "#06b6d4",
    5: "#3b82f6", 6: "#d946ef", 7: "#f8fafc", 8: "#64748b", 9: "#94a3b8",
  };
  return table[Math.abs(aci)] ?? "#60a5fa";
}

const ARCH_PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e", 
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#1d4ed8", 
  "#0f766e", "#0e7490", "#0369a1", "#1e3a8a", "#f8fafc", "#94a3b8", 
  "#64748b", "#475569", "#334155", "#1e293b", "#0f172a"
];

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

function getEntityBounds(entity: any): [number, number, number, number] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x: number, y: number) => {
    if (!isFinite(x) || !isFinite(y)) return;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  switch (entity.type) {
    case "LINE":
      // dxf-parser stores start/end in entity.vertices[0] and entity.vertices[1]
      entity.vertices?.forEach((v: any) => add(v.x, v.y));
      break;
    case "LWPOLYLINE": case "POLYLINE":
      entity.vertices?.forEach((v: any) => add(v.x, v.y));
      break;
    case "CIRCLE": case "ARC":
      if (entity.center) {
        const r = entity.radius ?? 0;
        add(entity.center.x - r, entity.center.y - r);
        add(entity.center.x + r, entity.center.y + r);
      }
      break;
    default:
      return null;
  }
  return isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

// ─── DXF 2D Canvas Viewer ─────────────────────────────────────────────────────

interface ViewState { offsetX: number; offsetY: number; scale: number; }

function DxfPlanViewer({
  assets,
  layers,
  onLayersInit,
}: {
  assets: Map<string, string>;
  layers: Map<string, DxfLayerState[]>;
  onLayersInit: (planId: string, layers: DxfLayerState[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dxfRefs = useRef<Map<string, any>>(new Map());
  const viewRef = useRef<ViewState>({ offsetX: 0, offsetY: 0, scale: 1 });
  const layersRef = useRef(layers);
  const [loadingMap, setLoadingMap] = useState<Map<string, boolean>>(new Map());
  const [errorsMap, setErrorsMap] = useState<Map<string, string>>(new Map());

  useEffect(() => { layersRef.current = layers; }, [layers]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { offsetX, offsetY, scale } = viewRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, -scale);

    const lw = Math.max(0.5 / scale, 0.3);

    dxfRefs.current.forEach((dxf, planId) => {
      const planLayers = layersRef.current.get(planId) ?? [];
      const visibleSet = new Set(planLayers.filter((l) => l.visible).map((l) => l.name));
      const layerColorMap = new Map(planLayers.map((l) => [l.name, l.color]));

      dxf.entities?.forEach((entity: any) => {
        const layerName = entity.layer ?? "0";
        if (!visibleSet.has(layerName)) return;

        const layerState = planLayers.find((l) => l.name === layerName);
        let color = layerState?.color ?? "#60a5fa";

        if (!layerState?.isCustomColor) {
          const ci = entity.colorIndex ?? entity.color;
          if (ci != null && ci !== 0 && ci !== 256) color = aciToHex(ci);
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = lw;

        switch (entity.type) {
          case "LINE":
            if (entity.vertices?.length >= 2) {
              ctx.beginPath();
              ctx.moveTo(entity.vertices[0].x, entity.vertices[0].y);
              ctx.lineTo(entity.vertices[1].x, entity.vertices[1].y);
              ctx.stroke();
            }
            break;
          case "LWPOLYLINE":
          case "POLYLINE":
            if (entity.vertices?.length > 0) {
              ctx.beginPath();
              ctx.moveTo(entity.vertices[0].x, entity.vertices[0].y);
              for (let i = 1; i < entity.vertices.length; i++) {
                ctx.lineTo(entity.vertices[i].x, entity.vertices[i].y);
              }
              if (entity.shape) ctx.closePath();
              ctx.stroke();
            }
            break;
          case "CIRCLE": {
            if (!entity.center) break;
            const { x: cx, y: cy } = entity.center;
            const r = entity.radius ?? 1;
            const steps = Math.max(32, Math.ceil(r * scale * 4));
            ctx.beginPath();
            for (let i = 0; i <= steps; i++) {
              const a = (i / steps) * Math.PI * 2;
              const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
              i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
            break;
          }
          case "ARC": {
            if (!entity.center) break;
            const { x: cx, y: cy } = entity.center;
            const r = entity.radius ?? 1;
            const startRad = entity.startAngle ?? 0;
            const endRad = entity.endAngle ?? Math.PI * 2;
            let span = endRad - startRad;
            if (span < 0) span += Math.PI * 2;
            if (span === 0) span = Math.PI * 2;
            const steps = Math.max(16, Math.ceil(r * scale * span * 2));
            ctx.beginPath();
            for (let i = 0; i <= steps; i++) {
              const a = startRad + (i / steps) * span;
              const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
              i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.stroke();
            break;
          }
        }
      });
    });

    ctx.restore();
  }, []);

  const fitToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dxfRefs.current.size) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    dxfRefs.current.forEach((dxf) => {
      dxf.entities?.forEach((e: any) => {
        const b = getEntityBounds(e);
        if (b) {
          minX = Math.min(minX, b[0]); minY = Math.min(minY, b[1]);
          maxX = Math.max(maxX, b[2]); maxY = Math.max(maxY, b[3]);
        }
      });
    });
    if (!isFinite(minX)) return;

    const W = canvas.width, H = canvas.height;
    const margin = 48;
    const dxfW = maxX - minX || 1;
    const dxfH = maxY - minY || 1;
    const scale = Math.min((W - margin * 2) / dxfW, (H - margin * 2) / dxfH);

    viewRef.current = {
      scale,
      offsetX: (W - dxfW * scale) / 2 - minX * scale,
      offsetY: H - (H - dxfH * scale) / 2 + minY * scale,
    };
    redraw();
  }, [redraw]);

  // Parse DXFs when assets change
  useEffect(() => {
    let cancelled = false;

    async function loadIndividual(id: string, url: string) {
      if (dxfRefs.current.has(id)) return;
      setLoadingMap(prev => new Map(prev).set(id, true));

      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        const parser = new DxfParser();
        const dxf = parser.parseSync(text);
        if (!dxf) throw new Error("Parse failed");

        if (!cancelled) {
          dxfRefs.current.set(id, dxf);
          const layerMap = new Map<string, string>();
          layerMap.set("0", "#60a5fa");
          if (dxf.tables?.layer?.layers) {
            Object.entries(dxf.tables.layer.layers).forEach(([name, layer]: [string, any]) => {
              layerMap.set(name, layer.color != null ? aciToHex(Math.abs(layer.color)) : "#60a5fa");
            });
          }
          dxf.entities?.forEach((e: any) => {
            if (e.layer && !layerMap.has(e.layer)) layerMap.set(e.layer, "#60a5fa");
          });

          onLayersInit(id, Array.from(layerMap.entries()).map(([name, color]) => ({ name, color, visible: true })));
          setLoadingMap(prev => { const n = new Map(prev); n.delete(id); return n; });
          requestAnimationFrame(fitToCanvas);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorsMap(prev => new Map(prev).set(id, err instanceof Error ? err.message : "Unknown error"));
          setLoadingMap(prev => { const n = new Map(prev); n.delete(id); return n; });
        }
      }
    }

    assets.forEach((url, id) => {
        void loadIndividual(id, url);
    });

    // Cleanup DXF refs when assets are removed
    dxfRefs.current.forEach((_, id) => {
        if (!assets.has(id)) dxfRefs.current.delete(id);
    });

    return () => { cancelled = true; };
  }, [assets, onLayersInit, fitToCanvas]);

  const isLoading = Array.from(loadingMap.values()).some(v => v);
  const hasErrors = errorsMap.size > 0;

  // Redraw when layer visibility changes
  useEffect(() => {
    if (!isLoading && dxfRefs.current.size) redraw();
  }, [layers, isLoading, redraw]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const obs = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      if (dxfRefs.current.size) fitToCanvas();
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, [fitToCanvas]);

  // Pan & zoom
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const onMouseDown = (e: React.MouseEvent) => { dragRef.current = { x: e.clientX, y: e.clientY }; };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    viewRef.current.offsetX += e.clientX - dragRef.current.x;
    viewRef.current.offsetY += e.clientY - dragRef.current.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    redraw();
  };
  const onMouseUp = () => { dragRef.current = null; };
  const onWheel = (e: React.WheelEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const { offsetX, offsetY, scale } = viewRef.current;
    const newScale = scale * factor;
    viewRef.current = {
      scale: newScale,
      offsetX: mx * (1 - factor) + offsetX * factor,
      offsetY: my * (1 - factor) + offsetY * factor,
    };
    redraw();
  };

  return (
    <div ref={containerRef} className="relative h-full w-full select-none bg-[#020617]">
      <canvas
        ref={canvasRef}
        className="block h-full w-full cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      />
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#020617]/80 px-5 py-3 backdrop-blur-sm">
            <LoaderCircle className="animate-spin text-blue-400" size={16} />
            <span className="text-xs font-black uppercase tracking-widest text-white/60">Loading vector CAD</span>
          </div>
        </div>
      )}
      {hasErrors && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
          <div className="max-w-md rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center">
            <AlertCircle className="mx-auto mb-3 text-red-400" size={28} />
            <p className="text-sm font-bold text-red-300">{Array.from(errorsMap.values())[0]}</p>
          </div>
        </div>
      )}
      {!isLoading && !hasErrors && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1.5">
            <FileCode2 size={11} className="text-blue-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-300">
              CAD Vector · Arrastra · Rueda para zoom
            </span>
          </div>
          <button
            onClick={fitToCanvas}
            className="absolute bottom-4 right-4 rounded-xl border border-white/10 bg-[#020617]/80 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/50 backdrop-blur-sm transition-colors hover:text-white"
          >
            Ajustar Vista
          </button>
        </>
      )}
    </div>
  );
}

// ─── Three.js helpers ─────────────────────────────────────────────────────────

function ImagePreviewSheet({ assetUrl }: { assetUrl: string }) {
  const texture = useTexture(assetUrl);
  return (
    <Float speed={1.2} rotationIntensity={0.18} floatIntensity={0.55}>
      <group>
        <RoundedBox args={[6.4, 4.1, 0.12]} radius={0.14}>
          <meshStandardMaterial color="#0f172a" metalness={0.4} roughness={0.22} />
          <Edges color="#60a5fa" />
        </RoundedBox>
        <mesh position={[0, 0, 0.08]}>
          <planeGeometry args={[5.8, 3.5]} />
          <meshStandardMaterial map={texture} toneMapped={false} />
        </mesh>
      </group>
    </Float>
  );
}

function PdfPreviewSheet({ assetUrl }: { assetUrl: string }) {
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function renderPdf() {
      try {
        const pdf = await pdfjs.getDocument(assetUrl).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        if (context) {
          await page.render({ canvasContext: context, viewport }).promise;
          if (!cancelled) setTexture(new CanvasTexture(canvas));
        }
      } catch (err) {
        console.error("PDF preview render error:", err);
      }
    }
    void renderPdf();
    return () => { cancelled = true; };
  }, [assetUrl]);

  return (
    <Float speed={1.2} rotationIntensity={0.18} floatIntensity={0.55}>
      <group>
        <RoundedBox args={[6.4, 4.1, 0.12]} radius={0.14}>
          <meshStandardMaterial color="#0f172a" metalness={0.4} roughness={0.22} />
          <Edges color="#60a5fa" />
        </RoundedBox>
        {texture && (
          <mesh position={[0, 0, 0.08]}>
            <planeGeometry args={[5.8, 3.5]} />
            <meshStandardMaterial map={texture} toneMapped={false} />
          </mesh>
        )}
      </group>
    </Float>
  );
}

function CadArtifact({ accent }: { accent: string }) {
  const groupRef = useRef<Mesh | null>(null);
  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = state.clock.elapsedTime * 0.18;
    groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.4) * 0.08;
  });
  return (
    <group ref={groupRef}>
      <Float speed={1.4} rotationIntensity={0.16} floatIntensity={0.45}>
        <RoundedBox args={[4.8, 3, 0.3]} radius={0.16}>
          <meshStandardMaterial color="#0b1120" metalness={0.55} roughness={0.24} />
          <Edges color={accent} />
        </RoundedBox>
      </Float>
      <mesh position={[0, 0, 0.3]}>
        <torusGeometry args={[1.35, 0.03, 20, 96]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.45} />
      </mesh>
      <mesh position={[0, 0, -0.35]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.75, 1.82, 96]} />
        <meshStandardMaterial color="#e2e8f0" emissive="#e2e8f0" emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[-1.1, 0.85, 0.15]}>
        <boxGeometry args={[0.95, 0.06, 0.06]} />
        <meshStandardMaterial color="#f8fafc" emissive="#f8fafc" emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[1.05, -0.72, 0.18]} rotation={[0, 0, 0.45]}>
        <boxGeometry args={[1.3, 0.05, 0.05]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.22} />
      </mesh>
    </group>
  );
}

function BlueprintStage({
  fileType,
  assetUrl,
  previewUrl,
}: {
  fileType: string;
  assetUrl: string | null;
  previewUrl?: string | null;
}) {
  const isGlb = normalizedType(fileType) === "glb";
  const accent = isInlinePreviewable(fileType) ? "#60a5fa" : "#f59e0b";

  return (
    <Canvas camera={{ position: [0, 1.8, 8], fov: 35 }} dpr={[1, 2]}>
      <color attach="background" args={["#020617"]} />
      {!isGlb && <fog attach="fog" args={["#020617", 10, 18]} />}
      <ambientLight intensity={isGlb ? 1.0 : 0.6} />
      <directionalLight position={[8, 10, 6]} intensity={1.4} color="#dbeafe" />
      <pointLight position={[-6, 4, 2]} intensity={0.8} color="#38bdf8" />
      <pointLight position={[6, -2, 4]} intensity={0.55} color="#f59e0b" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.1, 0]}>
        <planeGeometry args={[28, 28]} />
        <meshStandardMaterial color="#050816" metalness={0.12} roughness={0.94} />
      </mesh>
      <Grid
        position={[0, -2.08, 0]}
        args={[24, 24]}
        sectionColor={accent}
        cellColor="#1e293b"
        infiniteGrid
        fadeDistance={26}
        fadeStrength={1.4}
      />

      {assetUrl && isImageFile(fileType) ? (
        <ImagePreviewSheet assetUrl={assetUrl} />
      ) : assetUrl && isPdfFile(fileType) ? (
        <PdfPreviewSheet assetUrl={assetUrl} />
      ) : assetUrl && isGlb ? (
        <GlbPreviewSheet assetUrl={assetUrl} />
      ) : previewUrl ? (
        <ImagePreviewSheet assetUrl={previewUrl} />
      ) : (
        <CadArtifact accent={accent} />
      )}

      <OrbitControls
        enablePan
        enableZoom
        minPolarAngle={0}
        maxPolarAngle={isGlb ? Math.PI : Math.PI / 2.1}
        autoRotate={!assetUrl && !previewUrl}
        autoRotateSpeed={0.4}
      />
    </Canvas>
  );
}

// ─── Main PlanViewer ──────────────────────────────────────────────────────────

export function PlanViewer({ blueprints, token, onUpload, onDelete }: PlanViewerProps) {
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>(blueprints[0] ? [blueprints[0].id] : []);
  const [assets, setAssets] = useState<Map<string, string>>(new Map());
  const [previews, setPreviews] = useState<Map<string, string>>(new Map());
  const [previewError, setPreviewError] = useState(false);
  const [assetLoading, setAssetLoading] = useState(false);
  const [assetErrors, setAssetErrors] = useState<Map<string, string>>(new Map());
  const [dxfLayers, setDxfLayers] = useState<Map<string, DxfLayerState[]>>(new Map());
  const isWebGLSupported = useWebGL();

  useEffect(() => {
    if (!blueprints.length) { setSelectedPlanIds([]); return; }
    if (!selectedPlanIds.length || !blueprints.some((b) => selectedPlanIds.includes(b.id))) {
      setSelectedPlanIds([blueprints[0].id]);
    }
  }, [blueprints, selectedPlanIds]);

  const activePlans = useMemo(
    () => blueprints.filter((b) => selectedPlanIds.includes(b.id)),
    [blueprints, selectedPlanIds]
  );

  // Reset DXF layers when switching plans (cleanup old ones)
  useEffect(() => {
    setDxfLayers(prev => {
      const next = new Map(prev);
      next.forEach((_, id) => {
        if (!selectedPlanIds.includes(id)) next.delete(id);
      });
      return next;
    });
  }, [selectedPlanIds]);

  // Load assets and previews for all selected plans
  useEffect(() => {
    let cancelled = false;
    const currentObjectUrls = new Map<string, string>();
    const currentPreviewUrls = new Map<string, string>();

    async function loadAssets() {
      if (!activePlans.length || !token) {
        setAssets(new Map());
        setPreviews(new Map());
        return;
      }
      setAssetLoading(true);

      for (const plan of activePlans) {
        try {
          const isDwgWithPreview = plan.file_type.toLowerCase() === "dwg" && plan.url_preview;

          if (!assets.has(plan.id) && isDwgWithPreview) {
            const previewRes = await fetch(browserSafeURL(plan.url_preview || ""), {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (previewRes.ok) {
              const previewAssetUrl = URL.createObjectURL(await previewRes.blob());
              currentObjectUrls.set(plan.id, previewAssetUrl);
            }
            continue;
          }

          if (!assets.has(plan.id) && !isDwgWithPreview) {
            const res = await fetch(browserSafeURL(plan.url_archivo), {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const url = URL.createObjectURL(await res.blob());
              currentObjectUrls.set(plan.id, url);
            }
          }
          if (plan.url_preview && !previews.has(plan.id) && !isDwgWithPreview) {
            const pRes = await fetch(browserSafeURL(plan.url_preview), {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (pRes.ok) {
              const pUrl = URL.createObjectURL(await pRes.blob());
              currentPreviewUrls.set(plan.id, pUrl);
            }
          }
        } catch (err) {
          console.error(`Error loading plan ${plan.id}:`, err);
          setAssetErrors(prev => new Map(prev).set(plan.id, err instanceof Error ? err.message : "No se pudo cargar el archivo"));
        }
      }

      if (!cancelled) {
        setAssets(prev => {
          const next = new Map(prev);
          currentObjectUrls.forEach((url, id) => next.set(id, url));
          // Remove assets no longer selected
          next.forEach((_, id) => {
             if (!selectedPlanIds.includes(id)) {
               URL.revokeObjectURL(_);
               next.delete(id);
             }
          });
          return next;
        });
        setPreviews(prev => {
          const next = new Map(prev);
          currentPreviewUrls.forEach((url, id) => next.set(id, url));
          next.forEach((_, id) => {
            if (!selectedPlanIds.includes(id)) {
              URL.revokeObjectURL(_);
              next.delete(id);
            }
          });
          return next;
        });
        setAssetLoading(false);
      }
    }

    void loadAssets();
    return () => {
      cancelled = true;
    };
  }, [selectedPlanIds, token]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const MAX_SIZE = 500 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert(`The file exceeds the 500MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      e.target.value = "";
      return;
    }
    
    const validExtensions = [".dwg", ".dxf", ".stl", ".3mf", ".glb", ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".svg"];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (!validExtensions.includes(ext)) {
      alert(`Unsupported format. Use: ${validExtensions.join(", ")}`);
      e.target.value = "";
      return;
    }
    
    if (onUpload) {
      await onUpload(file);
      e.target.value = "";
    }
  };

  const handleDxfLayersInit = useCallback((planId: string, layers: DxfLayerState[]) => {
    setDxfLayers((prev) => {
      const next = new Map(prev);
      next.set(planId, layers);
      return next;
    });
  }, []);

  const renderForeground = () => {
    if (!activePlans.length) return null;
    if (assetLoading) {
      return (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="rounded-3xl border border-white/10 bg-[#020617]/85 px-6 py-5 backdrop-blur-xl">
            <div className="flex items-center gap-3 text-white/70">
              <LoaderCircle className="animate-spin text-blue-400" size={18} />
              <span className="text-xs font-black uppercase tracking-[0.2em]">Loading technical assets</span>
            </div>
          </div>
        </div>
      );
    }
    
    // If any selected plan has an error
    if (assetErrors.size > 0) {
        const firstErr = Array.from(assetErrors.values())[0];
        return (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-8">
              <div className="max-w-[520px] rounded-[32px] border border-red-500/20 bg-red-500/[0.06] p-7 text-center backdrop-blur-xl">
                <AlertCircle className="mx-auto mb-4 text-red-300" size={34} />
                <div className="text-lg font-black uppercase tracking-tight text-white">Failed to load technical files</div>
                <div className="mt-2 text-sm font-medium leading-relaxed text-white/50">{firstErr}</div>
              </div>
            </div>
          );
    }

    // PDF overlay (only if exactly one PDF is selected)
    if (activePlans.length === 1) {
        const plan = activePlans[0];
        const url = assets.get(plan.id);
        if (url && isPdfFile(plan.file_type)) {
            return (
                <div className="absolute inset-[8%] z-10 overflow-hidden rounded-[32px] border border-white/10 bg-white shadow-[0_30px_120px_rgba(2,6,23,0.65)]">
                  <iframe src={url} title={plan.file_name} className="h-full w-full" />
                </div>
              );
        }
    }
    return null;
  };

  const renderViewport = () => {
    if (!activePlans.length) return null;
    if (assetLoading) return null;

    const firstPlan = activePlans[0];
    const firstType = normalizedType(firstPlan.file_type);
    const firstAsset = assets.get(firstPlan.id);

    if (isVectorCadFile(firstType)) {
      const vectorAssets = new Map<string, string>();
      activePlans.forEach((plan) => {
        if (!isVectorCadFile(plan.file_type)) return;
        const url = assets.get(plan.id);
        if (url) vectorAssets.set(plan.id, url);
      });

      if (vectorAssets.size > 0) {
        return <DxfPlanViewer assets={vectorAssets} layers={dxfLayers} onLayersInit={handleDxfLayersInit} />;
      }
    }

    // 3D CAD files (STL, 3MF) → Three.js viewport
    if (isModelCadFile(firstType) && firstAsset) {
      return (
        <CadViewer
          fileUrl={firstAsset}
          fileType={firstType}
          fileName={firstPlan.file_name}
          previewUrl={previews.get(firstPlan.id)}
        />
      );
    }

    return (
      <BlueprintStage
        fileType={firstPlan.file_type}
        assetUrl={firstAsset ?? null}
        previewUrl={previews.get(firstPlan.id) ?? null}
      />
    );
  };

  return (
    <div className="flex h-full flex-col animate-fadeIn">
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] p-6">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-white">Technical Project Viewer</h2>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
            Stage 3D · Visor DXF vectorial · Preview autenticado
          </p>
        </div>
        <label className="cursor-pointer rounded-xl border border-white/10 bg-white/5 p-2 text-white/60 transition-colors hover:text-white">
          <Upload size={18} />
          <input
            type="file"
            className="hidden"
            onChange={handleFileChange}
            accept=".dwg,.dxf,.stl,.3mf,.glb,.pdf,.png,.jpg,.jpeg,.webp,.svg"
          />
        </label>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_320px]">
        {/* Viewport */}
        <div className="relative min-h-[560px] overflow-hidden border-r border-white/5 bg-[#020617]">
          {activePlans.length > 0 ? (
            <>
              {renderViewport()}
              {renderForeground()}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-blue-500/10 bg-blue-500/5">
                <FileText className="text-blue-500/20" size={48} />
              </div>
              <div className="space-y-2">
                 <h3 className="text-xl font-black uppercase tracking-tight text-white">No technical files yet</h3>
                <p className="max-w-[320px] text-xs font-bold uppercase leading-relaxed tracking-widest text-white/30">
                   Upload a DWG, DXF, PDF, or image to add technical files to this project.
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-blue-600 px-8 py-4 font-black text-white shadow-xl shadow-blue-500/20 transition-all active:scale-95 hover:bg-blue-500">
                <Upload size={20} />
                <span className="text-xs uppercase tracking-[0.2em]">Upload first file</span>
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  accept=".dwg,.dxf,.stl,.3mf,.glb,.pdf,.png,.jpg,.jpeg,.webp,.svg"
                />
              </label>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="flex h-full flex-col divide-y divide-white/5 overflow-y-auto bg-white/[0.01]">
          {/* Blueprint list */}
          <div className="p-6">
            <div className="mb-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
              File Versions
            </div>
            <div className="space-y-3">
              {blueprints.map((blueprint) => (
                <button
                  key={blueprint.id}
                  onClick={(e) => {
                    const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;
                    setSelectedPlanIds(prev => {
                      if (isMulti) {
                        return prev.includes(blueprint.id) 
                          ? prev.filter(id => id !== blueprint.id) 
                          : [...prev, blueprint.id];
                      }
                      return [blueprint.id];
                    });
                  }}
                  className={`w-full rounded-2xl border p-4 text-left transition-all ${
                    selectedPlanIds.includes(blueprint.id)
                      ? "border-blue-500/50 bg-blue-600/10"
                      : "border-white/5 bg-white/5 hover:border-white/10"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <div className="text-xs font-bold text-white">{blueprint.file_name}</div>
                    {isImageFile(blueprint.file_type) ? (
                      <FileImage size={14} className="text-white/30" />
                    ) : (
                      <FileCode2 size={14} className="text-white/30" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-white/40">
                    <span>{blueprint.file_type.toUpperCase()}</span>
                    <span>·</span>
                    <span>v{blueprint.version}</span>
                    <span>·</span>
                    <span>{formatBytes(blueprint.file_size_bytes)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* DXF Layer panel grouped by plan */}
          {dxfLayers.size > 0 && Array.from(dxfLayers.entries()).map(([planId, layers]) => (
            <div key={planId} className="p-6 border-b border-white/5">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">
                  {blueprints.find(b => b.id === planId)?.file_name}
                </div>
                <div className="text-[10px] font-bold text-white/20">{layers.length} layers</div>
              </div>
              <div className="space-y-1">
                {layers.map((layer) => (
                  <div key={layer.name} className="group relative">
                    <div className="flex items-center gap-2 rounded-xl px-3 py-2 transition-all hover:bg-white/5">
                      <button
                        type="button"
                        onClick={() =>
                          setDxfLayers((prev) => {
                            const next = new Map(prev);
                            const planLayers = next.get(planId)?.map(l => 
                              l.name === layer.name ? { ...l, visible: !l.visible } : l
                            );
                            if (planLayers) next.set(planId, planLayers);
                            return next;
                          })
                        }
                        className={`flex flex-1 items-center gap-2.5 text-left transition-all ${
                          layer.visible ? "opacity-100" : "opacity-35"
                        }`}
                      >
                        <div
                          className="h-3 w-3 flex-shrink-0 rounded-full border border-white/20 shadow-sm"
                          style={{ backgroundColor: layer.color }}
                        />
                        <span className="flex-1 truncate font-mono text-[11px] text-white/70">{layer.name}</span>
                        {layer.visible ? (
                          <Eye size={12} className="flex-shrink-0 text-white/30" />
                        ) : (
                          <EyeOff size={12} className="flex-shrink-0 text-white/20" />
                        )}
                      </button>

                      <div className="flex items-center">
                        <input
                          type="color"
                          value={layer.color}
                          onChange={(e) => {
                            const newColor = e.target.value;
                            setDxfLayers((prev) => {
                              const next = new Map(prev);
                              const planLayers = next.get(planId)?.map(l => 
                                l.name === layer.name ? { ...l, color: newColor, isCustomColor: true } : l
                              );
                              if (planLayers) next.set(planId, planLayers);
                              return next;
                            });
                          }}
                          className="h-4 w-4 transform cursor-pointer border-none bg-transparent transition-transform hover:scale-110"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Detail panel */}
          <div className="space-y-5 p-6">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Details</div>
            {activePlans.length > 0 ? (
              <>
                <div className="space-y-3 rounded-3xl border border-white/5 bg-white/[0.02] p-5">
                   <div className="text-[10px] font-black uppercase tracking-widest text-white/20">Selected ({activePlans.length})</div>
                   <div className="space-y-1 mt-2">
                     {activePlans.map(p => (
                       <div key={p.id} className="text-xs font-bold text-white/70 flex items-center justify-between">
                         <span className="truncate">{p.file_name}</span>
                         <span className="text-[10px] font-mono text-blue-400">{p.file_type.toUpperCase()}</span>
                       </div>
                     ))}
                   </div>
                </div>

                <div className="space-y-3">
                  {activePlans.length === 1 && (
                    <>
                      <a
                        href={assets.get(activePlans[0].id)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10"
                      >
                        <span className="text-xs font-black uppercase tracking-[0.2em] text-white/70">Open asset</span>
                        <ExternalLink size={16} className="text-white/30" />
                      </a>
                      <a
                        href={assets.get(activePlans[0].id)}
                        download={activePlans[0].file_name}
                        className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10"
                      >
                        <span className="text-xs font-black uppercase tracking-[0.2em] text-white/70">Download asset</span>
                        <Download size={16} className="text-white/30" />
                      </a>
                    </>
                  )}
                  {onDelete && activePlans.length === 1 && (
                    <button
                      type="button"
                      onClick={() => void onDelete(activePlans[0].id)}
                      className="flex w-full items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-left transition-colors hover:bg-red-500/[0.12]"
                    >
                      <span className="text-xs font-black uppercase tracking-[0.2em] text-red-200">Delete file</span>
                      <Trash2 size={16} className="text-red-300" />
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-3xl border border-dashed border-white/10 p-6 text-center text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
                No active selection
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
