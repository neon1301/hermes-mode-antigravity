# Three.js WebGL VRAM Hygiene, InstancedMesh & Digital Twin Architecture

This reference manual provides industrial-grade WebGL memory management, Three.js VRAM leak elimination, and high-performance digital twin rendering patterns for **🌐 Gleb**.

---

## 1. WebGL & Three.js VRAM Leak Elimination (Strict Zero-Leak)

Browsers and desktop WebView2 controls do NOT automatically garbage collect GPU VRAM when Three.js objects are dereferenced in JavaScript. Textures, vertex buffers, and shaders remain resident in GPU memory until explicitly disposed, leading to crashes and tab termination (`OutOfMemoryException` / Context Lost).

### The Universal Recursive Disposer Pattern
```javascript
export function disposeThreeScene(scene, renderer) {
  if (!scene) return;

  // 1. Recursive traversal and disposal of all geometries, materials, and textures
  scene.traverse((object) => {
    if (!object.isMesh && !object.isLine && !object.isPoints) return;

    // Dispose geometry vertex buffers
    if (object.geometry) {
      object.geometry.dispose();
    }

    // Dispose materials and attached texture maps
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const mat of materials) {
        disposeMaterial(mat);
      }
    }
  });

  // 2. Clear scene children
  while (scene.children.length > 0) {
    scene.remove(scene.children[0]);
  }

  // 3. Dispose renderer, WebGL context, and DOM canvas
  if (renderer) {
    renderer.dispose();
    if (renderer.forceContextLoss) {
      renderer.forceContextLoss();
    }
    const gl = renderer.getContext();
    if (gl && gl.getExtension('WEBGL_lose_context')) {
      gl.getExtension('WEBGL_lose_context').loseContext();
    }
  }
}

function disposeMaterial(mat) {
  if (!mat) return;
  const textureKeys = [
    'map', 'alphaMap', 'bumpMap', 'displacementMap',
    'emissiveMap', 'envMap', 'metalnessMap', 'normalMap', 'roughnessMap'
  ];
  for (const key of textureKeys) {
    if (mat[key] && typeof mat[key].dispose === 'function') {
      mat[key].dispose();
    }
  }
  mat.dispose();
}
```

---

## 2. Page Visibility API & Render Loop Throttling

Running continuous 60 FPS animation loops (`requestAnimationFrame`) when the user switches tabs or minimizes the window drains GPU/battery and starves the background telemetry thread.

```javascript
export class RenderLoopManager {
  constructor(renderFn) {
    this.renderFn = renderFn;
    this.animationFrameId = null;
    this.isTabActive = !document.hidden;

    this.onVisibilityChange = () => {
      if (document.hidden) {
        this.stop();
      } else {
        this.start();
      }
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  start() {
    if (this.animationFrameId) return;
    const loop = (timestamp) => {
      this.renderFn(timestamp);
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  dispose() {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }
}
```

---

## 3. High-Throughput `InstancedMesh` for 10,000+ Factory Sensors

Creating separate `THREE.Mesh` instances for thousands of factory sensors crushes draw-call budgets. Use `InstancedMesh` to render identical geometries in a single GPU draw call:

```javascript
import * as THREE from 'three';

export function createFactorySensorsInstancedMesh(sensorCount, geometry, material) {
  // Single GPU draw call for thousands of instances
  const instancedMesh = new THREE.InstancedMesh(geometry, material, sensorCount);
  instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  for (let i = 0; i < sensorCount; i++) {
    dummy.position.set((i % 100) * 2, 0, Math.floor(i / 100) * 2);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);

    // Initial state: normal green
    color.setHex(0x00ff66);
    instancedMesh.setColorAt(i, color);
  }

  instancedMesh.instanceMatrix.needsUpdate = true;
  if (instancedMesh.instanceColor) {
    instancedMesh.instanceColor.needsUpdate = true;
  }

  return {
    mesh: instancedMesh,
    updateSensorAlarm: (index, isAlarm) => {
      color.setHex(isAlarm ? 0xff2200 : 0x00ff66);
      instancedMesh.setColorAt(index, color);
      instancedMesh.instanceColor.needsUpdate = true;
    }
  };
}
```

---

## 4. Telemetry Level of Detail (LOD)

For complex machines with animated rollers, gearboxes, and yarn splines, use `THREE.LOD` to reduce geometric load when distant:
- **Level 0 (Distance < 30m):** High-detail kinematic parts with spinning pivots.
- **Level 1 (Distance 30m–100m):** Simplified bounding geometry with PBR material.
- **Level 2 (Distance > 100m):** Single instanced status proxy billboard/box.
