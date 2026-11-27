import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  ImageUp,
  Loader2,
  QrCode,
  RefreshCw,
  ScanLine,
} from 'lucide-react';

interface QRScannerPanelProps {
  onScanned: (serialNumber: string) => void;
  lastScannedSerial: string;
}

type ScanTriggerMode = 'trigger' | 'auto';

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
  const [startingCamera, setStartingCamera] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [activeCameraIdx, setActiveCameraIdx] = useState(0);
  const [scanMode, setScanMode] = useState<ScanTriggerMode>('trigger');
  const [isArmed, setIsArmed] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [showSampleQR, setShowSampleQR] = useState(false);

  const scanModeRef = useRef<ScanTriggerMode>('trigger');
  const isArmedRef = useRef<boolean>(false);
  const armTimeoutRef = useRef<number | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  // Holds a very fresh decoded frame (< 500ms old) so pressing the Scan button captures instantly
  const latestFrameRef = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    scanModeRef.current = scanMode;
    if (scanMode === 'auto') {
      isArmedRef.current = false;
      setIsArmed(false);
      if (armTimeoutRef.current) {
        window.clearTimeout(armTimeoutRef.current);
        armTimeoutRef.current = null;
      }
    }
  }, [scanMode]);

  const disarmTrigger = () => {
    isArmedRef.current = false;
    setIsArmed(false);
    if (armTimeoutRef.current) {
      window.clearTimeout(armTimeoutRef.current);
      armTimeoutRef.current = null;
    }
  };

  const stopScanner = async () => {
    disarmTrigger();
    latestFrameRef.current = null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitScannedCode = (rawText: string) => {
    const normalized = rawText.trim().toUpperCase();
    if (!normalized) return;

    lastScanTimeRef.current = Date.now();
    disarmTrigger();
    setScanError(null);
    setScanNotice(`Đã quét thành công mã: ${normalized}`);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(80);
      } catch {
        // Ignore unsupported vibration environments
      }
    }
    onScanned(normalized);
  };

  const handleDecodeFrame = (decodedText: string) => {
    const normalized = decodedText.trim().toUpperCase();
    if (!normalized) return;

    const now = Date.now();
    latestFrameRef.current = { code: normalized, at: now };

    if (scanModeRef.current === 'trigger') {
      // Only accept scan when user explicitly pressed the "Nhấn để quét" button
      if (!isArmedRef.current) return;
      commitScannedCode(normalized);
      return;
    }

    // Continuous auto-scan mode with 1.5s debounce
    if (now - lastScanTimeRef.current < 1500) return;
    commitScannedCode(normalized);
  };

  const startScanner = async (cameraIndexOverride?: number): Promise<boolean> => {
    setScanError(null);
    setScanNotice(null);
    setStartingCamera(true);

    try {
      await stopScanner();

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

      const scanConfig = {
        fps: 12,
        qrbox: { width: 230, height: 230 },
        aspectRatio: 4 / 3,
      };

      // When user explicitly switches camera, use exact cameraId;
      // otherwise prefer rear smartphone camera directly via facingMode: 'environment'
      if (cameraIndexOverride !== undefined && cameras[cameraIndexOverride]) {
        await html5Qr.start(
          cameras[cameraIndexOverride].id,
          scanConfig,
          handleDecodeFrame,
          () => {}
        );
      } else {
        try {
          await html5Qr.start(
            { facingMode: 'environment' },
            scanConfig,
            handleDecodeFrame,
            () => {}
          );
        } catch {
          const devices = await Html5Qrcode.getCameras();
          if (!devices || devices.length === 0) {
            throw new Error(
              'Không tìm thấy camera trên thiết bị. Bạn có thể chọn "Quét từ ảnh" hoặc nhập số series thủ công.'
            );
          }
          setCameras(devices);
          const backIdx = devices.findIndex((d) =>
            /back|rear|environment/i.test(d.label)
          );
          const targetIdx = backIdx >= 0 ? backIdx : 0;
          setActiveCameraIdx(targetIdx);
          await html5Qr.start(
            devices[targetIdx].id,
            scanConfig,
            handleDecodeFrame,
            () => {}
          );
        }

        // Populate camera list in background so user can switch lenses if needed
        Html5Qrcode.getCameras()
          .then((devices) => {
            if (devices && devices.length > 0) {
              setCameras(devices);
            }
          })
          .catch(() => {});
      }

      setIsScanning(true);
      return true;
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Không thể khởi động camera. Hãy kiểm tra quyền truy cập camera của trình duyệt.';
      setScanError(msg);
      setIsScanning(false);
      return false;
    } finally {
      setStartingCamera(false);
    }
  };

  const handlePressToScan = async () => {
    setScanError(null);

    // If camera is off, start it first and immediately arm capture
    if (!isScanning) {
      const started = await startScanner();
      if (!started) return;
      if (scanModeRef.current === 'trigger') {
        armTriggerWindow();
      }
      return;
    }

    // If already armed, pressing again cancels waiting state
    if (isArmedRef.current) {
      disarmTrigger();
      return;
    }

    // If camera already saw a crisp code in the viewfinder within the last 500ms, lock it immediately!
    const fresh = latestFrameRef.current;
    if (fresh && Date.now() - fresh.at < 500) {
      commitScannedCode(fresh.code);
      return;
    }

    armTriggerWindow();
  };

  const armTriggerWindow = () => {
    setScanNotice(null);
    isArmedRef.current = true;
    setIsArmed(true);

    if (armTimeoutRef.current) {
      window.clearTimeout(armTimeoutRef.current);
    }
    armTimeoutRef.current = window.setTimeout(() => {
      if (isArmedRef.current) {
        disarmTrigger();
        setScanError(
          'Chưa nhận diện được mã trong khung ngắm. Đưa camera lại gần mã QR/Barcode hơn rồi nhấn nút Quét lại.'
        );
      }
    }, 6000);
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
      commitScannedCode(decoded);
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Quét mã QR / Barcode Pallet
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {scanMode === 'trigger'
              ? 'Ngắm đúng tem pallet rồi nhấn nút "Nhấn để quét mã" bên dưới.'
              : 'Chế độ quét liên tục: tự động nhận mã ngay khi đưa vào khung.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSampleQR((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <QrCode className="h-3.5 w-3.5" />
          <span>{showSampleQR ? 'Ẩn mã mẫu' : 'Mã mẫu'}</span>
        </button>
      </div>

      {/* Smartphone Scan Mode Switcher */}
      <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setScanMode('trigger')}
          className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
            scanMode === 'trigger'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Bấm nút mới quét
        </button>
        <button
          type="button"
          onClick={() => setScanMode('auto')}
          className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
            scanMode === 'auto'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Quét tự động
        </button>
      </div>

      {/* Camera Viewport */}
      <div className="relative mt-3.5 overflow-hidden rounded-lg border border-slate-200 bg-slate-950 min-h-[260px] flex flex-col items-center justify-center">
        <div
          id="pallet-qr-reader"
          className={`w-full ${isScanning ? 'block' : 'hidden'}`}
        />
        <div id="pallet-qr-file-temp" className="hidden" />

        {isScanning && scanMode === 'trigger' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-3 pt-8 text-center">
            <p className="text-xs font-medium text-white">
              {isArmed
                ? 'Đang lấy nét & đọc mã QR / Barcode...'
                : 'Đưa mã vào khung ngắm rồi nhấn nút Quét bên dưới'}
            </p>
          </div>
        )}

        {!isScanning && (
          <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300">
              <Camera className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-100">
              Camera quét mã đang tắt
            </p>
            <p className="mt-1 max-w-xs text-xs text-slate-400">
              Hỗ trợ QR Code, Code 128, Code 39 và EAN-13 trên điện thoại &amp; máy tính.
            </p>
          </div>
        )}
      </div>

      {/* Primary Smartphone Press-to-Scan Trigger Button */}
      {scanMode === 'trigger' && (
        <button
          type="button"
          disabled={startingCamera}
          onClick={() => void handlePressToScan()}
          className={`mt-3.5 inline-flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-xl px-5 py-3 text-base font-semibold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 whitespace-nowrap ${
            isArmed
              ? 'bg-emerald-600 hover:bg-emerald-700 focus-visible:outline-emerald-600'
              : 'bg-blue-700 hover:bg-blue-800 focus-visible:outline-blue-700'
          }`}
        >
          {startingCamera ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Đang mở camera sau...</span>
            </>
          ) : isArmed ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Đang quét mã... (Nhấn để dừng)</span>
            </>
          ) : isScanning ? (
            <>
              <ScanLine className="h-5 w-5" />
              <span>Nhấn để quét mã</span>
            </>
          ) : (
            <>
              <ScanLine className="h-5 w-5" />
              <span>Mở camera &amp; Nhấn để quét</span>
            </>
          )}
        </button>
      )}

      {/* Secondary Camera Controls */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!isScanning ? (
          <button
            type="button"
            disabled={startingCamera}
            onClick={() => void startScanner()}
            className={`inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
              scanMode === 'auto'
                ? 'bg-slate-900 text-white hover:bg-slate-800'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Camera className="h-4 w-4" />
            <span>{scanMode === 'auto' ? 'Bật camera quét tự động' : 'Chỉ bật camera ngắm trước'}</span>
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
                    commitScannedCode(item.code);
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
