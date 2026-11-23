export type TransactionType = 'Nhập' | 'Xuất';

export type PalletSource = 'Nhà máy' | 'Kho';

export type DamageSeverity = 'Nhẹ' | 'Nặng';

export type RepairStatus = 'Chờ xử lý' | 'Đang sửa chữa' | 'Đã xử lý' | 'Thanh lý';

export const DEFECT_PRESETS: readonly string[] = [
  'Nứt chân pallet',
  'Gãy nan gỗ',
  'Mất thanh đỡ',
  'Sứt mẻ góc',
  'Cong vênh mặt sàn',
   'Ẩm mốc / Mối mọt',
   'Bụi,bẩn'
] as const;

export const SHEET_HEADERS = [
  'ID',
  'Thời gian',
  'Số Series Pallet',
  'Loại giao dịch',
  'Nguồn Pallet',
  'Mức độ hư hỏng',
  'Loại hư hỏng',
  'Ghi chú chi tiết',
  'Link ảnh',
  'Drive File ID',
  'Trạng thái',
  'Người báo cáo',
] as const;

export interface PalletRecord {
  rowIndex: number;
  id: string;
  timestamp: string;
  serialNumber: string;
  transactionType: TransactionType;
  source: PalletSource;
  severity: DamageSeverity;
  defectTypes: string[];
  notes: string;
  imageUrl: string;
  driveFileId: string;
  status: RepairStatus;
  reporter: string;
}

export interface NewPalletReportInput {
  serialNumber: string;
  transactionType: TransactionType;
  source: PalletSource;
  severity: DamageSeverity;
  defectTypes: string[];
  notes: string;
  photoFile: File | null;
}

export interface SheetTabInfo {
  sheetId: number;
  title: string;
}

export interface SpreadsheetConfig {
  spreadsheetId: string;
  title: string;
  sheetName: string;
  sheetId: number;
  url: string;
  configuredBy?: string;
}

export interface DriveSpreadsheetItem {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export type ActiveView = 'dashboard' | 'scan' | 'records' | 'settings';
