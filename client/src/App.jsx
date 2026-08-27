import React, { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "./socket.js";
import Landing from "./components/Landing.jsx";
import HostSetup from "./components/HostSetup.jsx";
import HostLobbyView from "./components/HostLobbyView.jsx";
import PlayerJoin from "./components/PlayerJoin.jsx";
import PlayerLobby from "./components/PlayerLobby.jsx";
import GameScreen from "./components/GameScreen.jsx";
import GameOverScreen from "./components/GameOverScreen.jsx";
import RoleReveal from "./components/RoleReveal.jsx";
import HostGameView from "./components/HostGameView.jsx";

const STORAGE_KEY = "the-rot-session";

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}
function saveSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}
function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

const initialGame = {
  phase: "LOBBY",
  round: 0,
  powerOn: true,
  powerRestoreCount: 0,
  powerRestoreNeeded: 0,
  cards: 3,
  alive: true,
  isOC: false,
  isCorrupted: false,
  corruptedSinceRound: null,
  hasStolenThisRound: false,
  deadline: null,
  corruptionPromptOpen: false,
  voteTargets: [],
  votesCast: 0,
  votersNeeded: 0,
  hasVoted: false,
  tieCandidates: [],
  eliminationReveal: null,
  lastDeath: null,
  livingCount: 0,
};

