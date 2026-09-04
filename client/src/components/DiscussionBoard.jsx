import React, { useState } from "react";
import { spriteUrlFor } from "../colors.js";

export default function DiscussionBoard({ positions, playersById, selfId, chatLog = [], onSendChat, canChat }) {
  const count = positions.length;
  const radius = count <= 5 ? 82 : count <= 8 ? 98 : 114;
  const [draft, setDraft] = useState("");

  const send = () => {
    const text = draft.trim();
    if (!text || !onSendChat) return;
    onSendChat(text);
    setDraft("");
  };

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
                <img className="meeting-seat-avatar-img" src={spriteUrlFor(p.color)} alt="" draggable={false} />
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

      {onSendChat && (
        <div className="chat-panel">
          <div className="chat-log">
            {chatLog.length === 0 && <div className="chat-empty">No messages yet — say something.</div>}
            {chatLog.map((m, i) => (
              <div key={i} className={`chat-line ${m.playerId === selfId ? "self" : ""}`}>
                <span className="chat-author">{m.displayName}:</span> {m.text}
              </div>
            ))}
          </div>
          {canChat && (
            <div className="chat-input-row">
              <input
                className="chat-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Type a message…"
                maxLength={240}
              />
              <button className="chat-send-btn" onClick={send}>
                SEND
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
