import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  History,
  ImagePlus,
  Send,
  Trash2,
} from 'lucide-react';
import {
  DamageSeverity,
  NewPalletReportInput,
  PalletRecord,
  PalletSource,
  SpreadsheetConfig,
  TransactionType,
} from '../types/pallet';
import { ConfirmDialog } from './ConfirmDialog';
import { DefectTypeSelector } from './DefectTypeSelector';
import { QRScannerPanel } from './QRScannerPanel';

interface ScanReportViewProps {
  records: PalletRecord[];
  sheetConfig: SpreadsheetConfig;
  onSubmitReport: (input: NewPalletReportInput) => Promise<void>;
  onSelectRecord: (record: PalletRecord) => void;
}

export const ScanReportView: React.FC<ScanReportViewProps> = ({
  records,
  sheetConfig,
  onSubmitReport,
  onSelectRecord,
}) => {
  const [serialNumber, setSerialNumber] = useState('');
  const [transactionType, setTransactionType] = useState<TransactionType>('Nhập');
  const [source, setSource] = useState<PalletSource>('Nhà máy');
  const [severity, setSeverity] = useState<DamageSeverity>('Nhẹ');
  const [defectTypes, setDefectTypes] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  // Check if the currently entered serial number has previous damage reports
  const previousReports = useMemo(() => {
    const clean = serialNumber.trim().toUpperCase();
    if (!clean) return [];
    return records.filter((r) => r.serialNumber.toUpperCase() === clean);
  }, [records, serialNumber]);

  // Gather unique defect types previously used in Google Sheets for quick reuse
  const historicalDefects = useMemo(() => {
    const list: string[] = [];
    records.forEach((r) => {
      r.defectTypes.forEach((d) => list.push(d));
    });
    return list;
  }, [records]);

  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormError('Vui lòng chọn tệp hình ảnh hợp lệ (JPG, PNG, WebP).');
      return;
    }
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
    setFormError(null);
    e.target.value = '';
  };

  const clearPhoto = () => {
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
  };

  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMsg(null);

    if (!serialNumber.trim()) {
      setFormError('Vui lòng quét mã QR hoặc nhập số series trên pallet.');
      return;
    }
    if (defectTypes.length === 0 && !notes.trim()) {
      setFormError(
        'Vui lòng chọn ít nhất 1 loại hư hỏng hoặc nhập ghi chú mô tả tình trạng pallet.'
      );
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirmSubmit = async () => {
    setSubmitting(true);
    setFormError(null);
    try {
      await onSubmitReport({
        serialNumber: serialNumber.trim().toUpperCase(),
        transactionType,
        source,
        severity,
        defectTypes,
        notes: notes.trim(),
        photoFile,
      });

      const savedSerial = serialNumber.trim().toUpperCase();
      setShowConfirm(false);
      setSerialNumber('');
      setDefectTypes([]);
      setNotes('');
      clearPhoto();
      setSuccessMsg(
        `Đã ghi nhận pallet ${savedSerial} vào Google Sheet "${sheetConfig.title}" thành công.`
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Không thể lưu báo cáo lên Google Sheets. Vui lòng thử lại.';
      setFormError(msg);
      setShowConfirm(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {successMsg && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-xs font-medium text-emerald-700 hover:underline whitespace-nowrap shrink-0"
          >
            Đóng
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        {/* Left: Live QR Scanner */}
        <div className="lg:col-span-5">
          <QRScannerPanel
            lastScannedSerial={serialNumber}
            onScanned={(code) => {
              setSerialNumber(code);
              setFormError(null);
            }}
          />
        </div>

        {/* Right: Structured Damage Report Form */}
        <form
          onSubmit={handlePreSubmit}
          className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7"
        >
          <div className="space-y-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Phiếu ghi nhận tình trạng pallet hư hỏng
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Đồng bộ trực tiếp vào trang tính{' '}
                  <span className="font-mono text-slate-700">
                    {sheetConfig.sheetName}
                  </span>
                </p>
              </div>
            </div>

            {formError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Serial Number Field */}
            <div>
              <label
                htmlFor="pallet-serial"
                className="block text-xs font-semibold text-slate-700"
              >
                Số Series trên Pallet <span className="text-red-600">*</span>
              </label>
              <input
                id="pallet-serial"
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value.toUpperCase())}
                placeholder="Quét mã QR hoặc nhập thủ công (VD: PLT-NM-2026-0412)"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm font-medium text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
              />

              {previousReports.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 shrink-0 text-amber-700" />
                    <span>
                      Pallet này đã có{' '}
                      <strong className="tabular-nums">{previousReports.length}</strong>{' '}
                      lần ghi nhận hư hỏng trước đó (gần nhất: {previousReports[0].severity}{' '}
                      · {previousReports[0].status}).
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectRecord(previousReports[0])}
                    className="font-semibold text-amber-800 underline hover:text-amber-950 whitespace-nowrap"
                  >
                    Xem lịch sử
                  </button>
                </div>
              )}
            </div>

            {/* 3 Segmented Controls Row: Transaction / Source / Severity */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Loại giao dịch: Nhập / Xuất */}
              <div>
                <span className="block text-xs font-semibold text-slate-700">
                  Loại giao dịch
                </span>
                <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                  {(['Nhập', 'Xuất'] as TransactionType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setTransactionType(type)}
                      className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                        transactionType === type
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {type === 'Nhập' ? 'Nhập kho' : 'Xuất kho'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nguồn Pallet: Nhà máy / Kho */}
              <div>
                <span className="block text-xs font-semibold text-slate-700">
                  Nguồn Pallet
                </span>
                <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                  {(['Nhà máy', 'Kho'] as PalletSource[]).map((src) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setSource(src)}
                      className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                        source === src
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {src}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mức độ hư hỏng: Nhẹ / Nặng */}
              <div>
                <span className="block text-xs font-semibold text-slate-700">
                  Mức độ hư hỏng
                </span>
                <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setSeverity('Nhẹ')}
                    className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      severity === 'Nhẹ'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Hư hỏng nhẹ
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeverity('Nặng')}
                    className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      severity === 'Nặng'
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Hư hỏng nặng
                  </button>
                </div>
              </div>
            </div>

            {/* Defect Type Selector with Custom Input */}
            <DefectTypeSelector
              selectedDefects={defectTypes}
              onChange={setDefectTypes}
              historicalDefects={historicalDefects}
              inputId="scan-custom-defect-input"
            />

            {/* Detailed Notes */}
            <div>
              <label
                htmlFor="damage-notes"
                className="block text-xs font-semibold text-slate-700"
              >
                Ghi chú chi tiết tình trạng
              </label>
              <textarea
                id="damage-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Mô tả rõ vị trí lỗi (VD: Nứt sâu chân pallet bên trái, gãy 2 nan gỗ mặt trên, không đảm bảo chịu tải khi xếp chồng...)"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
              />
            </div>

            {/* Attached Photo Illustration */}
            <div>
              <span className="block text-xs font-semibold text-slate-700">
                Hình ảnh đính kèm minh họa tình trạng cụ thể
              </span>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoSelected}
                className="hidden"
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelected}
                className="hidden"
              />

              {photoPreviewUrl && photoFile ? (
                <div className="mt-2 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:flex-row sm:items-center">
                  <div className="h-24 w-32 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white">
                    <img
                      src={photoPreviewUrl}
                      alt="Ảnh minh họa pallet hư hỏng"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {photoFile.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                      {(photoFile.size / 1024).toFixed(0)} KB · Tự động nén tối ưu và lưu vào Google Drive
                    </p>
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        Chụp lại
                      </button>
                      <button
                        type="button"
                        onClick={clearPhoto}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 whitespace-nowrap"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Gỡ ảnh</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex min-h-[46px] items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 whitespace-nowrap"
                  >
                    <Camera className="h-4 w-4 text-slate-500" />
                    <span>Chụp ảnh trực tiếp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex min-h-[46px] items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 whitespace-nowrap"
                  >
                    <ImagePlus className="h-4 w-4 text-slate-500" />
                    <span>Chọn ảnh từ thiết bị</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => {
                setSerialNumber('');
                setDefectTypes([]);
                setNotes('');
                clearPhoto();
                setFormError(null);
              }}
              className="min-h-[42px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              Xóa biểu mẫu
            </button>
            <button
              type="submit"
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 whitespace-nowrap shrink-0"
            >
              <Send className="h-4 w-4" />
              <span>Ghi nhận lên Google Sheet</span>
            </button>
          </div>
        </form>
      </div>

      {/* Mandatory Confirmation Dialog before appending to Sheets & uploading photo to Drive */}
      <ConfirmDialog
        open={showConfirm}
        title="Xác nhận ghi nhận báo cáo pallet hư hỏng"
        description={`Dữ liệu sẽ được thêm vào trang tính "${sheetConfig.sheetName}" của bảng tính dùng chung "${sheetConfig.title}"${
          photoFile
            ? ' và tải ảnh minh họa lên Google Drive (bật quyền xem qua liên kết để mọi thành viên trong nhóm đều xem được).'
            : '.'
        }`}
        details={[
          { label: 'Số Series Pallet', value: serialNumber.trim().toUpperCase() },
          {
            label: 'Phân loại & Nguồn',
            value: `${transactionType} kho · Pallet ${source}`,
          },
          { label: 'Mức độ hư hỏng', value: `Hư hỏng ${severity.toLowerCase()}` },
          {
            label: 'Loại hư hỏng',
            value:
              defectTypes.length > 0 ? defectTypes.join(', ') : 'Theo ghi chú chi tiết',
          },
          {
            label: 'Hình ảnh đính kèm',
            value: photoFile ? photoFile.name : 'Không đính kèm',
          },
        ]}
        confirmLabel="Xác nhận lưu dữ liệu"
        loading={submitting}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
};
