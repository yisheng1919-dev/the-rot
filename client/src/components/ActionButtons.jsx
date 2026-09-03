import React from "react";

export default function ActionButtons({
  showRestorePower,
  showMeeting,
  showMap,
  showSteal,
  stealBusy,
  onRestorePower,
  onCallMeeting,
  onOpenMap,
  onSteal,
  powerRestoreCount = 0,
  powerRestoreNeeded = 0,
}) {
  return (
    <div className="action-stack">
      {showRestorePower && (
        <button className="action-btn power" onClick={onRestorePower}>
          {powerRestoreNeeded > 1
            ? `⚡ RESTORE POWER (${powerRestoreCount}/${powerRestoreNeeded})`
            : "⚡ RESTORE POWER"}
        </button>
      )}
      {showSteal && (
        <button className="action-btn steal" onClick={onSteal} disabled={stealBusy}>
          🕳 STEAL CARD
        </button>
      )}
      {showMeeting && (
        <button className="action-btn meeting" onClick={onCallMeeting}>
          📣 CALL MEETING
        </button>
      )}
      {showMap && (
        <button className="action-btn map" onClick={onOpenMap}>
          🗺 SEE THE MAP
        </button>
      )}
    </div>
  );
}
