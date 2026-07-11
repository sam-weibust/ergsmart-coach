// Three.js r128 (loaded from CDN in index.html, available as window.THREE) 3D
// background accents for the landing page. Each scene lives in its own effect
// with a full cleanup path (cancel RAF, dispose geometry/material/renderer,
// remove listeners). All canvases are pointer-events:none and sit behind text.
import { useEffect, useRef } from "react";

// window.THREE has no bundled types (CDN global) — treat as any.
const getTHREE = (): any => (window as unknown as { THREE?: any }).THREE;

const isMobile = () => typeof window !== "undefined" && window.innerWidth < 768;
const clampPR = () => Math.min(window.devicePixelRatio || 1, 2);

// Recursively dispose everything under an object3D.
function disposeObject(obj: any) {
  obj?.traverse?.((child: any) => {
    if (child.geometry) child.geometry.dispose();
    const mat = child.material;
    if (Array.isArray(mat)) mat.forEach((m: any) => m.dispose?.());
    else mat?.dispose?.();
  });
}

const BLUE = 0x2272ff;
const ACCENT = 0x3d8fd4;

// ── HERO — glowing 3D force-curve ribbon ────────────────────────────────────
export function HeroForceCurve() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const THREE = getTHREE();
    const container = ref.current;
    if (!THREE || !container) return;

    const mobile = isMobile();
    let width = container.clientWidth || 1;
    let height = container.clientHeight || 1;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(0, 0, 6);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(clampPR());
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // Rowing stroke: flat recovery → slow build at the catch → sharp drive peak
    // → quick fall at the finish → back to flat recovery.
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.6, -1.2, 0.0),
      new THREE.Vector3(-2.6, -1.15, 0.1),
      new THREE.Vector3(-1.6, -0.9, 0.15),
      new THREE.Vector3(-0.8, -0.2, 0.1),
      new THREE.Vector3(0.0, 1.35, 0.0),
      new THREE.Vector3(0.7, 0.25, -0.1),
      new THREE.Vector3(1.5, -0.75, -0.15),
      new THREE.Vector3(2.4, -1.1, -0.1),
      new THREE.Vector3(3.6, -1.15, 0.0),
    ]);

    const segments = mobile ? 90 : 200;
    const group = new THREE.Group();

    const innerGeo = new THREE.TubeGeometry(curve, segments, 0.03, 8, false);
    const inner = new THREE.Mesh(
      innerGeo,
      new THREE.MeshBasicMaterial({ color: BLUE, wireframe: false })
    );

    const glowGeo = new THREE.TubeGeometry(curve, segments, 0.08, 8, false);
    const glow = new THREE.Mesh(
      glowGeo,
      new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0.08 })
    );

    group.add(glow);
    group.add(inner);
    scene.add(group);

    // Mouse parallax — ease the camera slightly toward the cursor.
    const target = { x: 0, y: 0 };
    const onMouseMove = (e: MouseEvent) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 0.8;
      target.y = (e.clientY / window.innerHeight - 0.5) * 0.6;
    };
    window.addEventListener("mousemove", onMouseMove);

    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      group.rotation.y += 0.003;
      inner.scale.setScalar(1 + Math.sin(t * 2) * 0.05);
      camera.position.x += (target.x - camera.position.x) * 0.05;
      camera.position.y += (target.y - camera.position.y) * 0.05;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => {
      width = container.clientWidth || 1;
      height = container.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: "absolute",
        right: 0,
        top: 0,
        width: "50%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}

// ── FEATURES — connected data sphere (points + proximity lines) ─────────────
export function FeaturesSphere() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const THREE = getTHREE();
    const container = ref.current;
    if (!THREE || !container) return;

    const mobile = isMobile();
    let width = container.clientWidth || 1;
    let height = container.clientHeight || 1;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(0, 0, 7);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(clampPR());
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    const R = 2.5;
    const count = mobile ? 100 : 200;
    const pts: any[] = [];
    const posArr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // uniform-ish random points on a sphere via spherical coordinates
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = 2 * Math.PI * Math.random();
      const x = R * Math.sin(theta) * Math.cos(phi);
      const y = R * Math.sin(theta) * Math.sin(phi);
      const z = R * Math.cos(theta);
      pts.push(new THREE.Vector3(x, y, z));
      posArr[i * 3] = x;
      posArr[i * 3 + 1] = y;
      posArr[i * 3 + 2] = z;
    }

    const pointsGeo = new THREE.BufferGeometry();
    pointsGeo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    const pointsMat = new THREE.PointsMaterial({
      size: 0.04,
      color: ACCENT,
      transparent: true,
      opacity: 0.6,
    });
    group.add(new THREE.Points(pointsGeo, pointsMat));

    // Connect nearby points (skip on mobile for performance).
    let lineMat: any = null;
    if (!mobile) {
      const linePos: number[] = [];
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          if (pts[i].distanceTo(pts[j]) < 0.8) {
            linePos.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z);
          }
        }
      }
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(linePos), 3));
      lineMat = new THREE.LineBasicMaterial({ color: BLUE, transparent: true, opacity: 0.15 });
      group.add(new THREE.LineSegments(lineGeo, lineMat));
    }

    scene.add(group);

    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      group.rotation.y += 0.002;
      group.rotation.x += 0.0005;
      const k = 0.5 + Math.sin(t) * 0.5; // 0..1
      pointsMat.opacity = 0.4 + k * 0.4; // 0.4..0.8
      if (lineMat) lineMat.opacity = 0.1 + k * 0.1; // 0.1..0.2
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => {
      width = container.clientWidth || 1;
      height = container.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}

