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
      >
        {/* Classic mouse-pointer silhouette instead of a plain triangle —
            same rotation logic as before, just a different tip shape. */}
        <svg viewBox="0 0 24 24" width="56" height="56">
          {/* Cursor-arrow tip points straight up at rest (0deg), matching
              the "0deg = ahead" convention the rotation math above uses —
              a stock mouse-pointer icon's tip normally points up-and-left,
              which would throw the heading off by ~20deg once rotated. */}
          <path
            d="M12 2 L12 18 L15.5 14.8 L18 20.5 L20.3 19.4 L17.6 13.6 L22 13.6 Z"
            fill="var(--emergency-red)"
          />
        </svg>
      </div>
    </>
  );
}