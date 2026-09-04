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
          <li>Move with the joystick, bottom-left. The narrow connecting passages between rooms are corridors — walk through them to get from one room to another.</li>
          <li>There are no tasks to complete. Just explore, keep an eye on who's acting suspicious, and stay near others for safety.</li>
          <li>When the power goes out, follow the red arrow to the Power Room.</li>
          <li>Restoring power takes a group effort — everyone needed has to be inside the Power Room and press RESTORE POWER together.</li>
          <li>Once power's back, talk it over with everyone — in person, out loud — about who seems suspicious.</li>
          <li>Vote for who you suspect at the meeting.</li>
          <li>Protect your cards — if they hit 0, you're out.</li>
        </ol>
      </div>
    </div>
  );
}
