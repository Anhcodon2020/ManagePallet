import React, { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import {
  AuthMode,
  DamageSeverity,
  PalletRecord,
  PalletSource,
  RepairStatus,
  SHEET_HEADERS,
  TransactionType,
} from '../types/pallet';
import { DrivePhoto } from './DrivePhoto';

interface RecordsTableViewProps {
  records: PalletRecord[];
  loading: boolean;
  accessToken: string | null;
  authMode: AuthMode;
  onSelectRecord: (record: PalletRecord) => void;
}

export const RecordsTableView: React.FC<RecordsTableViewProps> = ({
  records,
  loading,
  accessToken,
  authMode,
  onSelectRecord,
}) => {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | DamageSeverity>('ALL');
  const [txFilter, setTxFilter] = useState<'ALL' | TransactionType>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | PalletSource>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | RepairStatus>('ALL');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((rec) => {
      if (severityFilter !== 'ALL' && rec.severity !== severityFilter) return false;
      if (txFilter !== 'ALL' && rec.transactionType !== txFilter) return false;
      if (sourceFilter !== 'ALL' && rec.source !== sourceFilter) return false;
      if (statusFilter !== 'ALL' && rec.status !== statusFilter) return false;
      if (!q) return true;
      return (
        rec.serialNumber.toLowerCase().includes(q) ||
        rec.notes.toLowerCase().includes(q) ||
        rec.defectTypes.some((d) => d.toLowerCase().includes(q)) ||
        rec.reporter.toLowerCase().includes(q) ||
        rec.id.toLowerCase().includes(q)
      );
    });
  }, [records, search, severityFilter, txFilter, sourceFilter, statusFilter]);

  const handleExportCsv = () => {
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = [
      SHEET_HEADERS.map(escapeCsv).join(','),
      ...filtered.map((r) =>
        [
          r.id,
          r.timestamp,
          r.serialNumber,
          r.transactionType,
          r.source,
          r.severity,
          r.defectTypes.join('; '),
          r.notes,
          r.imageUrl,
          r.driveFileId,
          r.status,
          r.reporter,
        ]
          .map(escapeCsv)
          .join(',')
      ),
    ];

    // UTF-8 BOM ensures Excel opens Vietnamese diacritics properly
    const blob = new Blob(['\uFEFF' + rows.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bao-cao-pallet-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setSearch('');
    setSeverityFilter('ALL');
    setTxFilter('ALL');
    setSourceFilter('ALL');
    setStatusFilter('ALL');
  };

  const hasActiveFilter =
    search.trim() !== '' ||
    severityFilter !== 'ALL' ||
    txFilter !== 'ALL' ||
    sourceFilter !== 'ALL' ||
    statusFilter !== 'ALL';

  return (
    <div className="space-y-4">
      {/* Toolbar: Search + Filters + CSV Export */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm số series, lỗi hư hỏng, ghi chú, người báo cáo..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
            />
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-4 w-4" />
            <span>Xuất CSV ({filtered.length})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          {/* Severity segmented filter */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(['ALL', 'Nặng', 'Nhẹ'] as const).map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setSeverityFilter(val)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  severityFilter === val
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {val === 'ALL' ? 'Mọi mức độ' : `Hư hỏng ${val.toLowerCase()}`}
              </button>
            ))}
          </div>

          {/* Transaction filter */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(['ALL', 'Nhập', 'Xuất'] as const).map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setTxFilter(val)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  txFilter === val
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {val === 'ALL' ? 'Nhập & Xuất' : `${val} kho`}
              </button>
            ))}
          </div>

          {/* Source filter */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(['ALL', 'Nhà máy', 'Kho'] as const).map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setSourceFilter(val)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  sourceFilter === val
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {val === 'ALL' ? 'Mọi nguồn' : val}
              </button>
            ))}
          </div>

          <select
            aria-label="Lọc theo trạng thái xử lý"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | RepairStatus)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-blue-600 focus:outline-none"
          >
            <option value="ALL">Mọi trạng thái</option>
            <option value="Chờ xử lý">Chờ xử lý</option>
            <option value="Đang sửa chữa">Đang sửa chữa</option>
            <option value="Đã xử lý">Đã xử lý</option>
            <option value="Thanh lý">Thanh lý</option>
          </select>

          {hasActiveFilter && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
            >
              Đặt lại bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* High-Density Data Grid */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 pl-4 pr-3 whitespace-nowrap">Ảnh</th>
                <th className="px-3 py-3 whitespace-nowrap">Số Series</th>
                <th className="px-3 py-3 whitespace-nowrap">Thời gian</th>
                <th className="px-3 py-3 whitespace-nowrap">Phân loại / Nguồn</th>
                <th className="px-3 py-3 whitespace-nowrap">Mức độ</th>
                <th className="px-3 py-3">Loại hư hỏng &amp; Ghi chú</th>
                <th className="px-3 py-3 whitespace-nowrap">Trạng thái</th>
                <th className="py-3 pl-3 pr-4 whitespace-nowrap">Người ghi nhận</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && records.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-4 py-4">
                      <div className="h-8 animate-pulse rounded bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-sm text-slate-500"
                  >
                    {records.length === 0
                      ? 'Chưa có bản ghi nào trong Google Sheet.'
                      : 'Không tìm thấy bản ghi pallet nào khớp với bộ lọc hiện tại.'}
                  </td>
                </tr>
              ) : (
                filtered.map((rec) => (
                  <tr
                    key={`${rec.id}-${rec.rowIndex}`}
                    onClick={() => onSelectRecord(rec)}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                  >
                    <td className="py-2.5 pl-4 pr-3">
                      <div className="h-10 w-12 overflow-hidden rounded border border-slate-200 bg-slate-100">
                        <DrivePhoto
                          accessToken={accessToken}
                          authMode={authMode}
                          driveFileId={rec.driveFileId}
                          imageUrl={rec.imageUrl}
                          alt={`Pallet ${rec.serialNumber}`}
                          compact
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                      {rec.serialNumber}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {rec.timestamp}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-700 whitespace-nowrap">
                      <span>{rec.transactionType} kho</span>
                      <span className="mx-1.5 text-slate-300" aria-hidden="true">/</span>
                      <span>{rec.source}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap">
                      <span
                        className={
                          rec.severity === 'Nặng' ? 'text-red-600' : 'text-amber-700'
                        }
                      >
                        {rec.severity === 'Nặng' ? 'Nặng' : 'Nhẹ'}
                      </span>
                    </td>
                    <td className="max-w-xs px-3 py-2.5 text-xs text-slate-700">
                      <p className="truncate font-medium text-slate-800">
                        {rec.defectTypes.length > 0
                          ? rec.defectTypes.join(', ')
                          : 'Chưa phân loại'}
                      </p>
                      {rec.notes && (
                        <p className="mt-0.5 truncate text-slate-500">{rec.notes}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-medium whitespace-nowrap">
                      <span
                        className={
                          rec.status === 'Đã xử lý'
                            ? 'text-emerald-700'
                            : rec.status === 'Thanh lý'
                            ? 'text-slate-500'
                            : rec.status === 'Đang sửa chữa'
                            ? 'text-blue-700'
                            : 'text-amber-700'
                        }
                      >
                        {rec.status}
                      </span>
                    </td>
                    <td className="py-2.5 pl-3 pr-4 text-xs text-slate-600 whitespace-nowrap">
                      {rec.reporter}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
