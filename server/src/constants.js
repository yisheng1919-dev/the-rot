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
  powerOutageSeconds: 45,
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
// CAFETERIA is the central hub (where meetings gather everyone — it plays
// the role the spec calls "Main Hall"), with 11 rooms arranged around it in
// a 3-row grid. Security, Weapons, and O2 Room are plain walkable rooms
// with no special mechanic of their own — they exist for map texture/scale
// to match the reference, same as Corridors are in the original spec.
export const ROOMS = {
  CONTROL_ROOM: { id: "CONTROL_ROOM", label: "Control Room", x: -54, z: -33, w: 12, d: 12, color: 0x2a1a5c },
  LOBBY: { id: "LOBBY", label: "Lobby", x: -30, z: -33, w: 12, d: 12, color: 0x1e5c3a },
  MAP_ROOM: { id: "MAP_ROOM", label: "Map Room", x: 18, z: -33, w: 12, d: 12, color: 0x1a4d52 },
  POWER_ROOM: { id: "POWER_ROOM", label: "Power Room", x: 42, z: -33, w: 12, d: 12, color: 0x5c3d1a },
  STORAGE: { id: "STORAGE", label: "Storage", x: -54, z: -9, w: 12, d: 18, color: 0x4a3020 },
  CAFETERIA: { id: "CAFETERIA", label: "Cafeteria", x: -30, z: -9, w: 60, d: 18, color: 0x34405c },
  MEDBAY: { id: "MEDBAY", label: "Medbay", x: 42, z: -9, w: 12, d: 18, color: 0x5c1a28 },
  UPPER_ENGINE: { id: "UPPER_ENGINE", label: "Upper Engine", x: -54, z: 21, w: 12, d: 12, color: 0x5c2a1a },
  SECURITY: { id: "SECURITY", label: "Security", x: -30, z: 21, w: 12, d: 12, color: 0x1a4a2a },
  WEAPONS: { id: "WEAPONS", label: "Weapons", x: -6, z: 21, w: 12, d: 12, color: 0x3a2a4a },
  O2_ROOM: { id: "O2_ROOM", label: "O2 Room", x: 18, z: 21, w: 12, d: 12, color: 0x1a5c52 },
  LOWER_ENGINE: { id: "LOWER_ENGINE", label: "Lower Engine", x: 42, z: 21, w: 12, d: 12, color: 0x5c1a1a },
};

// Corridors are the only thing connecting rooms to each other. Together with
// the rooms above, they form the complete walkable area of the map — a
// player standing anywhere NOT inside one of these rectangles is standing
// somewhere invalid, and movement there is rejected (see Room.handleMove).
// This is what gives the map real walls instead of open-world free-roam.
// Keep this in sync with client/src/rooms.js CORRIDORS — client and server
// must agree on the exact same walkable shape or movement will rubber-band.
//
// Every non-hub room connects DIRECTLY to Cafeteria except the four corner
// rooms (Control Room, Power Room, Upper Engine, Lower Engine), which are
// one hop away via their adjacent neighbor (Storage/Medbay) — the same
// pattern real hallways in the reference map imply.
export const CORRIDORS = {
  C_CONTROL_STORAGE: { id: "C_CONTROL_STORAGE", x: -58.5, z: -21, w: 21, d: 12 },
  C_STORAGE_UPPERENGINE: { id: "C_STORAGE_UPPERENGINE", x: -58.5, z: 9, w: 21, d: 12 },
  // Widened from 3 separate 8-unit doorway corridors each (one per room) to
  // a single hallway spanning Cafeteria's full width. Mobile touch-joystick
  // input almost never approaches a doorway perfectly straight, and narrow
  // corridors gave zero tolerance for that drift — players got walled off
  // right at the threshold trying to reach the side rooms. Client rooms.js
  // must mirror this exactly (see the comment there).
  C_TOP_HALLWAY: { id: "C_TOP_HALLWAY", x: -30, z: -21, w: 60, d: 12 },
  C_BOTTOM_HALLWAY: { id: "C_BOTTOM_HALLWAY", x: -30, z: 9, w: 60, d: 12 },
  C_POWER_MEDBAY: { id: "C_POWER_MEDBAY", x: 37.5, z: -21, w: 21, d: 12 },
  C_MEDBAY_LOWERENGINE: { id: "C_MEDBAY_LOWERENGINE", x: 37.5, z: 9, w: 21, d: 12 },
  C_STORAGE_CAFETERIA: { id: "C_STORAGE_CAFETERIA", x: -42, z: -9, w: 12, d: 18 },
  C_CAFETERIA_MEDBAY: { id: "C_CAFETERIA_MEDBAY", x: 30, z: -9, w: 12, d: 18 },
};

export const WALKABLE_ZONES = [...Object.values(ROOMS), ...Object.values(CORRIDORS)];

export const POWER_ROOM_ZONE = ROOMS.POWER_ROOM;
export const MAP_ROOM_ZONE = ROOMS.MAP_ROOM;
// The Cafeteria is where meetings gather everyone — this plays the role
// the original design spec calls "Main Hall."
export const CAFETERIA_ZONE = ROOMS.CAFETERIA;

export function isWalkable(x, z, margin = 0) {
  return WALKABLE_ZONES.some(
    (zone) => x >= zone.x - margin && x <= zone.x + zone.w + margin && z >= zone.z - margin && z <= zone.z + zone.d + margin
  );
}

// How close (world units) a Corrupted player must be to a target to steal.
export const STEAL_RANGE = 6.75; // 4.5 * 1.5, scaled with the world so relative reach stays the same

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
