'use client';

interface BottomNavProps {
  active: string;
  onChange: (system: string) => void;
}

const systems = [
  { id: 'reduction-1', label: '1#还原系统' },
  { id: 'reduction-2', label: '2#还原系统' },
  { id: 'compression', label: '化合压滤' },
  { id: 'oxidation', label: '四锰氧化' },
  { id: 'drying', label: '四锰干燥' },
  { id: 'main', label: '主画面' },
  { id: 'energy', label: '能源看板' },
];

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 px-6 py-3 bg-[rgba(10,20,40,0.9)] border-t border-[rgba(0,180,220,0.2)] backdrop-blur-sm">
      {systems.map((sys) => (
        <button
          key={sys.id}
          onClick={() => onChange(sys.id)}
          className={`px-5 py-2 rounded text-sm font-medium transition-all ${
            active === sys.id
              ? 'bg-[rgba(0,180,220,0.3)] text-[#00e5ff] border border-[#00b4dc] shadow-[0_0_10px_rgba(0,180,220,0.3)]'
              : 'bg-[rgba(30,50,80,0.5)] text-[#94a3b8] border border-[rgba(100,140,180,0.2)] hover:bg-[rgba(0,180,220,0.1)] hover:text-[#00e5ff]'
          }`}
        >
          {sys.label}
        </button>
      ))}
    </div>
  );
}
