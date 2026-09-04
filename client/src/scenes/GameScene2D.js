import { ROOMS, CORRIDORS, PROPS_FOR_ROOM, DOORWAYS } from "../rooms.js";
import { spriteUrlFor } from "../colors.js";

const WALK_FRAME_MS = 70; // duration of each walk-cycle frame while a player is moving
const WALK_FRAMES = 5;

const CORRIDOR_COLOR = "#141a2e";
const CORRIDOR_BORDER = "#232c4d";
const WALL_DEPTH = 16;
const CORRIDOR_WALL_DEPTH = 8;
const WALL_FRAME = 4;

function shade(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  r = Math.max(0, Math.min(255, Math.round(r + (percent < 0 ? r : 255 - r) * percent)));
  g = Math.max(0, Math.min(255, Math.round(g + (percent < 0 ? g : 255 - g) * percent)));
  b = Math.max(0, Math.min(255, Math.round(b + (percent < 0 ? b : 255 - b) * percent)));
  return `rgb(${r},${g},${b})`;
}

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

// Which floor tile texture each room uses (files in public/sprites/tiles/).
const TILE_FOR_ROOM = {
  CONTROL_ROOM: "tile_purple",
  LOBBY: "tile_green1",
  MAP_ROOM: "tile_blue1",
  POWER_ROOM: "tile_gold",
  STORAGE: "tile_darkgrey",
  CAFETERIA: "tile_tan",
  MEDBAY: "tile_grey1",
  UPPER_ENGINE: "tile_darkgrey",
  SECURITY: "tile_green1",
  WEAPONS: "tile_purple",
  O2_ROOM: "tile_blue1",
  LOWER_ENGINE: "tile_darkgrey",
};

// PROPS_FOR_ROOM now lives in rooms.js — it also drives real furniture
// collision (PROP_COLLIDERS) there, so rendering and collision can never
// drift out of sync with each other.

/**
 * Sprite-based Canvas2D top-down renderer, using real illustrated assets
 * (rooms/furniture atlas + 12-color detective character sheet) instead of
 * procedural shapes. Falls back gracefully — nothing throws — if an image
 * hasn't finished loading yet; it just isn't drawn that frame.
 */
export class GameScene2D {
  constructor(container, { scale = 32 } = {}) {
    this.container = container;
    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.display = "block";
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");

    this.selfId = null;
    this.stealTargetId = null; // playerId currently auto-locked as a steal target, or null
    this.players = [];
    this.viewerIsGhost = false;
    this.blackout = false;
    this.focus = { x: 0, z: 0 };
    this.renderFocus = { x: 0, z: 0 };
    this.round = 1;
    this.crackCache = new Map();

    // Per-player facing/animation state, keyed by playerId. Rebuilt (carrying
    // over existing entries) on every updatePlayers() call — see there for
    // how facing and "moving" get decided from position deltas between
    // successive network updates.
    this.animState = new Map();
    this._lastTickTime = null;

    // The local player's own position/facing, refreshed every animation
    // frame directly from joystick input in GameScreen (see setSelfMotion).
    // The camera (focus/renderFocus) was already updated every frame like
    // this, but the player's own SPRITE used to only move when a
    // positions:update echo came back from the server (~80ms + network
    // latency), so the sprite visibly lagged and snapped relative to the
    // smoothly-moving camera. Rendering self from this instead removes
    // that mismatch — the network echo still arrives and updates
    // this.players (used for collision-adjacent bookkeeping and for every
    // other player), it's just no longer what self draws from.
    this.selfPos = null;

    // Overridable so a full-map spectator view (the Host monitor) can zoom
    // out far enough to fit all 12 rooms at once, instead of the close-in
    // scale a moving player uses.
    this.scale = scale;
    this.baseScale = scale;
    this.images = new Map(); // key -> HTMLImageElement (may still be loading)

    this._preloadImages();

    this._resize = this.resize.bind(this);
    window.addEventListener("resize", this._resize);
    this.resize();

    this._raf = null;
    this._tick = this._tick.bind(this);
    this._tick();
  }

  _getImage(key, src) {
    let img = this.images.get(key);
    if (!img) {
      img = new Image();
      img.src = src;
      this.images.set(key, img);
    }
    return img;
  }

