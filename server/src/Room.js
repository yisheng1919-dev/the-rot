import {
  PHASES,
  FROZEN_PHASES,
  DEFAULT_CONFIG,
  ROOMS,
  POWER_ROOM_ZONE,
  STEAL_RANGE,
  IDENTITY,
  identityOf,
  isWalkable,
  PLAYER_COLORS,
} from "./constants.js";
import {
  generatePlayerId,
  generateReconnectToken,
  shuffle,
  pointInZone,
  distance2D,
} from "./utils.js";

/**
 * Room is the single authoritative owner of one game's state.
 * Every rule from the design spec is enforced here, server-side.
 * The client never decides outcomes — it only sends intents
 * (move, restorePower, stealCard, vote, ...) and receives broadcasts.
 */
export class Room {
  constructor(code, io, hostSocketId, configOverrides = {}) {
    this.code = code;
    this.io = io;
    this.hostSocketId = hostSocketId;
    this.hostReconnectToken = generateReconnectToken();
    this.hostConnected = true;
    this.config = { ...DEFAULT_CONFIG, ...configOverrides };

    this.phase = PHASES.LOBBY;
    this.round = 0;
    this.powerOn = true;

    /** @type {Map<string, Player>} */
    this.players = new Map(); // playerId -> player object
    this.socketToPlayerId = new Map(); // socketId -> playerId

    this.votes = new Map(); // voterId -> targetId (current vote stage)
    this.tieCandidates = [];

    this.pendingCorruptionChoices = new Set(); // playerIds awaiting a private choice

    this.timers = {};
    this.phaseDeadline = null;

    this.createdAt = Date.now();
    this.ended = false;
  }

  // ---------------------------------------------------------------------
  // Room / player lifecycle
  // ---------------------------------------------------------------------

  get roomKey() {
    return `room:${this.code}`;
  }

  playerList() {
    return [...this.players.values()];
  }

  livingPlayers() {
    return this.playerList().filter((p) => p.alive);
  }

  addPlayer(socket, displayName, color) {
    if (this.phase !== PHASES.LOBBY) {
      throw new Error("Game already in progress.");
    }
    if (this.players.size >= this.config.maxPlayers) {
      throw new Error("Room is full.");
    }
    const nameTaken = this.playerList().some(
      (p) => p.displayName.toLowerCase() === displayName.toLowerCase()
    );
    if (nameTaken) {
      throw new Error("That name is already taken in this room.");
    }
    const chosenColor = PLAYER_COLORS.includes(color) ? color : PLAYER_COLORS[0];
    const colorTaken = this.playerList().some((p) => p.color === chosenColor && p.connected);
    if (colorTaken) {
      throw new Error("That color is already taken — pick another.");
    }

    const playerId = generatePlayerId();
    const reconnectToken = generateReconnectToken();

    const player = {
      playerId,
      displayName,
      color: chosenColor,
      reconnectToken,
      socketId: socket.id,
      connected: true,
      disconnectedAt: null,

      isOC: false,
      isCorrupted: false,
      cards: this.config.startingCards,
      alive: true,

      x: 0,
      z: 0,

      stealHistory: new Set(), // targetIds this player has stolen from, ever
      hasStolenThisRound: false,
      lastStealAt: null, // timestamp of last successful steal, for stealCooldownSeconds
      corruptedSinceRound: null, // round number they flipped, null if always innocent/started corrupted-ineligible
    };

    this.players.set(playerId, player);
    this.socketToPlayerId.set(socket.id, playerId);
    socket.join(this.roomKey);

    this.broadcastLobbyState();
    return player;
  }

