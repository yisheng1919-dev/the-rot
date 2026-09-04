import React, { useEffect, useRef, useState, useCallback } from "react";
import { GameScene2D } from "../scenes/GameScene2D.js";
import { roomAt, resolveMove } from "../rooms.js";
import Joystick from "./Joystick.jsx";
import HUD from "./HUD.jsx";
import PowerOutageOverlay from "./PowerOutageOverlay.jsx";
import ActionButtons from "./ActionButtons.jsx";
import CorruptionPrompt from "./CorruptionPrompt.jsx";
import CorruptionRevealed from "./CorruptionRevealed.jsx";
import VotingPanel from "./VotingPanel.jsx";
import TieClarifyPanel from "./TieClarifyPanel.jsx";
import { EliminationRevealModal, PlayerDiedToast } from "./EliminationReveal.jsx";
import MapRoomPanel from "./MapRoomPanel.jsx";
import DiscussionBoard from "./DiscussionBoard.jsx";
import { socket } from "../socket.js";

const MOVE_SPEED = 6.2; // world units per second
const STEAL_RANGE = 6.75; // must match server/src/constants.js STEAL_RANGE (4.5 * 1.5 world-scale)
const FROZEN_PHASES = new Set(["DISCUSSION", "VOTING", "TIE_CLARIFY", "TIE_VOTE", "ELIMINATION_REVEAL"]);

