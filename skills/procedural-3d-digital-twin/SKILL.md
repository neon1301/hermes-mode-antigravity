---
name: procedural-3d-digital-twin
description: Procedural 3D modeling, WebGL/Three.js, industrial Digital Twins, factory floor maps, and real-time machine telemetry visualization.
---

# Procedural 3D Modeling & Industrial Digital Twin Skill

This skill guides **🌐 Gleb** (Lead 3D Graphics & Industrial Digital Twin Engineer) in procedural 3D modeling, real-time industrial telemetry visualization, factory floor maps, and embedded WebGL runtimes.

---

## 1. 📐 Procedural 3D Modeling Principles (`img2threejs` Methodology)

1. **Zero Heavy Asset Files:** Ban multi-MB external `.gltf`/`.obj`/`.fbx` downloads for standard machinery. Construct complete industrial equipment procedurally using Three.js primitive geometries (`BoxGeometry`, `CylinderGeometry`, `ExtrudeGeometry`, `TorusGeometry`, `TubeGeometry`) and canvas-generated procedural textures.
2. **Hierarchical Scene Graph (Rigid Nodes & Pivots):**
   - Structure machines as a nested `Group` tree: `MachineRoot -> BaseFrame -> SubAssemblies -> ArticulatedJoints -> AnimatedPivots`.
   - **Pivot Points:** Wrap rotating or reciprocating components (shafts, rollers, creel arms, needle bars) in offset pivot groups so rotation occurs around the mechanical axis: `pivot.position.set(...)`, child component at `(-x, -y, -z)`.
   - **Colliders & Bounding Volumes:** Assign non-rendering proxy meshes (`visible = false`) for efficient raycasting, avoiding expensive per-face ray intersection on complex geometry.
3. **Procedural Shaders & PBR Materials:**
   - Use `MeshStandardMaterial` (`metalness: 0.8`, `roughness: 0.25`) for machined metal surfaces.
   - Author lightweight custom GLSL shaders (`ShaderMaterial`/`onBeforeCompile`) for dynamic effects: pulsing alarm rings, yarn flow trails, conveyor motion, and thermal heatmaps.

---

## 2. 🏭 Industrial Digital Twin Architecture & Telemetry Binding

1. **Decoupled Telemetry Ingestion:**
   - Maintain a normalized telemetry state object decoupled from the render loop.
   - Ingest machine telemetry (shaft RPM, yarn tension, motor temperatures, state `IDLE/RUNNING/ALARM/E_STOP`, fault codes) via WebSocket, SSE, or desktop IPC.
2. **Real-Time Kinematics & Animation Sync:**
   - Scale shaft rotation strictly by RPM and delta: `shaft.rotation.z += (rpm / 60) * Math.PI * 2 * delta`.
   - Thread/Yarn sensors: Update dynamic spline curves (`CatmullRomCurve3`) and `TubeGeometry` vertices in real time; recolor to red upon yarn break signal.
   - Temperature heatmaps: Map numeric sensor arrays to vertex colors or dynamic canvas gradient textures (`CanvasTexture.needsUpdate = true`).
3. **State-Driven Material States:**
   - `RUNNING`: Emissive `#00ff66`, pulse frequency 0.5 Hz.
   - `IDLE`: Neutral metal `#888888`, emissive `#000000`.
   - `ALARM` / `E_STOP`: Flashing alert `#ff2200`, emissive intensity oscillating 0.2–2.0 via sine wave.

---

## 3. 🗺️ Interactive Factory Floor Maps (T01–T20 Fleet Visualization)

1. **Massive Fleet Optimization via `InstancedMesh`:**
   - When rendering dozens of machines (e.g. loom fleet `T01–T20`), NEVER duplicate standalone mesh trees.
   - Use `InstancedMesh` for repeated modular bases. Set per-instance matrices (`setMatrixAt`) and status colors (`setColorAt`), followed by `instanceMatrix.needsUpdate = true` and `instanceColor.needsUpdate = true`.
2. **Dual-Mode Industrial Camera:**
   - **Isometric Mode:** `OrthographicCamera` for architectural plant layouts and shop floor bird-eye views.
   - **Inspect Mode:** `PerspectiveCamera` with bounded `OrbitControls` (`maxPolarAngle: Math.PI / 2.05` to prevent looking under floor).
   - Smoothly interpolate camera transitions using vector lerping (`Vector3.lerp`).
3. **Precise Click Raycasting & Hover Feedback:**
   - Maintain a dedicated raycast interaction layer containing machine collider hulls.
   - On `pointerdown` / `click`, project `Raycaster` from normalized device coordinates `(x, y)`.
   - Highlight selected machine with bounding box or emissive glow; dispatch `MachineSelectedEvent(machineId)` to the host UI.

---

## 4. 🧹 WebGL Memory & VRAM Hygiene (Zero-Leak Discipline)

> [!CAUTION]
> Removing a mesh from `scene` DOES NOT free GPU VRAM. Explicitly dispose all resources on teardown.

1. **Recursive Disposal Walk:**
   ```javascript
   function disposeHierarchy(node) {
     for (let i = node.children.length - 1; i >= 0; i--) disposeHierarchy(node.children[i]);
     if (node.geometry) node.geometry.dispose();
     if (node.material) {
       const mats = Array.isArray(node.material) ? node.material : [node.material];
       for (const m of mats) {
         for (const k of Object.keys(m)) if (m[k]?.dispose) m[k].dispose();
         m.dispose();
       }
     }
   }
   ```
2. **Renderer Teardown Contract:**
   - Cancel the active animation frame (`cancelAnimationFrame(animId)`).
   - Detach resize listeners, call `renderer.dispose()`, and invoke `renderer.forceContextLoss()`.
   - Remove `<canvas>` from DOM and clear references.

---

## 5. 🖥️ Desktop Host Integration (`Microsoft.Web.WebView2` for C# WinForms / WPF)

1. **Bi-Directional IPC Bridge:**
   - **Host to 3D (C# -> JS):** `PostWebMessageAsJson(jsonPayload)` or `ExecuteScriptAsync`.
   - **3D to Host (JS -> C#):** `window.chrome.webview.postMessage({ type: 'MACHINE_CLICKED', machineId: 'T05' });`. C# listens via `CoreWebView2.WebMessageReceived`.
2. **Zero-Hardcode Local Hosting:**
   - Use `CoreWebView2.SetVirtualHostNameToFolderMapping("digitaltwin.local", appDir, CoreWebView2HostResourceAccessKind.Allow)`.
   - Respect high-DPI scaling: synchronize `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`.
