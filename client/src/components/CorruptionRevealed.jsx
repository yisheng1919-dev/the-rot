import React from "react";

export default function CorruptionRevealed({ onDismiss }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-title corrupt">YOU ARE NOW CORRUPTED</div>
        <div className="small-dim">
          This is still completely private — no one else knows. Starting next round, you can steal
          cards from other players just like the Original Corrupted.
        </div>
        <button className="btn btn-corrupt btn-block" onClick={onDismiss}>
          GOT IT
        </button>
      </div>
    </div>
  );
}
