'use client';

import Link from 'next/link';

interface Filters {
  kiln_id: string;
}

interface FilterBarProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  kilns: string[];
}

export function FilterBar({ filters, onFilterChange, kilns }: FilterBarProps) {
  const handleChange = (key: keyof Filters, value: string) => {
    onFilterChange({ ...filters, [key]: value });
  };

  return (
    <div className="panel px-4 py-2.5">
      <div className="flex items-center gap-4">
        {/* Kiln filter */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground uppercase tracking-wider whitespace-nowrap">窑体</label>
          <select
            className="filter-select"
            value={filters.kiln_id}
            onChange={(e) => handleChange('kiln_id', e.target.value)}
          >
            <option value="">全部</option>
            {kilns.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Navigation buttons */}
        <Link
          href="/sensors"
          className="px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-2 text-foreground hover:bg-card-hover border border-border-strong bg-card"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          传感器趋势图
        </Link>
        <Link
          href="/process"
          className="px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-2 text-foreground hover:bg-card-hover border border-border-strong bg-card"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          工艺流程
        </Link>
      </div>
    </div>
  );
}
