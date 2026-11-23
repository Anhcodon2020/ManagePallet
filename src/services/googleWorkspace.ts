import {
  AdminStaffSettings,
  AuthMode,
  DamageSeverity,
  DriveSpreadsheetItem,
  PalletRecord,
  PalletSource,
  RepairStatus,
  SHEET_HEADERS,
  SheetTabInfo,
  SpreadsheetConfig,
  StaffAccessPublicStatus,
  TransactionType,
} from '../types/pallet';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

const PHOTO_FOLDER_NAME = 'PalletGuard_HinhAnh';

export class WorkspaceAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceAuthError';
  }
}

export class WorkspacePermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspacePermissionError';
  }
}

async function handleApiResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    throw new WorkspaceAuthError('Phiên đăng nhập Google đã hết hạn. Vui lòng đăng nhập lại.');
  }
  if (res.status === 403 || res.status === 404) {
    throw new WorkspacePermissionError(
      'Tài khoản Google này chưa được cấp quyền chỉnh sửa bảng tính dùng chung. Hãy nhờ quản trị viên chia sẻ quyền "Người chỉnh sửa" (Editor) trên Google Sheet.'
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Lỗi kết nối Google API (${res.status}): ${text.slice(0, 220)}`);
  }
  if (res.status === 204) {
    return {} as T;
  }
  return res.json() as Promise<T>;
}

export async function fetchSharedSheetConfig(): Promise<{
  config: SpreadsheetConfig | null;
  adminEmail: string;
  staffAccess: StaffAccessPublicStatus;
}> {
  const defaultStaff: StaffAccessPublicStatus = {
    enabled: false,
    hasPasscode: false,
    relayActive: false,
    restrictedToAllowlist: false,
  };
  const res = await fetch('/api/shared-config');
  if (!res.ok) {
    return { config: null, adminEmail: '', staffAccess: defaultStaff };
  }
  const data = (await res.json()) as {
    config: SpreadsheetConfig | null;
    adminEmail: string;
    staffAccess?: StaffAccessPublicStatus;
  };
  return {
    config: data.config ?? null,
    adminEmail: data.adminEmail ?? '',
    staffAccess: data.staffAccess ?? defaultStaff,
  };
}

export async function fetchAdminStaffSettings(
  googleAccessToken: string
): Promise<AdminStaffSettings> {
  const res = await fetch('/api/staff/admin-settings', {
    headers: { Authorization: `Bearer ${googleAccessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as AdminStaffSettings & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Không thể tải cấu hình đăng nhập nhân viên.');
  }
  return data;
}

export async function saveAdminStaffSettings(
  googleAccessToken: string,
  payload: {
    enabled: boolean;
    newPasscode?: string;
    allowedEmails: string[];
  }
): Promise<AdminStaffSettings> {
  const res = await fetch('/api/staff/admin-settings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${googleAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as AdminStaffSettings & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Không thể lưu cấu hình đăng nhập cho Gmail khác.');
  }
  return data;
}

export async function sendAdminRelayHeartbeat(
  googleAccessToken: string
): Promise<void> {
  await fetch('/api/staff/relay-heartbeat', {
    method: 'POST',
    headers: { Authorization: `Bearer ${googleAccessToken}` },
  }).catch(() => {});
}

export async function clearAdminRelaySession(
  googleAccessToken: string
): Promise<void> {
  await fetch('/api/staff/relay-clear', {
    method: 'POST',
    headers: { Authorization: `Bearer ${googleAccessToken}` },
  }).catch(() => {});
}

export async function staffLogin(payload: {
  email: string;
  displayName: string;
  accessCode: string;
}): Promise<{
  sessionToken: string;
  user: { email: string; displayName: string };
  config: SpreadsheetConfig;
}> {
  const res = await fetch('/api/staff/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as {
    sessionToken?: string;
    user?: { email: string; displayName: string };
    config?: SpreadsheetConfig;
    error?: string;
  };
  if (!res.ok || !data.sessionToken || !data.user || !data.config) {
    throw new Error(data.error || 'Đăng nhập bằng Gmail khác thất bại.');
  }
  return {
    sessionToken: data.sessionToken,
    user: data.user,
    config: data.config,
  };
}

