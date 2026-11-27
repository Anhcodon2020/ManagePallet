import React, { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Check,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  KeyRound,
  Link2,
  Loader2,
  Printer,
  Share2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  fetchAdminStaffSettings,
  saveAdminStaffSettings,
} from '../services/googleWorkspace';
import { AdminStaffSettings, SpreadsheetConfig } from '../types/pallet';
import { SheetSetupView } from './SheetSetupView';

interface SettingsAndQRViewProps {
  accessToken: string;
  sheetConfig: SpreadsheetConfig;
  isAdmin: boolean;
  adminEmail: string;
  autoRefresh: boolean;
  onToggleAutoRefresh: (enabled: boolean) => void;
  onSelectConfig: (config: SpreadsheetConfig, isSharedGlobal: boolean) => void;
  onStaffSettingsUpdated?: () => void;
  onAuthError: () => void;
}

export const SettingsAndQRView: React.FC<SettingsAndQRViewProps> = ({
  accessToken,
  sheetConfig,
  isAdmin,
  adminEmail,
  autoRefresh,
  onToggleAutoRefresh,
  onSelectConfig,
  onStaffSettingsUpdated,
  onAuthError,
}) => {
  const [prefix, setPrefix] = useState('PLT-NM-2026-');
  const [startNum, setStartNum] = useState(101);
  const [count, setCount] = useState(6);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showChangeSheetPanel, setShowChangeSheetPanel] = useState(false);
  const [sheetChangedNotice, setSheetChangedNotice] = useState<string | null>(null);

  // Admin Staff Gmail Login management state
  const [staffSettings, setStaffSettings] = useState<AdminStaffSettings | null>(null);
  const [staffEnabled, setStaffEnabled] = useState(false);
  const [newPasscode, setNewPasscode] = useState('');
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffSavedMsg, setStaffSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin || !accessToken) return;
    let active = true;
    setLoadingStaff(true);
    fetchAdminStaffSettings(accessToken)
      .then((data) => {
        if (!active) return;
        setStaffSettings(data);
        setStaffEnabled(data.enabled);
        setAllowedEmails(data.allowedEmails);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setStaffError(
          err instanceof Error ? err.message : 'Không thể tải cấu hình nhân viên.'
        );
      })
      .finally(() => {
        if (active) setLoadingStaff(false);
      });
    return () => {
      active = false;
    };
  }, [isAdmin, accessToken]);

  const teamAccessUrl = useMemo(() => {
    const url = new URL(window.location.origin);
    url.searchParams.set('sheetId', sheetConfig.spreadsheetId);
    url.searchParams.set('tab', sheetConfig.sheetName);
    return url.toString();
  }, [sheetConfig.spreadsheetId, sheetConfig.sheetName]);

  const generatedLabels = useMemo(() => {
    const safeCount = Math.min(Math.max(1, count), 24);
    const safeStart = Math.max(1, startNum);
    return Array.from({ length: safeCount }, (_, i) => {
      const seq = String(safeStart + i).padStart(4, '0');
      return `${prefix.trim().toUpperCase()}${seq}`;
    });
  }, [prefix, startNum, count]);

  const handleCopyTeamLink = async () => {
    try {
      await navigator.clipboard.writeText(teamAccessUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleAddAllowedEmail = () => {
    const parts = emailInput
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s));

    if (parts.length === 0) {
      setStaffError('Vui lòng nhập địa chỉ Gmail hợp lệ (VD: nhanvien@gmail.com).');
      return;
    }

    setAllowedEmails((prev) => Array.from(new Set([...prev, ...parts])));
    setEmailInput('');
    setStaffError(null);
  };

  const handleRemoveAllowedEmail = (email: string) => {
    setAllowedEmails((prev) => prev.filter((e) => e !== email));
  };

  const handleSaveStaffSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError(null);
    setStaffSavedMsg(null);

    if (
      staffEnabled &&
      !staffSettings?.hasPasscode &&
      newPasscode.trim().length < 4
    ) {
      setStaffError('Vui lòng đặt Mã truy cập kho tối thiểu 4 ký tự.');
      return;
    }

    setSavingStaff(true);
    try {
      const updated = await saveAdminStaffSettings(accessToken, {
        enabled: staffEnabled,
        newPasscode: newPasscode.trim() || undefined,
        allowedEmails,
      });
      setStaffSettings(updated);
      setNewPasscode('');
      setStaffSavedMsg(
        updated.enabled
          ? 'Đã bật phương thức đăng nhập cho user Gmail khác. Nhân viên có thể chọn tab "Đăng nhập bằng Gmail khác" để vào thẳng Database này.'
          : 'Đã tắt phương thức đăng nhập bằng mã truy cập cho Gmail khác.'
      );
      onStaffSettingsUpdated?.();
    } catch (err: unknown) {
      setStaffError(
        err instanceof Error ? err.message : 'Không thể lưu cấu hình.'
      );
    } finally {
      setSavingStaff(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Current Shared Database Status */}
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
                <span>
                  Quản trị viên:{' '}
                  <strong className="text-slate-700">
                    {sheetConfig.configuredBy || adminEmail || 'Chủ sở hữu Sheet'}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">ID: {sheetConfig.spreadsheetId}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowChangeSheetPanel((prev) => !prev)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Link2 className="h-3.5 w-3.5" />
                <span>
                  {showChangeSheetPanel
                    ? 'Đóng đổi đường dẫn'
                    : 'Đổi đường dẫn Google Sheet'}
                </span>
              </button>
            )}
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
        </div>

        {sheetChangedNotice && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs leading-relaxed text-emerald-800">
            {sheetChangedNotice}
          </div>
        )}

        {isAdmin && showChangeSheetPanel && (
          <div className="mt-5 border-t border-slate-200 pt-5">
            <SheetSetupView
              accessToken={accessToken}
              currentConfig={sheetConfig}
              isAdmin={isAdmin}
              adminEmail={adminEmail}
              onSelectConfig={(nextCfg, savedToServer) => {
                onSelectConfig(nextCfg, savedToServer);
                setShowChangeSheetPanel(false);
                setSheetChangedNotice(
                  savedToServer
                    ? `Đã cập nhật Database Google Sheet dùng chung sang "${nextCfg.title}" (Tab: ${nextCfg.sheetName}). Toàn bộ nhân viên sẽ đồng bộ vào bảng tính mới này.`
                    : `Đã chuyển Database sang "${nextCfg.title}" (Tab: ${nextCfg.sheetName}). Hãy sao chép "Link dùng chung" hoặc mã QR bên dưới để gửi cho điện thoại nhân viên mở thẳng bảng tính mới.`
                );
              }}
              onAuthError={onAuthError}
              embedded
            />
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
          <div>
            <p className="text-sm font-medium text-slate-900">
              Tự động đồng bộ dữ liệu thời gian thực (mỗi 15 giây)
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Cập nhật báo cáo mới từ tất cả nhân viên kho đang dùng chung Google Sheet này.
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

      {/* Admin-only: Configure Login Method for Other Gmail Users */}
      {isAdmin && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 no-print">
          <form onSubmit={handleSaveStaffSettings} className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-start gap-2.5">
                <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Cho phép user Gmail khác đăng nhập (Phương thức nhân viên)
                  </h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                    Cho phép nhân viên sử dụng bất kỳ tài khoản Gmail nào đăng nhập bằng <strong>Email Gmail + Họ tên + Mã truy cập kho</strong> để quét QR, chụp ảnh và ghi trực tiếp vào Google Sheet của bạn mà không bị giới hạn bởi màn hình kiểm duyệt Google.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={staffEnabled}
                onClick={() => setStaffEnabled((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  staffEnabled ? 'bg-slate-900' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${
                    staffEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {loadingStaff ? (
              <div className="py-4 text-xs text-slate-500">
                Đang tải cấu hình truy cập nhân viên...
              </div>
            ) : (
              <>
                {staffError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700"
                  >
                    {staffError}
                  </div>
                )}
                {staffSavedMsg && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
                    {staffSavedMsg}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  {/* Warehouse Access Passcode */}
                  <div>
                    <label
                      htmlFor="staff-passcode"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      {staffSettings?.hasPasscode
                        ? 'Đổi Mã truy cập kho (để trống nếu giữ nguyên)'
                        : 'Đặt Mã truy cập kho cho nhân viên *'}
                    </label>
                    <input
                      id="staff-passcode"
                      type="password"
                      value={newPasscode}
                      onChange={(e) => setNewPasscode(e.target.value)}
                      disabled={Boolean(staffSettings?.usingEnvPasscode)}
                      placeholder={
                        staffSettings?.usingEnvPasscode
                          ? 'Đang dùng biến môi trường STAFF_ACCESS_CODE'
                          : staffSettings?.hasPasscode
                          ? '•••••••• (đã thiết lập)'
                          : 'VD: KHO2026 (tối thiểu 4 ký tự)'
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none disabled:bg-slate-50"
                    />
                    <p className="mt-1.5 text-xs text-slate-500">
                      Trạng thái cầu nối Google Sheet:{' '}
                      <strong
                        className={
                          staffSettings?.relayActive
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }
                      >
                        {staffSettings?.relayActive
                          ? 'Đang sẵn sàng cho nhân viên Gmail khác'
                          : 'Chưa kích hoạt (bật công tắc và nhấn Lưu)'}
                      </strong>
                    </p>
                  </div>

                  {/* Optional Gmail Allowlist */}
                  <div>
                    <label
                      htmlFor="allowed-gmail-input"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Giới hạn danh sách Gmail được phép (tùy chọn)
                    </label>
                    <div className="mt-1.5 flex gap-2">
                      <input
                        id="allowed-gmail-input"
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddAllowedEmail();
                          }
                        }}
                        placeholder="VD: nhanvien1@gmail.com"
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddAllowedEmail}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        <span>Thêm Gmail</span>
                      </button>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500">
                      {allowedEmails.length === 0
                        ? 'Để trống = bất kỳ Gmail nào có Mã truy cập kho đều đăng nhập được.'
                        : `Chỉ ${allowedEmails.length} Gmail bên dưới được phép đăng nhập.`}
                    </p>
                  </div>
                </div>

                {allowedEmails.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {allowedEmails.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-700"
                      >
                        <span>{email}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAllowedEmail(email)}
                          aria-label={`Gỡ ${email}`}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
                  <p className="max-w-xl text-xs text-slate-500">
                    Mã truy cập được mã hóa an toàn trên máy chủ. Ngoài ra, nếu muốn nhân viên bấm trực tiếp nút "Đăng nhập bằng Google", bạn có thể thêm Gmail của họ vào mục Test Users trên Google Cloud và chia sẻ quyền Editor trên file Sheet.
                  </p>
                  <button
                    type="submit"
                    disabled={savingStaff}
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    {savingStaff && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>Lưu cấu hình đăng nhập Gmail khác</span>
                  </button>
                </div>
              </>
            )}
          </form>
        </section>
      )}

      {/* Multi-User Team Access Link & QR */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 no-print">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-9 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <Share2 className="h-4 w-4 text-blue-700 shrink-0" />
              <h2 className="text-base font-semibold">
                Chia sẻ đường dẫn cho nhân viên
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-slate-600">
              Gửi đường dẫn hoặc cho nhân viên quét mã QR bên cạnh để mở nhanh ứng dụng và đăng nhập vào bảng tính{' '}
              <strong className="text-slate-900">{sheetConfig.title}</strong> mà không cần tạo file mới.
            </p>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                readOnly
                value={teamAccessUrl}
                aria-label="Đường dẫn truy cập dùng chung"
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 font-mono text-xs text-slate-700"
              />
              <button
                type="button"
                onClick={handleCopyTeamLink}
                className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                {copiedLink ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Đã sao chép</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Sao chép link dùng chung</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50/70 p-4 lg:col-span-3">
            <QRCodeSVG value={teamAccessUrl} size={112} level="M" />
            <span className="mt-2 text-xs font-medium text-slate-700">
              Quét để mở trên điện thoại
            </span>
          </div>
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
    </div>
  );
};
