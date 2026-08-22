import { ROOMS, CORRIDORS } from "../rooms.js";

const CORRIDOR_COLOR = "#141a2e";
const CORRIDOR_BORDER = "#232c4d";
const WALL_DEPTH = 9; // px of "extruded wall" shown beneath each room's floor
const CORRIDOR_WALL_DEPTH = 5;

function shade(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  r = Math.max(0, Math.min(255, Math.round(r + (percent < 0 ? r : 255 - r) * percent)));
  g = Math.max(0, Math.min(255, Math.round(g + (percent < 0 ? g : 255 - g) * percent)));
  b = Math.max(0, Math.min(255, Math.round(b + (percent < 0 ? b : 255 - b) * percent)));
  return `rgb(${r},${g},${b})`;
}

/**
 * A lightweight Canvas2D top-down renderer, styled to read as "2.5D" the
 * way Among Us's top-down rooms do — walls drawn with visible extruded
 * thickness/shadow and floors with a soft directional gradient — rather
 * than perfectly flat color blocks. No external art assets: everything is
 * drawn geometrically in our own original style.
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

    this.scale = 30; // pixels per world unit at default zoom
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

  _drawZone(zone, isRoom) {
    const { sx, sy } = this.worldToScreen(zone.x, zone.z);
    const w = zone.w * this.scale;
    const h = zone.d * this.scale;
    const ctx = this.ctx;
    const radius = isRoom ? 14 : 4;
    const depth = isRoom ? WALL_DEPTH : CORRIDOR_WALL_DEPTH;
    const baseColor = isRoom ? zone.color : CORRIDOR_COLOR;

    // 1) Extruded "wall" body — a darker duplicate of the floor shape,
    // offset downward, so the bottom edge of every room/corridor reads as
    // a wall with real thickness instead of a flat outline.
    ctx.fillStyle = shade(baseColor, -0.55);
    this._drawRoundedRect(sx, sy + depth, w, h, radius);
    ctx.fill();

    // 2) Floor — soft top-to-bottom gradient so the surface itself isn't flat.
    const grad = ctx.createLinearGradient(sx, sy, sx, sy + h);
    grad.addColorStop(0, shade(baseColor, 0.16));
    grad.addColorStop(1, shade(baseColor, -0.12));
    ctx.fillStyle = grad;
    this._drawRoundedRect(sx, sy, w, h, radius);
    ctx.fill();

    // 3) Bevel: a light top-left highlight and a darker bottom-right edge.
    ctx.save();
    this._drawRoundedRect(sx, sy, w, h, radius);
    ctx.clip();
    ctx.strokeStyle = isRoom ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx + radius, sy + 1.5);
    ctx.lineTo(sx + w - radius, sy + 1.5);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = isRoom ? "rgba(53,230,208,0.3)" : CORRIDOR_BORDER;
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
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._resize);
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  }
}

