import React from "react";
import { ROOMS } from "../rooms.js";
import { PLAYER_COLORS } from "../colors.js";

const SWATCH_BY_ID = Object.fromEntries(PLAYER_COLORS.map((c) => [c.id, c.swatch]));

const WORLD_MIN_X = -40, WORLD_MAX_X = 40, WORLD_MIN_Z = -26, WORLD_MAX_Z = 26;

function toPercent(x, z) {
  const px = ((x - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X)) * 100;
  const pz = ((z - WORLD_MIN_Z) / (WORLD_MAX_Z - WORLD_MIN_Z)) * 100;
  return { left: `${Math.min(96, Math.max(4, px))}%`, top: `${Math.min(96, Math.max(4, pz))}%` };
}

export default function MapRoomPanel({ players, selfId, onClose }) {
  return (
    <div className="map-room-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="modal-title innocent">MAP ROOM</div>
        <button className="btn" onClick={onClose}>
          CLOSE
        </button>
      </div>
      <div style={{ position: "relative", flex: 1, background: "#060a16", borderRadius: 14, border: "1px solid var(--border-soft)", overflow: "hidden" }}>
        {ROOMS.map((r) => {
          const pos = toPercent(r.x + r.w / 2, r.z + r.d / 2);
          return (
            <div
              key={r.id}
              style={{
                position: "absolute",
                left: pos.left,
                top: pos.top,
                transform: "translate(-50%, -50%)",
                fontSize: 10,
                color: "var(--text-dim)",
                letterSpacing: 0.5,
                textAlign: "center",
                pointerEvents: "none",
              }}
            >
              {r.label}
            </div>
          );
        })}
        {players.map((p) => {
          const pos = toPercent(p.x, p.z);
          const isSelf = p.playerId === selfId;
          return (
            <div
              key={p.playerId}
              style={{
                position: "absolute",
                left: pos.left,
                top: pos.top,
                transform: "translate(-50%, -50%)",
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: isSelf ? "var(--neon-cyan)" : (SWATCH_BY_ID[p.color] || "#dfe6ff"),
                boxShadow: isSelf ? "0 0 10px var(--neon-cyan)" : "0 0 6px rgba(255,255,255,0.4)",
              }}
              title={p.displayName}
            />
          );
        })}
      </div>
      <div className="small-dim" style={{ marginTop: 8 }}>
        Only living players are shown. Secret roles stay secret.
      </div>
    </div>
  );
}
