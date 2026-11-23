import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, QrCode } from 'lucide-react';
import { PalletRecord } from '../types/pallet';
import { DrivePhoto } from './DrivePhoto';

interface DashboardViewProps {
  records: PalletRecord[];
  loading: boolean;
  accessToken: string | null;
  onNavigateScan: () => void;
  onNavigateRecords: () => void;
  onSelectRecord: (record: PalletRecord) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  records,
  loading,
  accessToken,
  onNavigateScan,
  onNavigateRecords,
  onSelectRecord,
}) => {
  const stats = useMemo(() => {
    const total = records.length;
    const severe = records.filter((r) => r.severity === 'Nặng').length;
    const minor = records.filter((r) => r.severity === 'Nhẹ').length;
    const inbound = records.filter((r) => r.transactionType === 'Nhập').length;
    const outbound = records.filter((r) => r.transactionType === 'Xuất').length;
    const pending = records.filter(
      (r) => r.status === 'Chờ xử lý' || r.status === 'Đang sửa chữa'
    ).length;
    const resolved = records.filter(
      (r) => r.status === 'Đã xử lý' || r.status === 'Thanh lý'
    ).length;

    const factoryMinor = records.filter(
      (r) => r.source === 'Nhà máy' && r.severity === 'Nhẹ'
    ).length;
    const factorySevere = records.filter(
      (r) => r.source === 'Nhà máy' && r.severity === 'Nặng'
    ).length;
    const warehouseMinor = records.filter(
      (r) => r.source === 'Kho' && r.severity === 'Nhẹ'
    ).length;
    const warehouseSevere = records.filter(
      (r) => r.source === 'Kho' && r.severity === 'Nặng'
    ).length;

    const sourceBreakdown = [
      { name: 'Pallet Nhà máy', Nhẹ: factoryMinor, Nặng: factorySevere },
      { name: 'Pallet Kho', Nhẹ: warehouseMinor, Nặng: warehouseSevere },
    ];

    const defectCounter = new Map<string, number>();
    records.forEach((r) => {
      r.defectTypes.forEach((d) => {
        defectCounter.set(d, (defectCounter.get(d) ?? 0) + 1);
      });
    });

    const topDefects = Array.from(defectCounter.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return {
      total,
      severe,
      minor,
      inbound,
      outbound,
      pending,
      resolved,
      severePct: total > 0 ? Math.round((severe / total) * 100) : 0,
      minorPct: total > 0 ? Math.round((minor / total) * 100) : 0,
      sourceBreakdown,
      topDefects,
    };
  }, [records]);

  if (loading && records.length === 0) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white p-5"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
          <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
        </div>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <QrCode className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">
          Chưa có dữ liệu pallet hư hỏng nào
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600 leading-relaxed">
          Bảng tính Google Sheet đã sẵn sàng. Quét mã QR trên pallet đầu tiên để bắt đầu theo dõi tình trạng hư hỏng theo thời gian thực.
        </p>
        <div className="mt-6">
          <button
            type="button"
            onClick={onNavigateScan}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
          >
            <QrCode className="h-4 w-4" />
            <span>Quét mã QR &amp; Báo cáo đầu tiên</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 4-column KPI strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Tổng pallet ghi nhận</p>
          <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
            {stats.total}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 tabular-nums">
            <span>Nhập: {stats.inbound}</span>
            <span aria-hidden="true">·</span>
            <span>Xuất: {stats.outbound}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Hư hỏng nặng</p>
          <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-red-600 tabular-nums">
            {stats.severe}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 tabular-nums">
            <span className="font-medium text-red-700">{stats.severePct}% tổng số</span>
            <span aria-hidden="true">·</span>
            <span>Ưu tiên cách ly</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Hư hỏng nhẹ</p>
          <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-amber-600 tabular-nums">
            {stats.minor}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 tabular-nums">
            <span className="font-medium text-amber-700">{stats.minorPct}% tổng số</span>
            <span aria-hidden="true">·</span>
            <span>Có thể sửa chữa</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Tiến độ xử lý</p>
          <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-emerald-700 tabular-nums">
            {stats.resolved}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 tabular-nums">
            <span>Đã xử lý / Thanh lý</span>
            <span aria-hidden="true">·</span>
            <span>Chờ: {stats.pending}</span>
          </div>
        </div>
      </div>

      {/* Analytics Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                So sánh Pallet Nhà máy và Pallet Kho
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Phân bổ số lượng theo mức độ hư hỏng nhẹ và nặng
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-amber-500" />
                Nhẹ
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-red-600" />
                Nặng
              </span>
            </div>
          </div>

          <div className="mt-5 h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stats.sourceBreakdown}
                margin={{ top: 8, right: 16, left: -12, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#475569', fontSize: 12 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="Nhẹ" fill="#d97706" radius={[4, 4, 0, 0]} maxBarSize={44} />
                <Bar dataKey="Nặng" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Tần suất các lỗi hư hỏng phổ biến
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Thống kê các dạng lỗi được ghi nhận nhiều nhất trên hệ thống
            </p>
          </div>

          {stats.topDefects.length === 0 ? (
            <div className="flex h-60 items-center justify-center text-sm text-slate-500">
              Chưa có phân loại lỗi cụ thể nào được chọn.
            </div>
          ) : (
            <div className="mt-5 h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.topDefects}
                  layout="vertical"
                  margin={{ top: 4, right: 20, left: 16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={132}
                    tick={{ fill: '#334155', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    formatter={(val) => [`${val ?? 0} lượt`, 'Số lần ghi nhận']}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" fill="#0f172a" radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Real-time Recent Activity List */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Báo cáo ghi nhận gần đây nhất
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Nhấn vào từng dòng để xem ảnh hiện trường và cập nhật trạng thái xử lý
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateRecords}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0"
          >
            <span>Xem toàn bộ ({records.length})</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {records.slice(0, 6).map((rec) => (
            <button
              key={`${rec.id}-${rec.rowIndex}`}
              type="button"
              onClick={() => onSelectRecord(rec)}
              className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-slate-50"
            >
              <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                <DrivePhoto
                  accessToken={accessToken}
                  driveFileId={rec.driveFileId}
                  imageUrl={rec.imageUrl}
                  alt={`Pallet ${rec.serialNumber}`}
                  compact
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-900">
                    {rec.serialNumber}
                  </span>
                  <span className="font-mono text-xs text-slate-500 tabular-nums">
                    {rec.timestamp}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
                  <span
                    className={`font-semibold ${
                      rec.severity === 'Nặng' ? 'text-red-600' : 'text-amber-700'
                    }`}
                  >
                    Hư hỏng {rec.severity.toLowerCase()}
                  </span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span>{rec.transactionType} kho</span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span>Pallet {rec.source}</span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="truncate text-slate-500">
                    {rec.defectTypes.length > 0
                      ? rec.defectTypes.join(', ')
                      : rec.notes || 'Không có ghi chú'}
                  </span>
                </div>
              </div>

              <div className="hidden text-right text-xs font-medium text-slate-700 sm:block shrink-0">
                {rec.status}
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