export async function saveSharedSheetConfig(
  accessToken: string,
  config: SpreadsheetConfig
): Promise<{ config: SpreadsheetConfig; adminEmail: string }> {
  const res = await fetch('/api/shared-config', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  const data = (await res.json().catch(() => ({}))) as {
    config?: SpreadsheetConfig;
    adminEmail?: string;
    error?: string;
  };
  if (!res.ok || !data.config) {
    throw new Error(
      data.error || 'Không thể lưu cấu hình Google Sheet dùng chung lên máy chủ.'
    );
  }
  return {
    config: data.config,
    adminEmail: data.adminEmail || '',
  };
}

export function extractDriveFileIdFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/) || url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export async function listAppSpreadsheets(
  accessToken: string
): Promise<DriveSpreadsheetItem[]> {
  const query = encodeURIComponent(
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
  );
  const fields = encodeURIComponent('files(id,name,modifiedTime,webViewLink)');
  const res = await fetch(
    `${DRIVE_API}?q=${query}&orderBy=modifiedTime desc&pageSize=20&fields=${fields}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const data = await handleApiResponse<{ files?: DriveSpreadsheetItem[] }>(res);
  return data.files ?? [];
}

export async function getSpreadsheetMetadata(
  accessToken: string,
  spreadsheetId: string
): Promise<{
  title: string;
  url: string;
  sheets: SheetTabInfo[];
}> {
  const fields = encodeURIComponent(
    'properties.title,spreadsheetUrl,sheets.properties(sheetId,title)'
  );
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}?fields=${fields}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await handleApiResponse<{
    properties: { title: string };
    spreadsheetUrl: string;
    sheets: Array<{ properties: { sheetId: number; title: string } }>;
  }>(res);

  return {
    title: data.properties.title,
    url: data.spreadsheetUrl,
    sheets: (data.sheets ?? []).map((s) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
    })),
  };
}

export async function createPalletSpreadsheet(
  accessToken: string,
  title = 'PalletGuard — Quản Lý Pallet Hư Hỏng'
): Promise<SpreadsheetConfig> {
  const sheetName = 'BaoCaoPallet';
  const createRes = await fetch(SHEETS_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title,
        locale: 'vi_VN',
      },
      sheets: [
        {
          properties: {
            title: sheetName,
            gridProperties: {
              frozenRowCount: 1,
              rowCount: 1000,
              columnCount: SHEET_HEADERS.length,
            },
          },
        },
      ],
    }),
  });

  const created = await handleApiResponse<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    properties: { title: string };
    sheets: Array<{ properties: { sheetId: number; title: string } }>;
  }>(createRes);

  const sheetId = created.sheets[0].properties.sheetId;

  // Write headers
  await writeSheetHeaders(accessToken, created.spreadsheetId, sheetName);

  // Format header row cleanly
  await fetch(`${SHEETS_API}/${created.spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: SHEET_HEADERS.length,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.06, green: 0.09, blue: 0.16 },
                textFormat: {
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                  bold: true,
                  fontSize: 10,
                },
                horizontalAlignment: 'LEFT',
                verticalAlignment: 'MIDDLE',
              },
            },
            fields:
              'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: 0,
              endIndex: 1,
            },
            properties: { pixelSize: 36 },
            fields: 'pixelSize',
          },
        },
      ],
    }),
  }).catch(() => {
    // Formatting is non-critical; headers are already written.
  });

  return {
    spreadsheetId: created.spreadsheetId,
    title: created.properties.title,
    sheetName,
    sheetId,
    url: created.spreadsheetUrl,
  };
}

function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

export async function writeSheetHeaders(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  const range = encodeURIComponent(`${quoteSheetName(sheetName)}!A1:L1`);
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [[...SHEET_HEADERS]],
      }),
    }
  );
  await handleApiResponse(res);
}

export async function ensureSheetHeaders(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  const range = encodeURIComponent(`${quoteSheetName(sheetName)}!A1:L1`);
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}/values/${range}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await handleApiResponse<{ values?: string[][] }>(res);
  if (!data.values || data.values.length === 0 || data.values[0].length === 0) {
    await writeSheetHeaders(accessToken, spreadsheetId, sheetName);
  }
}

function normalizeTransaction(val: string | undefined): TransactionType {
  return val?.trim() === 'Xuất' ? 'Xuất' : 'Nhập';
}

function normalizeSource(val: string | undefined): PalletSource {
  return val?.trim() === 'Kho' ? 'Kho' : 'Nhà máy';
}

function normalizeSeverity(val: string | undefined): DamageSeverity {
  return val?.trim() === 'Nặng' ? 'Nặng' : 'Nhẹ';
}

function normalizeStatus(val: string | undefined): RepairStatus {
  const cleaned = val?.trim();
  if (
    cleaned === 'Chờ xử lý' ||
    cleaned === 'Đang sửa chữa' ||
    cleaned === 'Đã xử lý' ||
    cleaned === 'Thanh lý'
  ) {
    return cleaned;
  }
  return 'Chờ xử lý';
}

