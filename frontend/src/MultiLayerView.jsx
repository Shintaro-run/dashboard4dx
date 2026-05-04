import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Tag → hex color (mirrors COLOR_TAGS in colorTags.js but as hex int).
const TAG_COLOR = {
  frontend: 0x3b82f6,
  backend: 0x10b981,
  data: 0x8b5cf6,
  external: 0xf97316,
  infra: 0x64748b,
  deprecated: 0xef4444,
  accent: 0xec4899,
  neutral: 0xcbd5e1,
};
const DEFAULT_COLOR = 0x94a3b8;

const PLANE_W = 9.0;
const PLANE_H = 6.5;
const LAYER_GAP = 1.6;
// Pages are ~800×600 in canvas coords; divide by this to fit on the plane.
const COORD_SCALE = 110;

function makeLabelSprite(text, color = "#e2e8f0") {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontSize = 56;
  ctx.font = `600 ${fontSize}px -apple-system, "Hiragino Sans", "Helvetica Neue", sans-serif`;
  const metrics = ctx.measureText(text);
  const padX = 30;
  const padY = 18;
  canvas.width = Math.ceil(metrics.width + padX * 2);
  canvas.height = Math.ceil(fontSize + padY * 2);
  // Re-set font (resizing canvas resets context state).
  ctx.font = `600 ${fontSize}px -apple-system, "Hiragino Sans", "Helvetica Neue", sans-serif`;
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(96, 165, 250, 0.6)";
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, padX, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(aspect * 0.7, 0.7, 1);
  return sprite;
}

function hexToInt(hex) {
  if (!hex) return 0x3b82f6;
  return parseInt(hex.replace("#", ""), 16) || 0x3b82f6;
}

