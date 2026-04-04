"use client";

import React, { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, PerspectiveCamera, MeshDistortMaterial, MeshWobbleMaterial, OrbitControls, ContactShadows, Environment, Sphere } from "@react-three/drei";
import * as THREE from "three";

function HouseModel() {
  const meshRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.003;
      meshRef.current.rotation.x = Math.sin(state.clock.getElapsedTime() * 0.2) * 0.05;
    }
  });

  return (
    <group ref={meshRef}>
      {/* Foundation - Glassy Slab */}
      <mesh position={[0, -1, 0]}>
        <boxGeometry args={[4.2, 0.1, 4.2]} />
        <meshStandardMaterial 
          color="#3b82f6" 
          transparent
          opacity={0.4}
          roughness={0.1}
          metalness={0.8}
        />
      </mesh>

      {/* Main Structure - Technical Wireframe + Glass */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[3.8, 2.2, 3.8]} />
        <meshStandardMaterial color="#60a5fa" wireframe transparent opacity={0.1} />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[3.7, 2.1, 3.7]} />
        <meshStandardMaterial 
          color="#1e293b" 
          transparent
          opacity={0.2}
          roughness={0.2}
        />
      </mesh>

      {/* Roof - Sharp Accents */}
      <mesh position={[0, 1.8, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[3.2, 1.6, 4]} />
        <meshStandardMaterial color="#2563eb" wireframe transparent opacity={0.3} />
      </mesh>

      {/* Technical Floor Grid */}
      <gridHelper args={[20, 20, "#1e293b", "#0f172a"]} position={[0, -1.05, 0]} />
    </group>
  );
}

function FloatingParticles() {
  const count = 40;
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    return pos;
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial size={0.05} color="#3b82f6" transparent opacity={0.4} sizeAttenuation />
    </points>
  );
}

function FloatingCore() {
  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.5, 32, 32]} />
        <MeshDistortMaterial
          color="#3b82f6"
          speed={3}
          distort={0.4}
          radius={1}
        />
      </mesh>
    </Float>
  );
}

export function Blueprint3D() {
  return (
    <div className="h-full w-full relative min-h-[400px] overflow-hidden rounded-2xl border border-white/5 bg-slate-950/50">
      <Canvas shadows dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[6, 4, 10]} fov={35} />
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={0.8} color="#3b82f6" />
        <spotLight position={[-10, 20, 10]} angle={0.12} penumbra={1} intensity={1} color="#0ea5e9" castShadow />
        
        <Environment preset="city" />
        
        <HouseModel />
        <FloatingCore />
        <FloatingParticles />
        
        <ContactShadows position={[0, -1, 0]} opacity={0.4} scale={15} blur={2.4} far={0.8} />
        <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.4} />
      </Canvas>
      
      {/* Enhanced Technical Overlay */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.05)_0%,transparent_70%)]" />
        
        <div className="absolute top-6 left-6 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <div className="text-[11px] font-bold text-blue-400 uppercase tracking-[0.2em]">System.Core_v2.0</div>
          </div>
          <div className="text-[9px] text-white/30 font-mono">LAT: 19.4326 | LON: -99.1332 | ALT: 2,240m</div>
        </div>

        <div className="absolute bottom-6 right-6 p-4 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <div className="text-[9px] text-white/40 uppercase font-bold tracking-wider">Engine Status</div>
              <div className="text-[12px] font-mono text-green-400">OPTIMAL_LINK</div>
            </div>
            <div className="w-[1px] h-8 bg-white/10" />
            <div className="flex flex-col">
              <div className="text-[9px] text-white/40 uppercase font-bold tracking-wider">Rendering</div>
              <div className="text-[12px] font-mono text-blue-400">UHD_GLASS</div>
            </div>
          </div>
        </div>

        {/* Scanline Effect */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
      </div>
    </div>
  );
}
