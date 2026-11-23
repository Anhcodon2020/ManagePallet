import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  ImageUp,
  QrCode,
  RefreshCw,
} from 'lucide-react';

interface QRScannerPanelProps {
  onScanned: (serialNumber: string) => void;
  lastScannedSerial: string;
}

const SAMPLE_CODES = [
  { code: 'PLT-NM-2026-0412', desc: 'Pallet Nhà máy — Lô A' },
  { code: 'PLT-KHO-2026-1089', desc: 'Pallet Kho trung tâm' },
  { code: 'PLT-EXP-2026-0735', desc: 'Pallet Xuất khẩu tiêu chuẩn' },
];

export const QRScannerPanel: React.FC<QRScannerPanelProps> = ({
  onScanned,
  lastScannedSerial,
}) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [activeCameraIdx, setActiveCameraIdx] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [showSampleQR, setShowSampleQR] = useState(false);
  const lastScanTimeRef = useRef<number>(0);

  const stopScanner = async () => {
    const instance = scannerRef.current;
    if (instance) {
      try {
        if (instance.isScanning) {
          await instance.stop();
        }
        await instance.clear();
      } catch {
        // Ignore cleanup errors when camera is already stopped
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  useEffect(() => {
    return () => {
      void stopScanner();
    };
  }, []);

  const handleDecodeSuccess = (decodedText: string) => {
    const now = Date.now();
    if (now - lastScanTimeRef.current < 1500) return;
    lastScanTimeRef.current = now;

    const normalized = decodedText.trim().toUpperCase();
    if (!normalized) return;

    setScanError(null);
    setScanNotice(`Đã quét thành công mã: ${normalized}`);
    onScanned(normalized);
  };

  const startScanner = async (cameraIndexOverride?: number) => {
    setScanError(null);
    setScanNotice(null);

    try {
      await stopScanner();

      const devices = await Html5Qrcode.getCameras();
      if (!devices || devices.length === 0) {
        setScanError(
          'Không tìm thấy camera trên thiết bị. Bạn có thể chọn "Quét từ ảnh QR" hoặc nhập số series trực tiếp.'
        );
        return;
      }

      setCameras(devices);

      // Prefer back/environment camera by default on first open
      let targetIdx = cameraIndexOverride ?? activeCameraIdx;
      if (cameraIndexOverride === undefined) {
        const backIdx = devices.findIndex((d) =>
          /back|rear|environment/i.test(d.label)
        );
        targetIdx = backIdx >= 0 ? backIdx : 0;
        setActiveCameraIdx(targetIdx);
      }

      const cameraId = devices[targetIdx]?.id ?? devices[0].id;
      const html5Qr = new Html5Qrcode('pallet-qr-reader', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
        ],
        verbose: false,
      });
      scannerRef.current = html5Qr;

      await html5Qr.start(
        cameraId,
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 4 / 3,
        },
        handleDecodeSuccess,
        () => {
          // Ignore per-frame decode misses
        }
      );

      setIsScanning(true);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Không thể khởi động camera. Hãy kiểm tra quyền truy cập camera của trình duyệt.';
      setScanError(msg);
      setIsScanning(false);
    }
  };

  const handleSwitchCamera = async () => {
    if (cameras.length < 2) return;
    const nextIdx = (activeCameraIdx + 1) % cameras.length;
    setActiveCameraIdx(nextIdx);
    if (isScanning) {
      await startScanner(nextIdx);
    }
  };

  const handleScanImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null);
    setScanNotice(null);

    try {
      await stopScanner();
      const fileScanner = new Html5Qrcode('pallet-qr-file-temp', {
        verbose: false,
      });
      const decoded = await fileScanner.scanFile(file, false);
      fileScanner.clear();
      handleDecodeSuccess(decoded);
    } catch {
      setScanError(
        'Không nhận diện được mã QR hoặc mã vạch trong hình ảnh đã chọn. Hãy chọn ảnh rõ nét hơn.'
      );
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Quét mã QR / Barcode Pallet
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Hướng camera vào tem mã trên thân pallet để điền tự động số series.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSampleQR((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <QrCode className="h-3.5 w-3.5" />
          <span>{showSampleQR ? 'Ẩn mã mẫu' : 'Mã QR thử nghiệm'}</span>
        </button>
      </div>

      {/* Camera Viewport */}
      <div className="relative mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-950 min-h-[260px] flex flex-col items-center justify-center">
        <div
          id="pallet-qr-reader"
          className={`w-full ${isScanning ? 'block' : 'hidden'}`}
        />
        <div id="pallet-qr-file-temp" className="hidden" />

        {!isScanning && (
          <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300">
              <Camera className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-100">
              Camera quét mã đang tắt
            </p>
            <p className="mt-1 max-w-xs text-xs text-slate-400">
              Hỗ trợ QR Code, Code 128, Code 39 và EAN-13 trên tem pallet nhà máy &amp; kho.
            </p>
          </div>
        )}
      </div>

      {/* Action Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {!isScanning ? (
          <button
            type="button"
            onClick={() => startScanner()}
            className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 whitespace-nowrap"
          >
            <Camera className="h-4 w-4" />
            <span>Bật camera quét mã</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void stopScanner()}
            className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 whitespace-nowrap"
          >
            <CameraOff className="h-4 w-4" />
            <span>Tắt camera</span>
          </button>
        )}

        {isScanning && cameras.length > 1 && (
          <button
            type="button"
            onClick={() => void handleSwitchCamera()}
            className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Đổi camera</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <ImageUp className="h-4 w-4" />
          <span>Quét từ ảnh</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleScanImageFile}
          className="hidden"
        />
      </div>

      {/* Feedback messages */}
      {scanNotice && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span className="font-mono">{scanNotice}</span>
        </div>
      )}

      {scanError && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 leading-relaxed"
        >
          {scanError}
        </div>
      )}

      {/* Optional Sample QR Drawer for rapid testing */}
      {showSampleQR && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-700">
              Chọn nhanh mã mẫu để kiểm thử phiếu báo cáo
            </p>
            <span className="text-xs text-slate-400">Nhấn để điền</span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {SAMPLE_CODES.map((item) => {
              const active = lastScannedSerial === item.code;
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => {
                    setScanNotice(`Đã chọn mã mẫu: ${item.code}`);
                    setScanError(null);
                    onScanned(item.code);
                  }}
                  className={`flex flex-col items-center rounded-lg border p-3 text-center transition-colors ${
                    active
                      ? 'border-blue-600 bg-blue-50/50'
                      : 'border-slate-200 bg-slate-50/40 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <QRCodeSVG value={item.code} size={64} level="M" />
                  <span className="mt-2 font-mono text-[11px] font-semibold text-slate-900">
                    {item.code}
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500">
                    {item.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
