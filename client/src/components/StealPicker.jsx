import React from "react";

export default function StealPicker({ targets, onPick, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title corrupt">STEAL A CARD</div>
        <div className="small-dim">Pick a nearby player. They won't know it was you.</div>
        <div className="vote-grid">
          {targets.map((t) => (
            <button key={t.playerId} className="vote-target-btn" onClick={() => onPick(t.playerId)}>
              {t.displayName}
            </button>
          ))}
        </div>
        {targets.length === 0 && <div className="small-dim">No valid targets nearby.</div>}
        <button className="btn btn-block" onClick={onClose}>
          CANCEL
        </button>
      </div>
    </div>
  );
}
