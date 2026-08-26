import React, { useRef, useState, useCallback } from "react";

const MAX_RADIUS = 42;

export default function Joystick({ onChange, disabled }) {
  const baseRef = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activePointerId = useRef(null);

  const updateFromEvent = useCallback(
    (clientX, clientY) => {
      const base = baseRef.current;
      if (!base) return;
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > MAX_RADIUS) {
        dx = (dx / dist) * MAX_RADIUS;
        dy = (dy / dist) * MAX_RADIUS;
      }
      setKnob({ x: dx, y: dy });
      onChange?.({ x: dx / MAX_RADIUS, y: dy / MAX_RADIUS });
    },
    [onChange]
  );

  const handlePointerDown = (e) => {
    if (disabled) return;
    activePointerId.current = e.pointerId;
    e.target.setPointerCapture?.(e.pointerId);
    updateFromEvent(e.clientX, e.clientY);
  };

  const handlePointerMove = (e) => {
    if (disabled || activePointerId.current !== e.pointerId) return;
    updateFromEvent(e.clientX, e.clientY);
  };

  const endDrag = (e) => {
    if (activePointerId.current !== e.pointerId) return;
    activePointerId.current = null;
    setKnob({ x: 0, y: 0 });
    onChange?.({ x: 0, y: 0 });
  };

  return (
    <div
      className="joystick-zone"
      style={{ opacity: disabled ? 0.35 : 1 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="joystick-base" ref={baseRef}>
        <div
          className="joystick-knob"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
      </div>
    </div>
  );
}
