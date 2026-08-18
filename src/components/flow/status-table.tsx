'use client';

interface StatusTableProps {
  data: {
    runTime: { day: number; night: number };
    gasFlow: { day: number; night: number };
    dryWeight: { day: string; night: string };
  };
  isRunning: boolean;
}

export function StatusTable({ data, isRunning }: StatusTableProps) {
  return (
    <div className="absolute bottom-[120px] right-[300px] bg-[rgba(10,20,40,0.85)] border border-[rgba(0,180,220,0.3)] rounded-lg p-4 backdrop-blur-sm">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[#94a3b8] text-sm">当前状态:</span>
        <div
          className={`w-10 h-5 rounded-full relative transition-colors ${
            isRunning ? 'bg-[#10b981]' : 'bg-[#475569]'
          }`}
        >
          <div
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              isRunning ? 'left-5' : 'left-0.5'
            }`}
          />
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-[#64748b] text-left py-1 pr-4"></th>
            <th className="text-[#94a3b8] text-center py-1 px-3">白班</th>
            <th className="text-[#94a3b8] text-center py-1 px-3">夜班</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="text-[#94a3b8] py-1.5 pr-4">运行时长:</td>
            <td className="text-[#00e5ff] text-center font-mono font-bold">{data.runTime.day.toFixed(1)} h</td>
            <td className="text-[#00e5ff] text-center font-mono font-bold">{data.runTime.night.toFixed(1)} h</td>
          </tr>
          <tr>
            <td className="text-[#94a3b8] py-1.5 pr-4">用气流量:</td>
            <td className="text-[#00e5ff] text-center font-mono font-bold">{data.gasFlow.day.toFixed(0)} m³</td>
            <td className="text-[#00e5ff] text-center font-mono font-bold">{data.gasFlow.night.toFixed(1)} m³</td>
          </tr>
          <tr>
            <td className="text-[#94a3b8] py-1.5 pr-4">干燥重量:</td>
            <td className="text-center font-mono font-bold text-[#f59e0b]">{data.dryWeight.day}</td>
            <td className="text-center font-mono font-bold text-[#f59e0b]">{data.dryWeight.night}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
