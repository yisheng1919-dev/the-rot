import React, { useEffect, useState } from "react";

const PHASE_LABELS = {
  ROUND_START: "EXPLORE THE MAP",
  POWER_OUTAGE: "POWER OUTAGE",
  FREE_ROAM: "HEAD TO CAFETERIA TO MEET",
  DISCUSSION: "DISCUSSION",
  VOTING: "VOTE — WHO DO YOU SUSPECT?",
  TIE_CLARIFY: "TIE — CLARIFICATION",
  TIE_VOTE: "TIE — FINAL VOTE",
  ELIMINATION_REVEAL: "REVEALING VOTE RESULT",
  GAME_OVER: "GAME OVER",
};

function useCountdown(deadline) {
  const [remaining, setRemaining] = useState(null);
  useEffect(() => {
    if (!deadline) {
      setRemaining(null);
      return;
    }
    const tick = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline]);
  return remaining;
}

export default function HUD({ round, phase, powerOn, cards, isGhost, deadline, currentRoomLabel }) {
  const remaining = useCountdown(deadline);

  return (
    <>
      <div className="hud-top">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div className="hud-badge round">ROUND {round}</div>
          <div className={`hud-badge ${powerOn ? "power-on" : "power-off"}`}>
            {powerOn ? "POWER ON" : "POWER OUT"}
          </div>
          {currentRoomLabel && !isGhost && (
            <div className="hud-badge room-label">📍 {currentRoomLabel.toUpperCase()}</div>
          )}
        </div>
        {!isGhost && <div className="hud-badge cards">CARDS: {cards}</div>}
      </div>
      {phase && phase !== "LOBBY" && (
        <div className="phase-banner">
          {PHASE_LABELS[phase] || phase}
          {remaining !== null && <span className="timer-text">{remaining}s</span>}
        </div>
      )}
      {isGhost && (
        <div className="ghost-banner">
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--neon-purple)" }}>SPECTATOR MODE</div>
          <div className="small-dim">You are a ghost. Watch the round play out.</div>
        </div>
      )}
    </>
  );
}
