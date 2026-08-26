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
  const distance = Math.round(Math.hypot(dx, dz));

  // Plain-language direction so it reads instantly even in a rush.
  let directionWord = "AHEAD";
  const deg = ((angleDeg % 360) + 360) % 360;
  if (deg > 25 && deg < 155) directionWord = "TURN RIGHT";
  else if (deg > 205 && deg < 335) directionWord = "TURN LEFT";
  else if (deg >= 155 && deg <= 205) directionWord = "BEHIND YOU";

  return (
    <>
      <div className="power-guide-panel">
        <div className="heading">⚡ HEAD TO THE POWER ROOM — {directionWord}</div>
        <div className="distance">{distance}m away · drag the glowing circle (bottom-left) to move</div>
      </div>

      <div
        className="power-arrow"
        style={{
          top: "34%",
          left: "50%",
          transform: `translate(-50%, -50%) rotate(${angleDeg}deg)`,
        }}
      />
    </>
  );
}

