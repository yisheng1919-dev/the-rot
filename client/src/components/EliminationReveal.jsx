import React from "react";

const IDENTITY_LABEL = {
  INNOCENT: "INNOCENT",
  CORRUPTED: "CORRUPTED",
  ORIGINAL_CORRUPTED: "THE ORIGINAL CORRUPTED",
};

export function EliminationRevealModal({ data }) {
  if (!data) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-title danger">ELIMINATED</div>
        <div style={{ fontSize: 24, fontWeight: 800 }}>{data.displayName}</div>
        <div className={`identity-tag ${data.identity}`}>{IDENTITY_LABEL[data.identity]}</div>
      </div>
    </div>
  );
}

export function PlayerDiedToast({ data, onDismiss }) {
  if (!data) return null;
  return (
    <div className="error-toast" style={{ background: "var(--bg-panel-2)", border: "1px solid var(--border-soft)" }} onClick={onDismiss}>
      {data.displayName} has died.
    </div>
  );
}
