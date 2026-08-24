import React from "react";

// A small hibiscus-inspired emblem behind the title — echoes the same
// motif inlaid in Main Hall's floor in-game, drawn as simple original
// geometry rather than any specific real batik/songket design.
function HibiscusEmblem() {
  const petals = Array.from({ length: 5 });
  return (
    <svg width="150" height="150" viewBox="-50 -50 100 100" className="landing-emblem">
      <g opacity="0.85">
        {petals.map((_, i) => (
          <ellipse
            key={i}
            cx="0"
            cy="-18"
            rx="10"
            ry="18"
            fill="none"
            stroke="url(#petalGradient)"
            strokeWidth="1.4"
            transform={`rotate(${(360 / 5) * i})`}
          />
        ))}
        <circle cx="0" cy="0" r="5" fill="none" stroke="var(--neon-cyan)" strokeWidth="1.2" />
      </g>
      <defs>
        <linearGradient id="petalGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--neon-purple)" />
          <stop offset="100%" stopColor="var(--emergency-red)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function Landing({ onChooseHost, onChoosePlayer }) {
  return (
    <div className="menu-screen">
      <div style={{ position: "relative" }}>
        <HibiscusEmblem />
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

