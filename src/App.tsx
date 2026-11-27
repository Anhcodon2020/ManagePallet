import React, { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Camera,
  ClipboardList,
  ExternalLink,
  FileSpreadsheet,
  KeyRound,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  Mail,
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
import { ToastContainer, ToastItem, ToastVariant } from './components/ToastContainer';
import {
  clearAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from './services/googleAuth';
import {
  appendPalletRecord,
  clearAdminRelaySession,
  deletePalletRecord,
  extractSpreadsheetId,
  fetchPalletRecords,
  fetchSharedSheetConfig,
  getSpreadsheetMetadata,
  sendAdminRelayHeartbeat,
  staffAppendPalletRecord,
  staffDeletePalletRecord,
  staffFetchPalletRecords,
  staffLogin,
  staffUpdatePalletRecord,
  staffUploadDamagePhoto,
  updatePalletRecord,
  uploadDamagePhotoToDrive,
  WorkspaceAuthError,
  WorkspacePermissionError,
} from './services/googleWorkspace';
import {
  ActiveView,
  AuthMode,
  NewPalletReportInput,
  PalletRecord,
  SpreadsheetConfig,
  StaffAccessPublicStatus,
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

function getUrlSheetParams(): { sheetId: string | null; tab: string | null } {
  const params = new URLSearchParams(window.location.search);
  const rawId = params.get('sheetId');
  const validId = rawId ? extractSpreadsheetId(rawId) : null;
  const tab = params.get('tab')?.trim() || null;
  return { sheetId: validId, tab };
}

function formatViTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('google');
  const [needsAuth, setNeedsAuth] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [staffUser, setStaffUser] = useState<{
    email: string;
    displayName: string;
  } | null>(null);
  // Both Google OAuth access token and Staff session token are strictly held in JS memory
  const [token, setToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Login screen method switcher & staff Gmail form state
  const [loginTab, setLoginTab] = useState<'google' | 'staff'>('google');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [staffAccessStatus, setStaffAccessStatus] =
    useState<StaffAccessPublicStatus>({
      enabled: false,
      hasPasscode: false,
      relayActive: false,
      restrictedToAllowlist: false,
    });

  const [adminEmail, setAdminEmail] = useState<string>('');
  const [sharedConfigLoaded, setSharedConfigLoaded] = useState(false);
  const [sheetConfig, setSheetConfig] = useState<SpreadsheetConfig | null>(() =>
    loadSavedSheetConfig()
  );
  const [permissionDenied, setPermissionDenied] = useState(false);

  const [activeView, setActiveView] = useState<ActiveView>('scan');
  const [records, setRecords] = useState<PalletRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<PalletRecord | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback(
    (
      variant: ToastVariant,
      title: string,
      description?: string,
      durationMs?: number
    ) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [
        ...prev.slice(-3),
        { id, variant, title, description, durationMs },
      ]);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const activeUserEmail =
    authMode === 'staff' ? staffUser?.email || '' : user?.email || '';
  const activeUserName =
    authMode === 'staff'
      ? staffUser?.displayName || staffUser?.email || 'Nhân viên'
      : user?.displayName || user?.email || 'Người dùng Google';

  const isAdmin =
    authMode === 'google' &&
    Boolean(user?.email) &&
    Boolean(adminEmail) &&
    user!.email!.trim().toLowerCase() === adminEmail.trim().toLowerCase();

  useEffect(() => {
    const unsubscribe = initAuth(
      (authUser, accessToken) => {
        setUser(authUser);
        setAuthMode('google');
        setStaffUser(null);
        setToken(accessToken);
        setNeedsAuth(false);
        setAuthReady(true);
      },
      (authUser) => {
        setUser(authUser);
        setAuthReady(true);
        // Only clear auth if we are not currently in an active staff session
        setAuthMode((currMode) => {
          if (currMode === 'staff') return currMode;
          setToken(null);
          setNeedsAuth(true);
          return 'google';
        });
      }
    );
    return () => unsubscribe();
  }, []);

  const resolveSharedDatabase = useCallback(
    async (activeToken: string | null, mode: AuthMode) => {
      try {
        const {
          config: serverConfig,
          adminEmail: serverAdmin,
          staffAccess,
          source: configSource,
        } = await fetchSharedSheetConfig();
        if (serverAdmin) {
          setAdminEmail(serverAdmin);
        }
        setStaffAccessStatus(staffAccess);

        if (mode === 'staff') {
          if (serverConfig) {
            setSheetConfig(serverConfig);
            setPermissionDenied(false);
          }
          setSharedConfigLoaded(true);
          return;
        }

        const urlParams = getUrlSheetParams();

        // Priority 1: Explicit team invite link (?sheetId=...&tab=...)
        if (urlParams.sheetId && activeToken) {
          try {
            const meta = await getSpreadsheetMetadata(
              activeToken,
              urlParams.sheetId
            );
            const matchedTab =
              meta.sheets.find((s) => s.title === urlParams.tab) ||
              meta.sheets[0];
            if (matchedTab) {
              const resolved: SpreadsheetConfig = {
                spreadsheetId: urlParams.sheetId,
                title: meta.title,
                sheetName: matchedTab.title,
                sheetId: matchedTab.sheetId,
                url: meta.url,
                configuredBy: serverAdmin || undefined,
              };
              setSheetConfig(resolved);
              setPermissionDenied(false);
              window.localStorage.setItem(
                SHEET_CONFIG_STORAGE_KEY,
                JSON.stringify(resolved)
              );
              setSharedConfigLoaded(true);
              return;
            }
          } catch (err) {
            if (err instanceof WorkspacePermissionError) {
              setSheetConfig({
                spreadsheetId: urlParams.sheetId,
                title: 'Google Sheet dùng chung',
                sheetName: urlParams.tab || 'Trang tính mặc định',
                sheetId: 0,
                url: `https://docs.google.com/spreadsheets/d/${urlParams.sheetId}/edit`,
                configuredBy: serverAdmin || undefined,
              });
              setPermissionDenied(true);
              setSharedConfigLoaded(true);
              return;
            }
          }
        }

        // Priority 2: Server-configured shared central Google Sheet
        // On static hosting (source === 'env'), keep any Admin-updated localStorage config if present.
        const savedLocal = loadSavedSheetConfig();
        const shouldUseServerConfig =
          Boolean(serverConfig) && (configSource === 'server' || !savedLocal);

        if (serverConfig && shouldUseServerConfig) {
          if (!serverConfig.sheetName && activeToken) {
            try {
              const meta = await getSpreadsheetMetadata(
                activeToken,
                serverConfig.spreadsheetId
              );
              const firstTab = meta.sheets[0];
              if (firstTab) {
                const fullCfg: SpreadsheetConfig = {
                  ...serverConfig,
                  title: meta.title,
                  sheetName: firstTab.title,
                  sheetId: firstTab.sheetId,
                  url: meta.url,
                };
                setSheetConfig(fullCfg);
                setPermissionDenied(false);
                window.localStorage.setItem(
                  SHEET_CONFIG_STORAGE_KEY,
                  JSON.stringify(fullCfg)
                );
                setSharedConfigLoaded(true);
                return;
              }
            } catch (err) {
              if (err instanceof WorkspacePermissionError) {
                setSheetConfig(serverConfig);
                setPermissionDenied(true);
                setSharedConfigLoaded(true);
                return;
              }
            }
          }

          setSheetConfig(serverConfig);
          setPermissionDenied(false);
          window.localStorage.setItem(
            SHEET_CONFIG_STORAGE_KEY,
            JSON.stringify(serverConfig)
          );
          setSharedConfigLoaded(true);
          return;
        }
      } catch {
        // Ignore network errors when reading optional shared config
      } finally {
        setSharedConfigLoaded(true);
      }
    },
    []
  );

  useEffect(() => {
    void resolveSharedDatabase(token, authMode);
  }, [token, authMode, resolveSharedDatabase]);

  // Keep Admin relay token fresh in server RAM whenever Admin is active
  useEffect(() => {
    if (isAdmin && token && staffAccessStatus.enabled) {
      void sendAdminRelayHeartbeat(token);
    }
  }, [isAdmin, token, staffAccessStatus.enabled]);

  const handleSessionExpired = useCallback(() => {
    clearAccessToken();
    setToken(null);
    setStaffUser(null);
    setNeedsAuth(true);
    setAuthError(
      'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại để tiếp tục đồng bộ.'
    );
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    setPermissionDenied(false);
    try {
      const result = await googleSignIn();
      setUser(result.user);
      setStaffUser(null);
      setAuthMode('google');
      setToken(result.accessToken);
      setNeedsAuth(false);
    } catch (err: unknown) {
      const rawMsg =
        err instanceof Error ? err.message : 'Đăng nhập Google thất bại.';
      if (rawMsg.includes('access_denied') || rawMsg.includes('unauthorized')) {
        setAuthError(
          'Tài khoản Gmail này chưa được duyệt đăng nhập Google trực tiếp. Hãy chuyển sang tab "Gmail khác (Nhân viên)" bên cạnh để đăng nhập bằng Mã truy cập kho.'
        );
      } else {
        setAuthError(rawMsg);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setAuthError(null);
    setPermissionDenied(false);
    try {
      const result = await staffLogin({
        email: staffEmail.trim(),
        displayName: staffName.trim(),
        accessCode: staffCode.trim(),
      });
      setAuthMode('staff');
      setStaffUser(result.user);
      setToken(result.sessionToken);
      setSheetConfig(result.config);
      setNeedsAuth(false);
      setStaffCode('');
    } catch (err: unknown) {
      setAuthError(
        err instanceof Error ? err.message : 'Đăng nhập bằng Gmail khác thất bại.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (authMode === 'google') {
      if (isAdmin && token) {
        await clearAdminRelaySession(token);
      }
      await logout();
    }
    setUser(null);
    setStaffUser(null);
    setAuthMode('google');
    setToken(null);
    setNeedsAuth(true);
    setRecords([]);
    setSelectedRecord(null);
    setPermissionDenied(false);
  };

  const handleSelectSheetConfig = (
    config: SpreadsheetConfig,
    _isSharedGlobal: boolean
  ) => {
    setSheetConfig(config);
    setRecords([]);
    setSelectedRecord(null);
    setPermissionDenied(false);
    try {
      window.localStorage.setItem(SHEET_CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Ignore storage quota errors
    }
    try {
      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.has('sheetId') || currentUrl.searchParams.has('tab')) {
        currentUrl.searchParams.delete('sheetId');
        currentUrl.searchParams.delete('tab');
        window.history.replaceState({}, '', currentUrl.toString());
      }
    } catch {
      // Ignore history API restrictions
    }
    setSyncError(null);
    pushToast(
      'success',
      `Đã kết nối Google Sheet "${config.title}"`,
      `Trang tính đang dùng: ${config.sheetName}`
    );
  };

  const refreshRecords = useCallback(
    async (silent = false) => {
      if (!token || !sheetConfig || !sheetConfig.sheetName) return;
      if (!silent) setLoadingRecords(true);
      try {
        const list =
          authMode === 'staff'
            ? await staffFetchPalletRecords(token)
            : await fetchPalletRecords(
                token,
                sheetConfig.spreadsheetId,
                sheetConfig.sheetName
              );
        setRecords(list);
        setPermissionDenied(false);
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
        } else if (err instanceof WorkspacePermissionError) {
          setPermissionDenied(true);
          setSyncError(null);
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
    [token, authMode, sheetConfig, handleSessionExpired]
  );

  useEffect(() => {
    if (token && sheetConfig && sheetConfig.sheetName && !permissionDenied) {
      void refreshRecords(false);
    }
  }, [token, sheetConfig, permissionDenied, refreshRecords]);

  useEffect(() => {
    if (!token || !sheetConfig || !autoRefresh || permissionDenied) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshRecords(true);
      }
    }, 15000);
    return () => window.clearInterval(interval);
  }, [token, sheetConfig, autoRefresh, permissionDenied, refreshRecords]);

  const handleCreateReport = async (input: NewPalletReportInput) => {
    if (!token || !sheetConfig) {
      throw new Error('Chưa kết nối tài khoản hoặc bảng tính.');
    }

    let imageUrl = '';
    let driveFileId = '';

    if (input.photoFile) {
      const uploaded =
        authMode === 'staff'
          ? await staffUploadDamagePhoto(token, input.photoFile, input.serialNumber)
          : await uploadDamagePhotoToDrive(
              token,
              input.photoFile,
              input.serialNumber
            );
      imageUrl = uploaded.webViewLink;
      driveFileId = uploaded.fileId;
    }

    const now = new Date();
    const recordId = `PLT-${now.getTime().toString().slice(-6)}`;
    const reporter = activeUserEmail
      ? `${activeUserName} (${activeUserEmail})`
      : activeUserName;

    const newRecord = {
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
      status: 'Chờ xử lý' as const,
      reporter,
    };

    try {
      if (authMode === 'staff') {
        await staffAppendPalletRecord(token, newRecord);
      } else {
        await appendPalletRecord(
          token,
          sheetConfig.spreadsheetId,
          sheetConfig.sheetName,
          newRecord
        );
      }
    } catch (err) {
      if (err instanceof WorkspaceAuthError) {
        handleSessionExpired();
      } else if (err instanceof WorkspacePermissionError) {
        setPermissionDenied(true);
      }
      throw err;
    }

    await refreshRecords(false);
    pushToast(
      'success',
      `Đã ghi nhận lỗi pallet ${newRecord.serialNumber}`,
      `${newRecord.transactionType} kho · Pallet ${newRecord.source} · Mức độ ${newRecord.severity}${
        imageUrl ? ' · Có ảnh đính kèm' : ''
      }`
    );
  };

  const handleUpdateRecord = async (updated: PalletRecord) => {
    if (!token || !sheetConfig) return;
    try {
      if (authMode === 'staff') {
        await staffUpdatePalletRecord(token, updated);
      } else {
        await updatePalletRecord(
          token,
          sheetConfig.spreadsheetId,
          sheetConfig.sheetName,
          updated
        );
      }
      await refreshRecords(false);
      pushToast(
        'success',
        `Đã cập nhật pallet ${updated.serialNumber}`,
        `Trạng thái: ${updated.status} · Mức độ: ${updated.severity}`
      );
    } catch (err) {
      if (err instanceof WorkspaceAuthError) {
        handleSessionExpired();
      } else if (err instanceof WorkspacePermissionError) {
        setPermissionDenied(true);
      }
      throw err;
    }
  };

  const handleDeleteRecord = async (record: PalletRecord) => {
    if (!token || !sheetConfig) return;
    try {
      if (authMode === 'staff') {
        await staffDeletePalletRecord(token, record.rowIndex, record.driveFileId);
      } else {
        await deletePalletRecord(
          token,
          sheetConfig.spreadsheetId,
          sheetConfig.sheetId,
          record.rowIndex,
          record.driveFileId
        );
      }
      await refreshRecords(false);
      pushToast(
        'info',
        `Đã xóa bản ghi pallet ${record.serialNumber}`,
        `Đã đồng bộ lại dữ liệu trên "${sheetConfig.title}".`
      );
    } catch (err) {
      if (err instanceof WorkspaceAuthError) {
        handleSessionExpired();
      } else if (err instanceof WorkspacePermissionError) {
        setPermissionDenied(true);
      }
      throw err;
    }
  };

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

  // Unauthenticated Welcome & Dual-Method Sign-In Screen
  if (needsAuth || !token) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-4">
            <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              PalletGuard
            </span>
            <div className="hidden md:flex items-center gap-6 text-sm text-slate-600">
              <span>Quét mã QR / Barcode</span>
              <span>Phân loại hư hỏng</span>
              <span>Ảnh minh họa</span>
              <span>Dùng chung 1 Google Sheet</span>
            </div>
            <div className="shrink-0">
              <GoogleSignInButton
                onClick={handleGoogleLogin}
                disabled={isLoggingIn}
                label={isLoggingIn ? 'Đang đăng nhập...' : 'Đăng nhập bằng Google'}
              />
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-10">
          <div className="grid w-full grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
            {/* Left: Value Proposition */}
            <div className="lg:col-span-6 space-y-5">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl leading-tight">
                Quản lý pallet hư hỏng tập trung trên một cơ sở dữ liệu dùng chung
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-slate-600">
                Hỗ trợ đăng nhập bằng tài khoản Google trực tiếp hoặc đăng nhập bằng bất kỳ địa chỉ Gmail nào của nhân viên kho để quét mã QR, chụp ảnh tình trạng pallet và ghi dữ liệu theo thời gian thực vào đúng 1 Google Sheet chung.
              </p>

              {sheetConfig && (
                <div className="max-w-xl flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                  <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-700" />
                  <span className="truncate">
                    Database đang kết nối:{' '}
                    <strong className="text-slate-900">{sheetConfig.title}</strong>
                    {sheetConfig.sheetName ? ` · ${sheetConfig.sheetName}` : ''}
                  </span>
                </div>
              )}

              <ol className="divide-y divide-slate-200/80 border-t border-slate-200 pt-2 text-sm max-w-xl">
                <li className="flex items-start gap-3 py-3">
                  <span className="mt-0.5 font-mono text-xs font-semibold text-slate-400">
                    01
                  </span>
                  <span className="text-slate-700">
                    Quản trị viên &amp; tài khoản đã duyệt chọn <strong>Đăng nhập bằng Google</strong> (tự động hiện danh sách chọn Gmail).
                  </span>
                </li>
                <li className="flex items-start gap-3 py-3">
                  <span className="mt-0.5 font-mono text-xs font-semibold text-slate-400">
                    02
                  </span>
                  <span className="text-slate-700">
                    Nhân viên dùng Gmail khác chọn tab <strong>Gmail khác (Nhân viên)</strong>, nhập Gmail + Họ tên + Mã truy cập kho do quản trị viên cấp.
                  </span>
                </li>
              </ol>
            </div>

            {/* Right: Dual-Method Sign-In Card */}
            <div className="lg:col-span-6">
              <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
                {/* Method Switcher Tabs */}
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginTab('google');
                      setAuthError(null);
                    }}
                    className={`min-h-[40px] rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                      loginTab === 'google'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Đăng nhập bằng Google
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginTab('staff');
                      setAuthError(null);
                    }}
                    className={`min-h-[40px] rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                      loginTab === 'staff'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Gmail khác (Nhân viên)
                  </button>
                </div>

                {authError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs leading-relaxed text-red-700"
                  >
                    {authError}
                  </div>
                )}

                {loginTab === 'google' ? (
                  <div className="space-y-4 py-2">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        Đăng nhập trực tiếp bằng tài khoản Google
                      </h2>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">
                        Dành cho quản trị viên ({adminEmail || 'chủ sở hữu Database'}) hoặc các tài khoản Gmail đã được chia sẻ quyền chỉnh sửa trên Google Sheet. Bạn có thể chọn bất kỳ tài khoản Gmail nào trên cửa sổ đăng nhập.
                      </p>
                    </div>

                    <div className="pt-1">
                      <GoogleSignInButton
                        onClick={handleGoogleLogin}
                        disabled={isLoggingIn}
                        label={
                          isLoggingIn
                            ? 'Đang kết nối Google...'
                            : 'Chọn tài khoản Google để đăng nhập'
                        }
                        className="w-full"
                      />
                    </div>

                    <p className="text-xs text-slate-500">
                      Dùng Gmail khác chưa có quyền trực tiếp?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setLoginTab('staff');
                          setAuthError(null);
                        }}
                        className="font-semibold text-blue-700 hover:underline"
                      >
                        Chuyển sang đăng nhập Gmail nhân viên
                      </button>
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleStaffLogin} className="space-y-4">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        Đăng nhập bằng địa chỉ Gmail khác
                      </h2>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">
                        Nhập địa chỉ Gmail của bạn và Mã truy cập kho do quản trị viên cung cấp để ghi nhận pallet trực tiếp vào Database chung.
                      </p>
                    </div>

                    {!staffAccessStatus.enabled || !staffAccessStatus.relayActive ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3.5 py-3 text-xs leading-relaxed text-amber-900">
                        {!staffAccessStatus.enabled
                          ? `Quản trị viên (${adminEmail || 'Admin'}) chưa bật phương thức đăng nhập cho Gmail khác trong mục "Database & In QR".`
                          : `Phiên cầu nối Google Sheet của quản trị viên (${adminEmail || 'Admin'}) đang tạm nghỉ. Hãy nhờ quản trị viên đăng nhập lại để mở kết nối.`}
                      </div>
                    ) : null}

                    <div>
                      <label
                        htmlFor="staff-email"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Địa chỉ Gmail của bạn <span className="text-red-600">*</span>
                      </label>
                      <div className="relative mt-1">
                        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          id="staff-email"
                          type="email"
                          required
                          value={staffEmail}
                          onChange={(e) => setStaffEmail(e.target.value)}
                          placeholder="nhanvien.kho@gmail.com"
                          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="staff-name"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Họ và tên nhân viên <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="staff-name"
                        type="text"
                        required
                        value={staffName}
                        onChange={(e) => setStaffName(e.target.value)}
                        placeholder="VD: Nguyễn Văn Nam"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="staff-code"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Mã truy cập kho <span className="text-red-600">*</span>
                      </label>
                      <div className="relative mt-1">
                        <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          id="staff-code"
                          type="password"
                          required
                          value={staffCode}
                          onChange={(e) => setStaffCode(e.target.value)}
                          placeholder="Nhập mã do quản trị viên cấp"
                          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoggingIn}
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
                    >
                      {isLoggingIn && <Loader2 className="h-4 w-4 animate-spin" />}
                      <span>Đăng nhập vào Database chung</span>
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!sharedConfigLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600">
          <RefreshCw className="h-4 w-4 animate-spin text-slate-900" />
          <span>Đang kết nối cơ sở dữ liệu Google Sheet dùng chung...</span>
        </div>
      </div>
    );
  }

  // Signed in via Google, but account lacks Editor permission on the shared Google Sheet
  if (sheetConfig && permissionDenied && authMode === 'google') {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4">
            <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              PalletGuard
            </span>
            <div className="flex items-center gap-4 text-sm">
              <span className="hidden text-slate-600 sm:inline">
                {activeUserEmail}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Đổi tài khoản</span>
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-xl px-6 py-14">
          <div className="rounded-xl border border-slate-200 bg-white p-7 space-y-5">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">
                  Tài khoản chưa được cấp quyền chỉnh sửa Google Sheet
                </h1>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  Bạn đang đăng nhập bằng{' '}
                  <strong className="font-mono text-slate-900">
                    {activeUserEmail}
                  </strong>
                  , nhưng tài khoản này chưa có quyền truy cập vào cơ sở dữ liệu dùng chung{' '}
                  <strong className="text-slate-900">{sheetConfig.title}</strong>.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600 space-y-1.5">
              <p className="font-semibold text-slate-800">2 cách để truy cập ngay:</p>
              <p>
                1. Nhờ quản trị viên{' '}
                {adminEmail ? (
                  <strong className="font-mono text-slate-900">{adminEmail}</strong>
                ) : (
                  'sở hữu bảng tính'
                )}{' '}
                chia sẻ quyền <strong>Người chỉnh sửa (Editor)</strong> trên file Google Sheet cho{' '}
                <strong className="font-mono text-slate-900">{activeUserEmail}</strong>.
              </p>
              <p>
                2. Hoặc bấm <strong>Đổi tài khoản</strong> rồi đăng nhập ở tab{' '}
                <strong>Gmail khác (Nhân viên)</strong> bằng Mã truy cập kho.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setPermissionDenied(false);
                  void resolveSharedDatabase(token, authMode);
                }}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Kiểm tra lại quyền truy cập</span>
              </button>

              <a
                href={sheetConfig.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
              >
                <span>Mở Google Sheet để gửi yêu cầu</span>
                <ExternalLink className="h-4 w-4" />
              </a>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setSheetConfig(null);
                    setPermissionDenied(false);
                  }}
                  className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
                >
                  Chọn bảng tính khác
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Signed in, but no shared Spreadsheet connected yet
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
                {activeUserName}
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
          isAdmin={isAdmin}
          adminEmail={adminEmail}
          onSelectConfig={handleSelectSheetConfig}
          onRetryFetchShared={() => resolveSharedDatabase(token, authMode)}
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
      label: 'Database & Nhân viên',
      mobileLabel: 'Cài đặt',
      icon: Settings,
    },
  ];

  const pageTitleMap: Record<ActiveView, string> = {
    dashboard: 'Tổng quan tình trạng pallet theo thời gian thực',
    scan: 'Quét mã QR & Ghi nhận pallet hư hỏng',
    records: 'Nhật ký dữ liệu pallet hư hỏng',
    settings: 'Database dùng chung, Quyền Gmail & In tem QR',
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
                {activeUserName}
              </p>
              <p className="truncate text-[11px] text-slate-500">
                {activeUserEmail} ·{' '}
                {isAdmin
                  ? 'Quản trị'
                  : authMode === 'staff'
                  ? 'Gmail nhân viên'
                  : 'Thành viên'}
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
              authMode={authMode}
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
              authMode={authMode}
              onSelectRecord={setSelectedRecord}
            />
          )}

          {activeView === 'settings' && (
            <SettingsAndQRView
              accessToken={token}
              sheetConfig={sheetConfig}
              isAdmin={isAdmin}
              adminEmail={adminEmail}
              autoRefresh={autoRefresh}
              onToggleAutoRefresh={setAutoRefresh}
              onSelectConfig={handleSelectSheetConfig}
              onStaffSettingsUpdated={() =>
                void resolveSharedDatabase(token, authMode)
              }
              onAuthError={handleSessionExpired}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
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
        authMode={authMode}
        sheetConfig={sheetConfig}
        onClose={() => setSelectedRecord(null)}
        onUpdateRecord={handleUpdateRecord}
        onDeleteRecord={handleDeleteRecord}
      />

      {/* Global Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
