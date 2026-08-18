import React from 'react';

export interface MotorProps {
  x: number;
  y: number;
  size?: number;
  label?: string;
  color?: string;
  running?: boolean;
}

export function Motor({
  x,
  y,
  size = 28,
  label,
  color = '#64748b',
  running = true,
}: MotorProps) {
  const r = size / 2;

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* 电机外壳 */}
      <circle
        cx="0"
        cy="0"
        r={r}
        fill="#1e293b"
        stroke={color}
        strokeWidth="2"
      />
      {/* M 标志 */}
      <text
        x="0"
        y="4"
        textAnchor="middle"
        fill={running ? '#10b981' : '#ef4444'}
        fontSize="14"
        fontWeight="bold"
        fontFamily="monospace"
      >
        M
      </text>
      {/* 运行指示 */}
      {running && (
        <circle cx="0" cy="0" r={r + 3} fill="none" stroke="#10b981" strokeWidth="1" opacity="0.5">
          <animate
            attributeName="r"
            values={`${r + 2};${r + 6};${r + 2}`}
            dur="1.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.5;0;0.5"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </circle>
      )}
      {/* 标签 */}
      {label && (
        <text
          x="0"
          y={-r - 6}
          textAnchor="middle"
          fill="#e2e8f0"
          fontSize="10"
        >
          {label}
        </text>
      )}
    </g>
  );
}
