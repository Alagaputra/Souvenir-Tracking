"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import { Button } from "./ui/button";
type Detector = {
  detect(video: HTMLVideoElement): Promise<{ rawValue: string }[]>;
};
export default function Scanner({
  onScan,
  autoStart = false,
}: {
  onScan: (text: string) => void;
  autoStart?: boolean;
}) {
  const [running, setRunning] = useState(autoStart);
  const [error, setError] = useState("");
  const [nativeMode, setNativeMode] = useState(false);
  const [decoderMissing, setDecoderMissing] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const readerId = `qr-${useId().replace(/[^a-z0-9]/gi, "")}`;
  const callback = useRef(onScan);
  // Perbarui callback tanpa perlu memulai ulang kamera pada setiap render induk.
  useEffect(() => {
    callback.current = onScan;
  }, [onScan]);
  useEffect(() => {
    if (!running) return;
    let cancelled = false,
      accepted = false;
    let scanner: import("html5-qrcode").Html5Qrcode | undefined;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const accept = (text: string) => {
      // Satu sesi kamera hanya menerima satu hasil, lalu berhenti untuk membuka form.
      if (accepted || cancelled) return;
      accepted = true;
      callback.current(text);
      setRunning(false);
    };
    const start = async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "Kamera memerlukan HTTPS atau localhost. Gunakan pilihan manual jika kamera tidak tersedia.",
          );
        const DetectorClass = (
          window as Window & {
            BarcodeDetector?: new (options: { formats: string[] }) => Detector;
          }
        ).BarcodeDetector;
        // Utamakan decoder bawaan browser; gunakan html5-qrcode jika tidak tersedia.
        let detector: Detector | undefined;
        try {
          if (DetectorClass)
            detector = new DetectorClass({ formats: ["qr_code"] });
        } catch {
          /* Lanjutkan ke decoder library jika detector bawaan gagal dibuat. */
        }
        if (!detector) {
          let Library: typeof import("html5-qrcode") | undefined;
          try {
            Library = await import("html5-qrcode");
          } catch {
            /* Pratinjau offline bisa berjalan tanpa paket decoder cadangan. */
          }
          if (cancelled) return;
          if (Library) {
            setNativeMode(false);
            scanner = new Library.Html5Qrcode(readerId);
            await scanner.start(
              { facingMode: "environment" },
              { fps: 10, qrbox: { width: 220, height: 220 } },
              accept,
              () => { },
            );
            if (cancelled && scanner.isScanning) await scanner.stop();
            return;
          }
        }
        setNativeMode(true);
        setDecoderMissing(!detector);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const element = video.current;
        if (!element) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        element.srcObject = stream;
        await element.play();
        const read = async () => {
          if (cancelled || accepted || !detector) return;
          try {
            const results = await detector.detect(element);
            if (results[0]?.rawValue) {
              accept(results[0].rawValue);
              return;
            }
          } catch {
            /* Coba lagi pada frame berikutnya jika gambar belum dapat dibaca. */
          }
          if (!cancelled && !accepted) timer = setTimeout(read, 200);
        };
        void read();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error && err.message.includes("HTTPS")
              ? err.message
              : "Kamera tidak tersedia atau izin ditolak. Izinkan kamera di browser, lalu coba lagi.",
          );
          setRunning(false);
        }
      }
    };
    void start();
    return () => {
      // Saat berhenti/unmount, batalkan pembacaan dan lepaskan semua track kamera.
      cancelled = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (scanner?.isScanning) void scanner.stop().catch(() => { });
    };
  }, [running, readerId]);
  return (
    <div className="scanner">
      <div
        id={readerId}
        className="qr-reader"
        hidden={nativeMode || !running}
      />
      <video
        ref={video}
        className="native-camera"
        autoPlay
        muted
        playsInline
        hidden={!nativeMode || !running}
        aria-label="Kamera scan QR"
      />
      {!running && (
        <div className="scanner-placeholder">
          <div className="scan-corners">
            <Camera size={34} />
          </div>
          <h3>Arahkan kamera ke QR produk</h3>
          <Button
            type="button"
            onClick={() => {
              setError("");
              setDecoderMissing(false);
              setRunning(true);
            }}
          >
            <Camera size={16} />
            {error ? "Coba kamera lagi" : "Aktifkan kamera"}
          </Button>
        </div>
      )}
      {running && (
        <>
          <p className="camera-instruction">
            Arahkan kamera ke QR pada barang.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setRunning(false)}
          >
            <CameraOff size={16} />
            Hentikan kamera
          </Button>
        </>
      )}
      {running && decoderMissing && (
        <p role="status" className="decoder-notice">
          Kamera aktif. Pembaca QR belum tersedia di browser demo ini; jalankan
          aplikasi lengkap atau gunakan pilihan manual.
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
