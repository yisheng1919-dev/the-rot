// Mirrors server/src/constants.js ROOMS. Keep these two in sync manually —
// the server is authoritative for gameplay; this copy is purely visual.
// Colors are hex STRINGS ("#rrggbb") — GameScene2D's canvas renderer calls
// string methods on these (see shade() in GameScene2D.js), so a numeric
// hex literal here (0x2b3650) will throw and silently kill every frame of
// rendering the instant the game screen mounts. Keep these as strings.
//
// Each room uses a genuinely distinct hue (not just a darker/lighter shade
// of the same blue-grey) so players can recognize a room by its color at a
// glance instead of having to read the small text label every time.
export const ROOMS = [
  { id: "MAIN_HALL", label: "Main Hall", x: -6, z: -6, w: 12, d: 10, color: "#34405c" }, // neutral steel blue — the hub
  { id: "POWER_ROOM", label: "Power Room", x: 10, z: -10, w: 8, d: 6, color: "#5c3d1a" }, // amber/warning
  { id: "MAP_ROOM", label: "Map Room", x: -18, z: -10, w: 8, d: 6, color: "#1a4d52" }, // teal
  { id: "LOUNGE", label: "Lounge", x: 10, z: 2, w: 8, d: 7, color: "#5c4a1a" }, // gold
  { id: "STORAGE", label: "Storage", x: -18, z: 2, w: 8, d: 7, color: "#4a3020" }, // rust brown
  { id: "REST_AREA", label: "Rest Area", x: -6, z: 12, w: 10, d: 6, color: "#1a5c3a" }, // sage green
  { id: "FIRST_AID", label: "First-Aid Area", x: 10, z: 12, w: 8, d: 6, color: "#5c1a28" }, // crimson
  { id: "CONTROL_ROOM", label: "Control/Communication Area", x: -18, z: 12, w: 8, d: 6, color: "#2a1a5c" }, // indigo
];

// Narrow connective corridors between rooms — these are the ONLY paths
// between rooms. A player cannot walk through a wall into empty space;
// they must be standing inside a room rectangle OR a corridor rectangle.
export const CORRIDORS = [
  // Main Hall <-> its four immediate neighbors
  { id: "C_MH_POWER", x: 6, z: -6, w: 4, d: 2, color: "#1c2036" },
  { id: "C_MH_MAP", x: -10, z: -6, w: 4, d: 2, color: "#1c2036" },
  { id: "C_MH_LOUNGE", x: 6, z: 2, w: 4, d: 2, color: "#1c2036" },
  { id: "C_MH_STORAGE", x: -10, z: 2, w: 4, d: 2, color: "#1c2036" },
  // Main Hall <-> Rest Area (center column, going "down" the map)
  { id: "C_MH_REST", x: -3, z: 4, w: 4, d: 8, color: "#1c2036" },
  // Right column: Power Room -> Lounge -> First-Aid
  { id: "C_POWER_LOUNGE", x: 12, z: -4, w: 4, d: 6, color: "#1c2036" },
  { id: "C_LOUNGE_FIRSTAID", x: 12, z: 9, w: 4, d: 3, color: "#1c2036" },
  // Left column: Map Room -> Storage -> Control Room
  { id: "C_MAP_STORAGE", x: -16, z: -4, w: 4, d: 6, color: "#1c2036" },
  { id: "C_STORAGE_CONTROL", x: -16, z: 9, w: 4, d: 3, color: "#1c2036" },
  // Bottom row loop: Rest Area <-> First-Aid / Control Room
  { id: "C_REST_FIRSTAID", x: 4, z: 14, w: 6, d: 2, color: "#1c2036" },
  { id: "C_REST_CONTROL", x: -10, z: 14, w: 6, d: 2, color: "#1c2036" },
];

export const ALL_ZONES = [...ROOMS, ...CORRIDORS];

export const POWER_ROOM = ROOMS.find((r) => r.id === "POWER_ROOM");
export const MAP_ROOM = ROOMS.find((r) => r.id === "MAP_ROOM");

function inRect(x, z, r) {
  return x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d;
}

export function roomAt(x, z) {
  return ROOMS.find((r) => inRect(x, z, r)) || null;
}

// True if (x, z) is inside a room OR a corridor — i.e. a legal place to
// stand. Used by the client to block walking through walls.
export function isWalkable(x, z) {
  return ALL_ZONES.some((zone) => inRect(x, z, zone));
}

// Simple AABB "slide" collision: try the full move; if blocked, try each
// axis independently so players slide along walls instead of getting
// stuck the instant they touch one.
export function resolveMove(fromX, fromZ, toX, toZ) {
  if (isWalkable(toX, toZ)) return { x: toX, z: toZ };
  if (isWalkable(toX, fromZ)) return { x: toX, z: fromZ };
  if (isWalkable(fromX, toZ)) return { x: fromX, z: toZ };
  return { x: fromX, z: fromZ };
}