  _preloadImages() {
    for (const tile of Object.values(TILE_FOR_ROOM)) {
      this._getImage(`tile:${tile}`, `/sprites/tiles/${tile}.png`);
    }
    for (const props of Object.values(PROPS_FOR_ROOM)) {
      for (const p of props) this._getImage(`prop:${p.img}`, `/sprites/props/${p.img}.png`);
    }
  }

  // pose is one of "dir_front" | "dir_back" | "dir_left" | "dir_right" |
  // "walk_1".."walk_5" — see the per-color folders under
  // public/sprites/characters/<color>/. Falls back to the flat, single
  // static <color>.png if a pose file is somehow missing for a color.
  _charPoseImage(color, pose) {
    const safeColor = color || "beige";
    const key = `char:${safeColor}:${pose}`;
    let img = this.images.get(key);
    if (!img) {
      img = new Image();
      img.src = `/sprites/characters/${safeColor}/${pose}.png`;
      img.onerror = () => {
        img.onerror = null;
        img.src = spriteUrlFor(safeColor);
      };
      this.images.set(key, img);
    }
    return img;
  }

  setSelfId(id) {
    this.selfId = id;
  }
  // The player currently auto-locked as a steal target (highlighted with a
  // red ring) — null when no one's in range or the local player isn't
  // Corrupted right now. See GameScreen's lockedTargetId effect.
  setStealTarget(playerId) {
    this.stealTargetId = playerId;
  }
  setBlackout(on) {
    this.blackout = on;
  }
  setRound(round) {
    this.round = round;
  }
  // Zoom relative to whatever scale this scene was constructed with (1.0 =
  // default). Clamped so the player can't zoom out so far that furniture
  // colliders become impossible to see/avoid, or in so far that a single
  // room fills more than the whole screen.
  setZoom(factor) {
    this.scale = this.baseScale * Math.max(0.6, Math.min(1.8, factor));
  }
  getZoom() {
    return this.scale / this.baseScale;
  }
  // Called every animation frame from GameScreen's joystick loop (not just
  // when the network echoes a position back). x/z are the locally-predicted
  // position; facing/moving are derived straight from joystick input.
  setSelfMotion(x, z, moving, facing) {
    this.selfPos = { x, z };
    if (!this.selfId) return;
    const prev = this.animState.get(this.selfId);
    this.animState.set(this.selfId, {
      facing: moving ? facing : (prev && prev.facing) || facing,
      moving,
      walkFrame: (prev && prev.walkFrame) || 0,
      walkTimer: (prev && prev.walkTimer) || 0,
      lastX: x,
      lastZ: z,
    });
  }

  updatePlayers(players, viewerIsGhost = false) {
    // Figure out which way each player is facing (and whether they're
    // currently walking) from how far they moved since the last snapshot —
    // the server only ever sends us a bare {x, z}, never a heading, so this
    // is reconstructed on the client. Previously this data was just thrown
    // away and every player was always drawn with the single static
    // front-facing sprite, regardless of which way they were actually moving.
    const nextState = new Map();
    const MOVE_EPSILON = 0.02; // world units; ignores network jitter on stationary players
    for (const p of players) {
      // The local player's facing/moving is owned by setSelfMotion(), driven
      // every frame from joystick input — leave it alone here so a laggy
      // network echo can't fight with (and visually stutter against) local
      // prediction. Everyone else still comes entirely from these snapshots.
      if (p.playerId === this.selfId) {
        const prev = this.animState.get(p.playerId);
        if (prev) {
          nextState.set(p.playerId, prev);
          continue;
        }
      }

      const prev = this.animState.get(p.playerId);
      const dx = prev ? p.x - prev.lastX : 0;
      const dz = prev ? p.z - prev.lastZ : 0;
      const dist = Math.hypot(dx, dz);
      const moving = dist > MOVE_EPSILON;

      let facing = prev ? prev.facing : "front";
      if (moving) {
        // Whichever axis moved further decides the sprite direction.
        facing = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "right" : "left") : dz > 0 ? "front" : "back";
      }

      nextState.set(p.playerId, {
        facing,
        moving,
        walkFrame: prev ? prev.walkFrame : 0,
        walkTimer: prev ? prev.walkTimer : 0,
        lastX: p.x,
        lastZ: p.z,
      });
    }
    this.animState = nextState;

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

