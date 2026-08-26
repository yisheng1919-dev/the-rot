import React, { useState } from "react";

const ROLE_INFO = {
  ORIGINAL_CORRUPTED: {
    label: "THE ORIGINAL CORRUPTED",
    className: "role-oc",
    objective:
      "You are the source of the rot. Steal cards to corrupt others, and make sure the Corrupted outnumber the Innocents by the end of Round 3 — or avoid ever being voted out.",
  },
  CORRUPTED: {
    label: "CORRUPTED",
    className: "role-corrupted",
    objective:
      "You've been turned. Blend in, help steal cards, and help the Corrupted outnumber the Innocents by the end of Round 3.",
  },
  INNOCENT: {
    label: "INNOCENT",
    className: "role-innocent",
    objective:
      "Restore power each round, watch for suspicious behavior, and vote out the Original Corrupted before Round 3 ends.",
  },
};

export default function RoleReveal({ isOC, isCorrupted, onDismiss }) {
  const [flipped, setFlipped] = useState(false);
  const identity = isOC ? "ORIGINAL_CORRUPTED" : isCorrupted ? "CORRUPTED" : "INNOCENT";
  const info = ROLE_INFO[identity];

  return (
    <div className="modal-backdrop">
      <div className="role-reveal-wrap">
        <div
          className={`role-card ${flipped ? "flipped" : ""}`}
          onClick={() => !flipped && setFlipped(true)}
        >
          <div className="role-card-face role-card-back">
            <div className="role-card-question">?</div>
            <div className="role-card-tap">TAP TO REVEAL YOUR ROLE</div>
          </div>
          <div className={`role-card-face role-card-front ${info.className}`}>
            <div className="role-card-label">{info.label}</div>
            <div className="role-card-objective">{info.objective}</div>
          </div>
        </div>

        {flipped && (
          <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={onDismiss}>
            GOT IT — LET'S GO
          </button>
        )}
      </div>
    </div>
  );
}
