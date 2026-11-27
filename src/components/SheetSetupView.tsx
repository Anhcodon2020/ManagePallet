import React, { useState } from 'react';
import {
  Check,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  ensureSheetHeaders,
  extractSpreadsheetId,
  getSpreadsheetMetadata,
  saveSharedSheetConfig,
  WorkspaceAuthError,
} from '../services/googleWorkspace';
import { SheetTabInfo, SpreadsheetConfig } from '../types/pallet';
import { ConfirmDialog } from './ConfirmDialog';

interface SheetSetupViewProps {
  accessToken: string;
  currentConfig: SpreadsheetConfig | null;
  isAdmin: boolean;
  adminEmail: string;
  onSelectConfig: (config: SpreadsheetConfig, isSharedGlobal: boolean) => void;
  onRetryFetchShared?: () => Promise<void>;
  onAuthError: () => void;
  embedded?: boolean;
}

export const SheetSetupView: React.FC<SheetSetupViewProps> = ({
  accessToken,
  currentConfig,
  isAdmin,
  adminEmail,
  onSelectConfig,
  onRetryFetchShared,
  onAuthError,
  embedded = false,
}) => {
  const [manualInput, setManualInput] = useState(currentConfig?.url || '');
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
  const [checkingShared, setCheckingShared] = useState(false);
  const [showEmployeeManual, setShowEmployeeManual] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInspectSpreadsheet = async (rawIdOrUrl: string) => {
    const id = extractSpreadsheetId(rawIdOrUrl);
    if (!id) {
      setError('Đường dẫn hoặc ID Google Sheet không hợp lệ. Vui lòng dán đúng link Google Sheets của bạn.');
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
      if (err instanceof WorkspaceAuthError) {
        onAuthError();
        return;
      }
      const msg =
        err instanceof Error
          ? err.message
          : 'Không thể đọc cấu trúc Google Sheet. Hãy đảm bảo tài khoản Google của bạn có quyền chỉnh sửa file này.';
      setError(msg);
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
      const nextConfig: SpreadsheetConfig = {
        spreadsheetId: inspectedMeta.spreadsheetId,
        title: inspectedMeta.title,
        sheetName: tabObj.title,
        sheetId: tabObj.sheetId,
        url: inspectedMeta.url,
      };

      if (isAdmin) {
        const saved = await saveSharedSheetConfig(accessToken, nextConfig);
        setShowConnectConfirm(false);
        onSelectConfig(saved.config, saved.savedToServer);
      } else {
        setShowConnectConfirm(false);
        onSelectConfig(nextConfig, false);
      }
    } catch (err: unknown) {
      if (err instanceof WorkspaceAuthError) {
        setShowConnectConfirm(false);
        onAuthError();
        return;
      }
      const msg = err instanceof Error ? err.message : 'Kết nối bảng tính thất bại.';
      setError(msg);
      setShowConnectConfirm(false);
    } finally {
      setConnecting(false);
    }
  };

  const handleRecheckShared = async () => {
    if (!onRetryFetchShared) return;
    setCheckingShared(true);
    try {
      await onRetryFetchShared();
    } finally {
      setCheckingShared(false);
    }
  };

  // Non-admin waiting screen when no shared central Google Sheet is configured yet
  if (!isAdmin && !embedded && !showEmployeeManual) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <Users className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">
            Chờ quản trị viên gắn Google Sheet dùng chung
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
            Quản trị viên{' '}
            {adminEmail ? (
              <strong className="font-mono text-slate-900">{adminEmail}</strong>
            ) : (
              'hệ thống'
            )}{' '}
            chưa cấu hình bảng tính Google Sheet dùng chung. Khi quản trị viên gắn xong, bạn sẽ tự động vào thẳng database chung mà không cần tạo file mới.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleRecheckShared}
              disabled={checkingShared}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
            >
              <RefreshCw className={`h-4 w-4 ${checkingShared ? 'animate-spin' : ''}`} />
              <span>Kiểm tra lại kết nối</span>
            </button>
            <button
              type="button"
              onClick={() => setShowEmployeeManual(true)}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              <Link2 className="h-4 w-4" />
              <span>Nhập link Sheet được chia sẻ</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-5' : 'mx-auto max-w-3xl px-6 py-10 space-y-6'}>
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isAdmin
              ? 'Gắn Google Sheet có sẵn làm Database chung'
              : 'Kết nối vào Google Sheet được chia sẻ'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {isAdmin
              ? 'Kết nối trực tiếp với file Google Sheet hiện có của bạn — không tạo file mới. Sau khi lưu, mọi nhân viên đăng nhập bằng tài khoản Google của họ sẽ tự động làm việc trên đúng bảng tính này.'
              : 'Dán đường dẫn Google Sheet mà quản trị viên đã chia sẻ quyền chỉnh sửa cho tài khoản Google của bạn.'}
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

      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {isAdmin
                  ? 'Đường dẫn Google Sheet Database của bạn'
                  : 'Đường dẫn Google Sheet dùng chung'}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Không tạo file mới — sử dụng trực tiếp file Google Sheet có sẵn và tự động giữ nguyên dữ liệu cũ.
              </p>
            </div>
          </div>
          {isAdmin && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 whitespace-nowrap shrink-0">
              <ShieldCheck className="h-4 w-4" />
              <span>Quyền quản trị</span>
            </span>
          )}
        </div>

        <div>
          <label
            htmlFor="existing-sheet-url"
            className="block text-xs font-semibold text-slate-700"
          >
            Dán URL hoặc Spreadsheet ID của Google Sheet
          </label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <input
              id="existing-sheet-url"
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
            />
            <button
              type="button"
              onClick={() => handleInspectSpreadsheet(manualInput)}
              disabled={inspecting || !manualInput.trim()}
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {inspecting && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{inspecting ? 'Đang kiểm tra...' : 'Kiểm tra bảng tính'}</span>
            </button>
          </div>
        </div>

        {inspectedMeta && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">Đã tìm thấy bảng tính</p>
                <p className="truncate text-sm font-semibold text-slate-900">
                  {inspectedMeta.title}
                </p>
              </div>
              <a
                href={inspectedMeta.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline whitespace-nowrap shrink-0"
              >
                <span>Mở trên Google Sheets</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div>
              <label
                htmlFor="sheet-tab-select"
                className="block text-xs font-semibold text-slate-700"
              >
                Chọn trang tính (Tab) chứa dữ liệu pallet
              </label>
              <select
                id="sheet-tab-select"
                value={selectedTab}
                onChange={(e) => setSelectedTab(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                {inspectedMeta.sheets.map((tab) => (
                  <option key={tab.sheetId} value={tab.title}>
                    {tab.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-1 flex justify-end">
              <button
                type="button"
                disabled={connecting}
                onClick={() => setShowConnectConfirm(true)}
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap"
              >
                <Check className="h-4 w-4" />
                <span>
                  {isAdmin
                    ? 'Lưu làm Database chung cho mọi người'
                    : 'Kết nối vào bảng tính này'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Multi-user sharing guide */}
        <div className="border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-600 space-y-1.5">
          <p className="font-semibold text-slate-800">
            Cách cho phép mọi người đăng nhập tài khoản Google của họ vào cùng Database này:
          </p>
          <p>
            1. Mở file Google Sheet của bạn → nhấn nút <strong>Chia sẻ (Share)</strong> ở góc trên bên phải.
          </p>
          <p>
            2. Thêm email Google của các nhân viên kho với quyền <strong>Người chỉnh sửa (Editor)</strong>, hoặc bật <strong>Bất kỳ ai có đường liên kết → Người chỉnh sửa</strong>.
          </p>
          <p>
            3. Sau khi bạn bấm <strong>Lưu làm Database chung</strong> tại đây, mọi người chỉ cần mở ứng dụng và đăng nhập bằng Google của họ là vào thẳng màn hình quét QR — không cần tạo file mới.
          </p>
        </div>
      </section>

      <ConfirmDialog
        open={showConnectConfirm}
        title={
          isAdmin
            ? 'Xác nhận đặt làm Database chung cho toàn bộ nhân viên'
            : 'Xác nhận kết nối Google Sheet'
        }
        description={
          isAdmin
            ? 'Tất cả người dùng đăng nhập bằng tài khoản Google vào ứng dụng sẽ tự động đọc và ghi dữ liệu trực tiếp trên trang tính này. Nếu dòng tiêu đề (A1:L1) đang trống, hệ thống sẽ tự động bổ sung 12 cột tiêu chuẩn.'
            : 'Ứng dụng sẽ kết nối và đồng bộ dữ liệu trực tiếp với trang tính bạn đã chọn.'
        }
        details={
          inspectedMeta
            ? [
                { label: 'Bảng tính', value: inspectedMeta.title },
                { label: 'Trang tính (Tab)', value: selectedTab },
                { label: 'Spreadsheet ID', value: inspectedMeta.spreadsheetId },
              ]
            : undefined
        }
        confirmLabel={isAdmin ? 'Lưu Database chung' : 'Xác nhận kết nối'}
        loading={connecting}
        onConfirm={handleConfirmConnect}
        onCancel={() => setShowConnectConfirm(false)}
      />
    </div>
  );
};