  reconnectPlayer(socket, reconnectToken) {
    const player = this.playerList().find((p) => p.reconnectToken === reconnectToken);
    if (!player) throw new Error("Invalid reconnect token for this room.");

    // Drop the stale socket mapping if the old socket is still around.
    this.socketToPlayerId.delete(player.socketId);
    if (this.timers[`grace:${player.playerId}`]) {
      clearTimeout(this.timers[`grace:${player.playerId}`]);
      delete this.timers[`grace:${player.playerId}`];
    }

    player.socketId = socket.id;
    player.connected = true;
    player.disconnectedAt = null;
    this.socketToPlayerId.set(socket.id, player.playerId);
    socket.join(this.roomKey);

    // Same class of bug as the vote-targets one below: a player's client
    // only ever learns isCorrupted from role:assigned (game start) or
    // role:updated (the moment they flip) — neither fires again on
    // reconnect, so a converted player who reconnects would be stuck
    // thinking they're still Innocent. Resend their current status.
    this.emitToPlayer(player.playerId, "role:updated", { isCorrupted: player.isCorrupted });

    // If they reconnected mid-vote, refresh the "X / Y votes cast" count
    // for everyone — they now count toward the total being waited on again.
    if (this.phase === PHASES.VOTING || this.phase === PHASES.TIE_VOTE) {
      const connectedIds = this._connectedLivingIds();
      this.io.to(this.roomKey).emit("vote:progress", {
        votesCast: [...this.votes.keys()].filter((id) => connectedIds.includes(id)).length,
        votersNeeded: connectedIds.length,
      });

      // This was the actual bug behind "vote buttons vanish after
      // reconnecting mid-vote": vote:targets is only ever *broadcast* when
      // voting starts (or a tie-vote narrows the candidates) — a player who
      // was disconnected at that moment, or whose client simply remounted
      // on reconnect, never received it and was left with an empty target
      // list. Re-send it to just this player now, restricted to the tie
      // candidates if we're in a tie-vote, plus whether they've already
      // cast a vote so their button state comes back correctly too.
      const restrictTo = this.phase === PHASES.TIE_VOTE ? this.tieCandidates : null;
      const targets = (restrictTo ? this.livingPlayers().filter((p) => restrictTo.includes(p.playerId)) : this.livingPlayers()).map(
        (p) => ({ playerId: p.playerId, displayName: p.displayName })
      );
      this.emitToPlayer(player.playerId, "vote:targets", { targets, restricted: !!restrictTo });
      this.emitToPlayer(player.playerId, "vote:self", { hasVoted: this.votes.has(player.playerId) });
    }

    return player;
  }

  handleSocketDisconnect(socketId) {
    const playerId = this.socketToPlayerId.get(socketId);
    if (!playerId) {
      // Might be the host socket.
      if (socketId === this.hostSocketId) {
        this.hostConnected = false;
        this.io.to(this.roomKey).emit("host:disconnected");
      }
      return;
    }
    const player = this.players.get(playerId);
    if (!player) return;

    player.connected = false;
    player.disconnectedAt = Date.now();
    this.socketToPlayerId.delete(socketId);
    this.broadcastLobbyState();
    this.broadcastPositions();

    // If they dropped mid-vote, the pool of people we're waiting on just
    // got smaller — re-check immediately rather than waiting for someone
    // else to cast a vote (or the full timer) before noticing.
    if ((this.phase === PHASES.VOTING || this.phase === PHASES.TIE_VOTE) && player.alive) {
      const connectedIds = this._connectedLivingIds();
      const castByConnected = [...this.votes.keys()].filter((id) => connectedIds.includes(id)).length;
      this.io.to(this.roomKey).emit("vote:progress", { votesCast: castByConnected, votersNeeded: connectedIds.length });
      if (connectedIds.length > 0 && castByConnected >= connectedIds.length) {
        if (this.timers.votingEnd) clearTimeout(this.timers.votingEnd);
        if (this.timers.tieVoteEnd) clearTimeout(this.timers.tieVoteEnd);
        this._tallyVotes(this.livingPlayers().map((p) => p.playerId), this.phase);
      }
    }

    // Grace period: if they don't reconnect in time, they stay in the game
    // as-is (their character just stands still / is treated as offline).
    // We do NOT remove them or free up their slot — reconnection must
    // always restore the *same* player, never a duplicate.
    this.timers[`grace:${playerId}`] = setTimeout(() => {
      // No-op beyond marking permanently disconnected; game state is
      // preserved so a very late reconnect (same token) still works.
      delete this.timers[`grace:${playerId}`];
    }, this.config.reconnectGraceSeconds * 1000);
  }

  reconnectHost(socket, token) {
    if (token !== this.hostReconnectToken) {
      throw new Error("Invalid host reconnect token for this room.");
    }
    this.hostSocketId = socket.id;
    this.hostConnected = true;
    socket.join(this.roomKey);
    socket.join(`${this.roomKey}:host`);

    this.broadcastLobbyState();
    if (this.phase !== PHASES.LOBBY) {
      this.broadcastPublicPlayerSummary();
      this.broadcastHostRoles();
      this.broadcastPositions();
    }
  }

  // ---------------------------------------------------------------------
  // Broadcasting helpers
  // ---------------------------------------------------------------------

  broadcastLobbyState() {
    this.io.to(this.roomKey).emit("room:update", {
      code: this.code,
      config: this.config,
      players: this.playerList().map((p) => ({
        playerId: p.playerId,
        displayName: p.displayName,
        color: p.color,
        connected: p.connected,
      })),
      phase: this.phase,
    });
  }

  broadcastPositions() {
    // Ghosts can see everyone; living players only ever receive living
    // players' positions (ghosts are invisible to the living, per spec).
    const livingPositions = this.livingPlayers().map((p) => ({
      playerId: p.playerId,
      x: p.x,
      z: p.z,
      color: p.color,
      connected: p.connected,
    }));
    const ghostPositions = this.playerList()
      .filter((p) => !p.alive)
      .map((p) => ({ playerId: p.playerId, x: p.x, z: p.z, color: p.color, connected: p.connected }));

    for (const p of this.playerList()) {
      const payload = p.alive
        ? livingPositions
        : [...livingPositions, ...ghostPositions];
      this.emitToPlayer(p.playerId, "positions:update", payload);
    }
    this.io.to(`${this.roomKey}:host`).emit("positions:update", [
      ...livingPositions,
      ...ghostPositions,
    ]);
  }

