import React, { useState } from "react";
import { TOKENOMICS } from "../lib/constants";

const TOTAL = 1_000_000_000;

export default function TokenomicsChart() {
  const [hovered, setHovered] = useState<number | null>(null);

  // Build SVG donut segments
  const cx = 100, cy = 100, r = 70, stroke = 28;
  const circumference = 2 * Math.PI * r;
  let cumulative = 0;

  const segments = TOKENOMICS.map((t, i) => {
    const fraction    = t.pct / 100;
    const dashArray   = `${fraction * circumference} ${(1 - fraction) * circumference}`;
    const dashOffset  = -(cumulative / 100) * circumference;
    cumulative       += t.pct;
    return { ...t, dashArray, dashOffset, i };
  });

  const active = hovered !== null ? TOKENOMICS[hovered] : null;

  return (
    <div className="panel">
      <h3 className="section-title mb-1">Tokenomics</h3>
      <p className="section-subtitle mb-5">1,000,000,000 SAW — fixed, auditable, immutable from State 1</p>

      <div className="flex flex-col sm:flex-row items-center gap-8">
        {/* SVG Donut */}
        <div className="relative flex-shrink-0">
          <svg width="200" height="200" viewBox="0 0 200 200" className="overflow-visible">
            {/* Background circle */}
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1a26" strokeWidth={stroke + 4} />

            {segments.map((seg) => (
              <circle
                key={seg.label}
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={hovered === seg.i ? stroke + 6 : stroke}
                strokeDasharray={seg.dashArray}
                strokeDashoffset={seg.dashOffset}
                strokeLinecap="butt"
                className="cursor-pointer transition-all duration-200"
                style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px` }}
                onMouseEnter={() => setHovered(seg.i)}
                onMouseLeave={() => setHovered(null)}
                opacity={hovered !== null && hovered !== seg.i ? 0.5 : 1}
              />
            ))}

            {/* Center text */}
            <text x={cx} y={cy - 8}  textAnchor="middle" fontSize="22" fontWeight="700" fill={active?.color ?? "#e2e8f0"} fontFamily="Space Grotesk">
              {active ? `${active.pct}%` : "SAW"}
            </text>
            <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9"  fill="#64748b" fontFamily="Inter">
              {active ? active.label : "1B Total"}
            </text>
            {active && (
              <text x={cx} y={cy + 26} textAnchor="middle" fontSize="8" fill="#475569" fontFamily="JetBrains Mono">
                {(active.pct * 10_000_000).toLocaleString()} SAW
              </text>
            )}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-3 w-full">
          {TOKENOMICS.map((t, i) => (
            <div
              key={t.label}
              className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all duration-200
                ${hovered === i ? "bg-dark-600 border border-white/10" : "hover:bg-dark-700"}`}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                <div>
                  <div className="text-sm font-medium text-slate-200">{t.label}</div>
                  <div className="text-xs text-slate-600">{t.state}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold" style={{ color: t.color }}>{t.pct}%</div>
                <div className="text-xs text-slate-600 font-mono">
                  {(t.pct * 10_000_000).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="divider" />
      <p className="text-xs text-slate-600 text-center italic">
        "The distribution is fixed, auditable, and unchangeable from State 1."
      </p>
    </div>
  );
}
