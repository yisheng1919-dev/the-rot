import React from "react";

export default function GameOverScreen({ result, onExit }) {
  if (!result) return null;
  const innocentsWin = result.winner === "INNOCENTS";

  return (
    <div className="menu-screen">
      <div
        className="rot-title"
        style={{
          fontSize: 34,
          background: innocentsWin
            ? "linear-gradient(180deg, var(--innocent), #2296ff)"
            : "linear-gradient(180deg, var(--corrupted), #a4283b)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
        }}
      >
        {innocentsWin ? "INNOCENTS WIN" : "CORRUPTED WIN"}
      </div>
      <div className="small-dim" style={{ maxWidth: 360 }}>
        {innocentsWin
          ? "The Original Corrupted has been eliminated."
          : "The Corrupted have taken control of the ship."}
      </div>

      {result.individualWinners?.length > 0 && (
        <div className="menu-card">
          <div className="field-label">MVP{result.individualWinners.length > 1 ? "S" : ""}</div>
          <div className="player-chip-list">
            {result.individualWinners.map((w) => (
              <div key={w.playerId} className="player-chip">
                {w.displayName} · {innocentsWin ? `${w.cards} cards` : `${w.cardsStolen} stolen`}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="menu-card">
        <div className="field-label">FINAL SUMMARY</div>
        <div className="summary-list">
          {result.summary.map((p) => (
            <div key={p.playerId} className="summary-row">
              <span>
                {p.displayName} {!p.alive && "· eliminated"}
              </span>
              <span className={`identity-tag ${p.identity}`}>{p.identity.replace("_", " ")}</span>
            </div>
          ))}
        </div>
      </div>

      <button className="btn btn-primary" onClick={onExit}>
        BACK TO MENU
      </button>
    </div>
  );
}