  emitToPlayer(playerId, event, payload) {
    const player = this.players.get(playerId);
    if (!player || !player.connected) return;
    this.io.to(player.socketId).emit(event, payload);
  }

  broadcastPublicPlayerSummary() {
    // Never leaks isOC/isCorrupted while the game is running.
    this.io.to(this.roomKey).emit("players:summary", {
      players: this.playerList().map((p) => ({
        playerId: p.playerId,
        displayName: p.displayName,
        color: p.color,
        alive: p.alive,
        connected: p.connected,
      })),
    });
  }

  // Host-only: unlike broadcastPublicPlayerSummary, this DOES include each
  // player's true identity. The Host is not a player and never appears to
  // anyone else, so giving the facilitator a live monitor view doesn't leak
  // anything to other players — their secrecy from each other is untouched.
  broadcastHostRoles() {
    this.io.to(this.hostSocketId).emit("host:roles", {
      players: this.playerList().map((p) => ({
        playerId: p.playerId,
        displayName: p.displayName,
        identity: identityOf(p),
        alive: p.alive,
        cards: p.cards,
        connected: p.connected,
      })),
    });
  }

  setPhase(phase, deadline = null) {
    this.phase = phase;
    this.phaseDeadline = deadline;
    // The Host's socket already sits in `roomKey` (see index.js), so this
    // single broadcast reaches players and the Host alike — no need for a
    // second, duplicate emit aimed at the Host specifically.
    this.io.to(this.roomKey).emit("phase:change", {
      phase,
      round: this.round,
      deadline,
      powerOn: this.powerOn,
    });
  }

  clearAllTimers() {
    for (const key of Object.keys(this.timers)) {
      if (key.startsWith("grace:")) continue; // reconnect grace timers survive phase changes
      clearTimeout(this.timers[key]);
      delete this.timers[key];
    }
  }

  // ---------------------------------------------------------------------
  // Game start / role assignment
  // ---------------------------------------------------------------------

  startGame() {
    if (this.phase !== PHASES.LOBBY) throw new Error("Game already started.");
    if (this.players.size < this.config.minPlayers) {
      throw new Error(`Need at least ${this.config.minPlayers} players to start.`);
    }

    const ids = shuffle(this.playerList().map((p) => p.playerId));
    const ocId = ids[0];
    const ocPlayer = this.players.get(ocId);
    ocPlayer.isOC = true;
    ocPlayer.isCorrupted = true;

    // Everyone else starts Innocent (isOC=false, isCorrupted=false).
    for (const p of this.playerList()) {
      if (p.playerId === ocId) continue;
      p.isOC = false;
      p.isCorrupted = false;
    }

    // Scatter players to spawn points around Cafeteria.
    const spawnPoints = this._generateSpawnPoints(this.players.size);
    this.playerList().forEach((p, i) => {
      p.x = spawnPoints[i].x;
      p.z = spawnPoints[i].z;
      p.cards = this.config.startingCards;
    });

    for (const p of this.playerList()) {
      this.emitToPlayer(p.playerId, "role:assigned", {
        isOC: p.isOC,
        isCorrupted: p.isCorrupted,
        cards: p.cards,
      });
    }

    this.broadcastHostRoles();
    // Push everyone's spawn position immediately — otherwise nobody sees
    // anyone else on the map until the first joystick move fires it.
    this.broadcastPositions();

    this.round = 0;
    this._startNextRound();
  }

