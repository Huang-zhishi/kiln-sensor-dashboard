import React from 'react';

export interface DataLabelItem {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
}

export interface DataLabelProps {
  x: number;
  y: number;
  items: DataLabelItem[];
  title?: string;
  width?: number;
  bgColor?: string;
}

export function DataLabel({
  x,
  y,
  items,
  title,
  width = 120,
  bgColor = 'rgba(15, 23, 42, 0.9)',
}: DataLabelProps) {
  const rowHeight = 22;
  const headerHeight = title ? 24 : 0;
  const height = headerHeight + items.length * rowHeight + 8;

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* 背景 */}
      <rect
        x="0"
        y="0"
        width={width}
        height={height}
        rx="4"
        fill={bgColor}
        stroke="#06b6d4"
        strokeWidth="1"
        opacity="0.9"
      />
      {/* 标题 */}
      {title && (
        <>
          <text
            x={width / 2}
            y="16"
            textAnchor="middle"
            fill="#06b6d4"
            fontSize="11"
            fontWeight="bold"
          >
            {title}
          </text>
          <line
            x1="4"
            y1="22"
            x2={width - 4}
            y2="22"
            stroke="#06b6d4"
            strokeWidth="0.5"
            opacity="0.5"
          />
        </>
      )}
      {/* 数据行 */}
      {items.map((item, i) => {
        const rowY = headerHeight + 8 + i * rowHeight + 14;
        const displayColor = item.color || '#e2e8f0';
        return (
          <g key={i}>
            <text
              x="8"
              y={rowY}
              fill="#94a3b8"
              fontSize="11"
            >
              {item.label}
            </text>
            <text
              x={width - 8}
              y={rowY}
              textAnchor="end"
              fill={displayColor}
              fontSize="12"
              fontWeight="bold"
              fontFamily="monospace"
            >
              {item.value}{item.unit ? ` ${item.unit}` : ''}
            </text>
          </g>
        );
      })}
    </g>
  );
}
