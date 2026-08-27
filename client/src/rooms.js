// Mirrors server/src/constants.js ROOMS + CORRIDORS. Keep these in sync
// manually — the server is authoritative for gameplay; this copy drives
// rendering AND local movement prediction (so walking into a wall stops
// immediately instead of waiting on a server round-trip).
//
// This is the 12-room layout matching the illustrated map reference:
// three rooms across the top, Cafeteria in the middle, Medbay on the right,
// and five rooms across the bottom.
export const ROOMS = [
  { id: "CONTROL_ROOM", label: "Control Room", x: -36, z: -24, w: 14, d: 12, color: "#2a1a5c" },
  { id: "LOBBY", label: "Lobby", x: -20, z: -24, w: 16, d: 12, color: "#1e5c3a" },
  { id: "MAP_ROOM", label: "Map Room", x: 0, z: -24, w: 16, d: 12, color: "#1a4d52" },
  { id: "STORAGE", label: "Storage", x: -36, z: -8, w: 14, d: 14, color: "#4a3020" },
  { id: "CAFETERIA", label: "Cafeteria", x: -20, z: -8, w: 32, d: 20, color: "#34405c" },
  { id: "POWER_ROOM", label: "Power Room", x: 16, z: -8, w: 16, d: 14, color: "#5c3d1a" },
  { id: "MEDBAY", label: "Medbay", x: 16, z: 8, w: 16, d: 12, color: "#5c1a28" },
  { id: "UPPER_ENGINE", label: "Upper Engine", x: -36, z: 16, w: 14, d: 14, color: "#5c2a1a" },
  { id: "SECURITY", label: "Security", x: -20, z: 16, w: 10, d: 14, color: "#1a4a2a" },
  { id: "WEAPONS", label: "Weapons", x: -8, z: 16, w: 10, d: 14, color: "#3a2a4a" },
  { id: "O2_ROOM", label: "O2 Room", x: 4, z: 16, w: 8, d: 14, color: "#1a5c52" },
  { id: "LOWER_ENGINE", label: "Lower Engine", x: 16, z: 22, w: 16, d: 10, color: "#5c1a1a" },
];

export const CORRIDORS = [
  { id: "C_TOP_HALLWAY", x: -20, z: -12, w: 36, d: 4 },
  { id: "C_BOTTOM_HALLWAY", x: -20, z: 12, w: 36, d: 4 },
  { id: "C_CONTROL_STORAGE", x: -30, z: -12, w: 4, d: 4 },
  { id: "C_STORAGE_UPPERENGINE", x: -30, z: 6, w: 4, d: 10 },
  { id: "C_STORAGE_CAFETERIA", x: -22, z: -4, w: 2, d: 6 },
  { id: "C_POWER_MEDBAY", x: 22, z: 6, w: 4, d: 2 },
  { id: "C_MEDBAY_LOWERENGINE", x: 22, z: 20, w: 4, d: 2 },
];

export const OBSTACLES = ROOMS.flatMap((room, index) => {
  const insetX = Math.min(2.2, room.w * 0.18);
  const insetZ = Math.min(2.2, room.d * 0.18);
  const furniture = [{ roomId: room.id, x: room.x + insetX, z: room.z + insetZ, w: Math.min(3.2, room.w * 0.3), d: Math.min(1.8, room.d * 0.16) }];
  if (room.w > 12 && room.d > 12) {
    furniture.push({ roomId: room.id, x: room.x + room.w - insetX - 2.2, z: room.z + room.d - insetZ - 2, w: 2.2, d: 2 });
  }
  return furniture.map((obstacle) => ({ ...obstacle, colorIndex: index % 4 }));
});

export const ALL_ZONES = [...ROOMS, ...CORRIDORS];

export const POWER_ROOM = ROOMS.find((r) => r.id === "POWER_ROOM");
export const MAP_ROOM = ROOMS.find((r) => r.id === "MAP_ROOM");
export const CAFETERIA = ROOMS.find((r) => r.id === "CAFETERIA");

export function roomAt(x, z) {
  return ROOMS.find((r) => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d) || null;
}

export function isWalkable(x, z, margin = 0.3) {
  const insideMap = ALL_ZONES.some(
    (zone) => x >= zone.x - margin && x <= zone.x + zone.w + margin && z >= zone.z - margin && z <= zone.z + zone.d + margin
  );
  if (!insideMap) return false;
  return !OBSTACLES.some(
    (obstacle) => x >= obstacle.x - margin && x <= obstacle.x + obstacle.w + margin && z >= obstacle.z - margin && z <= obstacle.z + obstacle.d + margin
  );
}

export function resolveMove(fromX, fromZ, toX, toZ) {
  if (isWalkable(toX, toZ)) return { x: toX, z: toZ };
  if (isWalkable(toX, fromZ)) return { x: toX, z: fromZ };
  if (isWalkable(fromX, toZ)) return { x: fromX, z: toZ };
  return { x: fromX, z: fromZ };
}
