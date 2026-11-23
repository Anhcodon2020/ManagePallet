import React, { useEffect, useState } from 'react';
import { ExternalLink, Save, Trash2, X } from 'lucide-react';
import {
  DamageSeverity,
  PalletRecord,
  RepairStatus,
  SpreadsheetConfig,
} from '../types/pallet';
import { ConfirmDialog } from './ConfirmDialog';
import { DrivePhoto } from './DrivePhoto';

interface RecordDetailDrawerProps {
  record: PalletRecord | null;
  accessToken: string | null;
  sheetConfig: SpreadsheetConfig;
  onClose: () => void;
  onUpdateRecord: (updated: PalletRecord) => Promise<void>;
  onDeleteRecord: (record: PalletRecord) => Promise<void>;
}

const STATUS_OPTIONS: RepairStatus[] = [
  'Chờ xử lý',
  'Đang sửa chữa',
  'Đã xử lý',
  'Thanh lý',
];

export const RecordDetailDrawer: React.FC<RecordDetailDrawerProps> = ({
  record,
  accessToken,
  sheetConfig,
  onClose,
  onUpdateRecord,
  onDeleteRecord,
}) => {
  const [status, setStatus] = useState<RepairStatus>('Chờ xử lý');
  const [severity, setSeverity] = useState<DamageSeverity>('Nhẹ');
  const [notes, setNotes] = useState('');
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (record) {
      setStatus(record.status);
      setSeverity(record.severity);
      setNotes(record.notes);
      setError(null);
    }
  }, [record]);

  useEffect(() => {
    if (!record) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showSaveConfirm && !showDeleteConfirm) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [record, showSaveConfirm, showDeleteConfirm, onClose]);

  if (!record) return null;

  const isDirty =
    status !== record.status ||
    severity !== record.severity ||
    notes.trim() !== record.notes.trim();

  const handleConfirmUpdate = async () => {
    setSaving(true);
    setError(null);
    try {
      await onUpdateRecord({
        ...record,
        status,
        severity,
        notes: notes.trim(),
      });
      setShowSaveConfirm(false);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Cập nhật dữ liệu thất bại.');
      setShowSaveConfirm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onDeleteRecord(record);
      setShowDeleteConfirm(false);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Xóa bản ghi thất bại.');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex justify-end bg-slate-950/40 backdrop-blur-[1px]"
        onClick={onClose}
      >
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={`Chi tiết pallet ${record.serialNumber}`}
          className="flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <p className="text-xs font-medium text-slate-500">
                Hồ sơ pallet · Dòng #{record.rowIndex} trên Google Sheet
              </p>
              <h2 className="mt-0.5 font-mono text-lg font-bold text-slate-900">
                {record.serialNumber}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng chi tiết"
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            {/* High-Res Photo Preview */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Ảnh minh họa hiện trường
                </span>
                {record.imageUrl && (
                  <a
                    href={record.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
                  >
                    <span>Mở ảnh gốc trên Drive</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              <div className="mt-2 aspect-4/3 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                <DrivePhoto
                  accessToken={accessToken}
                  driveFileId={record.driveFileId}
                  imageUrl={record.imageUrl}
                  alt={`Tình trạng hư hỏng của pallet ${record.serialNumber}`}
                  className="h-full w-full object-contain bg-slate-950"
                />
              </div>
            </div>

            {/* Structured Info List */}
            <dl className="divide-y divide-slate-100 border-y border-slate-200 text-sm">
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-slate-500">Mã báo cáo</dt>
                <dd className="font-mono text-xs font-medium text-slate-900">
                  {record.id}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-slate-500">Thời gian ghi nhận</dt>
                <dd className="font-mono text-xs text-slate-900 tabular-nums">
                  {record.timestamp}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-slate-500">Loại giao dịch</dt>
                <dd className="font-medium text-slate-900">
                  {record.transactionType} kho
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-slate-500">Nguồn Pallet</dt>
                <dd className="font-medium text-slate-900">Pallet {record.source}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-slate-500">Loại hư hỏng</dt>
                <dd className="text-right font-medium text-slate-900">
                  {record.defectTypes.length > 0
                    ? record.defectTypes.join(', ')
                    : 'Không chọn'}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-slate-500">Người báo cáo</dt>
                <dd className="font-medium text-slate-900">{record.reporter}</dd>
              </div>
            </dl>

            {/* Editable Status & Notes */}
            <div className="space-y-4">
              <div>
                <span className="block text-xs font-semibold text-slate-700">
                  Cập nhật mức độ hư hỏng
                </span>
                <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setSeverity('Nhẹ')}
                    className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      severity === 'Nhẹ'
                        ? 'bg-amber-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Hư hỏng nhẹ
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeverity('Nặng')}
                    className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      severity === 'Nặng'
                        ? 'bg-red-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Hư hỏng nặng
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="drawer-status"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Trạng thái xử lý
                </label>
                <select
                  id="drawer-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as RepairStatus)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="drawer-notes"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Ghi chú chi tiết
                </label>
                <textarea
                  id="drawer-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-4 w-4" />
              <span>Xóa bản ghi</span>
            </button>

            <button
              type="button"
              disabled={!isDirty}
              onClick={() => setShowSaveConfirm(true)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 whitespace-nowrap shrink-0"
            >
              <Save className="h-4 w-4" />
              <span>Lưu thay đổi</span>
            </button>
          </div>
        </aside>
      </div>

      {/* Mandatory Confirmation Dialog for Updating Row */}
      <ConfirmDialog
        open={showSaveConfirm}
        title="Xác nhận cập nhật dữ liệu trên Google Sheet"
        description={`Bạn sắp ghi đè dòng #${record.rowIndex} trong trang tính "${sheetConfig.sheetName}" với thông tin mới.`}
        details={[
          { label: 'Số Series Pallet', value: record.serialNumber },
          { label: 'Mức độ hư hỏng', value: `${record.severity} → ${severity}` },
          { label: 'Trạng thái xử lý', value: `${record.status} → ${status}` },
        ]}
        confirmLabel="Xác nhận cập nhật"
        loading={saving}
        onConfirm={handleConfirmUpdate}
        onCancel={() => setShowSaveConfirm(false)}
      />

      {/* Mandatory Confirmation Dialog for Deleting Row & Drive Photo */}
      <ConfirmDialog
        open={showDeleteConfirm}
        variant="danger"
        title="Xác nhận xóa vĩnh viễn bản ghi pallet"
        description={`Thao tác này sẽ xóa dòng #${record.rowIndex} khỏi bảng tính "${sheetConfig.title}"${
          record.driveFileId
            ? ' đồng thời xóa ảnh đính kèm trên Google Drive.'
            : '.'
        } Không thể hoàn tác sau khi xóa.`}
        details={[
          { label: 'Số Series Pallet', value: record.serialNumber },
          { label: 'Thời gian ghi nhận', value: record.timestamp },
          { label: 'Mức độ', value: `Hư hỏng ${record.severity.toLowerCase()}` },
        ]}
        confirmLabel="Xóa vĩnh viễn"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
};
