import React from 'react';

export interface FanProps {
  x: number;
  y: number;
  size?: number;
  label: string;
  labelId?: string;
  color?: string;
  spinning?: boolean;
}

export function Fan({
  x,
  y,
  size = 40,
  label,
  labelId,
  color = '#64748b',
  spinning = true,
}: FanProps) {
  const r = size / 2;

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* 外壳 */}
      <circle cx="0" cy="0" r={r} fill="#1e293b" stroke={color} strokeWidth="2" />
      {/* 叶片 */}
      <g>
        {[0, 60, 120, 180, 240, 300].map((angle) => (
          <line
            key={angle}
            x1="0"
            y1="0"
            x2={r * 0.8 * Math.cos((angle * Math.PI) / 180)}
            y2={r * 0.8 * Math.sin((angle * Math.PI) / 180)}
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
          />
        ))}
        {spinning && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0"
            to="360"
            dur="2s"
            repeatCount="indefinite"
          />
        )}
      </g>
      {/* 中心 */}
      <circle cx="0" cy="0" r={r * 0.2} fill={color} />
      {/* 标签 */}
      <text
        x="0"
        y={-r - 8}
        textAnchor="middle"
        fill="#e2e8f0"
        fontSize="12"
        fontWeight="bold"
      >
        {label}
      </text>
      {labelId && (
        <text
          x="0"
          y={r + 16}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize="10"
        >
          {labelId}
        </text>
      )}
    </g>
  );
}
