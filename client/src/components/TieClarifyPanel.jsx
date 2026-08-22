import React from "react";

export default function TieClarifyPanel({ candidates }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-title">TIE VOTE</div>
        <div className="small-dim">These players tied. They get one minute to make their case.</div>
        <div className="player-chip-list">
          {candidates.map((c) => (
            <div key={c.playerId} className="player-chip">
              {c.displayName}
            </div>
          ))}
        </div>
        <div className="small-dim">A final vote between them starts automatically.</div>
      </div>
    </div>
  );
}
