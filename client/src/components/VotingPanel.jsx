import React, { useState } from "react";

export default function VotingPanel({ targets, votesCast, votersNeeded, hasVoted, onVote, restricted }) {
  const [selected, setSelected] = useState(null);

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-title">WHO DO YOU SUSPECT?</div>
        {restricted && <div className="small-dim">Only tied candidates can be voted for.</div>}
        <div className="small-dim">
          {votesCast} / {votersNeeded} votes cast
        </div>
        <div className="vote-grid">
          {targets.map((t) => (
            <button
              key={t.playerId}
              className={`vote-target-btn ${selected === t.playerId ? "selected" : ""}`}
              disabled={hasVoted}
              onClick={() => setSelected(t.playerId)}
            >
              {t.displayName}
            </button>
          ))}
        </div>
        <button
          className={`vote-target-btn vote-abstain-btn ${selected === "ABSTAIN" ? "selected" : ""}`}
          disabled={hasVoted}
          onClick={() => setSelected("ABSTAIN")}
        >
          SKIP VOTE / ABSTAIN
        </button>
        <button
          className="btn btn-primary btn-block"
          disabled={!selected || hasVoted}
          onClick={() => onVote(selected)}
        >
          {hasVoted ? "VOTE LOCKED IN" : "CONFIRM VOTE"}
        </button>
      </div>
    </div>
  );
}
