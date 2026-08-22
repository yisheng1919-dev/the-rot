import {
  PHASES,
  DEFAULT_CONFIG,
  POWER_ROOM_ZONE,
  MAP_ROOM_ZONE,
  STEAL_RANGE,
  IDENTITY,
  identityOf,
  isWalkable,
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

  addPlayer(socket, displayName) {
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

    const playerId = generatePlayerId();
    const reconnectToken = generateReconnectToken();

    const player = {
      playerId,
      displayName,
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

    // If they reconnected mid-vote, refresh the "X / Y votes cast" count
    // for everyone — they now count toward the total being waited on again.
    if (this.phase === PHASES.VOTING || this.phase === PHASES.TIE_VOTE) {
      const connectedIds = this._connectedLivingIds();
      this.io.to(this.roomKey).emit("vote:progress", {
        votesCast: [...this.votes.keys()].filter((id) => connectedIds.includes(id)).length,
        votersNeeded: connectedIds.length,
      });
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
      connected: p.connected,
    }));
    const ghostPositions = this.playerList()
      .filter((p) => !p.alive)
      .map((p) => ({ playerId: p.playerId, x: p.x, z: p.z, connected: p.connected }));

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

    // Scatter players to spawn points around the Main Hall.
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

    this.round = 0;
    this._startNextRound();
  }

  _generateSpawnPoints(count) {
    const points = [];
    const radius = 3.5;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      points.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius });
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

    this.setPhase(PHASES.ROUND_START);
    this.timers.roundStart = setTimeout(() => {
      this._startPowerOutage();
    }, this.config.roundStartSeconds * 1000);
  }

  _startPowerOutage() {
    this.clearAllTimers();
    this.powerOn = false;
    this.io.to(this.roomKey).emit("power:state", { on: false });

    const deadline = Date.now() + this.config.powerOutageSeconds * 1000;
    this.setPhase(PHASES.POWER_OUTAGE, deadline);

    // Failsafe: auto-restore if nobody manually restores in time, so the
    // game can never stall waiting on a single player.
    this.timers.powerFailsafe = setTimeout(() => {
      if (this.phase === PHASES.POWER_OUTAGE) {
        this._restorePower(true);
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
    this._restorePower(false);
    return { ok: true };
  }

  _restorePower(auto) {
    if (this.timers.powerFailsafe) {
      clearTimeout(this.timers.powerFailsafe);
      delete this.timers.powerFailsafe;
    }
    this.powerOn = true;
    this.io.to(this.roomKey).emit("power:state", { on: true, auto });
    this._startDiscussion();
  }

  _startDiscussion() {
    this.clearAllTimers();
    const deadline = Date.now() + this.config.discussionSeconds * 1000;
    this.setPhase(PHASES.DISCUSSION, deadline);
    this.timers.discussionEnd = setTimeout(() => {
      this._startVoting();
    }, this.config.discussionSeconds * 1000);
  }

  handleCallMeeting(playerId) {
    if (this.phase !== PHASES.DISCUSSION) {
      return { ok: false, reason: "Meetings can only be called during discussion." };
    }
    const player = this.players.get(playerId);
    if (!player || !player.alive) return { ok: false, reason: "Ghosts cannot call meetings." };

    // A manually-called meeting overrides the remaining discussion time
    // with a short countdown, then moves straight to voting.
    if (this.timers.discussionEnd) clearTimeout(this.timers.discussionEnd);
    const deadline = Date.now() + this.config.manualMeetingProgressSeconds * 1000;
    this.io.to(this.roomKey).emit("meeting:called", { by: player.displayName, deadline });
    this.phaseDeadline = deadline;
    this.timers.discussionEnd = setTimeout(() => {
      this._startVoting();
    }, this.config.manualMeetingProgressSeconds * 1000);
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

    const target = this.players.get(targetId);
    if (!target || !target.alive) return { ok: false, reason: "Invalid target." };

    if (this.phase === PHASES.TIE_VOTE && !this.tieCandidates.includes(targetId)) {
      return { ok: false, reason: "You may only vote for tied candidates." };
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
    if (this.round >= this.config.totalRounds) {
      this._checkEndOfRound3();
    } else {
      this._startNextRound();
    }
  }

  _checkEndOfRound3() {
    const living = this.livingPlayers();
    const livingCorrupted = living.filter((p) => p.isCorrupted).length;
    const livingInnocent = living.filter((p) => !p.isCorrupted).length;
    if (livingCorrupted > livingInnocent) {
      this._endGame("CORRUPTED");
    } else {
      // Corrupted did not outnumber Innocents at the end of round 3, and the
      // OC was never eliminated -> nobody technically "won" by the letter of
      // the two conditions. We resolve this in Innocents' favor, since the
      // OC surviving without a Corrupted majority does not meet the
      // Corrupted win condition either.
      this._endGame("INNOCENTS");
    }
  }

  // ---------------------------------------------------------------------
  // Stealing & secret corruption
  // ---------------------------------------------------------------------

  handleStealCard(attackerId, targetId) {
    const attacker = this.players.get(attackerId);
    if (!attacker || !attacker.alive) return { ok: false, reason: "Ghosts cannot steal." };
    if (!attacker.isCorrupted) return { ok: false, reason: "Only Corrupted players can steal." };
    if (attacker.hasStolenThisRound) return { ok: false, reason: "You already stole this round." };

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

    // Authoritative wall collision: reject any position that isn't inside a
    // room or corridor. A small margin keeps movement feeling smooth right
    // up against a wall rather than stopping a full player-radius short of it.
    const nx = Math.max(-30, Math.min(30, x));
    const nz = Math.max(-30, Math.min(30, z));
    if (!isWalkable(nx, nz, 0.3)) {
      return; // Move rejected — player stays at their last valid position.
    }
    player.x = nx;
    player.z = nz;

    const inMapRoom = pointInZone(player.x, player.z, MAP_ROOM_ZONE);
    if (inMapRoom) {
      this.emitToPlayer(playerId, "maproom:data", this._mapRoomPayload());
    }
  }

  _mapRoomPayload() {
    return {
      you: null, // filled in per-recipient by caller if needed; kept generic here
      players: this.livingPlayers().map((p) => ({
        playerId: p.playerId,
        displayName: p.displayName,
        x: p.x,
        z: p.z,
      })),
    };
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
