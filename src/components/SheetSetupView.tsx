import React, { useEffect, useState } from 'react';
import {
  Check,
  ExternalLink,
  FileSpreadsheet,
  FolderPlus,
  Link2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  createPalletSpreadsheet,
  ensureSheetHeaders,
  extractSpreadsheetId,
  getSpreadsheetMetadata,
  listAppSpreadsheets,
} from '../services/googleWorkspace';
import {
  DriveSpreadsheetItem,
  SheetTabInfo,
  SpreadsheetConfig,
} from '../types/pallet';
import { ConfirmDialog } from './ConfirmDialog';

interface SheetSetupViewProps {
  accessToken: string;
  currentConfig: SpreadsheetConfig | null;
  onSelectConfig: (config: SpreadsheetConfig) => void;
  onAuthError: () => void;
  embedded?: boolean;
}

export const SheetSetupView: React.FC<SheetSetupViewProps> = ({
  accessToken,
  currentConfig,
  onSelectConfig,
  onAuthError,
  embedded = false,
}) => {
  const [recentFiles, setRecentFiles] = useState<DriveSpreadsheetItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [newSheetTitle, setNewSheetTitle] = useState(
    'PalletGuard — Quản Lý Pallet Hư Hỏng'
  );
  const [creating, setCreating] = useState(false);
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);

  const [manualInput, setManualInput] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const [inspectedMeta, setInspectedMeta] = useState<{
    spreadsheetId: string;
    title: string;
    url: string;
    sheets: SheetTabInfo[];
  } | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('');
  const [connecting, setConnecting] = useState(false);
  const [showConnectConfirm, setShowConnectConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = async () => {
    setLoadingFiles(true);
    setError(null);
    try {
      const files = await listAppSpreadsheets(accessToken);
      setRecentFiles(files);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải danh sách bảng tính.';
      if (msg.includes('hết hạn')) {
        onAuthError();
      } else {
        setError(msg);
      }
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const handleCreateSpreadsheet = async () => {
    setCreating(true);
    setError(null);
    try {
      const cfg = await createPalletSpreadsheet(
        accessToken,
        newSheetTitle.trim() || 'PalletGuard — Quản Lý Pallet Hư Hỏng'
      );
      setShowCreateConfirm(false);
      onSelectConfig(cfg);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tạo bảng tính thất bại.';
      setError(msg);
      setShowCreateConfirm(false);
    } finally {
      setCreating(false);
    }
  };

  const handleInspectSpreadsheet = async (rawIdOrUrl: string) => {
    const id = extractSpreadsheetId(rawIdOrUrl);
    if (!id) {
      setError('Đường dẫn hoặc ID Google Sheet không hợp lệ. Vui lòng kiểm tra lại.');
      return;
    }
    setInspecting(true);
    setError(null);
    setInspectedMeta(null);
    try {
      const meta = await getSpreadsheetMetadata(accessToken, id);
      if (meta.sheets.length === 0) {
        setError('Bảng tính này không có trang tính (tab) nào khả dụng.');
        return;
      }
      setInspectedMeta({
        spreadsheetId: id,
        title: meta.title,
        url: meta.url,
        sheets: meta.sheets,
      });
      setSelectedTab(meta.sheets[0].title);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Không thể đọc cấu trúc Google Sheet. Hãy đảm bảo tài khoản của bạn có quyền chỉnh sửa file này.';
      if (msg.includes('hết hạn')) {
        onAuthError();
      } else {
        setError(msg);
      }
    } finally {
      setInspecting(false);
    }
  };

  const handleConfirmConnect = async () => {
    if (!inspectedMeta || !selectedTab) return;
    const tabObj = inspectedMeta.sheets.find((s) => s.title === selectedTab);
    if (!tabObj) return;

    setConnecting(true);
    setError(null);
    try {
      await ensureSheetHeaders(accessToken, inspectedMeta.spreadsheetId, tabObj.title);
      setShowConnectConfirm(false);
      onSelectConfig({
        spreadsheetId: inspectedMeta.spreadsheetId,
        title: inspectedMeta.title,
        sheetName: tabObj.title,
        sheetId: tabObj.sheetId,
        url: inspectedMeta.url,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Kết nối bảng tính thất bại.';
      setError(msg);
      setShowConnectConfirm(false);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className={embedded ? 'space-y-6' : 'mx-auto max-w-4xl px-6 py-10 space-y-8'}>
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Kết nối cơ sở dữ liệu Google Sheets
          </h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-2xl">
            Tất cả dữ liệu quét mã QR, tình trạng hư hỏng pallet và đường dẫn ảnh minh họa sẽ được lưu trực tiếp vào bảng tính Google Sheets của bạn theo thời gian thực.
          </p>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-stretch">
        {/* Option 1: Create new ready-to-use Google Sheet */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6">
          <div>
            <div className="flex items-center gap-2.5 text-slate-900">
              <FolderPlus className="h-5 w-5 text-blue-700 shrink-0" />
              <h2 className="text-base font-semibold">Tạo Google Sheet chuẩn mới</h2>
            </div>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Hệ thống tự động khởi tạo bảng tính với đầy đủ 12 cột tiêu chuẩn (Số Series, Nhập/Xuất, Nhà máy/Kho, Mức độ hư hỏng, Ghi chú, Link ảnh Drive, Trạng thái).
            </p>
            <div className="mt-5">
              <label
                htmlFor="new-sheet-title"
                className="block text-xs font-medium text-slate-700"
              >
                Tên bảng tính mới
              </label>
              <input
                id="new-sheet-title"
                type="text"
                value={newSheetTitle}
                onChange={(e) => setNewSheetTitle(e.target.value)}
                placeholder="VD: Quản Lý Pallet Hư Hỏng 2026"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
              />
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowCreateConfirm(true)}
              disabled={creating}
              className="inline-flex w-full min-h-[42px] items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-60 whitespace-nowrap"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              <span>Tạo bảng tính &amp; Bắt đầu</span>
            </button>
          </div>
        </section>

        {/* Option 2: Connect existing Google Sheet */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6">
          <div>
            <div className="flex items-center gap-2.5 text-slate-900">
              <Link2 className="h-5 w-5 text-blue-700 shrink-0" />
              <h2 className="text-base font-semibold">Kết nối Google Sheet có sẵn</h2>
            </div>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Dán đường dẫn (URL) hoặc ID của Google Sheet đã tạo. Ứng dụng sẽ tự động đọc danh sách các trang tính (tab) hiện có để bạn chọn.
            </p>

            <div className="mt-5">
              <label
                htmlFor="existing-sheet-url"
                className="block text-xs font-medium text-slate-700"
              >
                URL hoặc Spreadsheet ID
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="existing-sheet-url"
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                />
                <button
                  type="button"
                  onClick={() => handleInspectSpreadsheet(manualInput)}
                  disabled={inspecting || !manualInput.trim()}
                  className="min-h-[42px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {inspecting ? 'Đang đọc...' : 'Kiểm tra'}
                </button>
              </div>
            </div>

            {inspectedMeta && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-slate-900">
                    {inspectedMeta.title}
                  </span>
                  <a
                    href={inspectedMeta.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline whitespace-nowrap shrink-0"
                  >
                    <span>Mở Sheet</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                <div>
                  <label
                    htmlFor="sheet-tab-select"
                    className="block text-xs font-medium text-slate-600"
                  >
                    Chọn trang tính (Tab) lưu dữ liệu
                  </label>
                  <select
                    id="sheet-tab-select"
                    value={selectedTab}
                    onChange={(e) => setSelectedTab(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    {inspectedMeta.sheets.map((tab) => (
                      <option key={tab.sheetId} value={tab.title}>
                        {tab.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <button
              type="button"
              disabled={!inspectedMeta || !selectedTab || connecting}
              onClick={() => setShowConnectConfirm(true)}
              className="inline-flex w-full min-h-[42px] items-center justify-center gap-2 rounded-lg border border-slate-900 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-white whitespace-nowrap"
            >
              <Check className="h-4 w-4" />
              <span>Kết nối bảng tính đã chọn</span>
            </button>
          </div>
        </section>
      </div>

      {/* Existing app-managed spreadsheets in Google Drive */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Bảng tính PalletGuard trên Google Drive
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Các bảng tính đã được tạo bởi ứng dụng này trên tài khoản Google của bạn.
            </p>
          </div>
          <button
            type="button"
            onClick={loadFiles}
            disabled={loadingFiles}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>

        <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          {loadingFiles ? (
            <div className="py-6 text-center text-sm text-slate-500">
              Đang tìm bảng tính đã tạo...
            </div>
          ) : recentFiles.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500">
              Chưa có bảng tính nào được tạo từ PalletGuard. Hãy tạo mới hoặc dán liên kết bảng tính ở trên.
            </div>
          ) : (
            recentFiles.map((file) => {
              const isCurrent = currentConfig?.spreadsheetId === file.id;
              return (
                <div
                  key={file.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-3.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-700 shrink-0" />
                      <span className="truncate text-sm font-medium text-slate-900">
                        {file.name}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 tabular-nums">
                      <span className="font-mono">{file.id.slice(0, 18)}…</span>
                      {file.modifiedTime && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            Cập nhật:{' '}
                            {new Date(file.modifiedTime).toLocaleString('vi-VN')}
                          </span>
                        </>
                      )}
                      {isCurrent && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-emerald-700">
                            Đang kết nối
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {file.webViewLink && (
                      <a
                        href={file.webViewLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap"
                      >
                        <span>Xem trên Sheets</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={inspecting}
                      onClick={() => handleInspectSpreadsheet(file.id)}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
                    >
                      {isCurrent ? 'Chọn lại tab' : 'Kết nối'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Mandatory Confirmation Dialog: Create New Spreadsheet */}
      <ConfirmDialog
        open={showCreateConfirm}
        title="Xác nhận tạo bảng tính Google Sheet mới"
        description="Ứng dụng sẽ tạo một tệp Google Sheets mới trên Google Drive của bạn và tự động ghi dòng tiêu đề chuẩn để lưu dữ liệu pallet hư hỏng."
        details={[
          {
            label: 'Tên bảng tính',
            value: newSheetTitle.trim() || 'PalletGuard — Quản Lý Pallet Hư Hỏng',
          },
          { label: 'Trang tính mặc định', value: 'BaoCaoPallet' },
          { label: 'Số cột dữ liệu', value: '12 cột (Series, Phân loại, Hư hỏng, Ảnh...)' },
        ]}
        confirmLabel="Tạo Google Sheet"
        loading={creating}
        onConfirm={handleCreateSpreadsheet}
        onCancel={() => setShowCreateConfirm(false)}
      />

      {/* Mandatory Confirmation Dialog: Connect Existing Spreadsheet */}
      <ConfirmDialog
        open={showConnectConfirm}
        title="Xác nhận kết nối Google Sheet"
        description="Ứng dụng sẽ đọc dữ liệu từ trang tính đã chọn. Nếu dòng đầu tiên (A1:L1) đang trống, hệ thống sẽ tự động ghi dòng tiêu đề chuẩn."
        details={
          inspectedMeta
            ? [
                { label: 'Bảng tính', value: inspectedMeta.title },
                { label: 'Trang tính (Tab)', value: selectedTab },
                { label: 'Spreadsheet ID', value: inspectedMeta.spreadsheetId },
              ]
            : undefined
        }
        confirmLabel="Xác nhận kết nối"
        loading={connecting}
        onConfirm={handleConfirmConnect}
        onCancel={() => setShowConnectConfirm(false)}
      />
    </div>
  );
};
