import React, { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "./socket.js";
import Landing from "./components/Landing.jsx";
import HostSetup from "./components/HostSetup.jsx";
import HostLobbyView from "./components/HostLobbyView.jsx";
import PlayerJoin from "./components/PlayerJoin.jsx";
import PlayerLobby from "./components/PlayerLobby.jsx";
import GameScreen from "./components/GameScreen.jsx";
import GameOverScreen from "./components/GameOverScreen.jsx";

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
  cards: 3,
  alive: true,
  isOC: false,
  isCorrupted: false,
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
  const [playersById, setPlayersById] = useState({});

  const errorTimeoutRef = useRef(null);
  const showError = useCallback((msg) => {
    setErrorMsg(msg);
    clearTimeout(errorTimeoutRef.current);
    errorTimeoutRef.current = setTimeout(() => setErrorMsg(null), 3200);
  }, []);

  // ---- Connect once on mount; try auto-reconnect if we have a session ----
  useEffect(() => {
    socket.connect();

    const session = loadSession();
    const onConnect = () => {
      if (session?.role === "player" && session.code && session.reconnectToken) {
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
      }
    };
    socket.on("connect", onConnect);
    return () => socket.off("connect", onConnect);
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
        ...(phase === "ROUND_START" ? { hasStolenThisRound: false, eliminationReveal: null } : {}),
        ...(phase === "VOTING" || phase === "TIE_VOTE"
          ? { votesCast: 0, votersNeeded: g.livingCount, hasVoted: false }
          : {}),
      }));
    };
    const onPowerState = ({ on }) => setGame((g) => ({ ...g, powerOn: on }));
    const onRoleAssigned = ({ isOC, isCorrupted, cards }) =>
      setGame((g) => ({ ...g, isOC, isCorrupted, cards }));
    const onCardsUpdate = ({ cards }) => setGame((g) => ({ ...g, cards }));
    const onCorruptionPrompt = () => setGame((g) => ({ ...g, corruptionPromptOpen: true }));
    const onVoteTargets = ({ targets, restricted }) =>
      setGame((g) => ({ ...g, voteTargets: targets, hasVoted: false }));
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

    socket.on("room:update", onRoomUpdate);
    socket.on("players:summary", onPlayersSummary);
    socket.on("phase:change", onPhaseChange);
    socket.on("power:state", onPowerState);
    socket.on("role:assigned", onRoleAssigned);
    socket.on("cards:update", onCardsUpdate);
    socket.on("corruption:prompt", onCorruptionPrompt);
    socket.on("vote:targets", onVoteTargets);
    socket.on("vote:progress", onVoteProgress);
    socket.on("tie:candidates", onTieCandidates);
    socket.on("elimination:reveal", onEliminationReveal);
    socket.on("player:died", onPlayerDied);
    socket.on("game:over", onGameOver);
    socket.on("room:ended", onRoomEnded);
    socket.on("error:action", onErrorAction);

    return () => {
      socket.off("room:update", onRoomUpdate);
      socket.off("players:summary", onPlayersSummary);
      socket.off("phase:change", onPhaseChange);
      socket.off("power:state", onPowerState);
      socket.off("role:assigned", onRoleAssigned);
      socket.off("cards:update", onCardsUpdate);
      socket.off("corruption:prompt", onCorruptionPrompt);
      socket.off("vote:targets", onVoteTargets);
      socket.off("vote:progress", onVoteProgress);
      socket.off("tie:candidates", onTieCandidates);
      socket.off("elimination:reveal", onEliminationReveal);
      socket.off("player:died", onPlayerDied);
      socket.off("game:over", onGameOver);
      socket.off("room:ended", onRoomEnded);
      socket.off("error:action", onErrorAction);
    };
  }, [self, showError]);

  // ---- Screen transition: once game starts, jump everyone into GameScreen ----
  useEffect(() => {
    if (game.phase !== "LOBBY" && game.phase !== "GAME_OVER" && role === "player" && screen === "playerLobby") {
      setScreen("game");
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
  }

  // ---- Host actions ----
  const createRoom = (cfg) => {
    socket.emit("host:createRoom", cfg, (res) => {
      if (!res?.ok) return showError(res?.reason || "Could not create room.");
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
  const endRoom = () => {
    socket.emit("host:endRoom", {}, () => resetToLanding());
  };

  // ---- Player actions ----
  const joinRoom = (code, displayName) => {
    socket.emit("player:joinRoom", { code, displayName }, (res) => {
      if (!res?.ok) return showError(res?.reason || "Could not join room.");
      const session = { role: "player", code: res.code, reconnectToken: res.reconnectToken, displayName };
      saveSession(session);
      setSelf({ playerId: res.playerId, displayName, reconnectToken: res.reconnectToken });
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
        onStart={startGame}
        onEnd={endRoom}
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
    </div>
  );
}
