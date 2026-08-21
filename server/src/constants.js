// THE ROT — server-side constants.
// All of these are intentionally configurable per room (see Room.js defaultConfig)
// but these are the defaults used when a Host does not override them.

export const PHASES = {
  LOBBY: "LOBBY",
  ROUND_START: "ROUND_START",
  POWER_OUTAGE: "POWER_OUTAGE",
  DISCUSSION: "DISCUSSION",
  VOTING: "VOTING",
  TIE_CLARIFY: "TIE_CLARIFY",
  TIE_VOTE: "TIE_VOTE",
  ELIMINATION_REVEAL: "ELIMINATION_REVEAL",
  GAME_OVER: "GAME_OVER",
};

export const DEFAULT_CONFIG = {
  minPlayers: 4,
  maxPlayers: 12,
  totalRounds: 3,
  startingCards: 3,
  powerOutageSeconds: 30,
  discussionSeconds: 180,
  manualMeetingProgressSeconds: 60,
  stealCooldownSeconds: 7,
  tieClarifySeconds: 60,
  reconnectGraceSeconds: 90,
  eliminationRevealSeconds: 6,
  roundStartSeconds: 3,
};

// Rooms are simple axis-aligned rectangles in world units. Used for
// server-side proximity / zone validation (who is "in" the Power Room, etc).
// x/z are the footprint on the ground plane; the client's 3D scene uses the
// same coordinates so what the player sees matches what the server enforces.
export const ROOMS = {
  MAIN_HALL: { id: "MAIN_HALL", label: "Main Hall", x: -6, z: -6, w: 12, d: 10, color: 0x2b3650 },
  POWER_ROOM: { id: "POWER_ROOM", label: "Power Room", x: 10, z: -10, w: 8, d: 6, color: 0x3a2b50 },
  MAP_ROOM: { id: "MAP_ROOM", label: "Map Room", x: -18, z: -10, w: 8, d: 6, color: 0x2b4a50 },
  LOUNGE: { id: "LOUNGE", label: "Lounge", x: 10, z: 2, w: 8, d: 7, color: 0x4a3a2b },
  STORAGE: { id: "STORAGE", label: "Storage", x: -18, z: 2, w: 8, d: 7, color: 0x33332b },
  REST_AREA: { id: "REST_AREA", label: "Rest Area", x: -6, z: 12, w: 10, d: 6, color: 0x2b503f },
  FIRST_AID: { id: "FIRST_AID", label: "First-Aid Area", x: 10, z: 12, w: 8, d: 6, color: 0x502b2b },
  CONTROL_ROOM: { id: "CONTROL_ROOM", label: "Control/Communication Area", x: -18, z: 12, w: 8, d: 6, color: 0x2b3a50 },
};

export const POWER_ROOM_ZONE = ROOMS.POWER_ROOM;
export const MAP_ROOM_ZONE = ROOMS.MAP_ROOM;

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
