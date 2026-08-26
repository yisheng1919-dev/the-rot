import React, { useState } from "react";
import { PLAYER_COLORS, spriteUrlFor } from "../colors.js";

export default function PlayerJoin({ onJoin, onBack, defaultCode = "" }) {
  const [code, setCode] = useState(defaultCode);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PLAYER_COLORS[0].id);

  return (
    <div className="menu-screen">
      <div className="rot-title" style={{ fontSize: 32 }}>
        JOIN ROOM
      </div>
      <div className="menu-card">
        <div className="field-label">Room Code</div>
        <input
          type="text"
          placeholder="e.g. MY7K29"
          value={code}
          maxLength={6}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <div className="field-label">Your Name</div>
        <input
          type="text"
          placeholder="Display name"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="field-label">Pick Your Detective</div>
        <div className="color-picker-grid">
          {PLAYER_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`color-swatch-btn ${color === c.id ? "selected" : ""}`}
              onClick={() => setColor(c.id)}
              title={c.label}
            >
              <img src={spriteUrlFor(c.id)} alt={c.label} draggable={false} />
            </button>
          ))}
        </div>

        <button
          className="btn btn-primary btn-block"
          disabled={!code || !name.trim()}
          onClick={() => onJoin(code.trim(), name.trim(), color)}
        >
          JOIN
        </button>
        <button className="btn btn-block" onClick={onBack}>
          BACK
        </button>
      </div>
    </div>
  );
}
