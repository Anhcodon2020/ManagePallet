import React, { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ExternalLink, FileSpreadsheet, Printer } from 'lucide-react';
import { SpreadsheetConfig } from '../types/pallet';
import { SheetSetupView } from './SheetSetupView';

interface SettingsAndQRViewProps {
  accessToken: string;
  sheetConfig: SpreadsheetConfig;
  autoRefresh: boolean;
  onToggleAutoRefresh: (enabled: boolean) => void;
  onSelectConfig: (config: SpreadsheetConfig) => void;
  onAuthError: () => void;
}

export const SettingsAndQRView: React.FC<SettingsAndQRViewProps> = ({
  accessToken,
  sheetConfig,
  autoRefresh,
  onToggleAutoRefresh,
  onSelectConfig,
  onAuthError,
}) => {
  const [prefix, setPrefix] = useState('PLT-NM-2026-');
  const [startNum, setStartNum] = useState(101);
  const [count, setCount] = useState(6);

  const generatedLabels = useMemo(() => {
    const safeCount = Math.min(Math.max(1, count), 24);
    const safeStart = Math.max(1, startNum);
    return Array.from({ length: safeCount }, (_, i) => {
      const seq = String(safeStart + i).padStart(4, '0');
      return `${prefix.trim().toUpperCase()}${seq}`;
    });
  }, [prefix, startNum, count]);

  return (
    <div className="space-y-8">
      {/* Current Database Status */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 no-print">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {sheetConfig.title}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>
                  Trang tính:{' '}
                  <strong className="font-mono text-slate-800">
                    {sheetConfig.sheetName}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">ID: {sheetConfig.spreadsheetId}</span>
              </div>
            </div>
          </div>

          <a
            href={sheetConfig.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <span>Mở trên Google Sheets</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
          <div>
            <p className="text-sm font-medium text-slate-900">
              Tự động đồng bộ dữ liệu thời gian thực (mỗi 15 giây)
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Cập nhật báo cáo mới từ các nhân viên kho khác mà không cần tải lại trang.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoRefresh}
            onClick={() => onToggleAutoRefresh(!autoRefresh)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              autoRefresh ? 'bg-slate-900' : 'bg-slate-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${
                autoRefresh ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </section>

      {/* Batch QR Label Generator & Printer */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 no-print">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Trình tạo &amp; in tem mã QR cho Pallet
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Tạo nhanh hàng loạt tem mã QR dán lên thân pallet nhà máy hoặc pallet kho để quét ngay trên ứng dụng.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Printer className="h-4 w-4" />
            <span>In tem mã QR</span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3 no-print">
          <div>
            <label
              htmlFor="qr-prefix"
              className="block text-xs font-medium text-slate-700"
            >
              Tiền tố mã Series
            </label>
            <input
              id="qr-prefix"
              type="text"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="qr-start"
              className="block text-xs font-medium text-slate-700"
            >
              Số bắt đầu
            </label>
            <input
              id="qr-start"
              type="number"
              min={1}
              value={startNum}
              onChange={(e) => setStartNum(Number(e.target.value) || 1)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="qr-count"
              className="block text-xs font-medium text-slate-700"
            >
              Số lượng tem (tối đa 24)
            </label>
            <input
              id="qr-count"
              type="number"
              min={1}
              max={24}
              value={count}
              onChange={(e) => setCount(Number(e.target.value) || 1)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {generatedLabels.map((code) => (
            <div
              key={code}
              className="flex flex-col items-center rounded-lg border border-slate-200 bg-white p-4 text-center"
            >
              <QRCodeSVG value={code} size={92} level="M" />
              <p className="mt-2.5 font-mono text-xs font-semibold text-slate-900 break-all">
                {code}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">PalletGuard ID</p>
            </div>
          ))}
        </div>
      </section>

      {/* Switch or Create Spreadsheet */}
      <div className="no-print">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          Chuyển đổi hoặc tạo mới Google Sheet lưu trữ
        </h2>
        <SheetSetupView
          accessToken={accessToken}
          currentConfig={sheetConfig}
          onSelectConfig={onSelectConfig}
          onAuthError={onAuthError}
          embedded
        />
      </div>
    </div>
  );
};
