// Mirrors server/src/constants.js ROOMS + CORRIDORS. Keep these in sync
// manually — the server is authoritative for gameplay; this copy drives
// rendering AND local movement prediction (so walking into a wall stops
// immediately instead of waiting on a server round-trip).
//
// This is the 12-room layout matching the illustrated map reference.
// CAFETERIA is the central hub (where meetings gather everyone). Security,
// Weapons, and O2 Room are plain walkable rooms with no special mechanic.
export const ROOMS = [
  { id: "CONTROL_ROOM", label: "Control Room", x: -54, z: -33, w: 12, d: 12, color: "#2a1a5c" },
  { id: "LOBBY", label: "Lobby", x: -30, z: -33, w: 12, d: 12, color: "#1e5c3a" },
  { id: "MAP_ROOM", label: "Map Room", x: 18, z: -33, w: 12, d: 12, color: "#1a4d52" },
  { id: "POWER_ROOM", label: "Power Room", x: 42, z: -33, w: 12, d: 12, color: "#5c3d1a" },
  { id: "STORAGE", label: "Storage", x: -54, z: -9, w: 12, d: 18, color: "#4a3020" },
  { id: "CAFETERIA", label: "Cafeteria", x: -30, z: -9, w: 60, d: 18, color: "#34405c" },
  { id: "MEDBAY", label: "Medbay", x: 42, z: -9, w: 12, d: 18, color: "#5c1a28" },
  { id: "UPPER_ENGINE", label: "Upper Engine", x: -54, z: 21, w: 12, d: 12, color: "#5c2a1a" },
  { id: "SECURITY", label: "Security", x: -30, z: 21, w: 12, d: 12, color: "#1a4a2a" },
  { id: "WEAPONS", label: "Weapons", x: -6, z: 21, w: 12, d: 12, color: "#3a2a4a" },
  { id: "O2_ROOM", label: "O2 Room", x: 18, z: 21, w: 12, d: 12, color: "#1a5c52" },
  { id: "LOWER_ENGINE", label: "Lower Engine", x: 42, z: 21, w: 12, d: 12, color: "#5c1a1a" },
];

export const CORRIDORS = [
  // Widened the same way as the top/bottom hallways below: these used to be
  // exactly as narrow (w=8) as Control Room/Upper Engine/Power Room/Lower
  // Engine themselves, giving zero tolerance for touch-joystick drift on
  // the final approach. Storage and Medbay (d=12) already give a deep
  // buffer to line back up before that last stretch.
  { id: "C_CONTROL_STORAGE", x: -58.5, z: -21, w: 21, d: 12 },
  { id: "C_STORAGE_UPPERENGINE", x: -58.5, z: 9, w: 21, d: 12 },
  // Top and bottom hallways used to be 3 separate 8-wide doorway corridors
  // each (one per room), exactly as narrow as the room they led to. On a
  // mobile touch joystick, players essentially never approach a doorway on
  // a perfectly straight line — the natural diagonal drift was enough to
  // clip the corner and get walled off right at the threshold ("stuck by
  // an invisible wall trying to get into the side rooms"). Widening these
  // into single hallways spanning the Cafeteria's full width gives room to
  // correct course before the final (much shorter) approach into the
  // room's own doorway, without changing which rooms connect to what.
  { id: "C_TOP_HALLWAY", x: -30, z: -21, w: 60, d: 12 }, // serves Lobby + Map Room
  { id: "C_BOTTOM_HALLWAY", x: -30, z: 9, w: 60, d: 12 }, // serves Security + Weapons + O2 Room
  { id: "C_POWER_MEDBAY", x: 37.5, z: -21, w: 21, d: 12 },
  { id: "C_MEDBAY_LOWERENGINE", x: 37.5, z: 9, w: 21, d: 12 },
  { id: "C_STORAGE_CAFETERIA", x: -42, z: -9, w: 12, d: 18 },
  { id: "C_CAFETERIA_MEDBAY", x: 30, z: -9, w: 12, d: 18 },
];

export const ALL_ZONES = [...ROOMS, ...CORRIDORS];

