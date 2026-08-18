import React from 'react';

export interface PumpProps {
  x: number;
  y: number;
  size?: number;
  label: string;
  labelId?: string;
  color?: string;
}

export function Pump({
  x,
  y,
  size = 36,
  label,
  labelId,
  color = '#64748b',
}: PumpProps) {
  const r = size / 2;

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* 泵体 */}
      <circle cx="0" cy="0" r={r} fill="#1e293b" stroke={color} strokeWidth="2" />
      {/* 泵符号 */}
      <path
        d={`M ${-r * 0.5},0 L 0,${-r * 0.5} L ${r * 0.5},0 L 0,${r * 0.5} Z`}
        fill={color}
        opacity="0.6"
      />
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
