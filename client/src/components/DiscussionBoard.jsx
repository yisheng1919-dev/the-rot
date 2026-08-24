import React from "react";

export default function DiscussionBoard({ positions, playersById, selfId }) {
  const count = positions.length;
  const radius = count <= 5 ? 82 : count <= 8 ? 98 : 114;

  return (
    <div className="meeting-table-wrap">
      <div className="meeting-table-panel">
        <div className="meeting-table-label">EVERYONE'S GATHERED</div>
        <div className="meeting-table-ring" style={{ width: radius * 2 + 70, height: radius * 2 + 70 }}>
          <div className="meeting-table-center">MEETING</div>
          {positions.map((p, i) => {
            const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
            const cx = Math.cos(angle) * radius;
            const cy = Math.sin(angle) * radius;
            const isSelf = p.playerId === selfId;
            return (
              <div
                key={p.playerId}
                className={`meeting-seat ${isSelf ? "self" : ""} ${p.connected === false ? "offline" : ""}`}
                style={{ transform: `translate(${cx}px, ${cy}px)` }}
              >
                <div className="meeting-seat-avatar" />
                <div className="meeting-seat-name">
                  {playersById[p.playerId] || "Player"}
                  {isSelf ? " (you)" : ""}
                </div>
              </div>
            );
          })}
          {count === 0 && <div className="small-dim">No one left to discuss with…</div>}
        </div>
      </div>
    </div>
  );
}