export const POWER_ROOM = ROOMS.find((r) => r.id === "POWER_ROOM");
export const MAP_ROOM = ROOMS.find((r) => r.id === "MAP_ROOM");
export const CAFETERIA = ROOMS.find((r) => r.id === "CAFETERIA");

// Furniture/prop sprites placed in each room. x/y are fractions (0-1) of the
// room's own width/height; scale is relative to a ~2-world-unit base. Lives
// here (not in GameScene2D.js) so the exact same data drives both rendering
// AND collision — see PROP_COLLIDERS below. Keep in sync with the actual
// sprite files under public/sprites/props/.
export const PROPS_FOR_ROOM = {
  CONTROL_ROOM: [
    { img: "monitor_dual", x: 0.28, y: 0.3, scale: 1.1 },
    { img: "server_rack", x: 0.72, y: 0.62, scale: 1.0 },
  ],
  LOBBY: [
    { img: "sofa_green", x: 0.32, y: 0.6, scale: 1.2 },
    { img: "plant_tall1", x: 0.78, y: 0.28, scale: 1.1 },
  ],
  MAP_ROOM: [{ img: "minimap_screen", x: 0.5, y: 0.42, scale: 1.6 }],
  POWER_ROOM: [{ img: "reactor_core1", x: 0.5, y: 0.5, scale: 1.7 }],
  STORAGE: [
    { img: "crate_brown1", x: 0.25, y: 0.3, scale: 1.0 },
    { img: "crate_brown2", x: 0.62, y: 0.28, scale: 1.0 },
    { img: "barrel_blue", x: 0.3, y: 0.7, scale: 0.9 },
    { img: "barrel_red", x: 0.68, y: 0.72, scale: 0.9 },
  ],
  CAFETERIA: [
    { img: "table_round_orange", x: 0.16, y: 0.35, scale: 1.1 },
    { img: "table_round_blue", x: 0.4, y: 0.35, scale: 1.1 },
    { img: "table_round_red", x: 0.64, y: 0.35, scale: 1.1 },
    { img: "table_round_orange", x: 0.88, y: 0.35, scale: 1.1 },
    { img: "vending_orange", x: 0.06, y: 0.75, scale: 1.0 },
    { img: "vending_teal", x: 0.94, y: 0.75, scale: 1.0 },
  ],
  MEDBAY: [
    { img: "medbed_teal", x: 0.28, y: 0.28, scale: 1.1 },
    { img: "medbed_teal2", x: 0.72, y: 0.28, scale: 1.1 },
    { img: "medkit", x: 0.5, y: 0.75, scale: 0.8 },
  ],
  UPPER_ENGINE: [{ img: "pipe_machine1", x: 0.5, y: 0.5, scale: 1.5 }],
  SECURITY: [
    { img: "security_cam", x: 0.25, y: 0.25, scale: 0.9 },
    { img: "noticeboard", x: 0.68, y: 0.5, scale: 1.1 },
  ],
  WEAPONS: [
    { img: "weaponrack1", x: 0.3, y: 0.5, scale: 1.2 },
    { img: "weaponrack2", x: 0.7, y: 0.5, scale: 1.2 },
  ],
  O2_ROOM: [
    { img: "canister_blue", x: 0.28, y: 0.5, scale: 0.9 },
    { img: "canister_green1", x: 0.52, y: 0.5, scale: 0.9 },
    { img: "canister_green2", x: 0.74, y: 0.5, scale: 0.9 },
  ],
  LOWER_ENGINE: [{ img: "reactor_core1", x: 0.5, y: 0.5, scale: 1.4 }],
};

