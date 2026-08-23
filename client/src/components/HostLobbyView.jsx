import React from "react";

const IDENTITY_LABEL = {
  INNOCENT: "INNOCENT",
  CORRUPTED: "CORRUPTED",
  ORIGINAL_CORRUPTED: "ORIGINAL CORRUPTED",
};

export default function HostLobbyView({ code, config, players, phase, round, powerOn, hostRoles, onStart, onEnd }) {
  const canStart = players.length >= (config?.minPlayers || 4) && phase === "LOBBY";

  return (
    <div className="menu-screen">
      <div className="rot-title" style={{ fontSize: 30 }}>
        THE ROT — HOST
      </div>

      <div className="field-label">ROOM CODE</div>
      <div className="room-code-display">{code}</div>

      {phase === "LOBBY" ? (
        <>
          <div className="small-dim">
            {players.length} / {config?.maxPlayers} joined · need {config?.minPlayers}+ to start
          </div>
          <div className="player-chip-list">
            {players.map((p) => (
              <div key={p.playerId} className={`player-chip ${p.connected ? "" : "offline"}`}>
                <span className="dot" /> {p.displayName}
              </div>
            ))}
            {players.length === 0 && <div className="small-dim">Waiting for players to join…</div>}
          </div>
          <button className="btn btn-primary btn-block" disabled={!canStart} onClick={onStart}>
            {canStart ? "START GAME" : `NEED ${Math.max(0, (config?.minPlayers || 4) - players.length)} MORE`}
          </button>
        </>
      ) : (
        <div className="menu-card">
          <div className="field-label">LIVE MONITOR</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            {phase === "GAME_OVER" ? "GAME OVER" : `ROUND ${round} · ${phase.replace(/_/g, " ")}`}
          </div>
          <div className="small-dim">Power: {powerOn ? "ON" : "OUT"}</div>

          {hostRoles && (
            <>
              <div className="field-label" style={{ marginTop: 10 }}>
                ROLES (only you can see this)
              </div>
              <div className="summary-list">
                {hostRoles.map((p) => (
                  <div key={p.playerId} className="summary-row">
                    <span>
                      {p.displayName} {!p.alive && "· dead"} {!p.connected && "· offline"}
                    </span>
                    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="small-dim">{p.cards} cards</span>
                      <span className={`identity-tag ${p.identity}`}>{IDENTITY_LABEL[p.identity]}</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <button className="btn btn-danger" onClick={onEnd}>
        END ROOM
      </button>
    </div>
  );
}