function parseSheetRowsToRecords(rows: string[][]): PalletRecord[] {
  const records: PalletRecord[] = [];
  rows.forEach((row, idx) => {
    const id = (row[0] ?? '').trim();
    const serialNumber = (row[2] ?? '').trim();
    if (!id && !serialNumber) return;

    const defectsRaw = (row[6] ?? '').trim();
    const defectTypes = defectsRaw
      ? defectsRaw
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean)
      : [];

    records.push({
      rowIndex: idx + 2, // 1-based row index in Google Sheets (row 1 is header)
      id: id || `ROW-${idx + 2}`,
      timestamp: (row[1] ?? '').trim(),
      serialNumber: serialNumber || 'KHÔNG RÕ',
      transactionType: normalizeTransaction(row[3]),
      source: normalizeSource(row[4]),
      severity: normalizeSeverity(row[5]),
      defectTypes,
      notes: (row[7] ?? '').trim(),
      imageUrl: (row[8] ?? '').trim(),
      driveFileId: (row[9] ?? '').trim(),
      status: normalizeStatus(row[10]),
      reporter: (row[11] ?? '').trim() || 'Nhân viên kho',
    });
  });

  // Return newest first
  return records.reverse();
}

export async function fetchPalletRecords(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string
): Promise<PalletRecord[]> {
  const range = encodeURIComponent(`${quoteSheetName(sheetName)}!A2:L2000`);
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}/values/${range}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await handleApiResponse<{ values?: string[][] }>(res);
  return parseSheetRowsToRecords(data.values ?? []);
}

export async function staffFetchPalletRecords(
  staffToken: string
): Promise<PalletRecord[]> {
  const res = await fetch('/api/staff/records', {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  if (res.status === 401) {
    throw new WorkspaceAuthError(
      'Phiên đăng nhập nhân viên đã hết hạn. Vui lòng đăng nhập lại.'
    );
  }
  const data = (await res.json().catch(() => ({}))) as {
    values?: string[][];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Không thể tải dữ liệu từ Google Sheet chung.');
  }
  return parseSheetRowsToRecords(data.values ?? []);
}

export async function staffAppendPalletRecord(
  staffToken: string,
  record: Omit<PalletRecord, 'rowIndex'>
): Promise<void> {
  const rowValues = [
    record.id,
    record.timestamp,
    record.serialNumber,
    record.transactionType,
    record.source,
    record.severity,
    record.defectTypes.join(', '),
    record.notes,
    record.imageUrl,
    record.driveFileId,
    record.status,
    record.reporter,
  ];
  const res = await fetch('/api/staff/records', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${staffToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ rowValues }),
  });
  if (res.status === 401) {
    throw new WorkspaceAuthError('Phiên đăng nhập nhân viên đã hết hạn.');
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Không thể lưu báo cáo vào Google Sheet chung.');
  }
}

export async function staffUpdatePalletRecord(
  staffToken: string,
  record: PalletRecord
): Promise<void> {
  const rowValues = [
    record.id,
    record.timestamp,
    record.serialNumber,
    record.transactionType,
    record.source,
    record.severity,
    record.defectTypes.join(', '),
    record.notes,
    record.imageUrl,
    record.driveFileId,
    record.status,
    record.reporter,
  ];
  const res = await fetch('/api/staff/records', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${staffToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ rowIndex: record.rowIndex, rowValues }),
  });
  if (res.status === 401) {
    throw new WorkspaceAuthError('Phiên đăng nhập nhân viên đã hết hạn.');
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Không thể cập nhật dữ liệu trên Google Sheet chung.');
  }
}

export async function staffDeletePalletRecord(
  staffToken: string,
  rowIndex: number,
  driveFileId?: string
): Promise<void> {
  const qs = driveFileId
    ? `?driveFileId=${encodeURIComponent(driveFileId)}`
    : '';
  const res = await fetch(`/api/staff/records/${rowIndex}${qs}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  if (res.status === 401) {
    throw new WorkspaceAuthError('Phiên đăng nhập nhân viên đã hết hạn.');
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Không thể xóa bản ghi trên Google Sheet chung.');
  }
}

export async function appendPalletRecord(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  record: Omit<PalletRecord, 'rowIndex'>
): Promise<void> {
  const range = encodeURIComponent(`${quoteSheetName(sheetName)}!A:L`);
  const rowValues = [
    record.id,
    record.timestamp,
    record.serialNumber,
    record.transactionType,
    record.source,
    record.severity,
    record.defectTypes.join(', '),
    record.notes,
    record.imageUrl,
    record.driveFileId,
    record.status,
    record.reporter,
  ];

  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [rowValues],
      }),
    }
  );
  await handleApiResponse(res);
}

export async function updatePalletRecord(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  record: PalletRecord
): Promise<void> {
  const range = encodeURIComponent(
    `${quoteSheetName(sheetName)}!A${record.rowIndex}:L${record.rowIndex}`
  );
  const rowValues = [
    record.id,
    record.timestamp,
    record.serialNumber,
    record.transactionType,
    record.source,
    record.severity,
    record.defectTypes.join(', '),
    record.notes,
    record.imageUrl,
    record.driveFileId,
    record.status,
    record.reporter,
  ];

  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [rowValues],
      }),
    }
  );
  await handleApiResponse(res);
}

export async function deletePalletRecord(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number,
  rowIndex: number,
  driveFileId?: string
): Promise<void> {
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex,
            },
          },
        },
      ],
    }),
  });
  await handleApiResponse(res);

  if (driveFileId) {
    // Best-effort removal of app-created image file in Drive
    await fetch(`${DRIVE_API}/${driveFileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {});
  }
}

