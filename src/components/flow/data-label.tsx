'use client';

interface DataLabelProps {
  x: number;
  y: number;
  items: { label: string; value: string | number; unit: string }[];
  color?: 'cyan' | 'yellow' | 'green';
}

const colorMap = {
  cyan: { bg: 'rgba(0, 180, 220, 0.15)', border: '#00b4dc', text: '#00e5ff' },
  yellow: { bg: 'rgba(255, 200, 0, 0.15)', border: '#ffc800', text: '#ffe066' },
  green: { bg: 'rgba(0, 220, 130, 0.15)', border: '#00dc82', text: '#66ffaa' },
};

export function DataLabel({ x, y, items, color = 'cyan' }: DataLabelProps) {
  const c = colorMap[color];
  const height = items.length * 22 + 12;

  return (
    <foreignObject x={x} y={y} width={140} height={height}>
      <div
        style={{
          background: c.bg,
          border: `1px solid ${c.border}`,
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 12,
          fontFamily: "'JetBrains Mono', monospace",
          color: c.text,
          lineHeight: '20px',
          whiteSpace: 'nowrap',
        }}
      >
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 6 }}>
            <span style={{ color: '#94a3b8' }}>{item.label}:</span>
            <span style={{ color: c.text, fontWeight: 600 }}>{item.value}</span>
            <span style={{ color: '#64748b', fontSize: 10 }}>{item.unit}</span>
          </div>
        ))}
      </div>
    </foreignObject>
  );
}
