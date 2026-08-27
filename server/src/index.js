import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { RoomManager } from "./RoomManager.js";
import { PHASES } from "./constants.js";

const PORT = process.env.PORT || 4000;

// Lock this down to your deployed client's exact origin(s) once you have
// them. Set the CORS_ORIGINS env var on your server host (comma-separated
// for multiple, e.g. your Netlify URL + a custom domain). Falls back to "*"
// (allow anything) only when the env var isn't set, so local dev keeps
// working out of the box — don't ship to a real event without setting this.
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
  : "*";

const app = express();
app.use(cors({ origin: allowedOrigins }));
app.get("/health", (_req, res) => res.json({ ok: true, name: "THE ROT server" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins },
});

const roomManager = new RoomManager(io);

function safe(socket, fn) {
  try {
    fn();
  } catch (err) {
    socket.emit("error:action", { message: err.message || "Something went wrong." });
  }
}

io.on("connection", (socket) => {
  // ---- Host flow -------------------------------------------------------
  socket.on("host:createRoom", (config, ack) => {
    safe(socket, () => {
      const room = roomManager.createRoom(socket.id, config);
      socket.join(room.roomKey);
      socket.join(`${room.roomKey}:host`);
      socket.data.isHost = true;
      socket.data.roomCode = room.code;
      ack?.({
        ok: true,
        code: room.code,
        config: room.config,
        hostReconnectToken: room.hostReconnectToken,
      });
      room.broadcastLobbyState();
    });
  });

  socket.on("host:reconnect", ({ code, hostReconnectToken }, ack) => {
    safe(socket, () => {
      const room = roomManager.getRoom(code);
      if (!room) throw new Error("Room not found.");
      room.reconnectHost(socket, hostReconnectToken);
      socket.data.isHost = true;
      socket.data.roomCode = room.code;
      ack?.({
        ok: true,
        code: room.code,
        config: room.config,
        phase: room.phase,
        round: room.round,
        powerOn: room.powerOn,
      });
    });
  });

  socket.on("host:startGame", (_payload, ack) => {
    safe(socket, () => {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room || room.hostSocketId !== socket.id) throw new Error("Not authorized.");
      room.startGame();
      ack?.({ ok: true });
    });
  });

  socket.on("host:requestRoles", (_payload, ack) => {
    safe(socket, () => {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room || room.hostSocketId !== socket.id) throw new Error("Not authorized.");
      room.broadcastHostRoles();
      ack?.({ ok: true });
    });
  });

  socket.on("host:skipDiscussion", (_payload, ack) => {
    const room = roomManager.getRoom(socket.data.roomCode);
    if (!room || room.hostSocketId !== socket.id) return ack?.({ ok: false, reason: "Not authorized." });
    ack?.(room.handleHostSkipDiscussion());
  });

  socket.on("host:endRoom", (_payload, ack) => {
    safe(socket, () => {
      const room = roomManager.getRoom(socket.data.roomCode);
      if (!room || room.hostSocketId !== socket.id) throw new Error("Not authorized.");
      room.clearAllTimers();
      io.to(room.roomKey).emit("room:ended");
      roomManager.removeRoom(room.code);
      ack?.({ ok: true });
    });
  });

  // ---- Player flow -------------------------------------------------------
  socket.on("player:joinRoom", ({ code, displayName, color }, ack) => {
    safe(socket, () => {
      const room = roomManager.getRoom(code);
      if (!room) throw new Error("Room not found.");
      const player = room.addPlayer(socket, (displayName || "").trim().slice(0, 20), color);
      socket.data.roomCode = room.code;
      socket.data.playerId = player.playerId;
      ack?.({
        ok: true,
        playerId: player.playerId,
        reconnectToken: player.reconnectToken,
        code: room.code,
        config: room.config,
        color: player.color,
      });
    });
  });

  socket.on("player:reconnect", ({ code, reconnectToken }, ack) => {
    safe(socket, () => {
      const room = roomManager.getRoom(code);
      if (!room) throw new Error("Room not found.");
      const player = room.reconnectPlayer(socket, reconnectToken);
      socket.data.roomCode = room.code;
      socket.data.playerId = player.playerId;

      ack?.({
        ok: true,
        playerId: player.playerId,
        phase: room.phase,
        round: room.round,
        powerOn: room.powerOn,
        alive: player.alive,
        isOC: player.isOC,
        isCorrupted: player.isCorrupted,
        cards: player.cards,
        color: player.color,
        x: player.x,
        z: player.z,
        deadline: room.phaseDeadline,
      });
      room.broadcastLobbyState();
      room.broadcastPublicPlayerSummary();
      room.broadcastPositions();
    });
  });

  socket.on("player:move", ({ x, z }) => {
    const room = roomManager.getRoom(socket.data.roomCode);
    if (!room || !socket.data.playerId) return;
    room.handleMove(socket.data.playerId, Number(x) || 0, Number(z) || 0);
  });

  socket.on("player:restorePower", (_payload, ack) => {
    const room = roomManager.getRoom(socket.data.roomCode);
    if (!room || !socket.data.playerId) return ack?.({ ok: false, reason: "No room." });
    ack?.(room.handleRestorePower(socket.data.playerId));
  });

  socket.on("player:stealCard", ({ targetId }, ack) => {
    const room = roomManager.getRoom(socket.data.roomCode);
    if (!room || !socket.data.playerId) return ack?.({ ok: false, reason: "No room." });
    ack?.(room.handleStealCard(socket.data.playerId, targetId));
  });

  socket.on("player:corruptionChoice", ({ becomeCorrupted }, ack) => {
    const room = roomManager.getRoom(socket.data.roomCode);
    if (!room || !socket.data.playerId) return ack?.({ ok: false, reason: "No room." });
    ack?.(room.handleCorruptionChoice(socket.data.playerId, !!becomeCorrupted));
  });

  socket.on("player:callMeeting", (_payload, ack) => {
    const room = roomManager.getRoom(socket.data.roomCode);
    if (!room || !socket.data.playerId) return ack?.({ ok: false, reason: "No room." });
    ack?.(room.handleCallMeeting(socket.data.playerId));
  });

  socket.on("player:vote", ({ targetId }, ack) => {
    const room = roomManager.getRoom(socket.data.roomCode);
    if (!room || !socket.data.playerId) return ack?.({ ok: false, reason: "No room." });
    ack?.(room.handleVote(socket.data.playerId, targetId));
  });

  // ---- Disconnect -------------------------------------------------------
  socket.on("disconnect", () => {
    const room = roomManager.getRoom(socket.data.roomCode);
    if (!room) return;
    room.handleSocketDisconnect(socket.id);

    // Clean up empty lobbies (nobody connected, still in LOBBY) after a delay.
    if (room.phase === PHASES.LOBBY) {
      const anyoneConnected =
        room.playerList().some((p) => p.connected) || io.sockets.sockets.has(room.hostSocketId);
      if (!anyoneConnected) {
        setTimeout(() => {
          const stillThere = roomManager.getRoom(room.code);
          if (stillThere && stillThere.phase === PHASES.LOBBY) {
            const stillEmpty =
              !stillThere.playerList().some((p) => p.connected) &&
              !io.sockets.sockets.has(stillThere.hostSocketId);
            if (stillEmpty) roomManager.removeRoom(room.code);
          }
        }, 60_000);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`THE ROT server listening on port ${PORT}`);
});
