import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';

interface SharedSheetConfig {
  spreadsheetId: string;
  title: string;
  sheetName: string;
  sheetId: number;
  url: string;
  updatedAt: string;
  configuredBy: string;
}

interface StaffAccessStoredConfig {
  enabled: boolean;
  passcodeHash: string | null; // format: "<saltHex>:<scryptHex>"
  allowedEmails: string[]; // empty = any valid email with correct passcode
}

interface StoredState {
  sheet: SharedSheetConfig | null;
  staff: StaffAccessStoredConfig;
}

interface StaffSessionPayload {
  email: string;
  displayName: string;
  role: 'staff';
  exp: number;
}

const PORT = 3000;
const BASE_DIR = path.resolve(process.cwd());
const CONFIG_FILE_PATH = path.resolve(BASE_DIR, '.palletguard-shared-sheet.json');
const ADMIN_EMAIL = (
  process.env.ADMIN_EMAIL || 'nguyenanhtam2002@gmail.com'
)
  .trim()
  .toLowerCase();

const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

const SPREADSHEET_ID_REGEX = /^[a-zA-Z0-9-_]{15,120}$/;
const DRIVE_FILE_ID_REGEX = /^[a-zA-Z0-9-_]{10,120}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const PHOTO_FOLDER_NAME = 'PalletGuard_HinhAnh';

// Strictly in-memory Admin Google Workspace token used to relay authenticated staff requests
// to the single configured shared spreadsheet. Never persisted to disk or exposed to clients.
let adminRelayToken: string | null = null;
let adminRelayUpdatedAt: number | null = null;

// In-memory brute-force protection for staff passcode login
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function assertConfinedPath(filePath: string): void {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(BASE_DIR + path.sep)) {
    throw new Error('Invalid config file path');
  }
}

function defaultStaffConfig(): StaffAccessStoredConfig {
  return {
    enabled: false,
    passcodeHash: null,
    allowedEmails: [],
  };
}

function readStoredState(): StoredState {
  assertConfinedPath(CONFIG_FILE_PATH);
  let sheet: SharedSheetConfig | null = null;
  let staff: StaffAccessStoredConfig = defaultStaffConfig();

  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const raw = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      // Backward-compatible with flat SharedSheetConfig or new { sheet, staff } shape
      const sheetObj = (
        parsed.sheet && typeof parsed.sheet === 'object' ? parsed.sheet : parsed
      ) as Partial<SharedSheetConfig>;

      if (
        sheetObj.spreadsheetId &&
        typeof sheetObj.spreadsheetId === 'string' &&
        SPREADSHEET_ID_REGEX.test(sheetObj.spreadsheetId) &&
        typeof sheetObj.sheetName === 'string' &&
        sheetObj.sheetName
      ) {
        sheet = {
          spreadsheetId: sheetObj.spreadsheetId,
          title: sheetObj.title || 'Google Sheet dùng chung',
          sheetName: sheetObj.sheetName,
          sheetId: typeof sheetObj.sheetId === 'number' ? sheetObj.sheetId : 0,
          url: `https://docs.google.com/spreadsheets/d/${sheetObj.spreadsheetId}/edit`,
          updatedAt: sheetObj.updatedAt || new Date().toISOString(),
          configuredBy: sheetObj.configuredBy || ADMIN_EMAIL,
        };
      }

      if (parsed.staff && typeof parsed.staff === 'object') {
        const s = parsed.staff as Partial<StaffAccessStoredConfig>;
        staff = {
          enabled: Boolean(s.enabled),
          passcodeHash: typeof s.passcodeHash === 'string' ? s.passcodeHash : null,
          allowedEmails: Array.isArray(s.allowedEmails)
            ? s.allowedEmails
                .filter((e): e is string => typeof e === 'string')
                .map((e) => e.trim().toLowerCase())
                .filter((e) => EMAIL_REGEX.test(e))
            : [],
        };
      }
    }
  } catch {
    // Fall through to env defaults
  }

  if (!sheet) {
    const envSheetId = (process.env.DEFAULT_SPREADSHEET_ID || '').trim();
    const envSheetName = (process.env.DEFAULT_SHEET_NAME || '').trim();
    if (envSheetId && SPREADSHEET_ID_REGEX.test(envSheetId)) {
      sheet = {
        spreadsheetId: envSheetId,
        title: 'Google Sheet dùng chung',
        sheetName: envSheetName || '',
        sheetId: 0,
        url: `https://docs.google.com/spreadsheets/d/${envSheetId}/edit`,
        updatedAt: new Date().toISOString(),
        configuredBy: ADMIN_EMAIL,
      };
    }
  }

  return { sheet, staff };
}

