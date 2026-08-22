import { Room } from "./Room.js";
import { generateRoomCode } from "./utils.js";

export class RoomManager {
  constructor(io) {
    this.io = io;
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
  }

  createRoom(hostSocketId, configOverrides) {
    let code;
    do {
      code = generateRoomCode();
    } while (this.rooms.has(code));

    const room = new Room(code, this.io, hostSocketId, configOverrides);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get((code || "").toUpperCase());
  }

  removeRoom(code) {
    this.rooms.delete(code);
  }

  findRoomBySocket(socketId) {
    for (const room of this.rooms.values()) {
      if (room.hostSocketId === socketId) return room;
      if (room.socketToPlayerId.has(socketId)) return room;
    }
    return null;
  }
}