// ── STATS — wireframe globe with pulsing athlete dots ───────────────────────
export function StatsGlobe() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const THREE = getTHREE();
    const container = ref.current;
    if (!THREE || !container) return;
    if (isMobile()) return; // keep the short stats bar readable on mobile

    const mobile = false;
    let width = container.clientWidth || 300;
    let height = container.clientHeight || 300;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 0, 5);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(clampPR());
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    const seg = mobile ? 12 : 24;
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, seg, seg),
      new THREE.MeshBasicMaterial({ color: BLUE, wireframe: true, transparent: true, opacity: 0.12 })
    );
    group.add(globe);

    const dots: { mat: any; phase: number }[] = [];
    for (let i = 0; i < 53; i++) {
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = 2 * Math.PI * Math.random();
      const r = 1.8;
      const mat = new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0.7 });
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), mat);
      dot.position.set(
        r * Math.sin(theta) * Math.cos(phi),
        r * Math.sin(theta) * Math.sin(phi),
        r * Math.cos(theta)
      );
      group.add(dot);
      dots.push({ mat, phase: Math.random() * Math.PI * 2 });
    }
    scene.add(group);

    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      group.rotation.y += 0.004;
      for (const d of dots) {
        d.mat.opacity = 0.4 + (Math.sin(t * 2 + d.phase) * 0.5 + 0.5) * 0.6; // 0.4..1.0
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => {
      width = container.clientWidth || 300;
      height = container.clientHeight || 300;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: "absolute",
        right: "8%",
        top: "50%",
        transform: "translateY(-50%)",
        width: "300px",
        height: "300px",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}

// ── CTA — drifting particle constellation ───────────────────────────────────
export function CtaParticles() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const THREE = getTHREE();
    const container = ref.current;
    if (!THREE || !container) return;

    const mobile = isMobile();
    let width = container.clientWidth || 1;
    let height = container.clientHeight || 1;

    const scene = new THREE.Scene();
    let camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.set(0, 0, 5);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(clampPR());
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const count = mobile ? 400 : 800;
    const BX = 4.5;
    const BY = 2.6;
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * BX;
      pos[i * 3 + 1] = (Math.random() * 2 - 1) * BY;
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * 0.8;
      vel[i * 3] = (Math.random() - 0.5) * 0.004; // slight sideways
      vel[i * 3 + 1] = 0.002 + Math.random() * 0.004; // slow upward
      vel[i * 3 + 2] = 0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.015,
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
    });
    scene.add(new THREE.Points(geo, mat));

    // Connecting lines (desktop only) — proximity in projected screen space.
    let lineSeg: any = null;
    let lineGeo: any = null;
    const maxSeg = 700;
    if (!mobile) {
      lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(maxSeg * 6), 3));
      lineSeg = new THREE.LineSegments(
        lineGeo,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06 })
      );
      scene.add(lineSeg);
    }

    const screenX = new Float32Array(count);
    const screenY = new Float32Array(count);
    const v = new THREE.Vector3();
    let frame = 0;
    let raf = 0;

    const rebuildLines = () => {
      if (!lineGeo) return;
      for (let i = 0; i < count; i++) {
        v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).project(camera);
        screenX[i] = (v.x * 0.5 + 0.5) * width;
        screenY[i] = (-v.y * 0.5 + 0.5) * height;
      }
      const arr = lineGeo.attributes.position.array as Float32Array;
      let s = 0;
      const thresh2 = 80 * 80;
      for (let i = 0; i < count && s < maxSeg; i++) {
        for (let j = i + 1; j < count && s < maxSeg; j++) {
          const dx = screenX[i] - screenX[j];
          const dy = screenY[i] - screenY[j];
          if (dx * dx + dy * dy < thresh2) {
            arr[s * 6] = pos[i * 3];
            arr[s * 6 + 1] = pos[i * 3 + 1];
            arr[s * 6 + 2] = pos[i * 3 + 2];
            arr[s * 6 + 3] = pos[j * 3];
            arr[s * 6 + 4] = pos[j * 3 + 1];
            arr[s * 6 + 5] = pos[j * 3 + 2];
            s++;
          }
        }
      }
      lineGeo.setDrawRange(0, s * 2);
      lineGeo.attributes.position.needsUpdate = true;
    };

    const tick = () => {
      for (let i = 0; i < count; i++) {
        pos[i * 3] += vel[i * 3];
        pos[i * 3 + 1] += vel[i * 3 + 1];
        if (pos[i * 3 + 1] > BY) pos[i * 3 + 1] = -BY;
        if (pos[i * 3] > BX) pos[i * 3] = -BX;
        else if (pos[i * 3] < -BX) pos[i * 3] = BX;
      }
      geo.attributes.position.needsUpdate = true;
      if (lineGeo && frame % 4 === 0) rebuildLines();
      renderer.render(scene, camera);
      frame++;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => {
      width = container.clientWidth || 1;
      height = container.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}

// ── PROBLEM — subtle tumbling wireframe shapes ──────────────────────────────
export function ProblemAccents() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const THREE = getTHREE();
    const container = ref.current;
    if (!THREE || !container) return;

    let width = container.clientWidth || 1;
    let height = container.clientHeight || 1;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(0, 0, 6);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(clampPR());
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const mkMat = () =>
      new THREE.MeshBasicMaterial({ color: ACCENT, wireframe: true, transparent: true, opacity: 0.15 });

    const shapes: { mesh: any; sx: number; sy: number; sz: number }[] = [];
    const octa = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), mkMat());
    octa.position.set(-3.6, 1.2, 0);
    const tetra = new THREE.Mesh(new THREE.TetrahedronGeometry(0.25), mkMat());
    tetra.position.set(3.4, -0.8, -1);
    const ico = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2), mkMat());
    ico.position.set(1.8, 1.6, -2);
    shapes.push({ mesh: octa, sx: 0.004, sy: 0.006, sz: 0.003 });
    shapes.push({ mesh: tetra, sx: 0.005, sy: 0.003, sz: 0.006 });
    shapes.push({ mesh: ico, sx: 0.003, sy: 0.005, sz: 0.004 });
    shapes.forEach((s) => scene.add(s.mesh));

    let raf = 0;
    const tick = () => {
      for (const s of shapes) {
        s.mesh.rotation.x += s.sx;
        s.mesh.rotation.y += s.sy;
        s.mesh.rotation.z += s.sz;
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => {
      width = container.clientWidth || 1;
      height = container.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
