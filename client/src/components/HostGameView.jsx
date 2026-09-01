import React, { useEffect, useRef, useState } from "react";
import { GameScene2D } from "../scenes/GameScene2D.js";

const IDENTITY_LABEL = {
  INNOCENT: "INNOCENT",
  CORRUPTED: "CORRUPTED",
  ORIGINAL_CORRUPTED: "ORIGINAL CORRUPTED",
};

// Host's live view during a running match: a read-only, zoomed-out map
// showing every player moving in real time (the server already sends the
// Host an unfiltered positions feed — see Room.broadcastPositions — this
// was just never rendered on the client), plus the roles/cards panel the
// Host previously had on its own with no gameplay context around it.
export default function HostGameView({ code, phase, round, powerOn, hostRoles, positions, playersById = {}, onEnd, onSkipDiscussion }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const canSkipDiscussion = phase === "DISCUSSION" || phase === "TIE_CLARIFY";

  useEffect(() => {
    const scene = new GameScene2D(containerRef.current, { scale: 9 });
    scene.focusOn(0, 0); // whole-ship view, centered on Cafeteria — the Host doesn't walk around
    sceneRef.current = scene;
    return () => scene.dispose();
  }, []);

  useEffect(() => {
    sceneRef.current?.setRound(round);
  }, [round]);

  useEffect(() => {
    const withNames = (positions || []).map((p) => ({ ...p, displayName: playersById[p.playerId] }));
    sceneRef.current?.updatePlayers(withNames, false);
  }, [positions, playersById]);

  return (
    <div className="app-shell">
      <div className="game-canvas-wrap" ref={containerRef} />

      <div className="hud-top" style={{ justifyContent: "flex-start", gap: 10 }}>
        <div className="hud-badge round">
          {phase === "GAME_OVER" ? "GAME OVER" : `ROUND ${round} · ${String(phase).replace(/_/g, " ")}`}
        </div>
        <div className={`hud-badge ${powerOn ? "power-on" : "power-off"}`}>{powerOn ? "POWER ON" : "POWER OUT"}</div>
      </div>

      {canSkipDiscussion && (
        <button className="btn host-skip-btn" onClick={onSkipDiscussion}>
          SKIP DISCUSSION ▸
        </button>
      )}

      <div className={`host-roles-sheet ${panelOpen ? "open" : "collapsed"}`}>
        <button className="host-roles-toggle" onClick={() => setPanelOpen((v) => !v)}>
          {panelOpen ? "HIDE ROLES ▾" : `ROLES & CARDS (only you can see this) ▸`}
        </button>
        {panelOpen && (
          <div className="summary-list host-roles-list">
            {(hostRoles || []).map((p) => (
              <div key={p.playerId} className="summary-row">
                <span>
                  {p.displayName} {!p.alive && "· dead"} {!p.connected && "· offline"}
                </span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="small-dim">{p.cards} cards</span>
                  <span className={`identity-tag ${p.identity}`}>{IDENTITY_LABEL[p.identity]}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button className="btn btn-danger host-end-btn" onClick={onEnd}>
        END ROOM
      </button>
    </div>
  );
}
