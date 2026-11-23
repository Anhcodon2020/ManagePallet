import React, { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Camera,
  ClipboardList,
  ExternalLink,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  QrCode,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { DashboardView } from './components/DashboardView';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { RecordDetailDrawer } from './components/RecordDetailDrawer';
import { RecordsTableView } from './components/RecordsTableView';
import { ScanReportView } from './components/ScanReportView';
import { SettingsAndQRView } from './components/SettingsAndQRView';
import { SheetSetupView } from './components/SheetSetupView';
import {
  clearAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from './services/googleAuth';
import {
  appendPalletRecord,
  deletePalletRecord,
  fetchPalletRecords,
  updatePalletRecord,
  uploadDamagePhotoToDrive,
  WorkspaceAuthError,
} from './services/googleWorkspace';
import {
  ActiveView,
  NewPalletReportInput,
  PalletRecord,
  SpreadsheetConfig,
} from './types/pallet';

const SHEET_CONFIG_STORAGE_KEY = 'palletguard_sheet_config_v1';

function loadSavedSheetConfig(): SpreadsheetConfig | null {
  try {
    const raw = window.localStorage.getItem(SHEET_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SpreadsheetConfig;
    if (parsed && parsed.spreadsheetId && parsed.sheetName) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function formatViTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [sheetConfig, setSheetConfig] = useState<SpreadsheetConfig | null>(() =>
    loadSavedSheetConfig()
  );
  const [activeView, setActiveView] = useState<ActiveView>('scan');
  const [records, setRecords] = useState<PalletRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<PalletRecord | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (authUser, accessToken) => {
        setUser(authUser);
        setToken(accessToken);
        setNeedsAuth(false);
        setAuthReady(true);
      },
      (authUser) => {
        setUser(authUser);
        setToken(null);
        setNeedsAuth(true);
        setAuthReady(true);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleSessionExpired = useCallback(() => {
    clearAccessToken();
    setToken(null);
    setNeedsAuth(true);
    setAuthError('Phiên làm việc Google Workspace đã hết hạn. Vui lòng đăng nhập lại để tiếp tục đồng bộ.');
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      setUser(result.user);
      setToken(result.accessToken);
      setNeedsAuth(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Đăng nhập Google thất bại. Vui lòng thử lại.';
      setAuthError(msg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setToken(null);
    setNeedsAuth(true);
    setRecords([]);
    setSelectedRecord(null);
  };

  const handleSelectSheetConfig = (config: SpreadsheetConfig) => {
    setSheetConfig(config);
    try {
      window.localStorage.setItem(SHEET_CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Ignore storage quota errors
    }
    setSyncError(null);
  };

  const refreshRecords = useCallback(
    async (silent = false) => {
      if (!token || !sheetConfig) return;
      if (!silent) setLoadingRecords(true);
      try {
        const list = await fetchPalletRecords(
          token,
          sheetConfig.spreadsheetId,
          sheetConfig.sheetName
        );
        setRecords(list);
        setSyncError(null);
        setLastSyncedAt(
          new Date().toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        );
      } catch (err: unknown) {
        if (err instanceof WorkspaceAuthError) {
          handleSessionExpired();
        } else {
          const msg =
            err instanceof Error
              ? err.message
              : 'Không thể đồng bộ dữ liệu từ Google Sheets.';
          setSyncError(msg);
        }
      } finally {
        setLoadingRecords(false);
      }
    },
    [token, sheetConfig, handleSessionExpired]
  );

  // Initial load when authenticated & sheet connected
  useEffect(() => {
    if (token && sheetConfig) {
      void refreshRecords(false);
    }
  }, [token, sheetConfig, refreshRecords]);

  // Real-time background sync every 15 seconds while visible
  useEffect(() => {
    if (!token || !sheetConfig || !autoRefresh) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshRecords(true);
      }
    }, 15000);
    return () => window.clearInterval(interval);
  }, [token, sheetConfig, autoRefresh, refreshRecords]);

  const handleCreateReport = async (input: NewPalletReportInput) => {
    if (!token || !sheetConfig) {
      throw new Error('Chưa kết nối tài khoản Google hoặc bảng tính.');
    }

    let imageUrl = '';
    let driveFileId = '';

    if (input.photoFile) {
      const uploaded = await uploadDamagePhotoToDrive(
        token,
        input.photoFile,
        input.serialNumber
      );
      imageUrl = uploaded.webViewLink;
      driveFileId = uploaded.fileId;
    }

    const now = new Date();
    const recordId = `PLT-${now.getTime().toString().slice(-6)}`;
    const reporter =
      user?.displayName || user?.email || 'Nhân viên kiểm kho';

    try {
      await appendPalletRecord(
        token,
        sheetConfig.spreadsheetId,
        sheetConfig.sheetName,
        {
          id: recordId,
          timestamp: formatViTimestamp(now),
          serialNumber: input.serialNumber,
          transactionType: input.transactionType,
          source: input.source,
          severity: input.severity,
          defectTypes: input.defectTypes,
          notes: input.notes,
          imageUrl,
          driveFileId,
          status: 'Chờ xử lý',
          reporter,
        }
      );
    } catch (err) {
      if (err instanceof WorkspaceAuthError) {
        handleSessionExpired();
      }
      throw err;
    }

    await refreshRecords(false);
  };

  const handleUpdateRecord = async (updated: PalletRecord) => {
    if (!token || !sheetConfig) return;
    try {
      await updatePalletRecord(
        token,
        sheetConfig.spreadsheetId,
        sheetConfig.sheetName,
        updated
      );
      await refreshRecords(false);
    } catch (err) {
      if (err instanceof WorkspaceAuthError) {
        handleSessionExpired();
      }
      throw err;
    }
  };

  const handleDeleteRecord = async (record: PalletRecord) => {
    if (!token || !sheetConfig) return;
    try {
      await deletePalletRecord(
        token,
        sheetConfig.spreadsheetId,
        sheetConfig.sheetId,
        record.rowIndex,
        record.driveFileId
      );
      await refreshRecords(false);
    } catch (err) {
      if (err instanceof WorkspaceAuthError) {
        handleSessionExpired();
      }
      throw err;
    }
  };

  // Loading auth state
  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600">
          <RefreshCw className="h-4 w-4 animate-spin text-slate-900" />
          <span>Đang khởi tạo ứng dụng...</span>
        </div>
      </div>
    );
  }

  // Unauthenticated Welcome & Google Workspace Sign-In Screen
  if (needsAuth || !token) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-4">
            <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              PalletGuard
            </span>
            <div className="hidden md:flex items-center gap-6 text-sm text-slate-600">
              <span>Quét mã QR</span>
              <span>Phân loại hư hỏng</span>
              <span>Ảnh minh họa Drive</span>
              <span>Đồng bộ Google Sheets</span>
            </div>
            <div className="shrink-0">
              <GoogleSignInButton
                onClick={handleLogin}
                disabled={isLoggingIn}
                label={isLoggingIn ? 'Đang đăng nhập...' : 'Đăng nhập bằng Google'}
              />
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-12">
          <div className="grid w-full grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7 space-y-6">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl leading-tight">
                Quản lý pallet hư hỏng và báo cáo tình trạng theo thời gian thực
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-slate-600">
                Quét trực tiếp số series mã QR trên pallet khi nhập xuất kho, ghi nhận lỗi hư hỏng kèm hình ảnh thực tế và đồng bộ tức thì vào cơ sở dữ liệu Google Sheets của doanh nghiệp.
              </p>

              {authError && (
                <div
                  role="alert"
                  className="max-w-xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {authError}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <GoogleSignInButton
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  label={
                    isLoggingIn
                      ? 'Đang kết nối Google...'
                      : 'Đăng nhập bằng Google để bắt đầu'
                  }
                />
                {user?.email && (
                  <p className="text-xs text-slate-500">
                    Tài khoản trước đó: <span className="font-medium text-slate-700">{user.email}</span> — cần cấp lại phiên làm việc.
                  </p>
                )}
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
                <h2 className="text-sm font-semibold text-slate-900">
                  Quy trình kiểm soát tại kho &amp; nhà máy
                </h2>

                <ol className="divide-y divide-slate-100 text-sm">
                  <li className="flex items-start gap-3.5 pb-4">
                    <span className="mt-0.5 font-mono text-xs font-semibold text-slate-400">
                      01
                    </span>
                    <div>
                      <p className="font-semibold text-slate-900">
                        Quét số series mã QR / Barcode
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                        Nhận diện tức thì số series pallet qua camera điện thoại hoặc ảnh chụp, tự động cảnh báo lịch sử hư hỏng cũ.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3.5 py-4">
                    <span className="mt-0.5 font-mono text-xs font-semibold text-slate-400">
                      02
                    </span>
                    <div>
                      <p className="font-semibold text-slate-900">
                        Phân loại chi tiết &amp; chụp ảnh hiện trường
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                        Chọn Nhập/Xuất, Pallet Nhà máy/Kho, mức độ Nhẹ/Nặng, đánh dấu lỗi (nứt chân pallet, gãy nan gỗ, mất thanh đỡ...) và đính kèm ảnh chụp thực tế.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3.5 pt-4">
                    <span className="mt-0.5 font-mono text-xs font-semibold text-slate-400">
                      03
                    </span>
                    <div>
                      <p className="font-semibold text-slate-900">
                        Lưu trữ Google Sheets &amp; Thống kê thời gian thực
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                        Dữ liệu ghi thẳng vào Google Sheets, ảnh lưu an toàn trên Google Drive của bạn, biểu đồ cập nhật liên tục mỗi 15 giây.
                      </p>
                    </div>
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Signed in, but no Spreadsheet selected yet
  if (!sheetConfig) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4">
            <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              PalletGuard
            </span>
            <div className="flex items-center gap-4 text-sm">
              <span className="hidden text-slate-600 sm:inline">
                {user?.displayName || user?.email}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Đăng xuất</span>
              </button>
            </div>
          </div>
        </header>

        <SheetSetupView
          accessToken={token}
          currentConfig={null}
          onSelectConfig={handleSelectSheetConfig}
          onAuthError={handleSessionExpired}
        />
      </div>
    );
  }

  const navItems: Array<{
    id: ActiveView;
    label: string;
    mobileLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'dashboard',
      label: 'Tổng quan',
      mobileLabel: 'Tổng quan',
      icon: LayoutDashboard,
    },
    {
      id: 'scan',
      label: 'Quét QR & Báo cáo',
      mobileLabel: 'Quét QR',
      icon: QrCode,
    },
    {
      id: 'records',
      label: 'Nhật ký Pallet',
      mobileLabel: 'Nhật ký',
      icon: ClipboardList,
    },
    {
      id: 'settings',
      label: 'Google Sheet & In QR',
      mobileLabel: 'Cài đặt',
      icon: Settings,
    },
  ];

  const pageTitleMap: Record<ActiveView, string> = {
    dashboard: 'Tổng quan tình trạng pallet theo thời gian thực',
    scan: 'Quét mã QR & Ghi nhận pallet hư hỏng',
    records: 'Nhật ký dữ liệu pallet hư hỏng',
    settings: 'Cấu hình Google Sheet & In tem mã QR',
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Left Sidebar (256px) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex no-print">
        <div className="flex h-16 items-center border-b border-slate-200 px-6">
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            PalletGuard
          </span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Điều hướng chính">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Connected Spreadsheet & User Profile Footer */}
        <div className="border-t border-slate-200 p-4 space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-700" />
              <span className="truncate">{sheetConfig.title}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
              <span className="truncate font-mono">{sheetConfig.sheetName}</span>
              <a
                href={sheetConfig.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline whitespace-nowrap shrink-0"
              >
                <span>Mở Sheet</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-900">
                {user?.displayName || 'Người dùng Google'}
              </p>
              <p className="truncate text-[11px] text-slate-500">
                {user?.email}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Đăng xuất"
              aria-label="Đăng xuất"
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0">
        {/* Top Bar Contract: Breadcrumb/Title on Left — Sync + 1 Primary CTA on Right */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-xs sm:px-6 no-print">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-900 lg:hidden">
                PalletGuard
              </span>
              <span className="lg:hidden" aria-hidden="true">/</span>
              <span className="truncate">
                {sheetConfig.title} · {sheetConfig.sheetName}
              </span>
              {lastSyncedAt && (
                <>
                  <span className="hidden sm:inline" aria-hidden="true">·</span>
                  <span className="hidden font-mono tabular-nums sm:inline">
                    Đồng bộ lúc {lastSyncedAt}
                  </span>
                </>
              )}
            </div>
            <h1 className="truncate text-sm font-semibold text-slate-900 sm:text-base">
              {pageTitleMap[activeView]}
            </h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => void refreshRecords(false)}
              disabled={loadingRecords}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loadingRecords ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline">Làm mới</span>
            </button>

            {activeView !== 'scan' && (
              <button
                type="button"
                onClick={() => setActiveView('scan')}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Camera className="h-3.5 w-3.5" />
                <span>Quét QR mới</span>
              </button>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          {syncError && (
            <div
              role="alert"
              className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 no-print"
            >
              <span>{syncError}</span>
              <button
                type="button"
                onClick={() => void refreshRecords(false)}
                className="text-xs font-semibold underline whitespace-nowrap"
              >
                Thử lại
              </button>
            </div>
          )}

          {activeView === 'dashboard' && (
            <DashboardView
              records={records}
              loading={loadingRecords}
              accessToken={token}
              onNavigateScan={() => setActiveView('scan')}
              onNavigateRecords={() => setActiveView('records')}
              onSelectRecord={setSelectedRecord}
            />
          )}

          {activeView === 'scan' && (
            <ScanReportView
              records={records}
              sheetConfig={sheetConfig}
              onSubmitReport={handleCreateReport}
              onSelectRecord={setSelectedRecord}
            />
          )}

          {activeView === 'records' && (
            <RecordsTableView
              records={records}
              loading={loadingRecords}
              accessToken={token}
              onSelectRecord={setSelectedRecord}
            />
          )}

          {activeView === 'settings' && (
            <SettingsAndQRView
              accessToken={token}
              sheetConfig={sheetConfig}
              autoRefresh={autoRefresh}
              onToggleAutoRefresh={setAutoRefresh}
              onSelectConfig={handleSelectSheetConfig}
              onAuthError={handleSessionExpired}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation (Compact 58px height) */}
      <nav
        aria-label="Điều hướng di động"
        className="fixed inset-x-0 bottom-0 z-30 grid h-14 grid-cols-4 border-t border-slate-200 bg-white lg:hidden no-print"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveView(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                active ? 'text-slate-900 font-semibold' : 'text-slate-500'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{item.mobileLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Detail & Edit Slide-over Drawer */}
      <RecordDetailDrawer
        record={selectedRecord}
        accessToken={token}
        sheetConfig={sheetConfig}
        onClose={() => setSelectedRecord(null)}
        onUpdateRecord={handleUpdateRecord}
        onDeleteRecord={handleDeleteRecord}
      />
    </div>
  );
}