export default function MultiLayerView({ pages, flows, enabledIds, onClose }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    const w = host.clientWidth;
    const h = host.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir = new THREE.DirectionalLight(0xffffff, 0.45);
    dir.position.set(8, 16, 10);
    scene.add(dir);

    // Build each layer.
    const layers = [];
    pages.forEach((page, idx) => {
      const group = new THREE.Group();
      group.position.y = idx * LAYER_GAP;

      // Translucent panel.
      const planeMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(PLANE_W, PLANE_H),
        planeMat
      );
      plane.rotation.x = -Math.PI / 2;
      group.add(plane);

      // Border.
      const borderGeo = new THREE.EdgesGeometry(
        new THREE.PlaneGeometry(PLANE_W, PLANE_H)
      );
      const border = new THREE.LineSegments(
        borderGeo,
        new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.7 })
      );
      border.rotation.x = -Math.PI / 2;
      group.add(border);

      // Page label sprite (floating to one side).
      const sprite = makeLabelSprite(`${idx + 1}. ${page.name}`);
      sprite.position.set(-PLANE_W / 2 - 1.6, 0.05, 0);
      group.add(sprite);

      // Per-object geometry.
      (page.objects || []).forEach((obj) => {
        if (obj.type === "edge") return;
        if (obj.type === "text") return; // text annotations are 2D-only
        const x = (obj.x ?? 0) / COORD_SCALE - PLANE_W / 2 + 0.4;
        const z = (obj.y ?? 0) / COORD_SCALE - PLANE_H / 2 + 0.3;
        const color = TAG_COLOR[obj.color_tag] || DEFAULT_COLOR;
        const mat = new THREE.MeshLambertMaterial({ color });
        let geom;
        if (obj.type === "stamp") {
          geom = new THREE.SphereGeometry(0.18, 16, 12);
        } else {
          geom = new THREE.BoxGeometry(0.65, 0.20, 0.30);
        }
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(x, 0.18, z);
        group.add(mesh);
      });

      // Within-page edges as flat lines on the plane.
      const objMap = new Map(
        (page.objects || [])
          .filter((o) => o.type !== "edge")
          .map((o) => [o.id, o])
      );
      (page.objects || []).forEach((edge) => {
        if (edge.type !== "edge") return;
        const a = objMap.get(edge.from);
        const b = objMap.get(edge.to);
        if (!a || !b) return;
        const ax = (a.x ?? 0) / COORD_SCALE - PLANE_W / 2 + 0.4;
        const az = (a.y ?? 0) / COORD_SCALE - PLANE_H / 2 + 0.3;
        const bx = (b.x ?? 0) / COORD_SCALE - PLANE_W / 2 + 0.4;
        const bz = (b.y ?? 0) / COORD_SCALE - PLANE_H / 2 + 0.3;
        const eg = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(ax, 0.05, az),
          new THREE.Vector3(bx, 0.05, bz),
        ]);
        const line = new THREE.Line(
          eg,
          new THREE.LineBasicMaterial({
            color: 0x94a3b8,
            transparent: true,
            opacity: 0.45,
          })
        );
        group.add(line);
      });

      scene.add(group);
      layers.push({ page, group });
    });

    // Inter-layer FID lines (glowing yellow).
    const fidMap = new Map();
    pages.forEach((page, idx) => {
      (page.objects || []).forEach((obj) => {
        if (obj.fid) {
          const list = fidMap.get(obj.fid) || [];
          list.push({ obj, layerIdx: idx });
          fidMap.set(obj.fid, list);
        }
      });
    });
    const fidLineMat = new THREE.LineBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.55,
    });
    fidMap.forEach((list) => {
      if (list.length < 2) return;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          if (a.layerIdx === b.layerIdx) continue;
          const ax = (a.obj.x ?? 0) / COORD_SCALE - PLANE_W / 2 + 0.4;
          const az = (a.obj.y ?? 0) / COORD_SCALE - PLANE_H / 2 + 0.3;
          const ay = a.layerIdx * LAYER_GAP + 0.18;
          const bx = (b.obj.x ?? 0) / COORD_SCALE - PLANE_W / 2 + 0.4;
          const bz = (b.obj.y ?? 0) / COORD_SCALE - PLANE_H / 2 + 0.3;
          const by = b.layerIdx * LAYER_GAP + 0.18;
          const geom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(ax, ay, az),
            new THREE.Vector3(bx, by, bz),
          ]);
          scene.add(new THREE.Line(geom, fidLineMat));
        }
      }
    });

    // ---------- Phase 8: data-flow animation in 3D ----------
    // For every enabled flow, draw a static line between consecutive anchors
    // (3D, may cross planes) plus N small spheres marching along it.
    const enabledFlows = (flows || []).filter((f) => enabledIds.has(f.id));
    const animatedDots = []; // { mesh, p1, p2, offset }
    const DOTS_PER_SEG = 3;

    function anchorTo3D(anchor) {
      if (!anchor) return null;
      const idx = pages.findIndex((p) => p.page_id === anchor.page_id);
      if (idx === -1) return null;
      const page = pages[idx];
      const obj = (page.objects || []).find(
        (o) => o.id === anchor.object_id && o.type !== "edge"
      );
      if (!obj) return null;
      return new THREE.Vector3(
        (obj.x ?? 0) / COORD_SCALE - PLANE_W / 2 + 0.4,
        idx * LAYER_GAP + 0.18,
        (obj.y ?? 0) / COORD_SCALE - PLANE_H / 2 + 0.3
      );
    }

    enabledFlows.forEach((flow) => {
      const colorInt = hexToInt(flow.color);
      const anchors = [
        flow.start,
        ...(flow.stops || []),
        flow.end,
      ].filter(Boolean);
      const points = anchors.map(anchorTo3D).filter(Boolean);
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const lineGeom = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const lineMat = new THREE.LineBasicMaterial({
          color: colorInt,
          transparent: true,
          opacity: 0.35,
        });
        scene.add(new THREE.Line(lineGeom, lineMat));
        for (let k = 0; k < DOTS_PER_SEG; k++) {
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 12, 8),
            new THREE.MeshBasicMaterial({ color: colorInt })
          );
          scene.add(dot);
          animatedDots.push({ mesh: dot, p1, p2, offset: k / DOTS_PER_SEG });
        }
      }
    });

    // Frame the scene.
    const totalH = Math.max(1, pages.length - 1) * LAYER_GAP;
    controls.target.set(0, totalH / 2, 0);
    camera.position.set(11, totalH / 2 + 4, 14);
    controls.update();

    let frame;
    const animate = () => {
      controls.update();
      const t = (Date.now() / 1500) % 1; // 1.5s loop
      animatedDots.forEach((d) => {
        const u = (t + d.offset) % 1;
        d.mesh.position.lerpVectors(d.p1, d.p2, u);
      });
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      if (!host) return;
      const w2 = host.clientWidth;
      const h2 = host.clientHeight;
      renderer.setSize(w2, h2);
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [pages, flows, enabledIds]);

  return (
    <div className="arch-view-overlay">
      <div className="arch-view-header">
        <span className="arch-view-title">🌐 Multi-layer view</span>
        <span className="arch-view-hint">
          {pages.length} layer{pages.length === 1 ? "" : "s"} · drag to rotate · scroll to zoom
        </span>
        <button className="arch-btn" onClick={onClose}>
          ✕ Close
        </button>
      </div>
      <div ref={containerRef} className="arch-view-canvas3d" />
      <div className="arch-view-legend">
        Cubes = boxes · spheres = stamps · grey lines = same-page edges ·{" "}
        <span style={{ color: "#fbbf24" }}>yellow lines</span> connect objects
        sharing the same Function ID across layers · enabled data flows
        animate as marching coloured spheres. View-only.
      </div>
    </div>
  );
}
