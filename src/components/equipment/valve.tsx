import React from 'react';

export interface ValveProps {
  x: number;
  y: number;
  size?: number;
  label?: string;
  open?: boolean;
  color?: string;
  vertical?: boolean;
}

export function Valve({
  x,
  y,
  size = 24,
  label,
  open = true,
  color = '#64748b',
  vertical = false,
}: ValveProps) {
  const s = size / 2;

  return (
    <g transform={`translate(${x}, ${y}) ${vertical ? 'rotate(90)' : ''}`}>
      {/* 阀门符号 - 两个三角形相对 */}
      <polygon
        points={`${-s},0 0,${-s} ${s},0`}
        fill={open ? color : '#ef4444'}
        stroke={open ? color : '#ef4444'}
        strokeWidth="1.5"
        opacity="0.8"
      />
      <polygon
        points={`${-s},0 0,${s} ${s},0`}
        fill={open ? color : '#ef4444'}
        stroke={open ? color : '#ef4444'}
        strokeWidth="1.5"
        opacity="0.8"
      />
      {/* 阀杆 */}
      <line
        x1="0"
        y1={-s}
        x2="0"
        y2={-s - 10}
        stroke={color}
        strokeWidth="2"
      />
      {/* 手轮 */}
      <circle cx="0" cy={-s - 12} r="4" fill="none" stroke={color} strokeWidth="1.5" />
      {/* 标签 */}
      {label && (
        <text
          x="0"
          y={s + 14}
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
