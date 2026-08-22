import React from "react";

export default function Landing({ onChooseHost, onChoosePlayer }) {
  return (
    <div className="menu-screen">
      <div>
        <div className="rot-title">THE ROT</div>
        <div className="rot-subtitle">A SOCIAL DEDUCTION EXPERIENCE</div>
      </div>
      <div className="menu-card">
        <button className="btn btn-primary btn-block" onClick={onChoosePlayer}>
          JOIN A GAME
        </button>
        <button className="btn btn-block" onClick={onChooseHost}>
          HOST A ROOM (BOOTH SCREEN)
        </button>
      </div>
      <div className="small-dim" style={{ maxWidth: 340 }}>
        Hosts run the room on a shared display or laptop. Everyone else joins
        from their own phone.
      </div>
    </div>
  );
}
