import * as THREE from 'three';

interface OcctMeshData {
  color?: [number, number, number];
  attributes: {
    position: { array: number[] };
    normal?: { array: number[] };
  };
  index?: { array: number[] };
}

interface OcctReadResult {
  success?: boolean;
  meshes?: OcctMeshData[];
}

interface OcctModule {
  ReadStepFile(data: Uint8Array, params: object | null): OcctReadResult;
}

declare global {
  interface Window {
    occtimportjs?: (options?: { locateFile?: (path: string, prefix: string) => string }) => Promise<OcctModule>;
  }
}

let occtModulePromise: Promise<OcctModule> | null = null;

export async function loadSTL(data: ArrayBuffer): Promise<THREE.Group> {
  const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
  const loader = new STLLoader();
  const geometry = loader.parse(data);
  
  if (geometry.attributes.position.count === 0) {
    throw new Error('STL file contains no geometry data.');
  }
  
  // Ensure normals are computed for proper lighting
  geometry.computeVertexNormals();
  geometry.center(); // Center the geometry itself

  const material = new THREE.MeshStandardMaterial({ 
    color: 0x999999, 
    flatShading: false,
    side: THREE.DoubleSide,
    metalness: 0.2,
    roughness: 0.8
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  const group = new THREE.Group();
  group.add(mesh);
  normalize3DGroup(group);
  return group;
}

export async function load3MF(data: ArrayBuffer): Promise<THREE.Group> {
  const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js');
  const loader = new ThreeMFLoader();
  const group = loader.parse(data);
  if (group.children.length === 0) {
    throw new Error('3MF file contains no geometry data.');
  }
  normalize3DGroup(group);
  return group;
}

export async function loadSTEP(data: Uint8Array): Promise<THREE.Group> {
  const occt = await getOcctModule();
  const result = occt.ReadStepFile(data, null);
  
  const group = new THREE.Group();
  if (!result?.success) {
    throw new Error('Failed to parse STEP/STP file.');
  }
  if (!result.meshes?.length) {
    throw new Error('STEP/STP file contains no geometry data.');
  }

  result.meshes.forEach((meshData) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.attributes.position.array, 3));
    if (meshData.index) {
      geometry.setIndex(new THREE.Uint32BufferAttribute(meshData.index.array, 1));
    }
    if (meshData.attributes.normal) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(meshData.attributes.normal.array, 3));
    } else {
      geometry.computeVertexNormals();
    }
    
    const material = new THREE.MeshStandardMaterial({ 
      color: getMeshColor(meshData.color),
      metalness: 0.5,
      roughness: 0.5
    });
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
  });

  normalize3DGroup(group);
  return group;
}

/**
 * DWG to DXF conversion is extremely complex in pure JS.
 * In a real production environment, this would typically be handled by a backend service
 * using a tool like LibreCAD's dwg2dxf or ODA File Converter.
 * 
 * For this implementation, we provide a placeholder that explains the requirement
 * or uses a hypothetical conversion route.
 */
export async function convertDwgToDxf(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/convert-dwg', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to convert DWG');
      }

      const message = await response.text();
      throw new Error(message || 'Failed to convert DWG');
    }

    return await response.text();
  } catch (err) {
    console.error('DWG Conversion Error:', err);
    throw err instanceof Error
      ? err
      : new Error('DWG conversion requires a backend service. Please use DXF for now or ensure the backend is configured.');
  }
}

async function getOcctModule(): Promise<OcctModule> {
  if (occtModulePromise) {
    return occtModulePromise;
  }

  occtModulePromise = (async () => {
    if (typeof window === 'undefined') {
      throw new Error('STEP loading is only available in the browser.');
    }

    if (!window.occtimportjs) {
      await loadScript('/occt-import-js.js');
    }

    if (!window.occtimportjs) {
      throw new Error('STEP loader assets could not be initialized.');
    }

    return window.occtimportjs({
      locateFile: (path: string) => path.endsWith('.wasm') ? '/occt-import-js.wasm' : path,
    });
  })();

  return occtModulePromise;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-occt-loader="true"][src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (window.occtimportjs) {
        resolve();
        return;
      }

      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load STEP loader script.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.occtLoader = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load STEP loader script.'));
    document.head.appendChild(script);
  });
}

function normalize3DGroup(group: THREE.Group) {
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) {
    return;
  }

  const center = box.getCenter(new THREE.Vector3());
  group.position.x -= center.x;
  group.position.z -= center.z;
  group.position.y -= box.min.y;
}

function getMeshColor(color?: [number, number, number]) {
  if (!color) {
    return new THREE.Color(0xcccccc);
  }

  const [r, g, b] = color;
  const needsNormalization = Math.max(r, g, b) > 1;
  return new THREE.Color(
    needsNormalization ? r / 255 : r,
    needsNormalization ? g / 255 : g,
    needsNormalization ? b / 255 : b,
  );
}
