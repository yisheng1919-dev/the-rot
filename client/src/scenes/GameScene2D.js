import { ROOMS, CORRIDORS } from "../rooms.js";

const CORRIDOR_COLOR = "#141a2e";
const CORRIDOR_BORDER = "#232c4d";
const WALL_DEPTH = 16; // px of "extruded wall" shown beneath each room's floor
const CORRIDOR_WALL_DEPTH = 8;
const WALL_FRAME = 4; // px of thick wall visible framing rooms, Among-Us style
// Corridors intentionally get NO outward frame — rooms and corridors meet
// edge-to-edge (not overlapping) in the underlying collision map, so an
// outward-extending frame on both sides of every doorway would visually
// wall the opening shut. Keeping the frame room-only (and thin) avoids that
// while still giving rooms a chunkier, more "built" silhouette.

function shade(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  r = Math.max(0, Math.min(255, Math.round(r + (percent < 0 ? r : 255 - r) * percent)));
  g = Math.max(0, Math.min(255, Math.round(g + (percent < 0 ? g : 255 - g) * percent)));
  b = Math.max(0, Math.min(255, Math.round(b + (percent < 0 ? b : 255 - b) * percent)));
  return `rgb(${r},${g},${b})`;
}

// Small deterministic PRNG (mulberry32) so decorative details generated
// from a seed — e.g. "which room, which round" — look the same every time
// rather than re-randomizing (and visibly jittering) every frame.
function seededRandom(seed) {
  let t = seed;
  return function () {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
}

/**
 * A lightweight Canvas2D top-down renderer, styled to read as "2.5D" the
 * way Among Us's top-down rooms do — walls drawn with visible extruded
 * thickness/shadow and floors with a soft directional gradient — rather
 * than perfectly flat color blocks. No external art assets: everything is
 * drawn geometrically in our own original style.
 *
 * Two thematic layers live here on top of the base geometry:
 *  - A subtle songket/batik-inspired diamond lattice texture on every
 *    room's floor, and a hibiscus (bunga raya — Malaysia's national
 *    flower) medallion inlaid in Main Hall's floor, for a bit of
 *    Malaysian visual identity beyond a generic sci-fi palette.
 *  - "The Rot" creeping in as cracks across room floors plus a slowly
 *    deepening color grade, both scaled by ROUND NUMBER only (never by
 *    hidden corruption counts) so the escalating dread is purely
 *    narrative and never leaks secret game state.
 */
export class GameScene2D {
  constructor(container) {
    this.container = container;
    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.display = "block";
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");

    this.selfId = null;
    this.players = [];
    this.viewerIsGhost = false;
    this.blackout = false;
    this.focus = { x: 0, z: 0 };
    this.renderFocus = { x: 0, z: 0 };
    this.round = 1;
    this.crackCache = new Map(); // roomId -> { round, cracks: [...] }

    this.scale = 30; // pixels per world unit at default zoom
    this._batikPattern = this._buildBatikPattern();
    this._resize = this.resize.bind(this);
    window.addEventListener("resize", this._resize);
    this.resize();

    this._raf = null;
    this._tick = this._tick.bind(this);
    this._tick();
  }

  setSelfId(id) {
    this.selfId = id;
  }

  setBlackout(on) {
    this.blackout = on;
  }

  setRound(round) {
    this.round = round;
  }

  updatePlayers(players, viewerIsGhost = false) {
    this.players = players;
    this.viewerIsGhost = viewerIsGhost;
  }

  focusOn(x, z) {
    this.focus = { x, z };
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  worldToScreen(x, z) {
    const cx = this.cssWidth / 2;
    const cy = this.cssHeight / 2;
    return {
      sx: cx + (x - this.renderFocus.x) * this.scale,
      sy: cy + (z - this.renderFocus.z) * this.scale,
    };
  }

  _drawRoundedRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // A small repeating diamond-lattice tile, evoking traditional Malaysian
  // songket/batik weave patterns in the abstract (not a copy of any
  // specific real motif) — built once as a CanvasPattern so applying it is
  // just a cheap fillRect, not per-frame line drawing.
  _buildBatikPattern() {
    const tile = document.createElement("canvas");
    const size = 28;
    tile.width = size;
    tile.height = size;
    const tctx = tile.getContext("2d");
    tctx.strokeStyle = "rgba(255,255,255,0.5)";
    tctx.lineWidth = 1;
    tctx.beginPath();
    tctx.moveTo(size / 2, 0);
    tctx.lineTo(size, size / 2);
    tctx.lineTo(size / 2, size);
    tctx.lineTo(0, size / 2);
    tctx.closePath();
    tctx.stroke();
    tctx.beginPath();
    tctx.arc(size / 2, size / 2, 2, 0, Math.PI * 2);
    tctx.stroke();
    return this.ctx.createPattern(tile, "repeat");
  }

  // Five-petal hibiscus (bunga raya) medallion — Malaysia's national
  // flower — inlaid at the center of Main Hall's floor, since that's the
  // room every player gathers in for meetings.
  _drawHibiscusMedallion(cx, cy, size, accentColor) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 5; i++) {
      ctx.rotate((Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.ellipse(0, -size * 0.55, size * 0.32, size * 0.55, 0, 0, Math.PI * 2);
      ctx.fillStyle = accentColor;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = accentColor;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      ctx.rotate((Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.ellipse(0, -size * 0.55, size * 0.32, size * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // "The Rot" creeping through the floor — jagged crack lines whose count
  // scales with ROUND NUMBER (never with actual corruption counts, which
  // are secret). Generated once per room per round and cached.
  _getCracksForRoom(zone) {
    const cached = this.crackCache.get(zone.id);
    if (cached && cached.round === this.round) return cached.cracks;

    const crackCount = Math.max(0, this.round - 1) * 3; // round 1: none, round 2: 3, round 3: 6
    const rand = seededRandom(hashString(zone.id) + this.round * 7919);
    const cracks = [];
    for (let i = 0; i < crackCount; i++) {
      const startX = rand() * zone.w;
      const startZ = rand() * zone.d;
      const segments = 2 + Math.floor(rand() * 2);
      const points = [{ x: startX, z: startZ }];
      let angle = rand() * Math.PI * 2;
      for (let s = 0; s < segments; s++) {
        angle += (rand() - 0.5) * 1.4;
        const len = 0.6 + rand() * 1.1;
        const last = points[points.length - 1];
        points.push({
          x: Math.min(zone.w, Math.max(0, last.x + Math.cos(angle) * len)),
          z: Math.min(zone.d, Math.max(0, last.z + Math.sin(angle) * len)),
        });
      }
      cracks.push(points);
    }
    this.crackCache.set(zone.id, { round: this.round, cracks });
    return cracks;
  }

  _drawCracks(sx, sy, cracks) {
    if (cracks.length === 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "rgba(20, 6, 20, 0.55)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (const points of cracks) {
      ctx.beginPath();
      ctx.moveTo(sx + points[0].x * this.scale, sy + points[0].z * this.scale);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(sx + points[i].x * this.scale, sy + points[i].z * this.scale);
      }
      ctx.stroke();
    }
    // Faint sickly glow along the same lines to make the rot feel alive
    // rather than just structural damage.
    ctx.strokeStyle = "rgba(155, 60, 120, 0.25)";
    ctx.lineWidth = 4;
    for (const points of cracks) {
      ctx.beginPath();
      ctx.moveTo(sx + points[0].x * this.scale, sy + points[0].z * this.scale);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(sx + points[i].x * this.scale, sy + points[i].z * this.scale);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawZone(zone, isRoom) {
    const { sx, sy } = this.worldToScreen(zone.x, zone.z);
    const w = zone.w * this.scale;
    const h = zone.d * this.scale;
    const ctx = this.ctx;
    const radius = isRoom ? 14 : 4;
    const depth = isRoom ? WALL_DEPTH : CORRIDOR_WALL_DEPTH;
    const baseColor = isRoom ? zone.color : CORRIDOR_COLOR;
    const wallColor = shade(baseColor, -0.62);

    // 1) Thick outer wall frame — rooms only (see note above on why
    // corridors skip this), drawn slightly outside the floor so a room's
    // sides read as real walls, not just a thin outline.
    if (isRoom) {
      ctx.fillStyle = wallColor;
      this._drawRoundedRect(sx - WALL_FRAME, sy - WALL_FRAME, w + WALL_FRAME * 2, h + WALL_FRAME * 2, radius + WALL_FRAME);
      ctx.fill();
    }

    // 2) Extruded "wall" body beneath the floor — a darker duplicate offset
    // downward, so the bottom edge additionally reads as a wall you're
    // looking at face-on, the way a slightly-tilted top-down camera would.
    ctx.fillStyle = shade(baseColor, -0.55);
    this._drawRoundedRect(sx, sy + depth, w, h, radius);
    ctx.fill();

    // 3) Floor — soft top-to-bottom gradient so the surface itself isn't flat.
    const grad = ctx.createLinearGradient(sx, sy, sx, sy + h);
    grad.addColorStop(0, shade(baseColor, 0.2));
    grad.addColorStop(1, shade(baseColor, -0.15));
    ctx.fillStyle = grad;
    this._drawRoundedRect(sx, sy, w, h, radius);
    ctx.fill();

    // 3b) Subtle songket/batik lattice texture, and (Main Hall only) a
    // hibiscus medallion centerpiece — both clipped to the floor shape.
    if (isRoom) {
      ctx.save();
      this._drawRoundedRect(sx, sy, w, h, radius);
      ctx.clip();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = this._batikPattern;
      ctx.fillRect(sx, sy, w, h);
      ctx.globalAlpha = 1;
      if (zone.id === "MAIN_HALL") {
        this._drawHibiscusMedallion(sx + w / 2, sy + h / 2, Math.min(w, h) * 0.32, shade(baseColor, 0.5));
      }
      // 3c) The Rot: cracks scaled by round number only.
      this._drawCracks(sx, sy, this._getCracksForRoom(zone));
      ctx.restore();
    }

    // 4) Rim highlight where the floor meets the extruded wall face below
    // it — a bright thin line right at that seam catches the eye the way
    // a lit edge would, reinforcing that there's a step down to the wall.
    ctx.save();
    this._drawRoundedRect(sx, sy, w, h, radius);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy + h - 1);
    ctx.lineTo(sx + w, sy + h - 1);
    ctx.stroke();

    ctx.strokeStyle = isRoom ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx + radius, sy + 1.5);
    ctx.lineTo(sx + w - radius, sy + 1.5);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = isRoom ? "rgba(53,230,208,0.35)" : CORRIDOR_BORDER;
    ctx.lineWidth = 2;
    this._drawRoundedRect(sx, sy, w, h, radius);
    ctx.stroke();

    if (isRoom && zone.label) {
      ctx.fillStyle = "rgba(207,233,255,0.9)";
      ctx.font = "600 13px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 3;
      ctx.fillText(zone.label.toUpperCase(), sx + w / 2, sy + 18);
      ctx.shadowBlur = 0;
    }
  }

  _drawPlayer(p) {
    const isSelf = p.playerId === this.selfId;
    const { sx, sy } = this.worldToScreen(p.x, p.z);
    const ctx = this.ctx;
    const radius = 11;

    ctx.globalAlpha = p.connected === false ? 0.35 : this.viewerIsGhost && !isSelf ? 0.55 : 1;

    // Grounding shadow beneath the character — this is what sells the
    // "standing on a floor" read instead of a flat token on a map.
    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.ellipse(sx, sy + radius * 0.65, radius * 0.9, radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body — small radial gradient so it reads as a rounded form, not a flat disc.
    const bodyColor = isSelf ? "#35e6d0" : this.viewerIsGhost ? "#9b6bff" : "#dfe6ff";
    const grad = ctx.createRadialGradient(sx - 3, sy - 4, 1, sx, sy, radius);
    grad.addColorStop(0, shade(bodyColor, 0.35));
    grad.addColorStop(1, shade(bodyColor, -0.1));
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#05070f";
    ctx.stroke();

    // Visor
    ctx.beginPath();
    ctx.fillStyle = "#05070f";
    ctx.ellipse(sx + 3, sy - 2, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;

    if (p.displayName) {
      ctx.font = "700 11px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = isSelf ? "#35e6d0" : "#e8ecf7";
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 4;
      ctx.fillText(p.displayName, sx, sy - radius - 8);
      ctx.shadowBlur = 0;
    }
  }

  _tick() {
    this._raf = requestAnimationFrame(this._tick);
    this.renderFocus.x += (this.focus.x - this.renderFocus.x) * 0.18;
    this.renderFocus.z += (this.focus.z - this.renderFocus.z) * 0.18;

    const ctx = this.ctx;
    ctx.fillStyle = "#05070f";
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    for (const c of CORRIDORS) this._drawZone(c, false);
    for (const r of ROOMS) this._drawZone(r, true);

    // Sort by z (screen depth) so characters standing "further down" the
    // map correctly overlap ones standing above them, reinforcing depth.
    const sorted = [...this.players].sort((a, b) => a.z - b.z);
    for (const p of sorted) this._drawPlayer(p);

    // Global color grade that slowly deepens with the round number — a
    // purely narrative escalation of dread as the game nears Round 3,
    // never tied to actual (secret) corruption counts.
    const roundIntensity = Math.max(0, this.round - 1) * 0.09; // 0 / 0.09 / 0.18
    if (roundIntensity > 0) {
      const vignette = ctx.createRadialGradient(
        this.cssWidth / 2, this.cssHeight / 2, Math.min(this.cssWidth, this.cssHeight) * 0.2,
        this.cssWidth / 2, this.cssHeight / 2, Math.max(this.cssWidth, this.cssHeight) * 0.7
      );
      vignette.addColorStop(0, "rgba(60,10,40,0)");
      vignette.addColorStop(1, `rgba(60,10,40,${roundIntensity})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
    }
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._resize);
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  }
}


