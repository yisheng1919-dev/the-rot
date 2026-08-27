import React from "react";

export default function ActionButtons({
  showRestorePower,
  showMeeting,
  showMap,
  stealTargets,
  onRestorePower,
  onCallMeeting,
  onOpenMap,
  onOpenStealPicker,
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
      {stealTargets && stealTargets.length > 0 && (
        <button className="action-btn steal" onClick={onOpenStealPicker}>
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