export default function GameScreen({ selfId, displayName, game, playersById = {}, onErrorToast, chatLog, onSendChat }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const positionRef = useRef({ x: 0, z: 0 });
  const joystickInput = useRef({ x: 0, y: 0 });
  const lastMoveEmit = useRef(0);
  const rafRef = useRef(null);
  const phaseRef = useRef(game.phase);

  const [positions, setPositions] = useState([]);
  const [inMapRoom, setInMapRoom] = useState(false);
  const [inCafeteria, setInCafeteria] = useState(false);
  const [currentRoomLabel, setCurrentRoomLabel] = useState(null);
  // mapPlayers/maproom:data used to be a dead end — nothing on the server
  // ever emitted that event, so the Map Room panel always showed zero
  // players regardless of power state. The live positions feed (already
  // populated for movement/steal-range) has everything the map needs,
  // including .color, so MapRoomPanel now reads straight from that.
  const [showMapPanel, setShowMapPanel] = useState(false);
  const [showCorruptionRevealed, setShowCorruptionRevealed] = useState(false);
  const [dismissedDeath, setDismissedDeath] = useState(null);
  const positionsRef = useRef([]);

  const isGhost = !game.alive;
  const isFrozen = FROZEN_PHASES.has(game.phase);

  useEffect(() => {
    phaseRef.current = game.phase;
  }, [game.phase]);

  // Close the map panel automatically if a meeting gathers everyone away
  // from the Map Room, or if the player simply walks out.
  useEffect(() => {
    if (isFrozen || !inMapRoom) setShowMapPanel(false);
  }, [isFrozen, inMapRoom]);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  // Both OC and regular Corrupted now share one steal flow: auto-lock onto
  // the single nearest valid target in range (no picking from a list) and
  // highlight them on-canvas with a red outline, but stealing itself is
  // manual — a STEAL CARD button has to be pressed to confirm. This used to
  // be two different flows (OC auto-fired with no button at all after a
  // 100ms dwell; regular Corrupted opened a picker listing everyone in
  // range) — now both use the same auto-target/manual-confirm shape.
  const [lockedTargetId, setLockedTargetId] = useState(null);
  const [stealBusy, setStealBusy] = useState(false);

  useEffect(() => {
    if (!game.isCorrupted || isGhost) {
      setLockedTargetId(null);
      return undefined;
    }
    const eligiblePhase =
      game.phase === "ROUND_START" || game.phase === "FREE_ROAM" || (game.phase === "POWER_OUTAGE" && game.powerOn);
    if (!eligiblePhase || game.hasStolenThisRound) {
      setLockedTargetId(null);
      return undefined;
    }

    const TICK_MS = 100;
    const interval = setInterval(() => {
      let nearest = null;
      let nearestDist = Infinity;
      for (const p of positionsRef.current) {
        if (p.playerId === selfId) continue;
        const dist = Math.hypot(p.x - positionRef.current.x, p.z - positionRef.current.z);
        if (dist <= STEAL_RANGE && dist < nearestDist) {
          nearest = p.playerId;
          nearestDist = dist;
        }
      }
      setLockedTargetId((prev) => (prev === nearest ? prev : nearest));
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [game.isCorrupted, game.phase, game.powerOn, game.hasStolenThisRound, isGhost, selfId]);

  // Feed the locked target to the canvas so it can draw the red highlight
  // ring around them.
  useEffect(() => {
    sceneRef.current?.setStealTarget(lockedTargetId);
  }, [lockedTargetId]);

  const confirmSteal = () => {
    if (!lockedTargetId || stealBusy) return;
    setStealBusy(true);
    socket.emit("player:stealCard", { targetId: lockedTargetId }, (res) => {
      setStealBusy(false);
      if (!res?.ok) onErrorToast(res?.reason || "Steal failed.");
      else game.onStolen?.();
    });
  };

  // ---- Set up the 2D scene once ----
  useEffect(() => {
    const scene = new GameScene2D(containerRef.current);
    scene.setSelfId(selfId);
    sceneRef.current = scene;
    return () => scene.dispose();
  }, [selfId]);

  const [zoom, setZoomState] = useState(1);
  const changeZoom = (delta) => {
    setZoomState((z) => {
      const next = Math.round((z + delta) * 10) / 10;
      const clamped = Math.max(0.6, Math.min(1.8, next));
      sceneRef.current?.setZoom(clamped);
      return clamped;
    });
  };

  useEffect(() => {
    sceneRef.current?.setBlackout(game.phase === "POWER_OUTAGE" && !game.powerOn);
  }, [game.phase, game.powerOn]);

  useEffect(() => {
    sceneRef.current?.setRound(game.round);
  }, [game.round]);

  // ---- Movement loop: read joystick, integrate position (with wall
  // collision), emit at ~12hz. Frozen during meeting/vote phases — the
  // server rejects movement then anyway, but we also stop applying it
  // locally so the character doesn't visually drift away from the table. ----
  useEffect(() => {
    let last = performance.now();
    function loop(now) {
      rafRef.current = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!isGhost && !FROZEN_PHASES.has(phaseRef.current)) {
        const { x: jx, y: jy } = joystickInput.current;
        if (jx !== 0 || jy !== 0) {
          const dx = jx * MOVE_SPEED * dt;
          const dz = jy * MOVE_SPEED * dt;
          const cur = positionRef.current;
          const next = resolveMove(cur.x, cur.z, cur.x + dx, cur.z + dz);
          // These bounds must match the server's authoritative clamp in
          // Room.handleMove (x:[-60,60], z:[-39,39]) — matching the ship's
          // actual extents (Control Room / Storage / Upper Engine sit at
          // x=-54, Power Room / Medbay / Lower Engine at x=+54, after the
          // 1.5x world-scale pass). The old ±28 clamp before that was
          // tighter than the real map on both axes, so local prediction
          // physically stopped short of ever reaching those six rooms —
          // walking into them looked like hitting an invisible wall because
          // the joystick loop never even let the predicted position get
          // close enough to try. Keep this in sync with rooms.js/constants.js
          // any time the world is rescaled again.
          positionRef.current.x = Math.max(-60, Math.min(60, next.x));
          positionRef.current.z = Math.max(-39, Math.min(39, next.z));
        }
        // Drive the local player's sprite (position + facing + walk-cycle)
        // straight from joystick input every frame, same cadence as the
        // camera below — this is what actually fixed the movement stutter;
        // see setSelfMotion() for the full explanation.
        const moving = jx !== 0 || jy !== 0;
        const facing = Math.abs(jx) > Math.abs(jy) ? (jx > 0 ? "right" : "left") : jy > 0 ? "front" : "back";
        sceneRef.current?.setSelfMotion(positionRef.current.x, positionRef.current.z, moving, facing);
      } else {
        sceneRef.current?.setSelfMotion(positionRef.current.x, positionRef.current.z, false, undefined);
      }
      sceneRef.current?.focusOn(positionRef.current.x, positionRef.current.z);

      if (now - lastMoveEmit.current > 80) {
        lastMoveEmit.current = now;
        if (!isGhost && !FROZEN_PHASES.has(phaseRef.current)) socket.emit("player:move", positionRef.current);
        const room = roomAt(positionRef.current.x, positionRef.current.z);
        setInMapRoom(room?.id === "MAP_ROOM");
        setInCafeteria(room?.id === "CAFETERIA");
        setCurrentRoomLabel(room?.label || null);
      }
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isGhost]);

  // ---- Socket listeners for this screen ----
  useEffect(() => {
    const onPositions = (list) => {
      setPositions(list);
      const withNames = list.map((p) => ({ ...p, displayName: playersById[p.playerId] }));
      sceneRef.current?.updatePlayers(withNames, isGhost);

      // Only hard-sync our own camera position to the server's echo while
      // frozen (gathered at the table). During ordinary free movement this
      // must NOT run unconditionally — on any real network with latency,
      // the echo of an earlier move arrives after local prediction has
      // already moved further, so snapping to it every time drags the
      // camera backward in a repeating stutter ("frame by frame" motion).
      // Frozen phases are safe to hard-sync because the server now always
      // sends the DISCUSSION phase change *before* the teleported
      // positions (see Room._gatherForMeeting), so phaseRef.current is
      // guaranteed fresh by the time this fires.
      if (FROZEN_PHASES.has(phaseRef.current)) {
        const self = list.find((p) => p.playerId === selfId);
        if (self) {
          positionRef.current.x = self.x;
          positionRef.current.z = self.z;
        }
      }
    };
    socket.on("positions:update", onPositions);
    return () => {
      socket.off("positions:update", onPositions);
    };
  }, [isGhost, playersById, selfId]);

  const handleJoystick = useCallback(({ x, y }) => {
    joystickInput.current = { x, y };
  }, []);

  const inPowerRoomZone =
    positionRef.current &&
    (() => {
      const r = roomAt(positionRef.current.x, positionRef.current.z);
      return r?.id === "POWER_ROOM";
    })();

  const showRestorePower =
    !isGhost && game.phase === "POWER_OUTAGE" && !game.powerOn && inPowerRoomZone;
  // Meeting can only be called from Cafeteria while roaming free, before
  // everyone's gathered — once the meeting has actually started
  // (DISCUSSION), there's no point offering the button again since you're
  // already there; it just reads as a confusing, redundant control.
  const showMeeting = !isGhost && game.phase === "FREE_ROAM" && inCafeteria;
  const showSeeMapButton = !isGhost && inMapRoom && !showMapPanel;
  // The lockedTargetId effect above already gates on isCorrupted/phase/
  // hasStolenThisRound — a non-null lock means a steal is actually valid
  // right now, for OC and regular Corrupted alike.
  const showStealAction = !isGhost && !!lockedTargetId;
  const lockedTargetName = lockedTargetId ? playersById[lockedTargetId] || "Player" : null;

  return (
    <div className="app-shell">
      <div className="game-canvas-wrap" ref={containerRef} />

      <HUD
        round={game.round}
        phase={game.phase}
        powerOn={game.powerOn}
        cards={game.cards}
        isGhost={isGhost}
        deadline={game.deadline}
        currentRoomLabel={currentRoomLabel}
      />

      <PowerOutageOverlay
        show={game.phase === "POWER_OUTAGE" && !game.powerOn && !isGhost}
        playerX={positionRef.current.x}
        playerZ={positionRef.current.z}
      />

      {!isGhost && !isFrozen && <Joystick onChange={handleJoystick} />}
      {!isGhost && !isFrozen && <div className="joystick-hint">DRAG TO MOVE</div>}

      <div className="zoom-controls">
        <button className="zoom-btn" onClick={() => changeZoom(0.2)} aria-label="Zoom in">
          +
        </button>
        <button className="zoom-btn" onClick={() => changeZoom(-0.2)} aria-label="Zoom out">
          −
        </button>
      </div>

      {showStealAction && (
        <div className="steal-lock-hint">🎯 Locked onto {lockedTargetName} — press STEAL CARD</div>
      )}

      {(game.phase === "DISCUSSION" || game.phase === "TIE_CLARIFY") && !isGhost && (
        <DiscussionBoard
          positions={positions}
          playersById={playersById}
          selfId={selfId}
          chatLog={chatLog}
          onSendChat={onSendChat}
          canChat={!isGhost}
        />
      )}

      <ActionButtons
        showRestorePower={showRestorePower}
        showMeeting={showMeeting}
        showMap={showSeeMapButton}
        showSteal={showStealAction}
        stealBusy={stealBusy}
        onRestorePower={() => {
          socket.emit("player:restorePower", {}, (res) => {
            if (!res?.ok) onErrorToast(res?.reason || "Could not restore power.");
          });
        }}
        powerRestoreCount={game.powerRestoreCount}
        powerRestoreNeeded={game.powerRestoreNeeded}
        onCallMeeting={() => {
          socket.emit("player:callMeeting", {}, (res) => {
            if (!res?.ok) onErrorToast(res?.reason || "Could not call meeting.");
          });
        }}
        onOpenMap={() => setShowMapPanel(true)}
        onSteal={confirmSteal}
      />

      {showMapPanel && (
        <MapRoomPanel players={positions} selfId={selfId} onClose={() => setShowMapPanel(false)} />
      )}

      {game.corruptionPromptOpen && (
        <CorruptionPrompt
          onChoose={(becomeCorrupted) => {
            // This used to fire-and-forget with no ack — if the server ever
            // rejected the choice (e.g. "No pending choice", a stale/late
            // click after the window already closed), the client had no way
            // to know and would show the "you are now corrupted" confirmation
            // regardless, leaving the player thinking they'd flipped when the
            // server never actually recorded it. Now only trust a
            // server-confirmed ok before showing that confirmation.
            socket.emit("player:corruptionChoice", { becomeCorrupted }, (res) => {
              if (becomeCorrupted && res?.ok) setShowCorruptionRevealed(true);
              else if (becomeCorrupted && !res?.ok) onErrorToast(res?.reason || "Could not process your choice — please try again.");
            });
            game.onCorruptionResolved?.();
          }}
        />
      )}

      {showCorruptionRevealed && <CorruptionRevealed onDismiss={() => setShowCorruptionRevealed(false)} />}

      {(game.phase === "VOTING" || game.phase === "TIE_VOTE") && !isGhost && (
        <VotingPanel
          targets={game.voteTargets || []}
          votesCast={game.votesCast || 0}
          votersNeeded={game.votersNeeded || 0}
          hasVoted={game.hasVoted}
          restricted={game.phase === "TIE_VOTE"}
          onVote={(targetId) => {
            socket.emit("player:vote", { targetId }, (res) => {
              if (!res?.ok) onErrorToast(res?.reason || "Vote failed.");
              else game.onVoted?.();
            });
          }}
        />
      )}

      {game.phase === "TIE_CLARIFY" && <TieClarifyPanel candidates={game.tieCandidates || []} />}

      <EliminationRevealModal data={game.eliminationReveal} />
      <PlayerDiedToast data={dismissedDeath ? null : game.lastDeath} onDismiss={() => setDismissedDeath(game.lastDeath)} />
    </div>
  );
}
