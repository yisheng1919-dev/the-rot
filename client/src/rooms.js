// Mirrors server/src/constants.js ROOMS + CORRIDORS. Keep these in sync
// manually — the server is authoritative for gameplay; this copy drives
// rendering AND local movement prediction (so walking into a wall stops
// immediately instead of waiting on a server round-trip).
//
// This is the 12-room layout matching the illustrated map reference.
// CAFETERIA is the central hub (where meetings gather everyone). Security,
// Weapons, and O2 Room are plain walkable rooms with no special mechanic.
export const ROOMS = [
  { id: "CONTROL_ROOM", label: "Control Room", x: -36, z: -22, w: 8, d: 8, color: "#2a1a5c" },
  { id: "LOBBY", label: "Lobby", x: -20, z: -22, w: 8, d: 8, color: "#1e5c3a" },
  { id: "MAP_ROOM", label: "Map Room", x: 12, z: -22, w: 8, d: 8, color: "#1a4d52" },
  { id: "POWER_ROOM", label: "Power Room", x: 28, z: -22, w: 8, d: 8, color: "#5c3d1a" },
  { id: "STORAGE", label: "Storage", x: -36, z: -6, w: 8, d: 12, color: "#4a3020" },
  { id: "CAFETERIA", label: "Cafeteria", x: -20, z: -6, w: 40, d: 12, color: "#34405c" },
  { id: "MEDBAY", label: "Medbay", x: 28, z: -6, w: 8, d: 12, color: "#5c1a28" },
  { id: "UPPER_ENGINE", label: "Upper Engine", x: -36, z: 14, w: 8, d: 8, color: "#5c2a1a" },
  { id: "SECURITY", label: "Security", x: -20, z: 14, w: 8, d: 8, color: "#1a4a2a" },
  { id: "WEAPONS", label: "Weapons", x: -4, z: 14, w: 8, d: 8, color: "#3a2a4a" },
  { id: "O2_ROOM", label: "O2 Room", x: 12, z: 14, w: 8, d: 8, color: "#1a5c52" },
  { id: "LOWER_ENGINE", label: "Lower Engine", x: 28, z: 14, w: 8, d: 8, color: "#5c1a1a" },
];

export const CORRIDORS = [
  { id: "C_CONTROL_STORAGE", x: -36, z: -14, w: 8, d: 8 },
  { id: "C_STORAGE_UPPERENGINE", x: -36, z: 6, w: 8, d: 8 },
  // Top and bottom hallways used to be 3 separate 8-wide doorway corridors
  // each (one per room), exactly as narrow as the room they led to. On a
  // mobile touch joystick, players essentially never approach a doorway on
  // a perfectly straight line — the natural diagonal drift was enough to
  // clip the corner and get walled off right at the threshold ("stuck by
  // an invisible wall trying to get into the side rooms"). Widening these
  // into single hallways spanning the Cafeteria's full width gives room to
  // correct course before the final (much shorter) approach into the
  // room's own doorway, without changing which rooms connect to what.
  { id: "C_TOP_HALLWAY", x: -20, z: -14, w: 40, d: 8 }, // serves Lobby + Map Room
  { id: "C_BOTTOM_HALLWAY", x: -20, z: 6, w: 40, d: 8 }, // serves Security + Weapons + O2 Room
  { id: "C_POWER_MEDBAY", x: 28, z: -14, w: 8, d: 8 },
  { id: "C_MEDBAY_LOWERENGINE", x: 28, z: 6, w: 8, d: 8 },
  { id: "C_STORAGE_CAFETERIA", x: -28, z: -6, w: 8, d: 12 },
  { id: "C_CAFETERIA_MEDBAY", x: 20, z: -6, w: 8, d: 12 },
];

export const ALL_ZONES = [...ROOMS, ...CORRIDORS];

export const POWER_ROOM = ROOMS.find((r) => r.id === "POWER_ROOM");
export const MAP_ROOM = ROOMS.find((r) => r.id === "MAP_ROOM");
export const CAFETERIA = ROOMS.find((r) => r.id === "CAFETERIA");

export function roomAt(x, z) {
  return ROOMS.find((r) => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d) || null;
}

export function isWalkable(x, z, margin = 0.3) {
  return ALL_ZONES.some(
    (zone) => x >= zone.x - margin && x <= zone.x + zone.w + margin && z >= zone.z - margin && z <= zone.z + zone.d + margin
  );
}

export function resolveMove(fromX, fromZ, toX, toZ) {
  if (isWalkable(toX, toZ)) return { x: toX, z: toZ };
  if (isWalkable(toX, fromZ)) return { x: toX, z: fromZ };
  if (isWalkable(fromX, toZ)) return { x: fromX, z: toZ };
  return { x: fromX, z: fromZ };
}
