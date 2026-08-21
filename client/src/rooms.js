// Mirrors server/src/constants.js ROOMS. Keep these two in sync manually —
// the server is authoritative for gameplay; this copy is purely visual.
export const ROOMS = [
  { id: "MAIN_HALL", label: "Main Hall", x: -6, z: -6, w: 12, d: 10, color: 0x2b3650 },
  { id: "POWER_ROOM", label: "Power Room", x: 10, z: -10, w: 8, d: 6, color: 0x3a2b50 },
  { id: "MAP_ROOM", label: "Map Room", x: -18, z: -10, w: 8, d: 6, color: 0x2b4a50 },
  { id: "LOUNGE", label: "Lounge", x: 10, z: 2, w: 8, d: 7, color: 0x4a3a2b },
  { id: "STORAGE", label: "Storage", x: -18, z: 2, w: 8, d: 7, color: 0x33332b },
  { id: "REST_AREA", label: "Rest Area", x: -6, z: 12, w: 10, d: 6, color: 0x2b503f },
  { id: "FIRST_AID", label: "First-Aid Area", x: 10, z: 12, w: 8, d: 6, color: 0x502b2b },
  { id: "CONTROL_ROOM", label: "Control/Communication Area", x: -18, z: 12, w: 8, d: 6, color: 0x2b3a50 },
];

export const POWER_ROOM = ROOMS.find((r) => r.id === "POWER_ROOM");
export const MAP_ROOM = ROOMS.find((r) => r.id === "MAP_ROOM");

export function roomAt(x, z) {
  return ROOMS.find((r) => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d) || null;
}
