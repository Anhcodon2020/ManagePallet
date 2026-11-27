import React, { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { PalletRecord, PalletSource } from '../types/pallet';

interface DefectDistributionPieChartProps {
  records: PalletRecord[];
}

type PieViewMode = 'compare' | 'all' | 'factory' | 'warehouse';

interface DefectSlice {
  name: string;
  value: number;
  percent: number;
  color: string;
}

const DEFECT_COLORS = [
  '#0f172a', // Slate 900
  '#2563eb', // Blue 600
  '#d97706', // Amber 600
  '#dc2626', // Red 600
  '#059669', // Emerald 600
  '#7c3aed', // Violet 600
  '#0891b2', // Cyan 600
  '#ea580c', // Orange 600
];

const OTHER_COLOR = '#94a3b8';
const MAX_NAMED_SLICES = 7;

function buildSlices(
  records: PalletRecord[],
  colorMap: Map<string, string>,
  sourceFilter?: PalletSource
): { slices: DefectSlice[]; totalDefects: number; palletCount: number } {
  const filtered = sourceFilter
    ? records.filter((r) => r.source === sourceFilter)
    : records;

  const counter = new Map<string, number>();
  filtered.forEach((rec) => {
    rec.defectTypes.forEach((raw) => {
      const label = raw.trim();
      if (!label) return;
      counter.set(label, (counter.get(label) ?? 0) + 1);
    });
  });

  const sorted = Array.from(counter.entries()).sort((a, b) => b[1] - a[1]);
  const totalDefects = sorted.reduce((sum, [, count]) => sum + count, 0);

  if (totalDefects === 0) {
    return { slices: [], totalDefects: 0, palletCount: filtered.length };
  }

  const topEntries = sorted.slice(0, MAX_NAMED_SLICES);
  const tailEntries = sorted.slice(MAX_NAMED_SLICES);
  const tailCount = tailEntries.reduce((sum, [, count]) => sum + count, 0);

  const slices: DefectSlice[] = topEntries.map(([name, value]) => ({
    name,
    value,
    percent: (value / totalDefects) * 100,
    color: colorMap.get(name) ?? OTHER_COLOR,
  }));

  if (tailCount > 0) {
    slices.push({
      name: 'Lỗi khác',
      value: tailCount,
      percent: (tailCount / totalDefects) * 100,
      color: OTHER_COLOR,
    });
  }

  return { slices, totalDefects, palletCount: filtered.length };
}

interface SingleDonutPanelProps {
  title: string;
  subtitle: string;
  slices: DefectSlice[];
  totalDefects: number;
  palletCount: number;
  emptyText: string;
  wideLayout?: boolean;
}

const SingleDonutPanel: React.FC<SingleDonutPanelProps> = ({
  title,
  subtitle,
  slices,
  totalDefects,
  palletCount,
  emptyText,
  wideLayout = false,
}) => {
  return (
    <div className="rounded-lg border border-slate-200/80 bg-slate-50/40 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-800">
            {title}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
        <span className="font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap shrink-0">
          {palletCount} pallet · {totalDefects} lượt lỗi
        </span>
      </div>

      {slices.length === 0 ? (
        <div className="flex h-52 items-center justify-center text-xs text-slate-500">
          {emptyText}
        </div>
      ) : (
        <div
          className={`mt-4 grid grid-cols-1 items-center gap-4 ${
            wideLayout ? 'md:grid-cols-12' : 'sm:grid-cols-12'
          }`}
        >
          {/* Recharts PieChart */}
          <div
            className={`relative h-52 w-full ${
              wideLayout ? 'md:col-span-5' : 'sm:col-span-6'
            }`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={82}
                  paddingAngle={slices.length > 1 ? 2 : 0}
                  stroke="#ffffff"
                  strokeWidth={2}
                >
                  {slices.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => {
                    const num = typeof value === 'number' ? value : Number(value ?? 0);
                    const pct =
                      totalDefects > 0 ? ((num / totalDefects) * 100).toFixed(1) : '0.0';
                    return [`${num} lượt (${pct}%)`, String(name ?? '')];
                  }}
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Centered Total Label */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums leading-none">
                {totalDefects}
              </span>
              <span className="mt-1 text-[11px] font-medium text-slate-500">
                lượt lỗi
              </span>
            </div>
          </div>

          {/* Crisp Tabular Breakdown Legend */}
          <ul
            className={`space-y-2 ${
              wideLayout ? 'md:col-span-7' : 'sm:col-span-6'
            }`}
          >
            {slices.map((slice) => (
              <li
                key={slice.name}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-xs"
                    style={{ backgroundColor: slice.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-slate-700" title={slice.name}>
                    {slice.name}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2 font-mono tabular-nums">
                  <span className="font-semibold text-slate-900">
                    {slice.percent.toFixed(1)}%
                  </span>
                  <span className="text-slate-500">({slice.value})</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export const DefectDistributionPieChart: React.FC<
  DefectDistributionPieChartProps
> = ({ records }) => {
  const [viewMode, setViewMode] = useState<PieViewMode>('compare');

  const { allData, factoryData, warehouseData } = useMemo(() => {
    // Build a global color map ranked by overall defect frequency so identical defect types
    // always keep the exact same color across Nhà máy, Kho, and Tổng hợp charts.
    const globalCounter = new Map<string, number>();
    records.forEach((rec) => {
      rec.defectTypes.forEach((raw) => {
        const label = raw.trim();
        if (!label) return;
        globalCounter.set(label, (globalCounter.get(label) ?? 0) + 1);
      });
    });

    const colorMap = new Map<string, string>();
    Array.from(globalCounter.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([label], idx) => {
        colorMap.set(label, DEFECT_COLORS[idx % DEFECT_COLORS.length]);
      });

    return {
      allData: buildSlices(records, colorMap),
      factoryData: buildSlices(records, colorMap, 'Nhà máy'),
      warehouseData: buildSlices(records, colorMap, 'Kho'),
    };
  }, [records]);

  const tabs: Array<{ id: PieViewMode; label: string }> = [
    { id: 'compare', label: 'Nhà máy vs Kho' },
    { id: 'all', label: 'Tất cả' },
    { id: 'factory', label: 'Pallet Nhà máy' },
    { id: 'warehouse', label: 'Pallet Kho' },
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Tỷ lệ phân bổ loại lỗi theo nguồn pallet
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Biểu đồ tròn hiển thị cơ cấu từng loại lỗi hư hỏng phân tách giữa Pallet Nhà máy và Pallet Kho
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Chế độ xem tỷ lệ lỗi theo nguồn pallet"
          className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1"
        >
          {tabs.map((tab) => {
            const active = viewMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setViewMode(tab.id)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        {viewMode === 'compare' && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SingleDonutPanel
              title="Pallet Nhà máy"
              subtitle="Phân bổ tỷ lệ lỗi trên pallet nguồn nhà máy"
              slices={factoryData.slices}
              totalDefects={factoryData.totalDefects}
              palletCount={factoryData.palletCount}
              emptyText="Chưa ghi nhận lỗi cụ thể cho Pallet Nhà máy."
            />
            <SingleDonutPanel
              title="Pallet Kho"
              subtitle="Phân bổ tỷ lệ lỗi trên pallet nguồn kho"
              slices={warehouseData.slices}
              totalDefects={warehouseData.totalDefects}
              palletCount={warehouseData.palletCount}
              emptyText="Chưa ghi nhận lỗi cụ thể cho Pallet Kho."
            />
          </div>
        )}

        {viewMode === 'all' && (
          <SingleDonutPanel
            title="Tổng hợp tất cả pallet"
            subtitle="Tỷ lệ phân bổ lỗi gộp chung cả Pallet Nhà máy và Pallet Kho"
            slices={allData.slices}
            totalDefects={allData.totalDefects}
            palletCount={allData.palletCount}
            emptyText="Chưa có loại lỗi cụ thể nào được chọn trên các báo cáo."
            wideLayout
          />
        )}

        {viewMode === 'factory' && (
          <SingleDonutPanel
            title="Pallet Nhà máy"
            subtitle="Chi tiết tỷ lệ các loại lỗi phát sinh từ Pallet Nhà máy"
            slices={factoryData.slices}
            totalDefects={factoryData.totalDefects}
            palletCount={factoryData.palletCount}
            emptyText="Chưa ghi nhận lỗi cụ thể cho Pallet Nhà máy."
            wideLayout
          />
        )}

        {viewMode === 'warehouse' && (
          <SingleDonutPanel
            title="Pallet Kho"
            subtitle="Chi tiết tỷ lệ các loại lỗi phát sinh từ Pallet Kho"
            slices={warehouseData.slices}
            totalDefects={warehouseData.totalDefects}
            palletCount={warehouseData.palletCount}
            emptyText="Chưa ghi nhận lỗi cụ thể cho Pallet Kho."
            wideLayout
          />
        )}
      </div>
    </section>
  );
};
