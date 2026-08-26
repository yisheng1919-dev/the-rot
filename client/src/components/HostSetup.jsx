import React, { useState } from "react";

export default function HostSetup({ onCreate, onBack }) {
  const [minPlayers, setMinPlayers] = useState(4);
  const [maxPlayers, setMaxPlayers] = useState(12);

  return (
    <div className="menu-screen">
      <div className="rot-title" style={{ fontSize: 32 }}>
        CREATE ROOM
      </div>
      <div className="menu-card">
        <div className="field-label">Minimum players</div>
        <input
          type="text"
          inputMode="numeric"
          value={minPlayers}
          onChange={(e) => setMinPlayers(e.target.value.replace(/\D/g, ""))}
        />
        <div className="field-label">Maximum players</div>
        <input
          type="text"
          inputMode="numeric"
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(e.target.value.replace(/\D/g, ""))}
        />
        <button
          className="btn btn-primary btn-block"
          onClick={() =>
            onCreate({
              minPlayers: Math.max(2, parseInt(minPlayers || "4", 10)),
              maxPlayers: Math.max(parseInt(minPlayers || "4", 10), parseInt(maxPlayers || "12", 10)),
            })
          }
        >
          CREATE ROOM
        </button>
        <button className="btn btn-block" onClick={onBack}>
          BACK
        </button>
      </div>
    </div>
  );
}
