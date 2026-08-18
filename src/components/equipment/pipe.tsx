import React from 'react';

export interface PipeProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  width?: number;
  dashed?: boolean;
  arrows?: boolean;
  arrowDirection?: 'forward' | 'backward' | 'both';
  label?: string;
  labelPosition?: 'start' | 'middle' | 'end';
}

export function Pipe({
  x1,
  y1,
  x2,
  y2,
  color = '#06b6d4',
  width = 3,
  dashed = false,
  arrows = true,
  arrowDirection = 'forward',
  label,
  labelPosition = 'middle',
}: PipeProps) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  const arrowSize = 8;

  // 计算箭头位置
  const getArrowTransform = (offset: number) => {
    const t = offset / length;
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    return `translate(${px}, ${py}) rotate(${angle})`;
  };

  // 计算标签位置
  const getLabelPosition = () => {
    let t = 0.5;
    if (labelPosition === 'start') t = 0.15;
    if (labelPosition === 'end') t = 0.85;
    return {
      x: x1 + dx * t,
      y: y1 + dy * t - 12,
    };
  };

  const labelPos = getLabelPosition();

  return (
    <g>
      {/* 管道 */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dashed ? '6,4' : undefined}
        fill="none"
      />
      {/* 箭头 */}
      {arrows && (
        <>
          {(arrowDirection === 'forward' || arrowDirection === 'both') && (
            <g transform={getArrowTransform(length - arrowSize)}>
              <polygon
                points={`0,0 ${-arrowSize},${-arrowSize / 2} ${-arrowSize},${arrowSize / 2}`}
                fill={color}
              />
            </g>
          )}
          {(arrowDirection === 'backward' || arrowDirection === 'both') && (
            <g transform={getArrowTransform(arrowSize)}>
              <polygon
                points={`0,0 ${arrowSize},${-arrowSize / 2} ${arrowSize},${arrowSize / 2}`}
                fill={color}
              />
            </g>
          )}
        </>
      )}
      {/* 标签 */}
      {label && (
        <text
          x={labelPos.x}
          y={labelPos.y}
          textAnchor="middle"
          fill="#e2e8f0"
          fontSize="11"
          fontWeight="bold"
        >
          {label}
        </text>
      )}
    </g>
  );
}

export interface CurvedPipeProps {
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  x2: number;
  y2: number;
  color?: string;
  width?: number;
  arrows?: boolean;
  label?: string;
}

export function CurvedPipe({
  x1,
  y1,
  cx,
  cy,
  x2,
  y2,
  color = '#06b6d4',
  width = 3,
  arrows = true,
  label,
}: CurvedPipeProps) {
  const path = `M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`;

  // 计算终点切线角度
  const t = 0.95;
  const endX = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2;
  const endY = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;
  const angle = (Math.atan2(y2 - endY, x2 - endX) * 180) / Math.PI;

  // 计算标签位置（中点）
  const midT = 0.5;
  const midX = (1 - midT) * (1 - midT) * x1 + 2 * (1 - midT) * midT * cx + midT * midT * x2;
  const midY = (1 - midT) * (1 - midT) * y1 + 2 * (1 - midT) * midT * cy + midT * midT * y2;

  return (
    <g>
      <path d={path} stroke={color} strokeWidth={width} fill="none" />
      {arrows && (
        <g transform={`translate(${x2}, ${y2}) rotate(${angle})`}>
          <polygon
            points={`0,0 -8,-4 -8,4`}
            fill={color}
          />
        </g>
      )}
      {label && (
        <text
          x={midX}
          y={midY - 12}
          textAnchor="middle"
          fill="#e2e8f0"
          fontSize="11"
          fontWeight="bold"
        >
          {label}
        </text>
      )}
    </g>
  );
}
