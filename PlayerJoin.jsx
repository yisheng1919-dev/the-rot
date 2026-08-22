import React, { useState } from "react";

export default function PlayerJoin({ onJoin, onBack, defaultCode = "" }) {
  const [code, setCode] = useState(defaultCode);
  const [name, setName] = useState("");

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
        <button
          className="btn btn-primary btn-block"
          disabled={!code || !name.trim()}
          onClick={() => onJoin(code.trim(), name.trim())}
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
