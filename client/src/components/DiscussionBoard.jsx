import React from "react";

export default function DiscussionBoard({ positions, playersById, selfId }) {
  return (
    <div className="discussion-board">
      <div className="field-label" style={{ marginBottom: 6 }}>
        LIVING PLAYERS
      </div>
      <div className="player-chip-list">
        {positions.map((p) => (
          <div key={p.playerId} className={`player-chip ${p.connected ? "" : "offline"}`}>
            <span className="dot" /> {playersById[p.playerId] || "Player"}
            {p.playerId === selfId ? " (you)" : ""}
          </div>
        ))}
        {positions.length === 0 && <div className="small-dim">No one left to discuss with…</div>}
      </div>
    </div>
  );
}
