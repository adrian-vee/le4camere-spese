interface BottleIndicatorProps {
  fillLevel: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  capacityMl?: number;
  className?: string;
}

const SIZES = { sm: 40, md: 80, lg: 120 };

export default function BottleIndicator({ fillLevel, size = "md", showLabel = false, capacityMl, className }: BottleIndicatorProps) {
  const h = SIZES[size];
  const level = Math.max(0, Math.min(10, fillLevel));
  const uid = `bl-${Math.random().toString(36).slice(2, 8)}`;
  const ml = capacityMl ? Math.round(level * capacityMl / 10) : null;

  return (
    <div className={className} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: size === "sm" ? 2 : 4 }}>
      <svg viewBox="0 0 60 130" width={h * 60 / 130} height={h} xmlns="http://www.w3.org/2000/svg" aria-label={`Bottiglia ${level}/10`}>
        <defs>
          <linearGradient id={`${uid}-liq`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4B96A" />
            <stop offset="50%" stopColor="#BFA762" />
            <stop offset="100%" stopColor="#8B6914" />
          </linearGradient>
          <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#F5F0E8" />
            <stop offset="100%" stopColor="#E8E0D0" />
          </linearGradient>
          <clipPath id={`${uid}-body`}>
            <path d="M24 10 L24 32 Q24 38 18 42 L16 44 Q14 46 14 49 L14 108 Q14 114 20 114 L40 114 Q46 114 46 108 L46 49 Q46 46 44 44 L42 42 Q36 38 36 32 L36 10 Z" />
          </clipPath>
          <clipPath id={`${uid}-neck`}>
            <rect x="24" y="10" width="12" height="22" />
          </clipPath>
        </defs>

        {/* Cap */}
        <rect x="23" y="1" width="14" height="9" rx="2.5" fill="#1F3326" />
        <rect x="25" y="2" width="2" height="7" rx="1" fill="#2D5A3D" opacity="0.4" />

        {/* Bottle body fill (glass) */}
        <path
          d="M24 10 L24 32 Q24 38 18 42 L16 44 Q14 46 14 49 L14 108 Q14 114 20 114 L40 114 Q46 114 46 108 L46 49 Q46 46 44 44 L42 42 Q36 38 36 32 L36 10 Z"
          fill={`url(#${uid}-glass)`}
        />

        {/* Liquid — rises from bottom */}
        {level > 0 && (
          <g clipPath={`url(#${uid}-body)`}>
            {/* Liquid surface wave */}
            <rect
              x="14"
              y={114 - level * 10.4}
              width="32"
              height={level * 10.4}
              fill={`url(#${uid}-liq)`}
              style={{ transition: "y 0.3s ease, height 0.3s ease" }}
            />
            {/* Surface highlight */}
            <ellipse
              cx="30"
              cy={114 - level * 10.4}
              rx="14"
              ry="2.5"
              fill="#D4B96A"
              opacity="0.5"
              style={{ transition: "cy 0.3s ease" }}
            />
            {/* Liquid in neck when level >= 8 */}
            {level >= 8 && (
              <rect
                x="24"
                y={32 - (level - 8) * 11}
                width="12"
                height={(level - 8) * 11}
                fill={`url(#${uid}-liq)`}
                clipPath={`url(#${uid}-neck)`}
                style={{ transition: "y 0.3s ease, height 0.3s ease" }}
              />
            )}
          </g>
        )}

        {/* Bottle outline */}
        <path
          d="M24 10 L24 32 Q24 38 18 42 L16 44 Q14 46 14 49 L14 108 Q14 114 20 114 L40 114 Q46 114 46 108 L46 49 Q46 46 44 44 L42 42 Q36 38 36 32 L36 10 Z"
          fill="none"
          stroke="#1F3326"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Glass reflection */}
        <line x1="19" y1="50" x2="19" y2="108" stroke="white" strokeWidth="1.8" opacity="0.35" strokeLinecap="round" />
        <line x1="22" y1="46" x2="22" y2="55" stroke="white" strokeWidth="1" opacity="0.2" strokeLinecap="round" />

        {/* Base */}
        <rect x="12" y="114" width="36" height="5" rx="2.5" fill="#1F3326" />
        <rect x="14" y="114" width="32" height="2" rx="1" fill="#2D5A3D" opacity="0.3" />

        {/* Shoulder line */}
        <path d="M24 32 Q24 38 18 42" fill="none" stroke="#1F3326" strokeWidth="0.5" opacity="0.3" />
        <path d="M36 32 Q36 38 42 42" fill="none" stroke="#1F3326" strokeWidth="0.5" opacity="0.3" />

        {/* Label area */}
        <rect x="18" y="68" width="24" height="28" rx="3" fill="none" stroke="#D8CCB8" strokeWidth="0.8" opacity="0.5" />
        <rect x="22" y="76" width="16" height="1.5" rx="0.75" fill="#D8CCB8" opacity="0.4" />
        <rect x="24" y="80" width="12" height="1" rx="0.5" fill="#D8CCB8" opacity="0.3" />
      </svg>
      {showLabel && (
        <div style={{ textAlign: "center", lineHeight: 1.2 }}>
          <div style={{ fontSize: size === "sm" ? 10 : size === "md" ? 12 : 14, fontWeight: 700, color: "#1F3326" }}>
            {level}/10
          </div>
          {ml !== null && (
            <div style={{ fontSize: size === "sm" ? 9 : size === "md" ? 11 : 12, color: "#8A7355" }}>
              ~{ml}ml
            </div>
          )}
        </div>
      )}
    </div>
  );
}
