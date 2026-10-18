'use client';

import { useEffect, useRef, useState } from 'react';

interface QrScannerProps {
  onScanSuccess: (decodedText: string) => void;
}

export default function QrScanner({ onScanSuccess }: QrScannerProps) {
  const [scannerActive, setScannerActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const scannerRef = useRef<any>(null);

  const startScanner = async () => {
    setErrorMsg('');
    try {
      const { Html5QrcodeScanner } = await import('html5-qrcode');

      if (!scannerRef.current) {
        const scanner = new Html5QrcodeScanner(
          'qr-camera-viewport',
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          false
        );

        scanner.render(
          (decodedText: string) => {
            onScanSuccess(decodedText);
          },
          () => {
            // Ignore frame-by-frame non-matches
          }
        );

        scannerRef.current = scanner;
        setScannerActive(true);
      }
    } catch (err: any) {
      setErrorMsg('Camera access unavailable or permission denied. Please enter token manually below.');
    }
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      try {
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
      setScannerActive(false);
    }
  };

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto', textAlign: 'center' }}>
      <div
        id="qr-camera-viewport"
        style={{
          width: '100%',
          minHeight: scannerActive ? '300px' : '60px',
          background: 'var(--surface-subtle)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          border: '1px dashed var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
        }}
      >
        {!scannerActive && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', padding: '24px' }}>
            Camera is inactive. Click button below to activate live camera scanning.
          </p>
        )}
      </div>

      {errorMsg && (
        <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: '12px' }}>
          {errorMsg}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
        {!scannerActive ? (
          <button type="button" onClick={startScanner} className="btn btn-primary btn-sm">
            Activate Camera Scanner
          </button>
        ) : (
          <button type="button" onClick={stopScanner} className="btn btn-outline btn-sm">
            Deactivate Camera
          </button>
        )}
      </div>
    </div>
  );
}
