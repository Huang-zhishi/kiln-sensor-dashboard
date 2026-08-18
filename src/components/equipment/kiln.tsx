import React from 'react';

export interface KilnProps {
  x: number;
  y: number;
  width?: number;
  height?: number;
  label: string;
  labelId?: string;
  rotation?: number; // 0=水平, 90=垂直
  showFlame?: boolean;
}

export function Kiln({
  x,
  y,
  width = 300,
  height = 80,
  label,
  labelId,
  rotation = 0,
  showFlame = true,
}: KilnProps) {
  return (
    <g transform={`translate(${x}, ${y}) rotate(${rotation})`}>
      {/* 窑体 */}
      <rect
        x="0"
        y="0"
        width={width}
        height={height}
        rx="10"
        fill="url(#kilnGradient)"
        stroke="#64748b"
        strokeWidth="2"
      />
      {/* 窑体纹理 */}
      <line
        x1="20"
        y1="0"
        x2="20"
        y2={height}
        stroke="#475569"
        strokeWidth="1"
        opacity="0.5"
      />
      <line
        x1={width - 20}
        y1="0"
        x2={width - 20}
        y2={height}
        stroke="#475569"
        strokeWidth="1"
        opacity="0.5"
      />
      {/* 火焰 */}
      {showFlame && (
        <g transform={`translate(${width - 40}, ${height / 2 - 15})`}>
          <path
            d="M 0,15 Q 5,0 10,15 Q 15,5 20,15 Q 25,0 30,15 Z"
            fill="#ef4444"
            opacity="0.8"
          >
            <animate
              attributeName="d"
              values="M 0,15 Q 5,0 10,15 Q 15,5 20,15 Q 25,0 30,15 Z;M 0,15 Q 5,5 10,15 Q 15,10 20,15 Q 25,5 30,15 Z;M 0,15 Q 5,0 10,15 Q 15,5 20,15 Q 25,0 30,15 Z"
              dur="0.5s"
              repeatCount="indefinite"
            />
          </path>
        </g>
      )}
      {/* 标签 */}
      <text
        x={width / 2}
        y={height / 2 + 5}
        textAnchor="middle"
        fill="#1e293b"
        fontSize="16"
        fontWeight="bold"
      >
        {label}
      </text>
      {labelId && (
        <text
          x={width / 2}
          y={-10}
          textAnchor="middle"
          fill="#e2e8f0"
          fontSize="12"
        >
          {labelId}
        </text>
      )}
    </g>
  );
}
