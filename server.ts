import 'dotenv/config';
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

const PORT = 3000;
const BASE_DIR = path.resolve(process.cwd());
const CONFIG_FILE_PATH = path.resolve(BASE_DIR, '.palletguard-shared-sheet.json');
const ADMIN_EMAIL = (
  process.env.ADMIN_EMAIL || 'nguyenanhtam2002@gmail.com'
)
  .trim()
  .toLowerCase();

const SPREADSHEET_ID_REGEX = /^[a-zA-Z0-9-_]{15,120}$/;

function assertConfinedPath(filePath: string): void {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(BASE_DIR + path.sep)) {
    throw new Error('Invalid config file path');
  }
}

function readStoredConfig(): SharedSheetConfig | null {
  assertConfinedPath(CONFIG_FILE_PATH);
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const raw = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<SharedSheetConfig>;
      if (
        parsed.spreadsheetId &&
        SPREADSHEET_ID_REGEX.test(parsed.spreadsheetId) &&
        parsed.sheetName
      ) {
        return {
          spreadsheetId: parsed.spreadsheetId,
          title: parsed.title || 'Google Sheet dùng chung',
          sheetName: parsed.sheetName,
          sheetId: typeof parsed.sheetId === 'number' ? parsed.sheetId : 0,
          url: `https://docs.google.com/spreadsheets/d/${parsed.spreadsheetId}/edit`,
          updatedAt: parsed.updatedAt || new Date().toISOString(),
          configuredBy: parsed.configuredBy || ADMIN_EMAIL,
        };
      }
    }
  } catch {
    // Fall through to env default
  }

  const envSheetId = (process.env.DEFAULT_SPREADSHEET_ID || '').trim();
  const envSheetName = (process.env.DEFAULT_SHEET_NAME || '').trim();
  if (envSheetId && SPREADSHEET_ID_REGEX.test(envSheetId)) {
    return {
      spreadsheetId: envSheetId,
      title: 'Google Sheet dùng chung',
      sheetName: envSheetName || '',
      sheetId: 0,
      url: `https://docs.google.com/spreadsheets/d/${envSheetId}/edit`,
      updatedAt: new Date().toISOString(),
      configuredBy: ADMIN_EMAIL,
    };
  }

  return null;
}

function writeStoredConfig(config: SharedSheetConfig): void {
  assertConfinedPath(CONFIG_FILE_PATH);
  fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

function deleteStoredConfig(): void {
  assertConfinedPath(CONFIG_FILE_PATH);
  if (fs.existsSync(CONFIG_FILE_PATH)) {
    fs.unlinkSync(CONFIG_FILE_PATH);
  }
}

async function verifyGoogleAdmin(
  authHeader: string | undefined
): Promise<{ ok: true; email: string } | { ok: false; status: number; error: string }> {
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
        error: `Chỉ quản trị viên (${ADMIN_EMAIL}) mới có quyền thay đổi cơ sở dữ liệu Google Sheet dùng chung.`,
      };
    }

    return { ok: true, email };
  } catch {
    return {
      ok: false,
      status: 502,
      error: 'Không thể kết nối máy chủ xác thực Google.',
    };
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  // Read shared central Google Sheet configuration (non-sensitive metadata only)
  app.get('/api/shared-config', (_req, res) => {
    const config = readStoredConfig();
    res.json({
      config,
      adminEmail: ADMIN_EMAIL,
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
      writeStoredConfig(saved);
      res.json({ config: saved, adminEmail: ADMIN_EMAIL });
    } catch {
      res
        .status(500)
        .json({ error: 'Không thể lưu cấu hình cơ sở dữ liệu dùng chung.' });
    }
  });

  // Admin-only unlink of central shared Google Sheet
  app.delete('/api/shared-config', async (req, res) => {
    const auth = await verifyGoogleAdmin(req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      deleteStoredConfig();
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Không thể xóa cấu hình dùng chung.' });
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