export default function App() {
  const [screen, setScreen] = useState("landing");
  const [role, setRole] = useState(null); // 'host' | 'player'
  const [roomCode, setRoomCode] = useState("");
  const [config, setConfig] = useState(null);
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [self, setSelf] = useState(null); // {playerId, displayName, reconnectToken}
  const [game, setGame] = useState(initialGame);
  const [gameOverResult, setGameOverResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [noticeMsg, setNoticeMsg] = useState(null);
  const [playersById, setPlayersById] = useState({});
  const [hostRoles, setHostRoles] = useState(null);
  const [hostPositions, setHostPositions] = useState([]);

  const errorTimeoutRef = useRef(null);
  const showError = useCallback((msg) => {
    setErrorMsg(msg);
    clearTimeout(errorTimeoutRef.current);
    errorTimeoutRef.current = setTimeout(() => setErrorMsg(null), 3200);
  }, []);

  const noticeTimeoutRef = useRef(null);
  const showNotice = useCallback((msg) => {
    setNoticeMsg(msg);
    clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = setTimeout(() => setNoticeMsg(null), 3200);
  }, []);

  const [connected, setConnected] = useState(false);
  const [everConnected, setEverConnected] = useState(false);
  const [showSlowConnectHint, setShowSlowConnectHint] = useState(false);
  const [confirmEndRoom, setConfirmEndRoom] = useState(false);
  const [isLandscapePhone, setIsLandscapePhone] = useState(false);
  const [showRoleReveal, setShowRoleReveal] = useState(false);

  // ---- Nudge people back to portrait on phone-sized landscape screens.
  // We can't reliably lock orientation cross-platform (iOS Safari ignores
  // the Screen Orientation Lock API outside fullscreen/PWA contexts), so
  // this is a CSS-driven prompt rather than an actual lock. The width
  // threshold keeps this from firing on desktop browsers, where landscape
  // is the normal, intended layout. ----
  useEffect(() => {
    const check = () => {
      const landscape = window.innerWidth > window.innerHeight;
      const phoneSized = Math.min(window.innerWidth, window.innerHeight) < 560;
      setIsLandscapePhone(landscape && phoneSized);
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  // ---- Connect on mount; re-run on every (re)connect, including automatic
  // reconnects after a dropped network — always re-reads localStorage fresh
  // so a session saved *after* mount (e.g. right after joining) is honored
  // by a later automatic reconnect, not just the very first page load. ----
  useEffect(() => {
    socket.connect();

    const slowConnectTimer = setTimeout(() => setShowSlowConnectHint(true), 4000);

    const onConnect = () => {
      clearTimeout(slowConnectTimer);
      setShowSlowConnectHint(false);
      setConnected(true);
      setEverConnected(true);

      const session = loadSession();
      if (!session) return;

      if (session.role === "player" && session.code && session.reconnectToken) {
        socket.emit(
          "player:reconnect",
          { code: session.code, reconnectToken: session.reconnectToken },
          (res) => {
            if (res?.ok) {
              setRole("player");
              setRoomCode(session.code);
              setSelf({
                playerId: res.playerId,
                displayName: session.displayName,
                reconnectToken: session.reconnectToken,
                color: res.color,
              });
              setGame((g) => ({
                ...g,
                phase: res.phase,
                round: res.round,
                powerOn: res.powerOn,
                alive: res.alive,
                isOC: res.isOC,
                isCorrupted: res.isCorrupted,
                cards: res.cards,
                deadline: res.deadline,
              }));
              setScreen(res.phase === "LOBBY" ? "playerLobby" : "game");
            } else {
              clearSession();
            }
          }
        );
      } else if (session.role === "host" && session.code && session.hostReconnectToken) {
        socket.emit(
          "host:reconnect",
          { code: session.code, hostReconnectToken: session.hostReconnectToken },
          (res) => {
            if (res?.ok) {
              setRole("host");
              setRoomCode(res.code);
              setConfig(res.config);
              setGame((g) => ({ ...g, phase: res.phase, round: res.round, powerOn: res.powerOn }));
              setScreen(res.phase === "LOBBY" ? "hostLobby" : "hostGame");
            } else {
              clearSession();
            }
          }
        );
      }
    };
    const onDisconnect = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      clearTimeout(slowConnectTimer);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  // ---- Global socket listeners (active regardless of screen) ----
  useEffect(() => {
    const onRoomUpdate = (data) => {
      setLobbyPlayers(data.players);
      setConfig(data.config);
      setPlayersById((prev) => {
        const next = { ...prev };
        for (const p of data.players) next[p.playerId] = p.displayName;
        return next;
      });
    };
    const onPlayersSummary = ({ players }) => {
      setLobbyPlayers(players.map((p) => ({ ...p })));
      setGame((g) => ({ ...g, livingCount: players.filter((p) => p.alive).length }));
      setPlayersById((prev) => {
        const next = { ...prev };
        for (const p of players) next[p.playerId] = p.displayName;
        return next;
      });
    };
    const onPhaseChange = ({ phase, round, deadline, powerOn }) => {
      setGame((g) => ({
        ...g,
        phase,
        round,
        deadline,
        powerOn,
        ...(phase === "ROUND_START"
          ? { hasStolenThisRound: g.isCorrupted && g.corruptedSinceRound === round ? true : false, eliminationReveal: null }
          : {}),
        ...(phase === "VOTING" || phase === "TIE_VOTE"
          ? { votesCast: 0, votersNeeded: g.livingCount, hasVoted: false }
          : {}),
      }));
    };
    const onPowerState = ({ on }) => setGame((g) => ({ ...g, powerOn: on }));
    const onPowerRestoreProgress = ({ count, needed }) =>
      setGame((g) => ({ ...g, powerRestoreCount: count, powerRestoreNeeded: needed }));
    const onRoleAssigned = ({ isOC, isCorrupted, corruptedSinceRound, hasStolenThisRound, cards }) => {
      setGame((g) => ({ ...g, isOC, isCorrupted, corruptedSinceRound, hasStolenThisRound, cards }));
      setShowRoleReveal(true); // fresh game start (not fired on reconnect) — show it once
    };
    const onCardsUpdate = ({ cards }) => setGame((g) => ({ ...g, cards }));
    const onCorruptionPrompt = () => setGame((g) => ({ ...g, corruptionPromptOpen: true }));
    // Fired only at the moment a stolen-from player chooses to flip — see
    // handleCorruptionChoice on the server for why this has to be a
    // separate event from role:assigned.
    const onRoleUpdated = ({ isCorrupted, corruptedSinceRound, hasStolenThisRound }) =>
      setGame((g) => ({ ...g, isCorrupted, corruptedSinceRound, hasStolenThisRound }));
    const onVoteTargets = ({ targets, restricted }) =>
      setGame((g) => ({ ...g, voteTargets: targets, hasVoted: false }));
    // Sent only to a reconnecting player, right after vote:targets, to
    // correct the hasVoted:false that onVoteTargets just set — otherwise
    // someone who already voted before disconnecting would reconnect to a
    // live "CONFIRM VOTE" button (harmless server-side since double votes
    // are rejected, but confusing: it looks like their vote never counted).
    const onVoteSelf = ({ hasVoted }) => setGame((g) => ({ ...g, hasVoted }));
    const onVoteProgress = ({ votesCast, votersNeeded }) =>
      setGame((g) => ({ ...g, votesCast, votersNeeded }));
    const onTieCandidates = ({ candidates }) => setGame((g) => ({ ...g, tieCandidates: candidates }));
    const onEliminationReveal = (data) => {
      setGame((g) => ({ ...g, eliminationReveal: data }));
      setTimeout(() => setGame((g) => ({ ...g, eliminationReveal: null })), 4200);
    };
    const onPlayerDied = (data) => {
      setGame((g) => {
        const next = { ...g, lastDeath: data };
        if (self && data.playerId === self.playerId) next.alive = false;
        return next;
      });
      setTimeout(() => setGame((g) => (g.lastDeath === data ? { ...g, lastDeath: null } : g)), 3500);
    };
    const onGameOver = (data) => {
      setGameOverResult(data);
      setScreen("gameOver");
      clearSession();
    };
    const onRoomEnded = () => {
      showError("The host ended the room.");
      resetToLanding();
    };
    const onErrorAction = ({ message }) => showError(message);
    const onHostRoles = ({ players }) => setHostRoles(players);
    // Only ever reaches this socket when it's the Host connection — the
    // server sends players the same event name but addressed to their own
    // socket individually, never to the room the Host's `positions:update`
    // broadcast goes to (see Room.broadcastPositions). Harmless to keep a
    // second copy in App state even while playing, since HostGameView is
    // simply never mounted for role === "player".
    const onHostPositions = (list) => setHostPositions(list);
    const onHostDisconnected = () => {
      if (role === "player") showError("The host disconnected — they can rejoin any time.");
    };
    const onCardStolen = () => showError("A card was stolen from you!");
    const onMeetingCalled = ({ by }) => showNotice(`${by} called a meeting!`);

    socket.on("room:update", onRoomUpdate);
    socket.on("players:summary", onPlayersSummary);
    socket.on("phase:change", onPhaseChange);
    socket.on("power:state", onPowerState);
    socket.on("power:restoreProgress", onPowerRestoreProgress);
    socket.on("role:assigned", onRoleAssigned);
    socket.on("role:updated", onRoleUpdated);
    socket.on("cards:update", onCardsUpdate);
    socket.on("corruption:prompt", onCorruptionPrompt);
    socket.on("vote:targets", onVoteTargets);
    socket.on("vote:self", onVoteSelf);
    socket.on("vote:progress", onVoteProgress);
    socket.on("tie:candidates", onTieCandidates);
    socket.on("elimination:reveal", onEliminationReveal);
    socket.on("player:died", onPlayerDied);
    socket.on("game:over", onGameOver);
    socket.on("room:ended", onRoomEnded);
    socket.on("error:action", onErrorAction);
    socket.on("host:roles", onHostRoles);
    socket.on("positions:update", onHostPositions);
    socket.on("host:disconnected", onHostDisconnected);
    socket.on("card:stolenNotice", onCardStolen);
    socket.on("meeting:called", onMeetingCalled);

    return () => {
      socket.off("room:update", onRoomUpdate);
      socket.off("players:summary", onPlayersSummary);
      socket.off("phase:change", onPhaseChange);
      socket.off("power:state", onPowerState);
      socket.off("power:restoreProgress", onPowerRestoreProgress);
      socket.off("role:assigned", onRoleAssigned);
      socket.off("role:updated", onRoleUpdated);
      socket.off("cards:update", onCardsUpdate);
      socket.off("corruption:prompt", onCorruptionPrompt);
      socket.off("vote:targets", onVoteTargets);
      socket.off("vote:self", onVoteSelf);
      socket.off("vote:progress", onVoteProgress);
      socket.off("tie:candidates", onTieCandidates);
      socket.off("elimination:reveal", onEliminationReveal);
      socket.off("player:died", onPlayerDied);
      socket.off("game:over", onGameOver);
      socket.off("room:ended", onRoomEnded);
      socket.off("error:action", onErrorAction);
      socket.off("host:roles", onHostRoles);
      socket.off("positions:update", onHostPositions);
      socket.off("host:disconnected", onHostDisconnected);
      socket.off("card:stolenNotice", onCardStolen);
      socket.off("meeting:called", onMeetingCalled);
    };
  }, [self, role, showError, showNotice]);

  // ---- Screen transition: once game starts, jump everyone into GameScreen ----
  useEffect(() => {
    if (game.phase !== "LOBBY" && game.phase !== "GAME_OVER" && role === "player" && screen === "playerLobby") {
      setScreen("game");
    }
  }, [game.phase, role, screen]);

  // Same idea for the Host: previously the Host just stayed on
  // HostLobbyView (text-only "LIVE MONITOR") for the entire match. Now they
  // move to a live map + roles view once the round actually starts.
  useEffect(() => {
    if (game.phase !== "LOBBY" && game.phase !== "GAME_OVER" && role === "host" && screen === "hostLobby") {
      setScreen("hostGame");
    }
  }, [game.phase, role, screen]);

  function resetToLanding() {
    setScreen("landing");
    setRole(null);
    setRoomCode("");
    setConfig(null);
    setLobbyPlayers([]);
    setSelf(null);
    setGame(initialGame);
    setGameOverResult(null);
    setShowRoleReveal(false);
  }

  // ---- Host actions ----
  const createRoom = (cfg) => {
    socket.emit("host:createRoom", cfg, (res) => {
      if (!res?.ok) return showError(res?.reason || "Could not create room.");
      saveSession({ role: "host", code: res.code, hostReconnectToken: res.hostReconnectToken });
      setRole("host");
      setRoomCode(res.code);
      setConfig(res.config);
      setScreen("hostLobby");
    });
  };
  const startGame = () => {
    socket.emit("host:startGame", {}, (res) => {
      if (!res?.ok) showError(res?.reason || "Could not start game.");
    });
  };
  const requestEndRoom = () => setConfirmEndRoom(true);
  const skipDiscussion = () => {
    socket.emit("host:skipDiscussion", {}, (res) => {
      if (!res?.ok) showError(res?.reason || "Could not skip discussion.");
    });
  };
  const confirmedEndRoom = () => {
    setConfirmEndRoom(false);
    socket.emit("host:endRoom", {}, () => {
      clearSession();
      resetToLanding();
    });
  };

  // ---- Player actions ----
  const joinRoom = (code, displayName, color) => {
    socket.emit("player:joinRoom", { code, displayName, color }, (res) => {
      if (!res?.ok) return showError(res?.reason || "Could not join room.");
      const session = { role: "player", code: res.code, reconnectToken: res.reconnectToken, displayName };
      saveSession(session);
      setSelf({ playerId: res.playerId, displayName, reconnectToken: res.reconnectToken, color: res.color });
      setRole("player");
      setRoomCode(res.code);
      setConfig(res.config);
      setScreen("playerLobby");
    });
  };

  let body = null;
  if (screen === "landing") {
    body = <Landing onChooseHost={() => setScreen("hostSetup")} onChoosePlayer={() => setScreen("playerJoin")} />;
  } else if (screen === "hostSetup") {
    body = <HostSetup onCreate={createRoom} onBack={() => setScreen("landing")} />;
  } else if (screen === "hostLobby") {
    body = (
      <HostLobbyView
        code={roomCode}
        config={config}
        players={lobbyPlayers}
        phase={game.phase}
        round={game.round}
        powerOn={game.powerOn}
        hostRoles={hostRoles}
        onStart={startGame}
        onEnd={requestEndRoom}
      />
    );
  } else if (screen === "hostGame") {
    body = (
      <HostGameView
        code={roomCode}
        phase={game.phase}
        round={game.round}
        powerOn={game.powerOn}
        hostRoles={hostRoles}
        positions={hostPositions}
        playersById={playersById}
        onSkipDiscussion={skipDiscussion}
        onEnd={requestEndRoom}
      />
    );
  } else if (screen === "playerJoin") {
    body = <PlayerJoin onJoin={joinRoom} onBack={() => setScreen("landing")} />;
  } else if (screen === "playerLobby") {
    body = <PlayerLobby code={roomCode} players={lobbyPlayers} displayName={self?.displayName} />;
  } else if (screen === "game") {
    body = (
      <GameScreen
        selfId={self?.playerId}
        displayName={self?.displayName}
        playersById={playersById}
        onErrorToast={showError}
        game={{
          ...game,
          onCorruptionResolved: () => setGame((g) => ({ ...g, corruptionPromptOpen: false })),
          onVoted: () => setGame((g) => ({ ...g, hasVoted: true })),
          onStolen: () => setGame((g) => ({ ...g, hasStolenThisRound: true })),
        }}
      />
    );
  } else if (screen === "gameOver") {
    body = <GameOverScreen result={gameOverResult} onExit={resetToLanding} />;
  }

  return (
    <div className="app-shell">
      {body}
      {errorMsg && <div className="error-toast">{errorMsg}</div>}
      {noticeMsg && !errorMsg && (
        <div className="error-toast notice-toast">{noticeMsg}</div>
      )}

      {isLandscapePhone && (
        <div className="rotate-overlay">
          <div className="rotate-icon">📱</div>
          <div className="rotate-title">ROTATE YOUR PHONE</div>
          <div className="small-dim">THE ROT is designed for portrait mode — turn your phone back upright to keep playing.</div>
        </div>
      )}

      {showRoleReveal && role === "player" && (
        <RoleReveal
          isOC={game.isOC}
          isCorrupted={game.isCorrupted}
          onDismiss={() => setShowRoleReveal(false)}
        />
      )}

      {!connected && !everConnected && showSlowConnectHint && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-title">WAKING UP THE SERVER…</div>
            <div className="small-dim">
              The server was asleep and is starting back up — this can take up to a minute on the
              free hosting tier. Hang tight, this only happens after a period of inactivity.
            </div>
          </div>
        </div>
      )}

      {!connected && everConnected && (
        <div className="error-toast" style={{ bottom: "auto", top: 16, background: "var(--bg-panel-2)", border: "1px solid var(--border-soft)" }}>
          Connection lost — reconnecting…
        </div>
      )}

      {confirmEndRoom && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-title danger">END ROOM?</div>
            <div className="small-dim">
              This will immediately disconnect everyone in the room. This can't be undone.
            </div>
            <button className="btn btn-danger btn-block" onClick={confirmedEndRoom}>
              YES, END THE ROOM
            </button>
            <button className="btn btn-block" onClick={() => setConfirmEndRoom(false)}>
              CANCEL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
