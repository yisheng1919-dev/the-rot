import React from "react";

export default function PlayerLobby({ code, players, displayName }) {
  return (
    <div className="menu-screen">
      <div className="rot-title" style={{ fontSize: 30 }}>
        YOU'RE IN
      </div>
      <div className="small-dim">
        Room <b style={{ color: "var(--neon-cyan)" }}>{code}</b> — waiting for the host to start…
      </div>

      <div className="player-chip-list">
        {players.map((p) => (
          <div key={p.playerId} className={`player-chip ${p.connected ? "" : "offline"}`}>
            <span className="dot" /> {p.displayName}
            {p.displayName === displayName ? " (you)" : ""}
          </div>
        ))}
      </div>

      <div className="menu-card" style={{ textAlign: "left" }}>
        <div className="field-label">HOW TO PLAY</div>
        <ol className="tutorial-steps">
          <li>Move with the joystick, bottom-left.</li>
          <li>When the power goes out, follow the red arrow to the Power Room.</li>
          <li>Tap RESTORE POWER once you're inside.</li>
          <li>Watch who's acting suspicious.</li>
          <li>Discuss with everyone after power is back.</li>
          <li>Vote for who you suspect.</li>
          <li>Protect your 3 cards — if they hit 0, you're out.</li>
        </ol>
      </div>
    </div>
  );
}
