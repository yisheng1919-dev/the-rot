import React from "react";

export default function CorruptionPrompt({ onChoose }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-title corrupt">A CARD HAS BEEN STOLEN</div>
        <div className="small-dim">
          This choice is completely private. No one else will ever see what you pick.
        </div>
        <button className="btn btn-block" onClick={() => onChoose(false)}>
          STAY INNOCENT
        </button>
        <button className="btn btn-corrupt btn-block" onClick={() => onChoose(true)}>
          BECOME CORRUPTED
        </button>
      </div>
    </div>
  );
}
