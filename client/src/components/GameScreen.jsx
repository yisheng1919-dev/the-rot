import React, { useEffect, useRef, useState, useCallback } from "react";
import { GameScene2D } from "../scenes/GameScene2D.js";
import { roomAt, resolveMove } from "../rooms.js";
import Joystick from "./Joystick.jsx";
import HUD from "./HUD.jsx";
import PowerOutageOverlay from "./PowerOutageOverlay.jsx";
import ActionButtons from "./ActionButtons.jsx";
import CorruptionPrompt from "./CorruptionPrompt.jsx";
import StealPicker from "./StealPicker.jsx";
import VotingPanel from "./VotingPanel.jsx";
import TieClarifyPanel from "./TieClarifyPanel.jsx";
import { EliminationRevealModal, PlayerDiedToast } from "./EliminationReveal.jsx";
import MapRoomPanel from "./MapRoomPanel.jsx";
import DiscussionBoard from "./DiscussionBoard.jsx";
import { socket } from "../socket.js";

const MOVE_SPEED = 6.2; // world units per second
const STEAL_RANGE = 2.5;
const FROZEN_PHASES = new Set(["DISCUSSION", "VOTING", "TIE_CLARIFY", "TIE_VOTE", "ELIMINATION_REVEAL"]);

export default function GameScreen({ selfId, displayName, game, playersById = {}, onErrorToast }) {
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
  const [mapPlayers, setMapPlayers] = useState([]);
  const [showMapPanel, setShowMapPanel] = useState(false);
  const [showStealPicker, setShowStealPicker] = useState(false);
  const [dismissedDeath, setDismissedDeath] = useState(null);

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

  // ---- Set up the 2D scene once ----
  useEffect(() => {
    const scene = new GameScene2D(containerRef.current);
    scene.setSelfId(selfId);
    sceneRef.current = scene;
    return () => scene.dispose();
  }, [selfId]);

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
          positionRef.current.x = Math.max(-28, Math.min(28, next.x));
          positionRef.current.z = Math.max(-28, Math.min(28, next.z));
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
    const onMapData = (data) => setMapPlayers(data.players);

    socket.on("positions:update", onPositions);
    socket.on("maproom:data", onMapData);
    return () => {
      socket.off("positions:update", onPositions);
      socket.off("maproom:data", onMapData);
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

  const nearbyStealTargets = positions
    .filter((p) => {
      if (p.playerId === selfId) return false;
      const dx = p.x - positionRef.current.x;
      const dz = p.z - positionRef.current.z;
      return Math.hypot(dx, dz) <= STEAL_RANGE;
    })
    .map((p) => ({ playerId: p.playerId, displayName: playersById[p.playerId] || "Player" }));

  const showRestorePower =
    !isGhost && game.phase === "POWER_OUTAGE" && !game.powerOn && inPowerRoomZone;
  // Meeting can only be called from Cafeteria while roaming free, before
  // everyone's gathered — once the meeting has actually started
  // (DISCUSSION), there's no point offering the button again since you're
  // already there; it just reads as a confusing, redundant control.
  const showMeeting = !isGhost && game.phase === "FREE_ROAM" && inCafeteria;
  const showSeeMapButton = !isGhost && inMapRoom && !showMapPanel;
  const showStealAction =
    !isGhost && game.isCorrupted && !game.hasStolenThisRound && nearbyStealTargets.length > 0 &&
    (game.phase === "ROUND_START" || game.phase === "FREE_ROAM" || (game.phase === "POWER_OUTAGE" && game.powerOn));

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

      {game.phase === "DISCUSSION" && !isGhost && (
        <DiscussionBoard positions={positions} playersById={playersById} selfId={selfId} />
      )}

      <ActionButtons
        showRestorePower={showRestorePower}
        showMeeting={showMeeting}
        showMap={showSeeMapButton}
        stealTargets={showStealAction ? nearbyStealTargets : []}
        onRestorePower={() => {
          socket.emit("player:restorePower", {}, (res) => {
            if (!res?.ok) onErrorToast(res?.reason || "Could not restore power.");
          });
        }}
        onCallMeeting={() => {
          socket.emit("player:callMeeting", {}, (res) => {
            if (!res?.ok) onErrorToast(res?.reason || "Could not call meeting.");
          });
        }}
        onOpenMap={() => setShowMapPanel(true)}
        onOpenStealPicker={() => setShowStealPicker(true)}
      />

      {showStealPicker && (
        <StealPicker
          targets={nearbyStealTargets}
          onClose={() => setShowStealPicker(false)}
          onPick={(targetId) => {
            socket.emit("player:stealCard", { targetId }, (res) => {
              if (!res?.ok) onErrorToast(res?.reason || "Steal failed.");
              else game.onStolen?.();
              setShowStealPicker(false);
            });
          }}
        />
      )}

      {showMapPanel && (
        <MapRoomPanel players={mapPlayers} selfId={selfId} onClose={() => setShowMapPanel(false)} />
      )}

      {game.corruptionPromptOpen && (
        <CorruptionPrompt
          onChoose={(becomeCorrupted) => {
            socket.emit("player:corruptionChoice", { becomeCorrupted });
            game.onCorruptionResolved?.();
          }}
        />
      )}

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
