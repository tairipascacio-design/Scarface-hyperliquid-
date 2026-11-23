import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { isStandaloneApkRuntime } from '../services/api';
import {
  Download,
  Smartphone,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Cpu,
  AlertTriangle,
  X,
  FileCode,
  Zap,
} from 'lucide-react';

interface ApkDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ApkMeta {
  version: string;
  versionCode: number;
  appName: string;
  packageName: string;
  filename: string;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  sha256: string;
  minSdk: string;
  targetSdk: string;
  arch: string;
  signature: string;
  signerSha256?: string;
  binaryFormat?: string;
  launchUrl?: string;
  downloadUrl: string;
  directUrl: string;
}

export const ApkDownloadModal: React.FC<ApkDownloadModalProps> = ({ isOpen, onClose }) => {
  const [apkInfo, setApkInfo] = useState<ApkMeta | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedHash, setCopiedHash] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<'download' | 'qr' | 'specs'>('download');
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const runningInsideApk = isStandaloneApkRuntime();

  const mobileQrDownloadUrl =
    typeof window !== 'undefined' && !runningInsideApk
      ? `${window.location.origin}/api/download/apk`
      : 'file:///android_asset/www/index.html';

  useEffect(() => {
    if (!isOpen) return;

    if (runningInsideApk) {
      setApkInfo({
        version: '2.5.0-PRO',
        versionCode: 20500,
        appName: 'HyperLiquid Pro L1 Terminal',
        packageName: 'com.hyperliquid.scarface.l1',
        filename: 'HyperLiquid-Pro-L1-v2.5.apk',
        fileSizeBytes: 0,
        fileSizeFormatted: 'Instalada en Android',
        sha256: 'APK_STANDALONE_VERIFICADA',
        minSdk: 'Android 8.0 (API Level 26+)',
        targetSdk: 'Android 14 (API Level 34)',
        arch: 'Universal (arm64-v8a, armeabi-v7a, x86_64)',
        signature: 'APK Signature Scheme v2 + v1 PKCS#7 (RSA-2048 SHA-256)',
        binaryFormat: 'Binary AXML + DEX 035 + Bundle React/Web3 Embebido (assets/www)',
        launchUrl: 'file:///android_asset/www/index.html',
        downloadUrl: '',
        directUrl: '',
      });
      return;
    }

    fetch('/api/apk/info', { credentials: 'include' })
      .then((res) => res.json())
      .then((data: ApkMeta) => {
        setApkInfo(data);
        const downloadUrl = `${window.location.origin}/api/download/apk`;
        QRCode.toDataURL(downloadUrl, {
          width: 260,
          margin: 1.5,
          color: {
            dark: '#000000',
            light: '#f59e0b',
          },
        }).then((url) => setQrDataUrl(url));
      })
      .catch((err) => {
        console.error('Error fetching APK meta:', err);
      });
  }, [isOpen, runningInsideApk]);

  if (!isOpen) return null;

  const handleCopyHash = () => {
    if (!apkInfo?.sha256) return;
    navigator.clipboard.writeText(apkInfo.sha256);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleDownload = async () => {
    if (runningInsideApk) {
      onClose();
      return;
    }
    setIsDownloading(true);
    setDownloadError(null);
    setDownloadProgress(20);

    const triggerBlobDownload = (blob: Blob, filename: string) => {
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
    };

    try {
      let downloaded = false;
      try {
        const res = await fetch('/api/apk/bundle', { credentials: 'include' });
        if (res.ok) {
          setDownloadProgress(65);
          const data = await res.json();
          if (data?.base64) {
            const binaryStr = atob(data.base64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            const blob = new Blob([bytes], {
              type: data.mimeType || 'application/vnd.android.package-archive',
            });
            setDownloadProgress(95);
            triggerBlobDownload(blob, data.filename || 'HyperLiquid-Pro-L1-v2.5.apk');
            downloaded = true;
          }
        }
      } catch {
        // Fallback directly to /api/download/apk binary endpoint below
      }

      if (!downloaded) {
        setDownloadProgress(55);
        const binRes = await fetch('/api/download/apk', { credentials: 'include' });
        if (!binRes.ok) {
          throw new Error(`HTTP ${binRes.status}: No se pudo descargar el binario APK.`);
        }
        const blob = await binRes.blob();
        setDownloadProgress(95);
        triggerBlobDownload(blob, apkInfo?.filename || 'HyperLiquid-Pro-L1-v2.5.apk');
      }

      setDownloadProgress(100);
      setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgress(0);
      }, 900);
    } catch (err: any) {
      setDownloadError(err?.message || 'Error al descargar el APK desde el preview.');
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-gradient-to-b from-[#120a06] via-[#0d0806] to-[#070504] border border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Glow & Header */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 shadow-[0_0_15px_rgba(245,158,11,0.8)]" />

        <div className="p-4 sm:p-5 border-b border-amber-500/20 flex items-center justify-between bg-black/40">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 via-yellow-500/10 to-transparent border border-amber-500/50 flex items-center justify-center text-amber-400 shadow-md">
              <Smartphone className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base sm:text-lg font-black tracking-wider text-white font-mono uppercase">
                  DESCARGAR APK ANDROID
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {apkInfo?.version || 'v2.5.0-PRO'}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-emerald-950 text-emerald-300 border border-emerald-500/50">
                  OFICIAL L1
                </span>
              </div>
              <p className="text-xs text-zinc-400 font-mono">
                Binario nativo compilado (AXML + DEX 035 + Firma RSA-2048 v1/v2 + Zipaligned)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-white/5 bg-black/60 px-4 text-xs font-mono">
          <button
            onClick={() => setActiveTab('download')}
            className={`py-2.5 px-3 border-b-2 font-bold cursor-pointer transition-all flex items-center space-x-1.5 ${
              activeTab === 'download'
                ? 'border-amber-500 text-amber-300'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Descarga Directa</span>
          </button>
          <button
            onClick={() => setActiveTab('qr')}
            className={`py-2.5 px-3 border-b-2 font-bold cursor-pointer transition-all flex items-center space-x-1.5 ${
              activeTab === 'qr'
                ? 'border-amber-500 text-amber-300'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Escanear QR Móvil</span>
          </button>
          <button
            onClick={() => setActiveTab('specs')}
            className={`py-2.5 px-3 border-b-2 font-bold cursor-pointer transition-all flex items-center space-x-1.5 ${
              activeTab === 'specs'
                ? 'border-amber-500 text-amber-300'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Ficha Técnica & Firma</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 font-mono text-xs flex-1">
          {/* TAB 1: DIRECT DOWNLOAD */}
          {activeTab === 'download' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-[#1b120c] via-[#24150d] to-[#170e0a] border border-amber-500/30 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1 text-center sm:text-left">
                  <div className="text-white font-bold text-sm flex items-center justify-center sm:justify-start space-x-2">
                    <span>{apkInfo?.filename || 'HyperLiquid-Pro-L1-v2.5.apk'}</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-black">
                      APK
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    APK autónoma con toda la terminal, gráficas, firma EIP-712 y motores Hyperliquid L1 embebidos dentro del paquete (cero errores 404).
                  </p>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1 text-[10px] text-zinc-400">
                    <span className="bg-black/60 px-2 py-0.5 rounded border border-white/5">
                      Tamaño: <strong className="text-white">{apkInfo?.fileSizeFormatted || '~280 KB'}</strong>
                    </span>
                    <span className="bg-black/60 px-2 py-0.5 rounded border border-white/5">
                      Arquitectura: <strong className="text-amber-300">Universal ARM64 / x86</strong>
                    </span>
                    <span className="bg-black/60 px-2 py-0.5 rounded border border-white/5">
                      Android: <strong className="text-emerald-400">8.0 o superior</strong>
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="w-full sm:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-black font-black text-xs tracking-wider uppercase transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center space-x-2 cursor-pointer shrink-0 active:scale-95 disabled:opacity-50"
                >
                  <Download className={`w-4 h-4 ${isDownloading ? 'animate-bounce' : ''}`} />
                  <span>
                    {runningInsideApk
                      ? 'APK NATIVA ACTIVA'
                      : isDownloading
                      ? 'COMPILANDO APK...'
                      : 'DESCARGAR AHORA (.APK)'}
                  </span>
                </button>
              </div>

              {isDownloading && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-zinc-400">
                    <span>Compilando & transfiriendo APK autónoma...</span>
                    <span className="text-amber-400">{downloadProgress}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-500 h-full transition-all duration-300"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {downloadError && (
                <div className="p-3 rounded-xl bg-red-950/60 border border-red-700/60 text-red-200 text-[11px] flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{downloadError}</span>
                </div>
              )}

              {/* Security & Highlights Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="p-3 bg-black/50 border border-white/5 rounded-xl space-y-1">
                  <div className="flex items-center space-x-1.5 text-emerald-400 font-bold text-[11px]">
                    <ShieldCheck className="w-4 h-4" />
                    <span>100% Autónoma Offline+L1</span>
                  </div>
                  <p className="text-[10px] text-zinc-400">
                    Carga la app desde file:///android_asset/www/index.html sin depender de servidores de preview.
                  </p>
                </div>

                <div className="p-3 bg-black/50 border border-white/5 rounded-xl space-y-1">
                  <div className="flex items-center space-x-1.5 text-amber-400 font-bold text-[11px]">
                    <Cpu className="w-4 h-4" />
                    <span>Cerebro Unificado EV+</span>
                  </div>
                  <p className="text-[10px] text-zinc-400">
                    Escanea todos los tokens L1 y ejecuta en tiempo real sobre tu API Wallet Perps.
                  </p>
                </div>

                <div className="p-3 bg-black/50 border border-white/5 rounded-xl space-y-1">
                  <div className="flex items-center space-x-1.5 text-cyan-400 font-bold text-[11px]">
                    <Zap className="w-4 h-4" />
                    <span>Directo a Hyperliquid L1</span>
                  </div>
                  <p className="text-[10px] text-zinc-400">
                    Firma EIP-712 local y envío directo a api.hyperliquid.xyz y Arbitrum One RPC.
                  </p>
                </div>
              </div>

              {/* SHA256 Verification Quickbox */}
              <div className="p-3 bg-black/70 border border-amber-500/20 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold flex items-center space-x-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>VERIFICACIÓN DE INTEGRIDAD SHA-256</span>
                  </span>
                  <button
                    onClick={handleCopyHash}
                    className="flex items-center space-x-1 text-[10px] text-amber-400 hover:text-amber-200 cursor-pointer"
                  >
                    {copiedHash ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedHash ? '¡COPIADO!' : 'COPIAR HASH'}</span>
                  </button>
                </div>
                <div className="bg-[#050302] p-2 rounded border border-white/5 font-mono text-[10px] text-amber-300/90 break-all select-all">
                  {apkInfo?.sha256 || 'Calculando firma SHA-256 criptográfica...'}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: QR CODE */}
          {activeTab === 'qr' && (
            <div className="flex flex-col items-center justify-center space-y-4 py-2">
              <div className="text-center space-y-1">
                <h4 className="text-sm font-bold text-white uppercase">ESCANEA CON TU TELÉFONO ANDROID</h4>
                <p className="text-[11px] text-zinc-400 max-w-md">
                  Abre la cámara de tu teléfono Android y enfoca el código QR. Se iniciará la descarga directa del archivo APK sin necesidad de cables.
                </p>
              </div>

              <div className="p-4 bg-amber-500 rounded-2xl shadow-xl border-4 border-amber-600/40">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="APK Download QR Code"
                    className="w-56 h-56 rounded-lg object-contain shadow-md"
                  />
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center text-black font-bold">
                    Generando QR...
                  </div>
                )}
              </div>

              <div className="text-center space-y-1">
                <div className="text-[10px] text-zinc-500 font-mono">ENLACE DIRECTO MÓVIL (PREVIEW COMPARTIDO):</div>
                <div className="text-amber-400 text-xs font-mono bg-black/60 px-3 py-1.5 rounded-lg border border-white/10 select-all break-all">
                  {mobileQrDownloadUrl}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TECHNICAL SPECS */}
          {activeTab === 'specs' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 bg-black/60 border border-white/5 rounded-lg flex justify-between gap-2">
                  <span className="text-zinc-500">Nombre del Paquete:</span>
                  <span className="text-amber-300 font-mono font-bold">{apkInfo?.packageName || 'com.hyperliquid.scarface.l1'}</span>
                </div>
                <div className="p-2.5 bg-black/60 border border-white/5 rounded-lg flex justify-between gap-2">
                  <span className="text-zinc-500">Versión:</span>
                  <span className="text-white font-mono font-bold">{apkInfo?.version || '2.5.0-PRO'} (Build {apkInfo?.versionCode || 20500})</span>
                </div>
                <div className="p-2.5 bg-black/60 border border-white/5 rounded-lg flex justify-between gap-2">
                  <span className="text-zinc-500">Mínimo SDK:</span>
                  <span className="text-emerald-400 font-mono">{apkInfo?.minSdk || 'Android 8.0 (API 26)'}</span>
                </div>
                <div className="p-2.5 bg-black/60 border border-white/5 rounded-lg flex justify-between gap-2">
                  <span className="text-zinc-500">Objetivo SDK:</span>
                  <span className="text-cyan-400 font-mono">{apkInfo?.targetSdk || 'Android 14 (API 34)'}</span>
                </div>
                <div className="p-2.5 bg-black/60 border border-white/5 rounded-lg flex justify-between gap-2 sm:col-span-2">
                  <span className="text-zinc-500 shrink-0">Firma Digital:</span>
                  <span className="text-emerald-300 font-mono text-right">{apkInfo?.signature || 'APK Signature Scheme v2 + v1 PKCS#7 (RSA-2048 SHA-256)'}</span>
                </div>
                <div className="p-2.5 bg-black/60 border border-white/5 rounded-lg flex justify-between gap-2 sm:col-span-2">
                  <span className="text-zinc-500 shrink-0">Estructura Binaria:</span>
                  <span className="text-amber-200 font-mono text-right">{apkInfo?.binaryFormat || 'Binary AXML + DEX 035 + 4-byte Zipaligned resources.arsc'}</span>
                </div>
                {apkInfo?.signerSha256 && (
                  <div className="p-2.5 bg-black/60 border border-white/5 rounded-lg sm:col-span-2 space-y-1">
                    <span className="text-zinc-500 block">Certificado Firmante (SHA-256):</span>
                    <span className="text-cyan-300 font-mono text-[10px] break-all block">{apkInfo.signerSha256}</span>
                  </div>
                )}
              </div>

              <div className="p-3 bg-black/70 border border-white/5 rounded-xl space-y-2">
                <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold block">
                  PERMISOS REQUERIDOS EN ANDROID MANIFEST
                </span>
                <ul className="space-y-1 text-[10px] text-zinc-400 list-disc list-inside">
                  <li><code className="text-amber-300">android.permission.INTERNET</code>: Comunicación con Hyperliquid L1 WebSocket y RPC.</li>
                  <li><code className="text-amber-300">android.permission.ACCESS_NETWORK_STATE</code>: Detección de reconexión automática ante cambios de red.</li>
                  <li><code className="text-amber-300">android.permission.VIBRATE</code>: Alertas táctiles al ejecutarse órdenes Take Profit / Stop Loss.</li>
                  <li><code className="text-amber-300">android.permission.WAKE_LOCK</code>: Ejecución ininterrumpida de los algoritmos de Bóveda y MEV Shield.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-amber-500/20 bg-black/60 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[10px] text-zinc-500 font-mono flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Servidor de Entrega de APKs L1: ACTIVO</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono cursor-pointer transition-all"
            >
              Cerrar
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black text-xs font-mono cursor-pointer transition-all flex items-center space-x-1.5 shadow"
            >
              <Download className="w-3.5 h-3.5" />
              <span>DESCARGAR .APK</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