  _generateSpawnPoints(count, centerX = 0, centerZ = 0, radius = 3.5) {
    const points = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      points.push({ x: centerX + Math.cos(angle) * radius, z: centerZ + Math.sin(angle) * radius });
    }
    return points;
  }

  // ---------------------------------------------------------------------
  // Round flow: ROUND_START -> POWER_OUTAGE -> DISCUSSION -> VOTING
  //            -> (TIE_CLARIFY -> TIE_VOTE)? -> ELIMINATION_REVEAL -> next round
  // ---------------------------------------------------------------------

  _startNextRound() {
    this.round += 1;
    this.clearAllTimers();
    this.votes.clear();
    this.tieCandidates = [];

    // Reset per-round steal flags for currently-eligible corrupted players.
    for (const p of this.livingPlayers()) {
      const eligible =
        p.isCorrupted &&
        (p.corruptedSinceRound === null || p.corruptedSinceRound < this.round);
      p.hasStolenThisRound = !eligible; // if not eligible this round, treat as "already used"
    }

    // Defensive resync: re-send everyone's own isCorrupted status at the
    // start of every round, not just once at the moment they flip. The
    // single at-conversion-time role:updated (handleCorruptionChoice) is a
    // fragile one-shot signal — if it's ever missed client-side for any
    // reason, this guarantees the player's real status self-heals within
    // one round instead of leaving them silently stuck thinking they're
    // still Innocent.
    for (const p of this.livingPlayers()) {
      this.emitToPlayer(p.playerId, "role:updated", { isCorrupted: p.isCorrupted });
    }

    this.setPhase(PHASES.ROUND_START);
    this.timers.roundStart = setTimeout(() => {
      this._startPowerOutage();
    }, this.config.roundStartSeconds * 1000);
  }

  _startPowerOutage() {
    this.clearAllTimers();
    this.powerOn = false;
    this.powerRestorers = new Set();
    this.io.to(this.roomKey).emit("power:state", { on: false });
    this.io.to(this.roomKey).emit("power:restoreProgress", {
      count: 0,
      needed: Math.min(this.config.powerRestoreRequiredPlayers, this.livingPlayers().length),
    });

    const deadline = Date.now() + this.config.powerOutageSeconds * 1000;
    this.setPhase(PHASES.POWER_OUTAGE, deadline);

    // No more auto-restore. Power staying off is now a real loss condition:
    // if the crew can't get the required headcount into the Power Room and
    // restoring within the timer, Corrupted wins outright — same idea as
    // Among Us's sabotage-timeout, and it's what actually forces everyone to
    // go deal with it instead of just waiting the blackout out.
    this.timers.powerFailsafe = setTimeout(() => {
      if (this.phase === PHASES.POWER_OUTAGE) {
        this._endGame("CORRUPTED");
      }
    }, this.config.powerOutageSeconds * 1000);
  }

  handleRestorePower(playerId) {
    if (this.phase !== PHASES.POWER_OUTAGE) return { ok: false, reason: "Not during a power outage." };
    const player = this.players.get(playerId);
    if (!player || !player.alive) return { ok: false, reason: "Ghosts cannot restore power." };
    if (!pointInZone(player.x, player.z, POWER_ROOM_ZONE)) {
      return { ok: false, reason: "You must be in the Power Room." };
    }

    // Needs a group effort: this many distinct players standing in the
    // Power Room and pressing restore, not just one person. Capped to the
    // number of living players so a late-game round with a small crew can
    // never soft-lock waiting on a headcount it can't reach.
    const needed = Math.min(this.config.powerRestoreRequiredPlayers, this.livingPlayers().length);
    this.powerRestorers.add(playerId);
    // Anyone who's left the Power Room since pressing restore doesn't count
    // toward the total — has to actually be there when it comes back on.
    for (const id of [...this.powerRestorers]) {
      const p = this.players.get(id);
      if (!p || !p.alive || !pointInZone(p.x, p.z, POWER_ROOM_ZONE)) this.powerRestorers.delete(id);
    }

    const count = this.powerRestorers.size;
    this.io.to(this.roomKey).emit("power:restoreProgress", { count, needed });

    if (count < needed) {
      return { ok: true, waitingForMore: true, count, needed };
    }
    this._restorePower();
    return { ok: true };
  }

  _restorePower() {
    if (this.timers.powerFailsafe) {
      clearTimeout(this.timers.powerFailsafe);
      delete this.timers.powerFailsafe;
    }
    this.powerOn = true;
    this.io.to(this.roomKey).emit("power:state", { on: true });
    this._startFreeRoam();
  }

  _startFreeRoam() {
    this.clearAllTimers();
    const deadline = Date.now() + this.config.freeRoamMaxSeconds * 1000;
    this.setPhase(PHASES.FREE_ROAM, deadline);

    // Failsafe: if nobody ever walks to Cafeteria and calls a meeting, the
    // game auto-gathers everyone anyway so a quiet/confused group can't
    // stall the round forever.
    this.timers.freeRoamFailsafe = setTimeout(() => {
      if (this.phase === PHASES.FREE_ROAM) this._gatherForMeeting(null);
    }, this.config.freeRoamMaxSeconds * 1000);
  }

  // Teleports every living player to Cafeteria (seated "around the table"),
  // freezes movement, and begins the Discussion timer. calledByName is null
  // for the automatic failsafe trigger, or a display name for a manual call.
  _gatherForMeeting(calledByName) {
    if (this.timers.freeRoamFailsafe) {
      clearTimeout(this.timers.freeRoamFailsafe);
      delete this.timers.freeRoamFailsafe;
    }
    const living = this.livingPlayers();
    const seats = this._generateSpawnPoints(living.length, 0, 0, 4); // Cafeteria center
    living.forEach((p, i) => {
      p.x = seats[i].x;
      p.z = seats[i].z;
    });
    // Order matters here: the phase must flip to DISCUSSION *before* the
    // teleported positions go out. Clients only hard-sync their camera to
    // a server-echoed position while frozen (see GameScreen.jsx) — doing
    // it unconditionally caused stutter during ordinary movement whenever
    // network latency made an echo arrive late. Sending phase:change first
    // guarantees it's already been processed by the time positions:update
    // (with the teleport) arrives, so the frozen-only sync reliably catches it.
    this._startDiscussion();
    this.broadcastPositions();
    if (calledByName) {
      this.io.to(this.roomKey).emit("meeting:called", { by: calledByName });
    }
  }

  _startDiscussion() {
    this.clearAllTimers();
    const deadline = Date.now() + this.config.discussionSeconds * 1000;
    this.setPhase(PHASES.DISCUSSION, deadline);
    this.timers.discussionEnd = setTimeout(() => {
      this._startVoting();
    }, this.config.discussionSeconds * 1000);
  }

  // Host-only: cut a discussion period short, whether it's the regular
  // pre-vote DISCUSSION or the TIE_CLARIFY window before a re-vote. Skips
  // straight to whichever phase that discussion was building up to, same as
  // if its timer had just run out.
  handleSkipDiscussion() {
    if (this.phase === PHASES.DISCUSSION) {
      if (this.timers.discussionEnd) clearTimeout(this.timers.discussionEnd);
      this._startVoting();
      return { ok: true };
    }
    if (this.phase === PHASES.TIE_CLARIFY) {
      if (this.timers.tieClarifyEnd) clearTimeout(this.timers.tieClarifyEnd);
      this._startTieVote();
      return { ok: true };
    }
    return { ok: false, reason: "No discussion is running right now." };
  }

  handleCallMeeting(playerId) {
    const player = this.players.get(playerId);
    if (!player || !player.alive) return { ok: false, reason: "Ghosts cannot call meetings." };

    if (this.phase !== PHASES.FREE_ROAM) {
      return { ok: false, reason: "You can't call a meeting right now." };
    }
    if (!pointInZone(player.x, player.z, ROOMS.CAFETERIA)) {
      return { ok: false, reason: "You must be in Cafeteria to call a meeting." };
    }
    this._gatherForMeeting(player.displayName);
    return { ok: true };
  }

  _startVoting() {
    this.clearAllTimers();
    this.votes.clear();
    const deadline = Date.now() + 45 * 1000;
    this.setPhase(PHASES.VOTING, deadline);
    this._broadcastVoteTargets();
    this.timers.votingEnd = setTimeout(() => {
      this._tallyVotes(this.livingPlayers().map((p) => p.playerId), PHASES.VOTING);
    }, 45 * 1000);
  }

  _broadcastVoteTargets(restrictTo = null) {
    const targets = (restrictTo
      ? this.livingPlayers().filter((p) => restrictTo.includes(p.playerId))
      : this.livingPlayers()
    ).map((p) => ({ playerId: p.playerId, displayName: p.displayName }));
    this.io.to(this.roomKey).emit("vote:targets", { targets, restricted: !!restrictTo });
  }

  // Players who are currently disconnected shouldn't hold up a vote that
  // everyone actually present has already finished — this lets voting
  // finish as soon as everyone *reachable* has voted, falling back to the
  // full timer only as an outer safety net (e.g. in case someone's
  // connection flaps right as the phase begins).
  _connectedLivingIds() {
    return this.livingPlayers().filter((p) => p.connected).map((p) => p.playerId);
  }

  handleVote(voterId, targetId) {
    const validPhase = this.phase === PHASES.VOTING || this.phase === PHASES.TIE_VOTE;
    if (!validPhase) return { ok: false, reason: "Voting is not open." };

    const voter = this.players.get(voterId);
    if (!voter || !voter.alive) return { ok: false, reason: "Ghosts cannot vote." };
    if (this.votes.has(voterId)) return { ok: false, reason: "You already voted." };

    // "ABSTAIN" is a real, valid vote — it just never counts toward any
    // candidate's tally (see _tallyVotes). Skip the target-existence/
    // tie-candidate checks below for it; there's no player to validate.
    if (targetId !== "ABSTAIN") {
      const target = this.players.get(targetId);
      if (!target || !target.alive) return { ok: false, reason: "Invalid target." };

      if (this.phase === PHASES.TIE_VOTE && !this.tieCandidates.includes(targetId)) {
        return { ok: false, reason: "You may only vote for tied candidates." };
      }
    }

    this.votes.set(voterId, targetId);
    const connectedIds = this._connectedLivingIds();
    this.io.to(this.roomKey).emit("vote:progress", {
      votesCast: [...this.votes.keys()].filter((id) => connectedIds.includes(id)).length,
      votersNeeded: connectedIds.length,
    });

    const allEligible = this.livingPlayers().map((p) => p.playerId);
    const castByConnected = [...this.votes.keys()].filter((id) => connectedIds.includes(id)).length;

    if (connectedIds.length > 0 && castByConnected >= connectedIds.length) {
      if (this.timers.votingEnd) clearTimeout(this.timers.votingEnd);
      if (this.timers.tieVoteEnd) clearTimeout(this.timers.tieVoteEnd);
      this._tallyVotes(allEligible, this.phase);
    }
    return { ok: true };
  }

  _tallyVotes(eligibleVoterIds, stagePhase) {
    // Only count votes cast by players who were alive when the stage ends
    // AND whose chosen target was still alive at the time of casting.
    // (If a target died mid-vote via card-death, handleCardDeath already
    // stripped any votes pointed at them — see handleCardDeath.)
    const counts = new Map();
    for (const [voterId, targetId] of this.votes.entries()) {
      if (!eligibleVoterIds.includes(voterId)) continue;
      if (targetId === "ABSTAIN") continue; // counted toward turnout, never toward a candidate
      counts.set(targetId, (counts.get(targetId) || 0) + 1);
    }

    if (counts.size === 0) {
      // Nobody voted for anybody valid (e.g. everyone's target died). Treat
      // as no elimination, same as a full tie with no resolution.
      this._afterElimination(null);
      return;
    }

    let max = 0;
    for (const c of counts.values()) max = Math.max(max, c);
    const topCandidates = [...counts.entries()].filter(([, c]) => c === max).map(([id]) => id);

    if (topCandidates.length === 1) {
      this._eliminate(topCandidates[0]);
      return;
    }

    // Tie.
    if (stagePhase === PHASES.TIE_VOTE) {
      // Second vote also tied -> nobody eliminated.
      this._afterElimination(null);
      return;
    }

    this._startTieClarify(topCandidates);
  }

  _startTieClarify(tieCandidates) {
    this.clearAllTimers();
    this.tieCandidates = tieCandidates;
    const deadline = Date.now() + this.config.tieClarifySeconds * 1000;
    this.setPhase(PHASES.TIE_CLARIFY, deadline);
    this.io.to(this.roomKey).emit("tie:candidates", {
      candidates: tieCandidates.map((id) => ({
        playerId: id,
        displayName: this.players.get(id)?.displayName,
      })),
    });
    this.timers.tieClarifyEnd = setTimeout(() => {
      this._startTieVote();
    }, this.config.tieClarifySeconds * 1000);
  }

  _startTieVote() {
    this.clearAllTimers();
    this.votes.clear();
    const deadline = Date.now() + 30 * 1000;
    this.setPhase(PHASES.TIE_VOTE, deadline);
    this._broadcastVoteTargets(this.tieCandidates);
    this.timers.tieVoteEnd = setTimeout(() => {
      this._tallyVotes(this.livingPlayers().map((p) => p.playerId), PHASES.TIE_VOTE);
    }, 30 * 1000);
  }

  _eliminate(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;
    player.alive = false;
    const identity = identityOf(player);

    this.setPhase(PHASES.ELIMINATION_REVEAL);
    this.io.to(this.roomKey).emit("elimination:reveal", {
      playerId: player.playerId,
      displayName: player.displayName,
      identity,
    });
    this.broadcastPublicPlayerSummary();
    this.broadcastPositions();
    this.broadcastHostRoles();

    if (identity === IDENTITY.ORIGINAL_CORRUPTED) {
      this.timers.postReveal = setTimeout(() => this._endGame("INNOCENTS"), this.config.eliminationRevealSeconds * 1000);
      return;
    }

    this.timers.postReveal = setTimeout(() => {
      this._afterElimination(playerId);
    }, this.config.eliminationRevealSeconds * 1000);
  }

  _afterElimination(_eliminatedIdOrNull) {
    // Check the Corrupted win condition after EVERY elimination, not just
    // at the end of the final round. Previously this only ran inside
    // _checkEndOfRound3(), so if the Innocents were wiped out (or
    // outnumbered) mid-game the round would just keep going instead of
    // declaring Corrupted the winner on the spot.
    if (this._checkMidGameWin()) return;

    if (this.round >= this.config.totalRounds) {
      this._checkEndOfRound3();
    } else {
      this._startNextRound();
    }
  }

  // Same threshold _checkEndOfRound3 uses ("strictly more Corrupted than
  // Innocent" — a tie still favors Innocents, per that function's comment),
  // just evaluated immediately instead of only at the end of round 3. This
  // is what makes "all Innocents are dead" declare Corrupted the winner on
  // the spot instead of leaving the round running with nobody left to play.
  _checkMidGameWin() {
    const living = this.livingPlayers();
    const livingCorrupted = living.filter((p) => p.isCorrupted).length;
    const livingInnocent = living.filter((p) => !p.isCorrupted).length;
    if (livingCorrupted > livingInnocent) {
      this._endGame("CORRUPTED");
      return true;
    }
    return false;
  }

  _checkEndOfRound3() {
    // Reaching this function at all means the Original Corrupted survived
    // every round: their elimination is handled immediately and separately
    // up in _eliminate (identity === ORIGINAL_CORRUPTED short-circuits
    // straight to an Innocents win, and this function is never reached in
    // that case). So per the actual win condition — OC still alive once the
    // rounds run out is a Corrupted win outright — this no longer needs to
    // check the surviving headcount split at all; that used to let
    // Innocents win on a technicality (OC alive, but not enough Corrupted
    // recruits to hit a majority) that contradicted the stated rule.
    this._endGame("CORRUPTED");
  }

  // ---------------------------------------------------------------------
  // Stealing & secret corruption
  // ---------------------------------------------------------------------

  handleStealCard(attackerId, targetId) {
    const attacker = this.players.get(attackerId);
    if (!attacker || !attacker.alive) return { ok: false, reason: "Ghosts cannot steal." };
    if (FROZEN_PHASES.has(this.phase)) return { ok: false, reason: "Can't steal while everyone's gathered at the table." };
    if (!attacker.isCorrupted) return { ok: false, reason: "Only Corrupted players can steal." };
    if (attacker.hasStolenThisRound) return { ok: false, reason: "You already stole this round." };

    // stealCooldownSeconds existed in config from the start but was never
    // actually enforced anywhere — the only real limit was the once-per-
    // round flag above, which is a much longer window in practice, so this
    // rarely changes anything today. Wiring it up anyway rather than
    // deleting it: it's real protection against any future change that
    // relaxes the once-per-round rule (e.g. multiple steals per round) or
    // any client bug that fires a rapid burst of steal requests, without
    // changing today's actual gameplay pacing.
    const cooldownMs = this.config.stealCooldownSeconds * 1000;
    if (attacker.lastStealAt && Date.now() - attacker.lastStealAt < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - (Date.now() - attacker.lastStealAt)) / 1000);
      return { ok: false, reason: `Wait ${waitSec}s before stealing again.` };
    }

    const target = this.players.get(targetId);
    if (!target || !target.alive) return { ok: false, reason: "Invalid target." };
    if (target.playerId === attacker.playerId) return { ok: false, reason: "You cannot steal from yourself." };
    if (attacker.stealHistory.has(targetId)) {
      return { ok: false, reason: "You've already stolen from this player." };
    }

    const dist = distance2D(attacker.x, attacker.z, target.x, target.z);
    if (dist > STEAL_RANGE) return { ok: false, reason: "Too far away." };

    // All checks passed — commit the steal.
    attacker.hasStolenThisRound = true;
    attacker.lastStealAt = Date.now();
    attacker.stealHistory.add(targetId);
    target.cards -= 1;
    attacker.cards += 1;

    this.emitToPlayer(attacker.playerId, "cards:update", { cards: attacker.cards });
    this.emitToPlayer(target.playerId, "cards:update", { cards: target.cards });
    this.emitToPlayer(target.playerId, "card:stolenNotice", {}); // anonymous — no attacker id

    if (target.cards <= 0) {
      this._handleCardDeath(target.playerId);
      this.broadcastHostRoles();
      return { ok: true, targetDied: true };
    }

    if (!target.isCorrupted) {
      // Innocent survives the theft -> gets the secret choice.
      this.pendingCorruptionChoices.add(target.playerId);
      this.emitToPlayer(target.playerId, "corruption:prompt", {});
    }

    this.broadcastHostRoles();
    return { ok: true, targetDied: false };
  }

  handleCorruptionChoice(playerId, becomeCorrupted) {
    if (!this.pendingCorruptionChoices.has(playerId)) {
      return { ok: false, reason: "No pending choice." };
    }
    this.pendingCorruptionChoices.delete(playerId);
    const player = this.players.get(playerId);
    if (!player || !player.alive) return { ok: false };

    if (becomeCorrupted) {
      player.isCorrupted = true;
      player.corruptedSinceRound = this.round;
      // No card is stolen again — the theft already happened.

      // This was the actual bug behind "a converted player can't steal next
      // round": the server flipped player.isCorrupted here, but never told
      // THAT PLAYER'S OWN CLIENT — the client's local isCorrupted flag was
      // only ever set once, from the initial role:assigned at game start,
      // and stayed false forever after. The steal button is gated on
      // game.isCorrupted client-side, so it simply never appeared, even
      // though the server would have happily accepted a steal request.
      // Sent to this player only — still secret from everyone else.
      this.emitToPlayer(playerId, "role:updated", { isCorrupted: true });
    }
    // Silent either way — no broadcast to other players, this must stay
    // completely secret from them. The Host's private monitor view is the
    // one exception (see broadcastHostRoles).
    this.broadcastHostRoles();
    return { ok: true };
  }

  _handleCardDeath(playerId) {
    const player = this.players.get(playerId);
    if (!player || !player.alive) return;
    player.alive = false;

    // Strip any in-flight votes cast *for* this player (they can no longer
    // be a valid elimination target); votes they already *cast* remain valid.
    for (const [voterId, targetId] of [...this.votes.entries()]) {
      if (targetId === playerId) this.votes.delete(voterId);
    }
    this.tieCandidates = this.tieCandidates.filter((id) => id !== playerId);

    // Card-death is silent — no identity reveal, unlike a voted elimination.
    this.io.to(this.roomKey).emit("player:died", {
      playerId: player.playerId,
      displayName: player.displayName,
      cause: "cards",
    });
    this.broadcastPublicPlayerSummary();
    this.broadcastPositions();
    this.broadcastHostRoles();

    if (player.isOC) {
      // Innocents win immediately, regardless of current phase.
      this.clearAllTimers();
      this._endGame("INNOCENTS");
      return;
    }

    // If a vote was in progress and is now fully resolved (everyone left
    // eligible and reachable has voted), re-check whether the stage should
    // tally now.
    if (this.phase === PHASES.VOTING || this.phase === PHASES.TIE_VOTE) {
      const eligible = this.livingPlayers().map((p) => p.playerId);
      const connectedIds = this._connectedLivingIds();
      const castByConnected = [...this.votes.keys()].filter((id) => connectedIds.includes(id)).length;
      if (connectedIds.length > 0 && castByConnected >= connectedIds.length) {
        if (this.timers.votingEnd) clearTimeout(this.timers.votingEnd);
        if (this.timers.tieVoteEnd) clearTimeout(this.timers.tieVoteEnd);
        this._tallyVotes(eligible, this.phase);
      } else {
        this._broadcastVoteTargets(this.phase === PHASES.TIE_VOTE ? this.tieCandidates : null);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Movement / zones
  // ---------------------------------------------------------------------

  handleMove(playerId, x, z) {
    const player = this.players.get(playerId);
    if (!player || !player.alive) return;

    // Everyone's gathered at the meeting table during these phases — no
    // wandering off mid-discussion or mid-vote, same as Among Us's meeting
    // screen. Silently ignore rather than error, since the client already
    // hides the joystick during these phases; this is just the backstop.
    if (FROZEN_PHASES.has(this.phase)) return;

    // Authoritative wall collision: reject any position that isn't inside a
    // room or corridor. A small margin keeps movement feeling smooth right
    // up against a wall rather than stopping a full player-radius short of
    // it. Bounds must match client GameScreen.jsx's local-prediction clamp
    // and rooms.js/constants.js's actual room extents — keep all three in
    // sync any time the world is rescaled (see the 1.5x pass comment there).
    const nx = Math.max(-60, Math.min(60, x));
    const nz = Math.max(-39, Math.min(39, z));
    if (!isWalkable(nx, nz, 0.3)) {
      return; // Move rejected — player stays at their last valid position.
    }
    player.x = nx;
    player.z = nz;

    // This was the actual bug behind "I can't see anyone on the map" — a
    // player's new position was recorded here but never actually pushed
    // out to anyone. broadcastPositions() is what turns local movement
    // into everyone else's live view. (MapRoomPanel now reads straight from
    // that live positions feed — the old maproom:data event this handler
    // used to also emit here is gone; nothing on the client has listened
    // for it since that fix.)
    this.broadcastPositions();

    // The restore-power headcount only used to get re-checked when someone
    // actually pressed the button — so if a player left the Power Room
    // without anyone else pressing it afterward, everyone kept seeing a
    // stale, too-high count until the next press. Re-validate live on every
    // move instead, same as the button-press path does.
    if (
      this.phase === PHASES.POWER_OUTAGE &&
      this.powerRestorers &&
      this.powerRestorers.has(playerId) &&
      !pointInZone(nx, nz, POWER_ROOM_ZONE)
    ) {
      this.powerRestorers.delete(playerId);
      const needed = Math.min(this.config.powerRestoreRequiredPlayers, this.livingPlayers().length);
      this.io.to(this.roomKey).emit("power:restoreProgress", { count: this.powerRestorers.size, needed });
    }
  }

  // ---------------------------------------------------------------------
  // Game over
  // ---------------------------------------------------------------------

  _endGame(winner) {
    this.clearAllTimers();
    this.setPhase(PHASES.GAME_OVER);

    let individualWinners = [];
    if (winner === "CORRUPTED") {
      const livingCorrupted = this.livingPlayers().filter((p) => p.isCorrupted);
      const maxCards = Math.max(0, ...livingCorrupted.map((p) => p.cards));
      individualWinners = livingCorrupted
        .filter((p) => p.cards === maxCards)
        .map((p) => ({ playerId: p.playerId, displayName: p.displayName, cards: p.cards }));
    }

    this.io.to(this.roomKey).emit("game:over", {
      winner,
      individualWinners,
      summary: this.playerList().map((p) => ({
        playerId: p.playerId,
        displayName: p.displayName,
        identity: identityOf(p),
        alive: p.alive,
        cards: p.cards,
      })),
    });
  }
}
