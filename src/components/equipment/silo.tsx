import React from 'react';

export interface SiloProps {
  x: number;
  y: number;
  width?: number;
  height?: number;
  label: string;
  labelId?: string;
  fill?: string;
  stroke?: string;
  level?: number; // 0-100 料位百分比
  showLevel?: boolean;
}

export function Silo({
  x,
  y,
  width = 120,
  height = 160,
  label,
  labelId,
  fill = '#c0c0c0',
  stroke = '#808080',
  level = 50,
  showLevel = true,
}: SiloProps) {
  const levelHeight = (height * level) / 100;

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* 仓体 */}
      <path
        d={`M 0,0 L ${width},0 L ${width},${height * 0.7} L ${width / 2},${height} L 0,${height * 0.7} Z`}
        fill={fill}
        stroke={stroke}
        strokeWidth="2"
      />
      {/* 料位 */}
      {showLevel && (
        <path
          d={`M 2,${height * 0.7 - levelHeight + 2} L ${width - 2},${height * 0.7 - levelHeight + 2} L ${width / 2},${height - 2} L 2,${height - 2} Z`}
          fill="url(#materialGradient)"
          opacity="0.8"
        />
      )}
      {/* 标签 */}
      <text
        x={width / 2}
        y={-10}
        textAnchor="middle"
        fill="#e2e8f0"
        fontSize="14"
        fontWeight="bold"
      >
        {label}
      </text>
      {labelId && (
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          fill="#64748b"
          fontSize="12"
        >
          {labelId}
        </text>
      )}
    </g>
  );
}
