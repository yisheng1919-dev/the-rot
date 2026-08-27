// THE ROT — server-side constants.
// All of these are intentionally configurable per room (see Room.js defaultConfig)
// but these are the defaults used when a Host does not override them.

export const PHASES = {
  LOBBY: "LOBBY",
  ROUND_START: "ROUND_START",
  POWER_OUTAGE: "POWER_OUTAGE",
  FREE_ROAM: "FREE_ROAM", // power's back on, players roam freely until someone calls a meeting from Cafeteria
  DISCUSSION: "DISCUSSION",
  VOTING: "VOTING",
  TIE_CLARIFY: "TIE_CLARIFY",
  TIE_VOTE: "TIE_VOTE",
  ELIMINATION_REVEAL: "ELIMINATION_REVEAL",
  GAME_OVER: "GAME_OVER",
};

// Phases where everyone is gathered at the meeting table and movement is
// frozen — mirrors Among Us's meeting screen, where you can't wander off
// mid-discussion or mid-vote.
export const FROZEN_PHASES = new Set([
  PHASES.DISCUSSION,
  PHASES.VOTING,
  PHASES.TIE_CLARIFY,
  PHASES.TIE_VOTE,
  PHASES.ELIMINATION_REVEAL,
]);

export const DEFAULT_CONFIG = {
  minPlayers: 4,
  maxPlayers: 12,
  totalRounds: 3,
  startingCards: 3,
  powerOutageSeconds: 30,
  // Restoring power takes a group effort — this many distinct players must
  // be standing in the Power Room and press restore before it actually
  // comes back on (see Room._restorePower / handleRestorePower).
  powerRestoreRequiredPlayers: 3,
  discussionSeconds: 180,
  manualMeetingProgressSeconds: 60,
  stealCooldownSeconds: 7,
  tieClarifySeconds: 60,
  reconnectGraceSeconds: 90,
  eliminationRevealSeconds: 6,
  // Gives players time to look around the map and get their bearings
  // before the lights go out and the 30s Power Room scramble begins.
  roundStartSeconds: 60,
  // Failsafe: if nobody walks to Cafeteria and calls a meeting after power
  // comes back on, the game auto-gathers everyone anyway so it can't stall.
  freeRoamMaxSeconds: 90,
};

// Rooms are simple axis-aligned rectangles in world units. Used for
// server-side proximity / zone validation (who is "in" the Power Room, etc).
// x/z are the footprint on the ground plane; the client's 2D scene uses the
// same coordinates so what the player sees matches what the server enforces.
// Colors here are metadata only (kept in sync with client/src/rooms.js for
// reference) — the client's copy is what actually gets rendered.
//
// This is the 12-room layout matching the illustrated map reference:
// three rooms across the top, Cafeteria in the middle, Medbay on the right,
// and five rooms across the bottom.
export const ROOMS = {
  CONTROL_ROOM: { id: "CONTROL_ROOM", label: "Control Room", x: -36, z: -24, w: 14, d: 12, color: 0x2a1a5c },
  LOBBY: { id: "LOBBY", label: "Lobby", x: -20, z: -24, w: 16, d: 12, color: 0x1e5c3a },
  MAP_ROOM: { id: "MAP_ROOM", label: "Map Room", x: 0, z: -24, w: 16, d: 12, color: 0x1a4d52 },
  STORAGE: { id: "STORAGE", label: "Storage", x: -36, z: -8, w: 14, d: 14, color: 0x4a3020 },
  CAFETERIA: { id: "CAFETERIA", label: "Cafeteria", x: -20, z: -8, w: 32, d: 20, color: 0x34405c },
  POWER_ROOM: { id: "POWER_ROOM", label: "Power Room", x: 16, z: -8, w: 16, d: 14, color: 0x5c3d1a },
  MEDBAY: { id: "MEDBAY", label: "Medbay", x: 16, z: 8, w: 16, d: 12, color: 0x5c1a28 },
  UPPER_ENGINE: { id: "UPPER_ENGINE", label: "Upper Engine", x: -36, z: 16, w: 14, d: 14, color: 0x5c2a1a },
  SECURITY: { id: "SECURITY", label: "Security", x: -20, z: 16, w: 10, d: 14, color: 0x1a4a2a },
  WEAPONS: { id: "WEAPONS", label: "Weapons", x: -8, z: 16, w: 10, d: 14, color: 0x3a2a4a },
  O2_ROOM: { id: "O2_ROOM", label: "O2 Room", x: 4, z: 16, w: 8, d: 14, color: 0x1a5c52 },
  LOWER_ENGINE: { id: "LOWER_ENGINE", label: "Lower Engine", x: 16, z: 22, w: 16, d: 10, color: 0x5c1a1a },
};

