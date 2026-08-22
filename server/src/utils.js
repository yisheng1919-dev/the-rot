import { customAlphabet } from "nanoid";

// Room codes: unambiguous uppercase letters + digits (no 0/O/1/I confusion).
const roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const generateRoomCode = customAlphabet(roomCodeAlphabet, 6);

const idAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
export const generatePlayerId = customAlphabet(idAlphabet, 12);
export const generateReconnectToken = customAlphabet(idAlphabet, 32);

export function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pointInZone(x, z, zone) {
  return x >= zone.x && x <= zone.x + zone.w && z >= zone.z && z <= zone.z + zone.d;
}

export function distance2D(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}