async function getOrCreatePhotoFolder(accessToken: string): Promise<string> {
  const query = encodeURIComponent(
    `name='${PHOTO_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const searchRes = await fetch(`${DRIVE_API}?q=${query}&fields=files(id,name)&pageSize=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const searchData = await handleApiResponse<{ files?: Array<{ id: string }> }>(searchRes);
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const createRes = await fetch(DRIVE_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: PHOTO_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  const folder = await handleApiResponse<{ id: string }>(createRes);
  return folder.id;
}

export async function compressImageFile(file: File, maxDimension = 1280): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else resolve(file);
        },
        'image/jpeg',
        0.78
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Không thể đọc tệp hình ảnh đã chọn.'));
    };
    img.src = objectUrl;
  });
}

export async function uploadDamagePhotoToDrive(
  accessToken: string,
  file: File,
  serialNumber: string
): Promise<{ fileId: string; webViewLink: string }> {
  const folderId = await getOrCreatePhotoFolder(accessToken);
  const compressedBlob = await compressImageFile(file);
  const safeSerial = serialNumber.replace(/[^a-zA-Z0-9-_]/g, '_') || 'PALLET';
  const fileName = `${safeSerial}_${Date.now()}.jpg`;

  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: 'image/jpeg',
  };

  const formData = new FormData();
  formData.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  formData.append('file', compressedBlob, fileName);

  const res = await fetch(
    `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    }
  );
  const data = await handleApiResponse<{ id: string; webViewLink?: string }>(res);

  // Grant link-level read permission on this newly uploaded damage photo so
  // all teammates and the database admin can view the evidence from their own accounts.
  await fetch(`${DRIVE_API}/${data.id}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone',
    }),
  }).catch(() => {
    // Non-fatal if organization Drive policy restricts public links
  });

  return {
    fileId: data.id,
    webViewLink:
      data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Không thể đọc dữ liệu ảnh.'));
    reader.readAsDataURL(blob);
  });
}

export async function staffUploadDamagePhoto(
  staffToken: string,
  file: File,
  serialNumber: string
): Promise<{ fileId: string; webViewLink: string }> {
  const compressedBlob = await compressImageFile(file);
  const base64Data = await blobToBase64(compressedBlob);

  const res = await fetch('/api/staff/upload-photo', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${staffToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      base64Data,
      mimeType: compressedBlob.type || 'image/jpeg',
      serialNumber,
    }),
  });
  if (res.status === 401) {
    throw new WorkspaceAuthError('Phiên đăng nhập nhân viên đã hết hạn.');
  }
  const data = (await res.json().catch(() => ({}))) as {
    fileId?: string;
    webViewLink?: string;
    error?: string;
  };
  if (!res.ok || !data.fileId || !data.webViewLink) {
    throw new Error(data.error || 'Tải ảnh lên Google Drive thất bại.');
  }
  return { fileId: data.fileId, webViewLink: data.webViewLink };
}

// In-memory cache of Drive image blob URLs so thumbnails render instantly
const driveImageCache = new Map<string, string>();
const driveImagePending = new Map<string, Promise<string | null>>();

export async function fetchDriveImageBlobUrl(
  accessToken: string,
  fileId: string,
  authMode: AuthMode = 'google'
): Promise<string | null> {
  if (!fileId) return null;
  const cacheKey = `${authMode}:${fileId}`;
  if (driveImageCache.has(cacheKey)) {
    return driveImageCache.get(cacheKey)!;
  }
  if (driveImagePending.has(cacheKey)) {
    return driveImagePending.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      const endpoint =
        authMode === 'staff'
          ? `/api/staff/photo/${encodeURIComponent(fileId)}`
          : `${DRIVE_API}/${encodeURIComponent(fileId)}?alt=media`;
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      driveImageCache.set(cacheKey, url);
      return url;
    } catch {
      return null;
    } finally {
      driveImagePending.delete(cacheKey);
    }
  })();

  driveImagePending.set(cacheKey, promise);
  return promise;
}