// Real per-object collision for furniture/machines, derived from the exact
// same placement data used to render them — so a player can no longer walk
// through a sofa, reactor, crate, etc. Each collider is a small rectangle
// centered on the prop's rendered position (top-left {x,z,w,d} form, same
// convention as ROOMS/CORRIDORS above).
//
// The footprint is a heuristic, not a traced silhouette: sprites are drawn
// anchored at their visual base with a much taller vertical extent (a sofa
// or reactor "stands" above the tile it occupies), so using the sprite's
// full drawn height as depth would block a huge area no player is actually
// standing in. FOOT_W/FOOT_D approximate just the part of the object that's
// actually solid at floor level.
const FOOT_W = 0.9; // world units, per 1.0 prop scale
const FOOT_D = 0.5;
export const PROP_COLLIDERS = [];
for (const [roomId, props] of Object.entries(PROPS_FOR_ROOM)) {
  const room = ROOMS.find((r) => r.id === roomId);
  if (!room) continue;
  for (const p of props) {
    const cx = room.x + room.w * p.x;
    const cz = room.z + room.d * p.y;
    const hw = (FOOT_W * p.scale) / 2;
    const hd = (FOOT_D * p.scale) / 2;
    PROP_COLLIDERS.push({ x: cx - hw, z: cz - hd, w: hw * 2, d: hd * 2 });
  }
}

export function roomAt(x, z) {
  return ROOMS.find((r) => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d) || null;
}

export function isWalkable(x, z, margin = 0.3) {
  const inZone = ALL_ZONES.some(
    (zone) => x >= zone.x - margin && x <= zone.x + zone.w + margin && z >= zone.z - margin && z <= zone.z + zone.d + margin
  );
  if (!inZone) return false;
  // Furniture collision is intentionally NOT mirrored server-side (the
  // server only clamps to room/corridor zones) — this is local-prediction
  // only. For a private party game that's a fine tradeoff: worst case is a
  // modified client ignoring it and clipping through a sofa, which doesn't
  // affect any actual game logic (zone checks for steal range / power
  // restore etc. never cared about furniture).
  const blocked = PROP_COLLIDERS.some(
    (c) => x >= c.x && x <= c.x + c.w && z >= c.z && z <= c.z + c.d
  );
  return !blocked;
}

export function resolveMove(fromX, fromZ, toX, toZ) {
  if (isWalkable(toX, toZ)) return { x: toX, z: toZ };
  if (isWalkable(toX, fromZ)) return { x: toX, z: fromZ };
  if (isWalkable(fromX, toZ)) return { x: fromX, z: toZ };
  return { x: fromX, z: fromZ };
}

// Real doorway geometry, derived (not guessed) from where a room's rectangle
// and a corridor's rectangle share an exact boundary edge with overlapping
// range — i.e. wherever the collision system actually lets a player cross
// from one into the other. Used purely for rendering (see GameScene2D's
// _drawDoorways): draws a visually distinct opening exactly where the wall
// is actually walkable, instead of the flat unbroken wall-frame every room
// drew before, so "doors align with openings" for real rather than by luck.
//
// Each entry: axis 'x' means the door spans along X at a fixed Z (a
// horizontal gap in a top/bottom wall); axis 'z' means it spans along Z at
// a fixed X (a vertical gap in a left/right wall).
const EPS = 0.01;
export const DOORWAYS = [];
for (const r of ROOMS) {
  for (const c of CORRIDORS) {
    // Vertical shared edge (room's left/right wall meets corridor) — door
    // spans along Z.
    for (const [edgeX, otherX] of [[r.x + r.w, c.x], [r.x, c.x + c.w]]) {
      if (Math.abs(edgeX - otherX) < EPS) {
        const z0 = Math.max(r.z, c.z);
        const z1 = Math.min(r.z + r.d, c.z + c.d);
        if (z1 - z0 > EPS) DOORWAYS.push({ axis: "z", edge: edgeX, start: z0, end: z1 });
      }
    }
    // Horizontal shared edge (room's top/bottom wall meets corridor) — door
    // spans along X.
    for (const [edgeZ, otherZ] of [[r.z + r.d, c.z], [r.z, c.z + c.d]]) {
      if (Math.abs(edgeZ - otherZ) < EPS) {
        const x0 = Math.max(r.x, c.x);
        const x1 = Math.min(r.x + r.w, c.x + c.w);
        if (x1 - x0 > EPS) DOORWAYS.push({ axis: "x", edge: edgeZ, start: x0, end: x1 });
      }
    }
  }
}