function writeStoredState(state: StoredState): void {
  assertConfinedPath(CONFIG_FILE_PATH);
  fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

function hashPasscode(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPasscode(plain: string, storedHash: string | null): boolean {
  const envPasscode = (process.env.STAFF_ACCESS_CODE || '').trim();
  if (envPasscode) {
    const a = Buffer.from(plain, 'utf-8');
    const b = Buffer.from(envPasscode, 'utf-8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  try {
    const derived = crypto.scryptSync(plain, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function hasConfiguredPasscode(staff: StaffAccessStoredConfig): boolean {
  return Boolean((process.env.STAFF_ACCESS_CODE || '').trim() || staff.passcodeHash);
}

function signStaffToken(payload: StaffSessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyStaffToken(authHeader: string | undefined): StaffSessionPayload | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf-8')
    ) as StaffSessionPayload;
    if (
      payload.role !== 'staff' ||
      !payload.email ||
      typeof payload.exp !== 'number' ||
      Date.now() > payload.exp
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function verifyGoogleAdmin(
  authHeader: string | undefined
): Promise<
  | { ok: true; email: string; token: string }
  | { ok: false; status: number; error: string }
> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Thiếu mã xác thực Google.' };
  }
  const token = authHeader.slice(7).trim();
  if (!token || token.length > 4096) {
    return { ok: false, status: 401, error: 'Mã xác thực không hợp lệ.' };
  }

  try {
    const userInfoRes = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!userInfoRes.ok) {
      return {
        ok: false,
        status: 401,
        error: 'Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn.',
      };
    }

    const profile = (await userInfoRes.json()) as {
      email?: string;
      email_verified?: boolean;
    };

    const email = (profile.email || '').trim().toLowerCase();
    if (!email || profile.email_verified !== true) {
      return {
        ok: false,
        status: 401,
        error: 'Không xác minh được email hợp lệ từ tài khoản Google.',
      };
    }

    if (email !== ADMIN_EMAIL) {
      return {
        ok: false,
        status: 403,
        error: `Chỉ quản trị viên (${ADMIN_EMAIL}) mới có quyền thay đổi cấu hình hệ thống.`,
      };
    }

    return { ok: true, email, token };
  } catch {
    return {
      ok: false,
      status: 502,
      error: 'Không thể kết nối máy chủ xác thực Google.',
    };
  }
}

function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function isRelayActive(): boolean {
  if (!adminRelayToken || !adminRelayUpdatedAt) return false;
  // Google OAuth access tokens typically live 60 mins; mark stale after 55 mins
  return Date.now() - adminRelayUpdatedAt < 55 * 60 * 1000;
}

async function getOrCreateDriveFolder(token: string): Promise<string> {
  const query = encodeURIComponent(
    `name='${PHOTO_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const searchRes = await fetch(
    `${DRIVE_API}?q=${query}&fields=files(id,name)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (searchRes.ok) {
    const data = (await searchRes.json()) as { files?: Array<{ id: string }> };
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  const createRes = await fetch(DRIVE_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: PHOTO_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!createRes.ok) {
    throw new Error('Không thể tạo thư mục lưu ảnh trên Google Drive.');
  }
  const folder = (await createRes.json()) as { id: string };
  return folder.id;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  // Public safe metadata (never returns tokens, hashes, or employee email list)
  app.get('/api/shared-config', (_req, res) => {
    const state = readStoredState();
    res.json({
      config: state.sheet,
      adminEmail: ADMIN_EMAIL,
      staffAccess: {
        enabled: state.staff.enabled,
        hasPasscode: hasConfiguredPasscode(state.staff),
        relayActive: isRelayActive(),
        restrictedToAllowlist: state.staff.allowedEmails.length > 0,
      },
    });
  });

  // Admin-only update of central shared Google Sheet
  app.put('/api/shared-config', async (req, res) => {
    const auth = await verifyGoogleAdmin(req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const body = req.body as Partial<SharedSheetConfig> | null;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Dữ liệu cấu hình không hợp lệ.' });
      return;
    }

    const spreadsheetId =
      typeof body.spreadsheetId === 'string' ? body.spreadsheetId.trim() : '';
    const sheetName =
      typeof body.sheetName === 'string' ? body.sheetName.trim() : '';
    const title =
      typeof body.title === 'string' && body.title.trim()
        ? body.title.trim().slice(0, 200)
        : 'Google Sheet dùng chung';
    const sheetId =
      typeof body.sheetId === 'number' &&
      Number.isInteger(body.sheetId) &&
      body.sheetId >= 0
        ? body.sheetId
        : 0;

    if (!SPREADSHEET_ID_REGEX.test(spreadsheetId)) {
      res.status(400).json({ error: 'Spreadsheet ID không đúng định dạng.' });
      return;
    }
    if (!sheetName || sheetName.length > 100) {
      res.status(400).json({ error: 'Tên trang tính (tab) không hợp lệ.' });
      return;
    }

    const state = readStoredState();
    const saved: SharedSheetConfig = {
      spreadsheetId,
      title,
      sheetName,
      sheetId,
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      updatedAt: new Date().toISOString(),
      configuredBy: auth.email,
    };

    try {
      writeStoredState({ sheet: saved, staff: state.staff });
      if (state.staff.enabled) {
        adminRelayToken = auth.token;
        adminRelayUpdatedAt = Date.now();
      }
      res.json({ config: saved, adminEmail: ADMIN_EMAIL });
    } catch {
      res
        .status(500)
        .json({ error: 'Không thể lưu cấu hình cơ sở dữ liệu dùng chung.' });
    }
  });

  // Admin-only fetch full staff access settings (including allowlist emails)
  app.get('/api/staff/admin-settings', async (req, res) => {
    const auth = await verifyGoogleAdmin(req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    const state = readStoredState();
    if (state.staff.enabled) {
      adminRelayToken = auth.token;
      adminRelayUpdatedAt = Date.now();
    }
    res.json({
      enabled: state.staff.enabled,
      hasPasscode: hasConfiguredPasscode(state.staff),
      usingEnvPasscode: Boolean((process.env.STAFF_ACCESS_CODE || '').trim()),
      relayActive: isRelayActive(),
      allowedEmails: state.staff.allowedEmails,
    });
  });

  // Admin-only update staff Gmail login settings & refresh in-RAM relay token
  app.post('/api/staff/admin-settings', async (req, res) => {
    const auth = await verifyGoogleAdmin(req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const body = req.body as {
      enabled?: boolean;
      newPasscode?: string;
      allowedEmails?: string[];
    } | null;

    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Dữ liệu cấu hình không hợp lệ.' });
      return;
    }

    const state = readStoredState();
    const nextEnabled = Boolean(body.enabled);
    let nextHash = state.staff.passcodeHash;

    if (typeof body.newPasscode === 'string' && body.newPasscode.trim() !== '') {
      const trimmed = body.newPasscode.trim();
      if (trimmed.length < 4 || trimmed.length > 64) {
        res
          .status(400)
          .json({ error: 'Mã truy cập kho phải dài từ 4 đến 64 ký tự.' });
        return;
      }
      nextHash = hashPasscode(trimmed);
    }

    if (
      nextEnabled &&
      !nextHash &&
      !(process.env.STAFF_ACCESS_CODE || '').trim()
    ) {
      res.status(400).json({
        error: 'Vui lòng đặt Mã truy cập kho trước khi bật đăng nhập cho Gmail khác.',
      });
      return;
    }

    const nextAllowedEmails = Array.isArray(body.allowedEmails)
      ? Array.from(
          new Set(
            body.allowedEmails
              .filter((e): e is string => typeof e === 'string')
              .map((e) => e.trim().toLowerCase())
              .filter((e) => EMAIL_REGEX.test(e))
          )
        ).slice(0, 200)
      : state.staff.allowedEmails;

    const updatedStaff: StaffAccessStoredConfig = {
      enabled: nextEnabled,
      passcodeHash: nextHash,
      allowedEmails: nextAllowedEmails,
    };

    writeStoredState({ sheet: state.sheet, staff: updatedStaff });

    if (nextEnabled) {
      adminRelayToken = auth.token;
      adminRelayUpdatedAt = Date.now();
    } else {
      adminRelayToken = null;
      adminRelayUpdatedAt = null;
    }

    res.json({
      enabled: updatedStaff.enabled,
      hasPasscode: hasConfiguredPasscode(updatedStaff),
      usingEnvPasscode: Boolean((process.env.STAFF_ACCESS_CODE || '').trim()),
      relayActive: isRelayActive(),
      allowedEmails: updatedStaff.allowedEmails,
    });
  });

  // Admin heartbeat to keep in-RAM relay token fresh while Admin uses the app
  app.post('/api/staff/relay-heartbeat', async (req, res) => {
    const auth = await verifyGoogleAdmin(req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    const state = readStoredState();
    if (state.staff.enabled) {
      adminRelayToken = auth.token;
      adminRelayUpdatedAt = Date.now();
    }
    res.json({ relayActive: isRelayActive() });
  });

  // Clear in-RAM relay token on Admin logout if desired
  app.post('/api/staff/relay-clear', async (req, res) => {
    const auth = await verifyGoogleAdmin(req.headers.authorization);
    if (auth.ok) {
      adminRelayToken = null;
      adminRelayUpdatedAt = null;
    }
    res.json({ ok: true });
  });

  // Staff Login for ANY other Gmail user using Email + Display Name + Warehouse Passcode
  app.post('/api/staff/login', (req, res) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const record = loginAttempts.get(ip);
    if (record && now < record.resetAt && record.count >= MAX_LOGIN_ATTEMPTS) {
      res.status(429).json({
        error: 'Bạn đã nhập sai mã truy cập quá nhiều lần. Vui lòng thử lại sau 15 phút.',
      });
      return;
    }

    const body = req.body as {
      email?: string;
      displayName?: string;
      accessCode?: string;
    } | null;

    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const displayName =
      typeof body?.displayName === 'string' ? body.displayName.trim().slice(0, 80) : '';
    const accessCode =
      typeof body?.accessCode === 'string' ? body.accessCode.trim() : '';

    if (!EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: 'Vui lòng nhập địa chỉ Gmail hợp lệ.' });
      return;
    }
    if (!displayName || displayName.length < 2) {
      res.status(400).json({ error: 'Vui lòng nhập họ và tên nhân viên.' });
      return;
    }
    if (!accessCode) {
      res.status(400).json({ error: 'Vui lòng nhập mã truy cập kho.' });
      return;
    }

    const state = readStoredState();
    if (!state.sheet) {
      res.status(503).json({
        error: `Quản trị viên (${ADMIN_EMAIL}) chưa gắn Google Sheet dùng chung.`,
      });
      return;
    }
    if (!state.staff.enabled) {
      res.status(403).json({
        error: `Quản trị viên (${ADMIN_EMAIL}) chưa bật phương thức đăng nhập cho Gmail khác.`,
      });
      return;
    }
    if (!isRelayActive()) {
      res.status(503).json({
        error: `Phiên kết nối Google Sheet của quản trị viên (${ADMIN_EMAIL}) tạm hết hạn. Hãy nhờ quản trị viên đăng nhập lại để kích hoạt cầu nối dữ liệu.`,
      });
      return;
    }

    if (
      state.staff.allowedEmails.length > 0 &&
      !state.staff.allowedEmails.includes(email)
    ) {
      res.status(403).json({
        error: `Email ${email} chưa có trong danh sách nhân viên được phép truy cập. Liên hệ ${ADMIN_EMAIL} để thêm email này.`,
      });
      return;
    }

    if (!verifyPasscode(accessCode, state.staff.passcodeHash)) {
      const nextCount = record && now < record.resetAt ? record.count + 1 : 1;
      loginAttempts.set(ip, {
        count: nextCount,
        resetAt: record && now < record.resetAt ? record.resetAt : now + LOGIN_WINDOW_MS,
      });
      res.status(401).json({ error: 'Mã truy cập kho không chính xác.' });
      return;
    }

    loginAttempts.delete(ip);
    const sessionToken = signStaffToken({
      email,
      displayName,
      role: 'staff',
      exp: now + 12 * 60 * 60 * 1000,
    });

    res.json({
      sessionToken,
      user: { email, displayName },
      config: state.sheet,
    });
  });

  // Helper to verify staff request + ensure active relay & configured shared sheet
  function requireStaffAndRelay(
    req: express.Request,
    res: express.Response
  ): { staff: StaffSessionPayload; sheet: SharedSheetConfig; relayToken: string } | null {
    const staff = verifyStaffToken(req.headers.authorization);
    if (!staff) {
      res.status(401).json({ error: 'Phiên đăng nhập nhân viên đã hết hạn. Vui lòng đăng nhập lại.' });
      return null;
    }
    const state = readStoredState();
    if (!state.staff.enabled || !state.sheet) {
      res.status(403).json({ error: 'Quyền truy cập cho Gmail khác hiện đang tắt.' });
      return null;
    }
    if (!isRelayActive() || !adminRelayToken) {
      res.status(503).json({
        error: `Phiên kết nối của quản trị viên (${ADMIN_EMAIL}) đã hết hạn. Vui lòng nhờ quản trị viên mở lại ứng dụng để làm mới kết nối.`,
      });
      return null;
    }
    return { staff, sheet: state.sheet, relayToken: adminRelayToken };
  }

  // Staff GET records (strictly scoped to the single configured shared spreadsheet)
  app.get('/api/staff/records', async (req, res) => {
    const ctx = requireStaffAndRelay(req, res);
    if (!ctx) return;

    const range = encodeURIComponent(`${quoteSheetName(ctx.sheet.sheetName)}!A2:L2000`);
    const googleRes = await fetch(
      `${SHEETS_API}/${ctx.sheet.spreadsheetId}/values/${range}`,
      { headers: { Authorization: `Bearer ${ctx.relayToken}` } }
    );

    if (googleRes.status === 401) {
      adminRelayToken = null;
      adminRelayUpdatedAt = null;
      res.status(503).json({
        error: `Phiên kết nối Google của quản trị viên (${ADMIN_EMAIL}) đã hết hạn. Vui lòng nhờ quản trị viên đăng nhập lại.`,
      });
      return;
    }
    if (!googleRes.ok) {
      res.status(googleRes.status).json({ error: 'Không thể đọc dữ liệu từ Google Sheet chung.' });
      return;
    }
    res.json(await googleRes.json());
  });

  // Staff POST append new pallet record
  app.post('/api/staff/records', async (req, res) => {
    const ctx = requireStaffAndRelay(req, res);
    if (!ctx) return;

    const body = req.body as { rowValues?: unknown } | null;
    if (!body || !Array.isArray(body.rowValues) || body.rowValues.length !== 12) {
      res.status(400).json({ error: 'Dữ liệu dòng báo cáo không hợp lệ.' });
      return;
    }
    const sanitizedRow = body.rowValues.map((v) =>
      typeof v === 'string' ? v.slice(0, 1000) : String(v ?? '').slice(0, 1000)
    );
    // Enforce server-verified staff reporter identity in column L (index 11)
    sanitizedRow[11] = `${ctx.staff.displayName} (${ctx.staff.email})`;

    const range = encodeURIComponent(`${quoteSheetName(ctx.sheet.sheetName)}!A:L`);
    const googleRes = await fetch(
      `${SHEETS_API}/${ctx.sheet.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.relayToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [sanitizedRow] }),
      }
    );

    if (googleRes.status === 401) {
      adminRelayToken = null;
      adminRelayUpdatedAt = null;
      res.status(503).json({
        error: `Phiên kết nối Google của quản trị viên (${ADMIN_EMAIL}) đã hết hạn.`,
      });
      return;
    }
    if (!googleRes.ok) {
      res.status(googleRes.status).json({ error: 'Không thể ghi báo cáo vào Google Sheet chung.' });
      return;
    }
    res.json({ ok: true });
  });

  // Staff PUT update existing pallet record
  app.put('/api/staff/records', async (req, res) => {
    const ctx = requireStaffAndRelay(req, res);
    if (!ctx) return;

    const body = req.body as { rowIndex?: unknown; rowValues?: unknown } | null;
    const rowIndex = typeof body?.rowIndex === 'number' ? body.rowIndex : -1;
    if (
      !Number.isInteger(rowIndex) ||
      rowIndex < 2 ||
      rowIndex > 100000 ||
      !Array.isArray(body?.rowValues) ||
      body.rowValues.length !== 12
    ) {
      res.status(400).json({ error: 'Dữ liệu cập nhật không hợp lệ.' });
      return;
    }

    const sanitizedRow = body.rowValues.map((v) =>
      typeof v === 'string' ? v.slice(0, 1000) : String(v ?? '').slice(0, 1000)
    );

    const range = encodeURIComponent(
      `${quoteSheetName(ctx.sheet.sheetName)}!A${rowIndex}:L${rowIndex}`
    );
    const googleRes = await fetch(
      `${SHEETS_API}/${ctx.sheet.spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${ctx.relayToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [sanitizedRow] }),
      }
    );

    if (googleRes.status === 401) {
      adminRelayToken = null;
      adminRelayUpdatedAt = null;
      res.status(503).json({
        error: `Phiên kết nối Google của quản trị viên (${ADMIN_EMAIL}) đã hết hạn.`,
      });
      return;
    }
    if (!googleRes.ok) {
      res.status(googleRes.status).json({ error: 'Không thể cập nhật dòng trên Google Sheet.' });
      return;
    }
    res.json({ ok: true });
  });

  // Staff DELETE pallet record
  app.delete('/api/staff/records/:rowIndex', async (req, res) => {
    const ctx = requireStaffAndRelay(req, res);
    if (!ctx) return;

    const rowIndex = Number.parseInt(req.params.rowIndex, 10);
    if (!Number.isInteger(rowIndex) || rowIndex < 2 || rowIndex > 100000) {
      res.status(400).json({ error: 'Số dòng cần xóa không hợp lệ.' });
      return;
    }

    const googleRes = await fetch(
      `${SHEETS_API}/${ctx.sheet.spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.relayToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: ctx.sheet.sheetId,
                  dimension: 'ROWS',
                  startIndex: rowIndex - 1,
                  endIndex: rowIndex,
                },
              },
            },
          ],
        }),
      }
    );

    if (googleRes.status === 401) {
      adminRelayToken = null;
      adminRelayUpdatedAt = null;
      res.status(503).json({
        error: `Phiên kết nối Google của quản trị viên (${ADMIN_EMAIL}) đã hết hạn.`,
      });
      return;
    }
    if (!googleRes.ok) {
      res.status(googleRes.status).json({ error: 'Không thể xóa dòng trên Google Sheet.' });
      return;
    }

    const driveFileId =
      typeof req.query.driveFileId === 'string' ? req.query.driveFileId.trim() : '';
    if (driveFileId && DRIVE_FILE_ID_REGEX.test(driveFileId)) {
      await fetch(`${DRIVE_API}/${encodeURIComponent(driveFileId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ctx.relayToken}` },
      }).catch(() => {});
    }

    res.json({ ok: true });
  });

  // Staff POST upload damage photo (base64 JPEG up to 5MB) into Admin's Drive folder
  app.post(
    '/api/staff/upload-photo',
    express.json({ limit: '5mb' }),
    async (req, res) => {
      const ctx = requireStaffAndRelay(req, res);
      if (!ctx) return;

      const body = req.body as {
        base64Data?: string;
        mimeType?: string;
        serialNumber?: string;
      } | null;

      const allowedMimes = new Set(['image/jpeg', 'image/png', 'image/webp']);
      const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : '';
      const base64Data = typeof body?.base64Data === 'string' ? body.base64Data : '';
      const serial = typeof body?.serialNumber === 'string' ? body.serialNumber : 'PALLET';

      if (!allowedMimes.has(mimeType) || !base64Data) {
        res.status(400).json({ error: 'Định dạng hình ảnh không hợp lệ.' });
        return;
      }

      try {
        const buffer = Buffer.from(base64Data, 'base64');
        if (buffer.length === 0 || buffer.length > 4 * 1024 * 1024) {
          res.status(400).json({ error: 'Dung lượng ảnh vượt quá giới hạn 4MB.' });
          return;
        }

        const folderId = await getOrCreateDriveFolder(ctx.relayToken);
        const safeSerial = serial.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40) || 'PALLET';
        const fileName = `${safeSerial}_${Date.now()}.jpg`;

        const metadata = {
          name: fileName,
          parents: [folderId],
          mimeType,
        };

        const formData = new FormData();
        formData.append(
          'metadata',
          new Blob([JSON.stringify(metadata)], { type: 'application/json' })
        );
        formData.append('file', new Blob([buffer], { type: mimeType }), fileName);

        const uploadRes = await fetch(
          `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,webViewLink`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${ctx.relayToken}` },
            body: formData,
          }
        );

        if (!uploadRes.ok) {
          res.status(uploadRes.status).json({ error: 'Tải ảnh lên Google Drive thất bại.' });
          return;
        }

        const uploaded = (await uploadRes.json()) as {
          id: string;
          webViewLink?: string;
        };

        await fetch(`${DRIVE_API}/${encodeURIComponent(uploaded.id)}/permissions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ctx.relayToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ role: 'reader', type: 'anyone' }),
        }).catch(() => {});

        res.json({
          fileId: uploaded.id,
          webViewLink:
            uploaded.webViewLink ||
            `https://drive.google.com/file/d/${uploaded.id}/view`,
        });
      } catch {
        res.status(500).json({ error: 'Lỗi khi tải ảnh lên Google Drive.' });
      }
    }
  );

  // Staff GET Drive photo proxy (strictly validates fileId & image content-type)
  app.get('/api/staff/photo/:fileId', async (req, res) => {
    const ctx = requireStaffAndRelay(req, res);
    if (!ctx) return;

    const fileId = (req.params.fileId || '').trim();
    if (!DRIVE_FILE_ID_REGEX.test(fileId)) {
      res.status(400).end();
      return;
    }

    try {
      const driveRes = await fetch(
        `${DRIVE_API}/${encodeURIComponent(fileId)}?alt=media`,
        { headers: { Authorization: `Bearer ${ctx.relayToken}` } }
      );
      if (!driveRes.ok) {
        res.status(driveRes.status).end();
        return;
      }
      const contentType = driveRes.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) {
        res.status(415).end();
        return;
      }
      const arrayBuffer = await driveRes.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(Buffer.from(arrayBuffer));
    } catch {
      res.status(502).end();
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(BASE_DIR, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PalletGuard server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
