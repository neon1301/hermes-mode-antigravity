# 🌐 Modern Three.js (r186+) Engineering & Digital Twin Patterns

*Adapted from `CloudAI-X/threejs-skills` under the MIT License.*

---

## 1. Modern Scene Setup & Renderer Configuration

```typescript
import * as THREE from 'three';

export function createDigitalTwinRenderer(container: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    alpha: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);
  return renderer;
}
```

---

## 2. PBR Materials & Industrial Machine Aesthetics

Use `MeshStandardMaterial` or `MeshPhysicalMaterial` with realistic roughness and metalness:

```typescript
// Factory equipment steel casing
const industrialSteelMaterial = new THREE.MeshStandardMaterial({
  color: 0x2A2E35,
  metalness: 0.85,
  roughness: 0.25,
  envMapIntensity: 1.0
});

// Machine status indicator light (emissive pulse)
const statusIndicatorMaterial = new THREE.MeshStandardMaterial({
  color: 0x00FF66,
  emissive: 0x00FF66,
  emissiveIntensity: 0.8,
  roughness: 0.2
});
```

---

## 3. High-Density Optimization: `InstancedMesh`

When rendering thousands of factory items (pallets, sensors, conveyor rollers), never create thousands of individual `Mesh` objects. Use a single `InstancedMesh`:

```typescript
const count = 500;
const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const material = new THREE.MeshStandardMaterial({ color: 0x7A8288 });
const instancedMesh = new THREE.InstancedMesh(geometry, material, count);

const dummy = new THREE.Object3D();
for (let i = 0; i < count; i++) {
  dummy.position.set((i % 25) * 1.0, 0, Math.floor(i / 25) * 1.0);
  dummy.updateMatrix();
  instancedMesh.setMatrixAt(i, dummy.matrix);
}
instancedMesh.instanceMatrix.needsUpdate = true;
scene.add(instancedMesh);
```

---

## 4. VRAM Leak Prevention & Lifecycle Teardown

Every Three.js resource allocated in GPU memory MUST be released explicitly when disposing the scene or swapping machine twins:

```typescript
export function disposeThreeHierarchy(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => disposeMaterial(m));
        } else {
          disposeMaterial(mesh.material);
        }
      }
    }
  });
}

function disposeMaterial(mat: THREE.Material) {
  mat.dispose();
  // Dispose all associated textures
  for (const key of Object.keys(mat)) {
    const prop = (mat as any)[key];
    if (prop && prop.isTexture) prop.dispose();
  }
}
```
