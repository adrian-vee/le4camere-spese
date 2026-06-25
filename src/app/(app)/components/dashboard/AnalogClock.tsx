"use client";
import { useEffect, useRef, useState } from "react";

export default function AnalogClock() {
  const [time, setTime] = useState(() => new Date());
  const raf = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      setTime(new Date());
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const h = time.getHours() % 12;
  const m = time.getMinutes();
  const s = time.getSeconds();
  const ms = time.getMilliseconds();

  const sDeg = (s + ms / 1000) * 6;
  const mDeg = (m + s / 60) * 6;
  const hDeg = (h + m / 60) * 30;

  const cx = 40, cy = 40, r = 36;
  const digital = `${String(time.getHours()).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

  // Hour markers
  const markers = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * 30 - 90) * (Math.PI / 180);
    const numR = r - 8;
    const tickOuterR = r - 2;
    const tickInnerR = i % 3 === 0 ? r - 6 : r - 4;
    return {
      num: i === 0 ? 12 : i,
      nx: cx + numR * Math.cos(angle),
      ny: cy + numR * Math.sin(angle),
      x1: cx + tickOuterR * Math.cos(angle),
      y1: cy + tickOuterR * Math.sin(angle),
      x2: cx + tickInnerR * Math.cos(angle),
      y2: cy + tickInnerR * Math.sin(angle),
      major: i % 3 === 0,
    };
  });

  function hand(deg: number, len: number, width: number, color: string, round = false) {
    const rad = (deg - 90) * (Math.PI / 180);
    const x2 = cx + len * Math.cos(rad);
    const y2 = cy + len * Math.sin(rad);
    // Small tail
    const tailLen = len * 0.2;
    const x1 = cx - tailLen * Math.cos(rad);
    const y1 = cy - tailLen * Math.sin(rad);
    return (
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color} strokeWidth={width}
        strokeLinecap={round ? "round" : "butt"}
      />
    );
  }

  return (
    <div className="analog-clock-wrap">
      <svg width="80" height="80" viewBox="0 0 80 80" className="analog-clock-svg">
        {/* Dial */}
        <circle cx={cx} cy={cy} r={r} fill="#FAF9F5" stroke="#D8CCB8" strokeWidth="1.2" />
        {/* Inner ring */}
        <circle cx={cx} cy={cy} r={r - 1} fill="none" stroke="#E8E0D0" strokeWidth="0.3" />

        {/* Tick marks */}
        {markers.map((mk, i) => (
          <line key={i} x1={mk.x1} y1={mk.y1} x2={mk.x2} y2={mk.y2}
            stroke={mk.major ? "#1F3326" : "#D8CCB8"} strokeWidth={mk.major ? 1.2 : 0.6} />
        ))}

        {/* Hour numbers (only at 12, 3, 6, 9) */}
        {markers.filter(mk => mk.major).map(mk => (
          <text key={mk.num} x={mk.nx} y={mk.ny + 1}
            textAnchor="middle" dominantBaseline="central"
            fill="#1F3326" fontSize="7.5" fontFamily="'Fraunces', serif" fontWeight="500">
            {mk.num}
          </text>
        ))}

        {/* Hour hand */}
        {hand(hDeg, 18, 2.4, "#1F3326", true)}
        {/* Minute hand */}
        {hand(mDeg, 26, 1.6, "#1F3326", true)}
        {/* Second hand */}
        {hand(sDeg, 28, 0.6, "#BFA762")}

        {/* Center dot */}
        <circle cx={cx} cy={cy} r="2.5" fill="#BFA762" />
        <circle cx={cx} cy={cy} r="1" fill="#1F3326" />
      </svg>
      <div className="analog-clock-digital">{digital}</div>
    </div>
  );
}
