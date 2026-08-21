import React from "react";
import { POWER_ROOM } from "../rooms.js";

/**
 * The camera always looks down the -Z axis with a fixed yaw (see
 * GameScene3D), so "up" on screen == -Z in world space and "right" ==
 * +X. That lets us draw a simple compass-style arrow toward the Power
 * Room without doing a full 3D screen-space projection every frame.
 */
export default function PowerOutageOverlay({ show, playerX, playerZ }) {
  if (!show) return null;

  const targetX = POWER_ROOM.x + POWER_ROOM.w / 2;
  const targetZ = POWER_ROOM.z + POWER_ROOM.d / 2;
  const dx = targetX - playerX;
  const dz = targetZ - playerZ;
  const angleRad = Math.atan2(dx, -dz); // 0 = up, clockwise positive
  const angleDeg = (angleRad * 180) / Math.PI;

  return (
    <>
      <div className="blackout-overlay" />
      <div
        className="power-arrow"
        style={{
          top: "22%",
          left: "50%",
          transform: `translate(-50%, -50%) rotate(${angleDeg}deg)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "27%",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 6,
          color: "var(--emergency-red)",
          fontWeight: 800,
          fontSize: 12,
          letterSpacing: 1,
          textShadow: "0 0 8px rgba(255,77,94,0.8)",
        }}
      >
        POWER ROOM
      </div>
    </>
  );
}