  _drawOctagon(x, y, w, h, c) {
    const ctx = this.ctx;
    const cx = Math.min(c, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + cx, y);
    ctx.lineTo(x + w - cx, y);
    ctx.lineTo(x + w, y + cx);
    ctx.lineTo(x + w, y + h - cx);
    ctx.lineTo(x + w - cx, y + h);
    ctx.lineTo(x + cx, y + h);
    ctx.lineTo(x, y + h - cx);
    ctx.lineTo(x, y + cx);
    ctx.closePath();
  }

  _drawShape(x, y, w, h, isRoom, radiusOrChamfer) {
    if (isRoom) this._drawOctagon(x, y, w, h, radiusOrChamfer);
    else this._drawRoundedRect(x, y, w, h, radiusOrChamfer);
  }

  _drawFloorTexture(zone, sx, sy, w, h, radius) {
    const tileName = TILE_FOR_ROOM[zone.id];
    if (!tileName) return;
    const img = this._getImage(`tile:${tileName}`, `/sprites/tiles/${tileName}.png`);
    if (!img.complete || img.naturalWidth === 0) return;
    const ctx = this.ctx;
    ctx.save();
    this._drawShape(sx, sy, w, h, true, radius);
    ctx.clip();
    ctx.globalAlpha = 0.55;
    const tileSize = 34; // screen px per tile, independent of room scale
    for (let ty = sy; ty < sy + h; ty += tileSize) {
      for (let tx = sx; tx < sx + w; tx += tileSize) {
        ctx.drawImage(img, tx, ty, tileSize, tileSize);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawRoomPropsSprites(zone, sx, sy, w, h) {
    const props = PROPS_FOR_ROOM[zone.id];
    if (!props) return;
    const ctx = this.ctx;
    for (const p of props) {
      const img = this._getImage(`prop:${p.img}`, `/sprites/props/${p.img}.png`);
      if (!img.complete || img.naturalWidth === 0) continue;
      const baseSize = 2.1 * this.scale * p.scale; // world-unit-ish sizing
      const aspect = img.naturalWidth / img.naturalHeight;
      const drawW = baseSize;
      const drawH = baseSize / aspect;
      const px = sx + w * p.x - drawW / 2;
      const py = sy + h * p.y - drawH * 0.75; // anchor near the "base" of the object
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 3;
      ctx.drawImage(img, px, py, drawW, drawH);
      ctx.restore();
    }
  }

  _getCracksForRoom(zone) {
    const cached = this.crackCache.get(zone.id);
    if (cached && cached.round === this.round) return cached.cracks;
    const crackCount = Math.max(0, this.round - 1) * 3;
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
      for (let i = 1; i < points.length; i++) ctx.lineTo(sx + points[i].x * this.scale, sy + points[i].z * this.scale);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(155, 60, 120, 0.25)";
    ctx.lineWidth = 4;
    for (const points of cracks) {
      ctx.beginPath();
      ctx.moveTo(sx + points[0].x * this.scale, sy + points[0].z * this.scale);
      for (let i = 1; i < points.length; i++) ctx.lineTo(sx + points[i].x * this.scale, sy + points[i].z * this.scale);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawDoorways() {
    // Punches a visible gap through the room wall-frame drawn in _drawZone
    // exactly where DOORWAYS (rooms.js) says the collision system actually
    // lets a player cross — so what looks open is what IS open, instead of
    // every room drawing an unbroken wall-frame regardless of what
    // corridors connect to it.
    const ctx = this.ctx;
    const band = WALL_FRAME + 2; // px — a little wider than the frame itself so it fully punches through
    const frameColor = "rgba(220, 190, 120, 0.55)"; // warm accent reading as a door frame, not just a hole
    // Rooms are octagons now with a real (post-rescale) visible chamfer —
    // see _drawZone. A doorway segment that spans a room's full straight
    // edge (most of ours do — that's literally how wide the corridor was
    // built) would bleed past where that edge is actually straight and
    // into the angled octagon corner past each end. Inset the drawn
    // segment by the same chamfer amount so the visible opening stays on
    // the flat wall section it's supposed to be cut into.
    const CHAMFER_PX = 60; // must match the room chamfer cap in _drawZone
    for (const d of DOORWAYS) {
      if (d.axis === "x") {
        const p0 = this.worldToScreen(d.start, d.edge);
        const p1 = this.worldToScreen(d.end, d.edge);
        let left = Math.min(p0.sx, p1.sx);
        let width = Math.abs(p1.sx - p0.sx);
        const inset = Math.min(CHAMFER_PX, width * 0.4);
        left += inset;
        width -= inset * 2;
        const topY = p0.sy - band;
        ctx.fillStyle = CORRIDOR_COLOR;
        ctx.fillRect(left, topY, width, band * 2);
        ctx.fillStyle = frameColor;
        ctx.fillRect(left - 2, topY, 3, band * 2);
        ctx.fillRect(left + width - 1, topY, 3, band * 2);
      } else {
        const p0 = this.worldToScreen(d.edge, d.start);
        const p1 = this.worldToScreen(d.edge, d.end);
        let top = Math.min(p0.sy, p1.sy);
        let height = Math.abs(p1.sy - p0.sy);
        const inset = Math.min(CHAMFER_PX, height * 0.4);
        top += inset;
        height -= inset * 2;
        const leftX = p0.sx - band;
        ctx.fillStyle = CORRIDOR_COLOR;
        ctx.fillRect(leftX, top, band * 2, height);
        ctx.fillStyle = frameColor;
        ctx.fillRect(leftX, top - 2, band * 2, 3);
        ctx.fillRect(leftX, top + height - 1, band * 2, 3);
      }
    }
  }

  _drawZone(zone, isRoom) {
    let { sx, sy } = this.worldToScreen(zone.x, zone.z);
    let w = zone.w * this.scale;
    let h = zone.d * this.scale;
    const ctx = this.ctx;

    if (!isRoom) {
      // Several corridors were deliberately widened earlier (past even a
      // room's own 12-unit width) specifically to fix a "stuck at the
      // doorway" bug from mobile touch-joystick drift — that fix has to
      // stay, the actual walkable collision (rooms.js) is untouched here.
      // But the side effect was corridors visually reading as BIGGER than
      // the rooms they connect, which no longer looks like a corridor at
      // all. This shrinks only the VISUAL footprint, centered, leaving an
      // invisible-but-still-walkable buffer around the drawn edges — the
      // generous collision that fixed the doorway bug is still fully
      // there, it just isn't drawn that wide anymore.
      //
      // Only the axis that ISN'T clearly the corridor's connecting length
      // gets capped — a dimension more than 2x the other is assumed to be
      // the span between the two rooms it joins (shrinking THAT would pull
      // the corridor away from one or both doorways, leaving a visible
      // gap), so it's left alone; the other (perpendicular, "width") axis
      // is capped down toward a normal room-width-ish size.
      const worldW = zone.w, worldD = zone.d;
      const capAxis = (big, small) => (big > small * 2 ? big : Math.min(big, 18));
      const visualWorldW = capAxis(worldW, worldD);
      const visualWorldD = capAxis(worldD, worldW);
      if (visualWorldW !== worldW || visualWorldD !== worldD) {
        const centerX = zone.x + worldW / 2;
        const centerZ = zone.z + worldD / 2;
        const p = this.worldToScreen(centerX - visualWorldW / 2, centerZ - visualWorldD / 2);
        sx = p.sx;
        sy = p.sy;
        w = visualWorldW * this.scale;
        h = visualWorldD * this.scale;
      }
    }

    // Rooms are drawn as proper octagons (_drawOctagon), matching the
    // reference blueprint's faceted room style — but this used to be a
    // fixed 22px chamfer regardless of room size. After this session's
    // world-scale pass (1.5x) and camera-zoom bump (24->32px/unit), rooms
    // render at 384-1920 screen px wide, so a fixed 22px corner-cut had
    // shrunk to a barely-visible nick — the octagon shape was technically
    // there but read as "just a rectangle" at these sizes. Scaling the
    // chamfer to the room's own screen size keeps the faceted look
    // consistent (and visible) across both the smallest and largest rooms.
    const radius = isRoom ? Math.min(60, Math.min(w, h) * 0.18) : 4;
    const depth = isRoom ? WALL_DEPTH : CORRIDOR_WALL_DEPTH;
    const baseColor = isRoom ? zone.color : CORRIDOR_COLOR;
    const wallColor = shade(baseColor, -0.62);

    if (isRoom) {
      ctx.fillStyle = wallColor;
      this._drawShape(sx - WALL_FRAME, sy - WALL_FRAME, w + WALL_FRAME * 2, h + WALL_FRAME * 2, isRoom, radius + WALL_FRAME);
      ctx.fill();
    }

    ctx.fillStyle = shade(baseColor, -0.55);
    this._drawShape(sx, sy + depth, w, h, isRoom, radius);
    ctx.fill();

    const grad = ctx.createLinearGradient(sx, sy, sx, sy + h);
    grad.addColorStop(0, shade(baseColor, 0.2));
    grad.addColorStop(1, shade(baseColor, -0.15));
    ctx.fillStyle = grad;
    this._drawShape(sx, sy, w, h, isRoom, radius);
    ctx.fill();

    if (isRoom) {
      this._drawFloorTexture(zone, sx, sy, w, h, radius);

      ctx.save();
      this._drawShape(sx, sy, w, h, isRoom, radius);
      ctx.clip();
      this._drawRoomPropsSprites(zone, sx, sy, w, h);
      this._drawCracks(sx, sy, this._getCracksForRoom(zone));
      ctx.restore();
    }

    ctx.save();
    this._drawShape(sx, sy, w, h, isRoom, radius);
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
    this._drawShape(sx, sy, w, h, isRoom, radius);
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
    } else if (!isRoom) {
      // Corridors used to render with zero label at all — a first-time
      // player walking through one had no visual cue it was a distinct
      // "corridor" space rather than just an odd-shaped extension of
      // whichever room they'd just left, which is exactly the reported
      // confusion. A small, muted label (much quieter than a room name —
      // corridors are pass-through spaces, not destinations) fixes that
      // without changing the actual geometry or collision at all.
      ctx.fillStyle = "rgba(160,180,210,0.4)";
      ctx.font = "600 11px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("CORRIDOR", sx + w / 2, sy + h / 2);
    }
  }

  _drawPlayer(p) {
    const isSelf = p.playerId === this.selfId;
    // Draw the local player at their locally-predicted position instead of
    // the last server echo — see setSelfMotion() for why.
    const drawX = isSelf && this.selfPos ? this.selfPos.x : p.x;
    const drawZ = isSelf && this.selfPos ? this.selfPos.z : p.z;
    const { sx, sy } = this.worldToScreen(drawX, drawZ);
    const ctx = this.ctx;
    const anim = this.animState.get(p.playerId);
    const facing = (anim && anim.facing) || "front";
    // Left-facing walk uses its own mirrored frame set (walk_left_N) instead
    // of reusing the right-facing walk_N frames — matching the reference
    // sheet's rule that LEFT is a horizontal mirror of RIGHT, for the walk
    // cycle just as much as the static pose.
    const pose = anim && anim.moving
      ? (facing === "left" ? `walk_left_${anim.walkFrame + 1}` : `walk_${anim.walkFrame + 1}`)
      : `dir_${facing}`;
    const img = this._charPoseImage(p.color, pose);

    ctx.globalAlpha = p.connected === false ? 0.35 : this.viewerIsGhost && !isSelf ? 0.55 : 1;

    // Character size used to be a flat 42px, completely independent of
    // this.scale — unlike everything else in the scene (rooms, corridors,
    // furniture, the vision circle, the room chamfer), which all multiply
    // by this.scale. That was fine back when scale was a fixed 24px/unit,
    // but this session's camera-zoom bump (24->32) and 1.5x world-scale
    // pass both made rooms/corridors/furniture render noticeably bigger on
    // screen while the character sprite itself stayed pinned at the same
    // 42px — so characters had visibly shrunk relative to the rooms around
    // them. 1.75 is just 42/24, preserving the exact original tuning at the
    // old default scale while now correctly growing/shrinking with camera
    // zoom like everything else does.
    const drawH = 1.75 * this.scale;
    const k = drawH / 42; // scales the shadow/self-ring offsets below by the same ratio

    // Grounding shadow.
    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.ellipse(sx, sy + 12 * k, 13 * k, 5 * k, 0, 0, Math.PI * 2);
    ctx.fill();

    // Red lock-on ring — this player is the currently auto-targeted steal
    // victim for a Corrupted local player (see GameScreen's lockedTargetId).
    // Drawn under the character like a ground target marker, pulsing so
    // it's readable at a glance even in a crowd.
    if (this.stealTargetId && p.playerId === this.stealTargetId) {
      const pulse = 0.75 + 0.25 * Math.sin((this._lastTickTime || 0) / 180);
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255, 60, 60, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.ellipse(sx, sy + 12 * k, 19 * k, 8 * k, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (img.complete && img.naturalWidth > 0) {
      const drawW = drawH * (img.naturalWidth / img.naturalHeight);
      if (this.viewerIsGhost && !isSelf) {
        ctx.filter = "hue-rotate(220deg) saturate(0.6)";
      }
      ctx.drawImage(img, sx - drawW / 2, sy - drawH + 10 * k, drawW, drawH);
      ctx.filter = "none";
    } else {
      // Fallback while the sprite loads: a simple colored dot so players
      // aren't invisible for the first frame or two.
      ctx.beginPath();
      ctx.fillStyle = isSelf ? "#35e6d0" : "#dfe6ff";
      ctx.arc(sx, sy, 10 * k, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    if (p.displayName) {
      ctx.font = "700 11px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = isSelf ? "#35e6d0" : "#e8ecf7";
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 4;
      ctx.fillText(p.displayName, sx, sy - 34);
      ctx.shadowBlur = 0;
    }
  }

  _tick(now) {
    this._raf = requestAnimationFrame(this._tick);
    const dt = this._lastTickTime != null ? Math.min(now - this._lastTickTime, 100) : 16;
    this._lastTickTime = now;

    for (const state of this.animState.values()) {
      if (!state.moving) continue;
      state.walkTimer += dt;
      while (state.walkTimer >= WALK_FRAME_MS) {
        state.walkTimer -= WALK_FRAME_MS;
        state.walkFrame = (state.walkFrame + 1) % WALK_FRAMES;
      }
    }

    this.renderFocus.x += (this.focus.x - this.renderFocus.x) * 0.18;
    this.renderFocus.z += (this.focus.z - this.renderFocus.z) * 0.18;

    const ctx = this.ctx;
    ctx.fillStyle = "#05070f";
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    for (const c of CORRIDORS) this._drawZone(c, false);
    for (const r of ROOMS) this._drawZone(r, true);
    this._drawDoorways();

    const sorted = [...this.players].sort((a, b) => a.z - b.z);
    for (const p of sorted) this._drawPlayer(p);

    if (this.blackout) {
      const cx = this.cssWidth / 2, cy = this.cssHeight / 2;
      // These used to be fixed screen-pixel radii (170/300px), independent
      // of this.scale. That was the actual bug behind "blackout vision
      // looks the same as normal" — once the camera scale/zoom or world
      // size changed, that fixed pixel circle could end up covering most
      // of an actual mobile screen (300px against a ~380px-wide viewport
      // is nearly edge-to-edge), leaving almost nothing actually darkened.
      // Defining the radius in WORLD units and multiplying by this.scale
      // keeps it a genuinely tight circle around the player regardless of
      // camera scale or zoom level — zooming in/out changes how big that
      // same real visible area looks on screen, exactly like real vision.
      const innerWorld = 2.2;
      const outerWorld = 4;
      const vision = ctx.createRadialGradient(
        cx, cy, innerWorld * this.scale,
        cx, cy, outerWorld * this.scale
      );
      vision.addColorStop(0, "rgba(3,4,10,0)");
      vision.addColorStop(1, "rgba(3,4,10,0.97)");
      ctx.fillStyle = vision;
      ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
    }

    const roundIntensity = Math.max(0, this.round - 1) * 0.09;
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