// Corridors are the only thing connecting rooms to each other. Together with
// the rooms above, they form the complete walkable area of the map — a
// player standing anywhere NOT inside one of these rectangles is standing
// somewhere invalid, and movement there is rejected (see Room.handleMove).
// This is what gives the map real walls instead of open-world free-roam.
// Keep this in sync with client/src/rooms.js CORRIDORS — client and server
// must agree on the exact same walkable shape or movement will rubber-band.
//
// The top and bottom halls branch from Cafeteria; Storage and Medbay provide
// the side routes to the engine rooms, matching the illustrated floor plan.
export const CORRIDORS = {
  C_TOP_HALLWAY: { id: "C_TOP_HALLWAY", x: -20, z: -12, w: 36, d: 4 },
  C_BOTTOM_HALLWAY: { id: "C_BOTTOM_HALLWAY", x: -20, z: 12, w: 36, d: 4 },
  C_CONTROL_STORAGE: { id: "C_CONTROL_STORAGE", x: -30, z: -12, w: 4, d: 4 },
  C_STORAGE_UPPERENGINE: { id: "C_STORAGE_UPPERENGINE", x: -30, z: 6, w: 4, d: 10 },
  C_STORAGE_CAFETERIA: { id: "C_STORAGE_CAFETERIA", x: -22, z: -4, w: 2, d: 6 },
  C_POWER_MEDBAY: { id: "C_POWER_MEDBAY", x: 22, z: 6, w: 4, d: 2 },
  C_MEDBAY_LOWERENGINE: { id: "C_MEDBAY_LOWERENGINE", x: 22, z: 20, w: 4, d: 2 },
};

export const OBSTACLES = Object.values(ROOMS).flatMap((room, index) => {
  const insetX = Math.min(2.2, room.w * 0.18);
  const insetZ = Math.min(2.2, room.d * 0.18);
  const furniture = [{ roomId: room.id, x: room.x + insetX, z: room.z + insetZ, w: Math.min(3.2, room.w * 0.3), d: Math.min(1.8, room.d * 0.16) }];
  if (room.w > 12 && room.d > 12) {
    furniture.push({ roomId: room.id, x: room.x + room.w - insetX - 2.2, z: room.z + room.d - insetZ - 2, w: 2.2, d: 2 });
  }
  return furniture.map((obstacle) => ({ ...obstacle, colorIndex: index % 4 }));
});

export const WALKABLE_ZONES = [...Object.values(ROOMS), ...Object.values(CORRIDORS)];

export const POWER_ROOM_ZONE = ROOMS.POWER_ROOM;
export const MAP_ROOM_ZONE = ROOMS.MAP_ROOM;
// The Cafeteria is where meetings gather everyone — this plays the role
// the original design spec calls "Main Hall."
export const CAFETERIA_ZONE = ROOMS.CAFETERIA;

export function isWalkable(x, z, margin = 0) {
  const insideMap = WALKABLE_ZONES.some(
    (zone) => x >= zone.x - margin && x <= zone.x + zone.w + margin && z >= zone.z - margin && z <= zone.z + zone.d + margin
  );
  if (!insideMap) return false;
  return !OBSTACLES.some(
    (obstacle) => x >= obstacle.x - margin && x <= obstacle.x + obstacle.w + margin && z >= obstacle.z - margin && z <= obstacle.z + obstacle.d + margin
  );
}

// How close (world units) a Corrupted player must be to a target to steal.
export const STEAL_RANGE = 2.5;

export const IDENTITY = {
  INNOCENT: "INNOCENT",
  CORRUPTED: "CORRUPTED",
  ORIGINAL_CORRUPTED: "ORIGINAL_CORRUPTED",
};

export function identityOf(player) {
  if (player.isOC) return IDENTITY.ORIGINAL_CORRUPTED;
  if (player.isCorrupted) return IDENTITY.CORRUPTED;
  return IDENTITY.INNOCENT;
}

// The 12 selectable player colors — keep in sync with
// client/public/sprites/characters/*.png filenames and client/src/colors.js.
export const PLAYER_COLORS = [
  "beige", "brown", "charcoal", "navy", "forest_green", "maroon",
  "purple", "teal", "orange", "white", "pink", "yellow",
];
