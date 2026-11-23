import React, { useState, useEffect, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import {
  createNewWallet,
  importFromSeedPhrase,
  importFromPrivateKey,
  generateQrDataUrl,
  generateAddressFromPrivateKey,
  isValidAddress,
  isValidPrivateKey,
  HYPERLIQUID_API_WALLET,
} from '../services/walletCrypto';
import { fetchRealWalletBalances } from '../services/web3Balance';
import {
  Wallet,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  QrCode,
  Download,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  X,
  RefreshCw,
  Camera,
  Upload,
  Info,
} from 'lucide-react';

export const WalletModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const {
    wallet,
    setWallet,
    configureHyperliquidApiWallet,
    refreshRealBalances,
    isSyncingBalances,
    sendOnChainTransfer,
    onChainTransfers,
    isAutoBotActive,
    toggleAutoBot,
    maxMarginPct,
    addToast,
    openHashVerifier,
  } = useTrading();

  const [activeTab, setActiveTab] = useState<'balances' | 'create' | 'import' | 'transfers'>('balances');
  const [importMethod, setImportMethod] = useState<'seed' | 'key' | 'qr'>('key');

  // Hyperliquid Perps API Wallet Config Form
  const [masterAddressInput, setMasterAddressInput] = useState<string>(wallet.masterAddress || '');
  const [apiKeyInput, setApiKeyInput] = useState<string>(wallet.apiWalletKey || wallet.privateKey || '');
  const [apiWalletNameInput, setApiWalletNameInput] = useState<string>(wallet.apiWalletName || 'TonyMontana-AI-Perps');
  const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(false);
  const [isSavingApiConfig, setIsSavingApiConfig] = useState<boolean>(false);

  // Creation State
  const [tempCreatedWallet, setTempCreatedWallet] = useState<{
    address: string;
    privateKey: string;
    seedPhrase: string;
    balances: any;
  } | null>(null);

  // Import Inputs
  const [seedInput, setSeedInput] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');

  // Visibility Toggles
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [showSeedPhrase, setShowSeedPhrase] = useState(false);

  // Transfer Form State
  const [transferAsset, setTransferAsset] = useState<'USDC' | 'ETH' | 'HYPE' | 'ARB'>('USDC');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Copy feedback
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMasterAddressInput(wallet.masterAddress || '');
      setApiKeyInput(wallet.apiWalletKey || wallet.privateKey || '');
      setApiWalletNameInput(wallet.apiWalletName || 'TonyMontana-AI-Perps');
    }
  }, [isOpen, wallet.masterAddress, wallet.apiWalletKey, wallet.privateKey, wallet.apiWalletName]);

  const derivedSignerAddress = useMemo(() => {
    try {
      if (apiKeyInput && isValidPrivateKey(apiKeyInput)) {
        return generateAddressFromPrivateKey(apiKeyInput);
      }
    } catch {
      // ignore invalid partial key
    }
    return wallet.apiWalletAddress || wallet.address || '';
  }, [apiKeyInput, wallet.apiWalletAddress, wallet.address]);

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    addToast({
      type: 'success',
      title: 'Copiado al Portapapeles',
      message: `${fieldName} copiado con éxito.`,
    });
    setTimeout(() => setCopiedField(null), 2500);
  };

  // Generate QR for Master Account (where funds/deposits go) or active address
  useEffect(() => {
    const qrTarget = wallet.masterAddress || wallet.address;
    if (qrTarget) {
      generateQrDataUrl(qrTarget).then(setQrCodeDataUrl);
    }
  }, [wallet.masterAddress, wallet.address]);

  if (!isOpen) return null;

  const handleSaveHyperliquidApiWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingApiConfig(true);
      await configureHyperliquidApiWallet({
        masterAddress: masterAddressInput.trim(),
        apiWalletKey: apiKeyInput.trim(),
        apiWalletName: apiWalletNameInput.trim() || 'TonyMontana-AI-Perps',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error en Configuración Perps',
        message: err?.message || 'Verifica la clave privada de la API Wallet (64 hex) y la dirección Master (0x...).',
      });
    } finally {
      setIsSavingApiConfig(false);
    }
  };

  const handleGenerateNew = () => {
    const nw = createNewWallet();
    setTempCreatedWallet(nw);
    setShowPrivateKey(false);
    setShowSeedPhrase(false);
  };

  const handleApplyCreatedWallet = () => {
    if (!tempCreatedWallet) return;
    setWallet({
      address: tempCreatedWallet.address,
      privateKey: tempCreatedWallet.privateKey,
      seedPhrase: tempCreatedWallet.seedPhrase,
      isConnected: true,
      type: 'CREATED',
      masterAddress: tempCreatedWallet.address,
      apiWalletAddress: tempCreatedWallet.address,
      apiWalletKey: tempCreatedWallet.privateKey,
      balances: tempCreatedWallet.balances,
    });
    setTempCreatedWallet(null);
    setActiveTab('balances');
    addToast({
      type: 'success',
      title: 'Nueva Bóveda Creada (Balance Real $0.00)',
      message: 'Deposita USDC en Hyperliquid / Arbitrum para operar en vivo.',
    });
  };

  const handleImportSeed = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const imported = importFromSeedPhrase(seedInput);
      setWallet({
        address: imported.address,
        privateKey: imported.privateKey,
        seedPhrase: imported.seedPhrase,
        isConnected: true,
        type: 'IMPORTED_SEED',
        masterAddress: imported.address,
        apiWalletAddress: imported.address,
        apiWalletKey: imported.privateKey,
        balances: imported.balances,
      });
      setSeedInput('');
      setActiveTab('balances');
      addToast({
        type: 'info',
        title: 'Bóveda Importada',
        message: `Consultando balances reales L1/Arbitrum para ${imported.address.slice(0, 6)}...${imported.address.slice(-4)}`,
      });

      const realBals = await fetchRealWalletBalances(imported.address, imported.address);
      setWallet((prev) => ({
        ...prev,
        balances: {
          USDC: realBals.USDC,
          ETH: realBals.ETH,
          HYPE: realBals.HYPE,
          ARB: realBals.ARB,
        },
        arbitrumUsdc: realBals.arbitrumUsdc,
        hyperliquidAccountValue: realBals.hyperliquidAccountValue,
        hyperliquidSpotUsdc: realBals.hyperliquidSpotUsdc,
        hyperliquidSpotBalances: realBals.hyperliquidSpotBalances,
        hyperliquidWithdrawable: realBals.hyperliquidWithdrawable,
        hyperliquidMarginUsed: realBals.hyperliquidMarginUsed,
        hyperliquidUserRole: realBals.hyperliquidUserRole,
        isAgentAuthorized: realBals.isAgentAuthorized,
        lastSyncedAt: realBals.syncedAt,
      }));
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error al Importar Frase Semilla',
        message: err.message,
      });
    }
  };

  const handleImportKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const imported = importFromPrivateKey(keyInput);
      setWallet((prev) => ({
        ...prev,
        address: imported.address,
        privateKey: imported.privateKey,
        seedPhrase: imported.seedPhrase,
        isConnected: true,
        type: 'IMPORTED_KEY',
        apiWalletAddress: imported.address,
        apiWalletKey: imported.privateKey,
        balances: imported.balances,
      }));
      setKeyInput('');
      setActiveTab('balances');
      addToast({
        type: 'info',
        title: 'Clave Privada Importada',
        message: `Signer: ${imported.address.slice(0, 6)}...${imported.address.slice(-4)}. Sincronizando balances reales...`,
      });

      const targetMaster = wallet.masterAddress && isValidAddress(wallet.masterAddress) ? wallet.masterAddress : imported.address;
      const realBals = await fetchRealWalletBalances(targetMaster, imported.address);
      setWallet((prev) => ({
        ...prev,
        balances: {
          USDC: realBals.USDC,
          ETH: realBals.ETH,
          HYPE: realBals.HYPE,
          ARB: realBals.ARB,
        },
        arbitrumUsdc: realBals.arbitrumUsdc,
        hyperliquidAccountValue: realBals.hyperliquidAccountValue,
        hyperliquidSpotUsdc: realBals.hyperliquidSpotUsdc,
        hyperliquidSpotBalances: realBals.hyperliquidSpotBalances,
        hyperliquidWithdrawable: realBals.hyperliquidWithdrawable,
        hyperliquidMarginUsed: realBals.hyperliquidMarginUsed,
        hyperliquidUserRole: realBals.hyperliquidUserRole,
        isAgentAuthorized: realBals.isAgentAuthorized,
        lastSyncedAt: realBals.syncedAt,
      }));
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error de Clave Privada',
        message: err.message,
      });
    }
  };

  const handleDownloadBackup = (addr: string, key: string, seed: string) => {
    const backupData = {
      app: 'HyperLiquid AI Pro - Scarface Empire',
      created: new Date().toISOString(),
      address: addr,
      privateKey: key,
      seedPhrase: seed,
      note: 'GUARDAR BAJO MÁXIMA SEGURIDAD. NUNCA COMPARTIR CON TERCEROS.',
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hyperliquid-vault-${addr.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast({
      type: 'info',
      title: 'Copia de Seguridad Descargada',
      message: 'Archivo JSON generado con tu clave secreta y frase semilla.',
    });
  };

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(transferAmount);
    if (!isValidAddress(recipientAddress)) {
      addToast({
        type: 'error',
        title: 'Dirección Inválida',
        message: 'La dirección debe comenzar con 0x y tener 40 caracteres hexadecimales.',
      });
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      addToast({
        type: 'error',
        title: 'Monto Inválido',
        message: 'Introduce una cantidad mayor a cero.',
      });
      return;
    }

    try {
      setIsTransferring(true);
      await sendOnChainTransfer(transferAsset, recipientAddress, amount);
      setRecipientAddress('');
      setTransferAmount('');
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Transferencia Fallida',
        message: err.message,
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const hlEquity = wallet.hyperliquidAccountValue || 0;
  const effectiveUsdcCap = Math.max(hlEquity, wallet.balances.USDC || 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-mono">
      <div className="bg-[#0e0a08] border border-[#3d2011] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative my-auto">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#24150c] bg-gradient-to-r from-[#190f09] via-[#24130a] to-[#120805] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-[#2e150b] flex items-center justify-center border border-[#d4af37] text-amber-300">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold uppercase text-amber-200 tracking-wider">
                LA BÓVEDA HYPERLIQUID PERPS
              </h2>
              <p className="text-[10px] text-zinc-400">
                Configuración Oficial API Wallet (Master + Agent Signer) & Balances Reales L1
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#1f130c] hover:bg-[#331c10] text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* AI Permission Banner */}
        <div
          className={`px-4 py-2.5 border-b flex items-center justify-between text-xs ${
            isAutoBotActive
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
              : 'bg-amber-950/40 border-amber-800/80 text-amber-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {isAutoBotActive ? (
              <Shield className="w-4 h-4 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-amber-400" />
            )}
            <span className="font-bold">
              {isAutoBotActive
                ? `IA CON PERMISO ACTIVO: Margen máx. $${((effectiveUsdcCap * maxMarginPct) / 100).toFixed(2)} USDC (${maxMarginPct}%)`
                : 'IA BLOQUEADA: Los fondos están seguros. Presiona BOTÓN ON para permitir órdenes reales.'}
            </span>
          </div>
          <button
            onClick={toggleAutoBot}
            className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition-all cursor-pointer ${
              isAutoBotActive
                ? 'bg-red-950 text-red-300 border border-red-700 hover:bg-red-900'
                : 'bg-emerald-950 text-emerald-300 border border-emerald-700 hover:bg-emerald-900'
            }`}
          >
            {isAutoBotActive ? 'Apagar Bot' : 'Activar Bot ON'}
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#24150c] bg-[#120c08] text-xs">
          <button
            onClick={() => setActiveTab('balances')}
            className={`flex-1 py-2.5 text-center font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'balances'
                ? 'border-amber-400 text-amber-300 bg-[#1f130b]'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            API Wallet Perps & Balances
          </button>
          <button
            onClick={() => {
              setActiveTab('create');
              if (!tempCreatedWallet) handleGenerateNew();
            }}
            className={`flex-1 py-2.5 text-center font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'create'
                ? 'border-amber-400 text-amber-300 bg-[#1f130b]'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            Crear Wallet
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`flex-1 py-2.5 text-center font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'import'
                ? 'border-amber-400 text-amber-300 bg-[#1f130b]'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            Importar Clave
          </button>
          <button
            onClick={() => setActiveTab('transfers')}
            className={`flex-1 py-2.5 text-center font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'transfers'
                ? 'border-amber-400 text-amber-300 bg-[#1f130b]'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            Retiros & On-Chain
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 max-h-[68vh] overflow-y-auto space-y-4">
          {/* TAB 1: API WALLET PERPS & REAL BALANCES */}
          {activeTab === 'balances' && (
            <div className="space-y-4">
              {/* Hyperliquid Perps API Wallet Official Form */}
              <form
                onSubmit={handleSaveHyperliquidApiWallet}
                className="bg-[#170e0a] p-4 rounded-xl border border-amber-500/40 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase text-amber-300 flex items-center space-x-1.5">
                    <Key className="w-4 h-4 text-amber-400" />
                    <span>CAMPOS API WALLET HYPERLIQUID PERPS</span>
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-black border ${
                      wallet.isAgentAuthorized
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                        : 'bg-amber-950 text-amber-300 border-amber-500/50'
                    }`}
                  >
                    {wallet.isAgentAuthorized
                      ? 'AGENTE AUTORIZADO EN L1'
                      : `ROL L1: ${(wallet.hyperliquidUserRole || 'SIN VERIFICAR').toUpperCase()}`}
                  </span>
                </div>

                {/* Official Docs Clarification Box */}
                <div className="p-2.5 rounded-lg bg-black/50 border border-cyan-500/20 text-[10px] text-zinc-300 space-y-1">
                  <div className="flex items-center space-x-1.5 text-cyan-300 font-bold uppercase">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>Regla Oficial Hyperliquid API (Master vs API Wallet)</span>
                  </div>
                  <p className="text-zinc-400 leading-relaxed">
                    • <strong className="text-white">Dirección Pública Master (0x...):</strong> Tu cuenta principal donde viven tus USDC y posiciones. Se usa para leer balances y posiciones (<code className="text-amber-300">/info</code>).
                  </p>
                  <p className="text-zinc-400 leading-relaxed">
                    • <strong className="text-amber-300">Clave Privada API Wallet (0x...):</strong> Solo firma órdenes Perps (<code className="text-amber-300">/exchange</code> EIP-712 chainId 1337). Sin permisos de retiro. Debes aprobar su dirección pública derivada en <em>app.hyperliquid.xyz/API</em>.
                  </p>
                </div>

                {/* Field 1: Master Public Address */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-zinc-300 flex justify-between">
                    <span>1. Dirección Pública Master Hyperliquid (0x... donde está tu USDC)</span>
                    {wallet.masterAddress && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(wallet.masterAddress || '', 'Dirección Master')}
                        className="text-amber-400 hover:underline cursor-pointer"
                      >
                        Copiar
                      </button>
                    )}
                  </label>
                  <input
                    type="text"
                    value={masterAddressInput}
                    onChange={(e) => setMasterAddressInput(e.target.value)}
                    placeholder="0x... (Tu dirección pública principal de Hyperliquid / Arbitrum)"
                    className="w-full bg-[#0b0806] border border-[#3b2012] focus:border-amber-400 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none"
                  />
                </div>

                {/* Field 2: API Wallet Private Key */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] uppercase font-bold text-zinc-300">
                    <span>2. Clave Privada API Wallet (64 hex chars para firmar órdenes)</span>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                        className="text-zinc-400 hover:text-white flex items-center space-x-1 cursor-pointer"
                      >
                        {showApiKeyInput ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{showApiKeyInput ? 'Ocultar' : 'Ver'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(apiKeyInput, 'Clave API Wallet')}
                        className="text-amber-400 hover:underline cursor-pointer"
                      >
                        Copiar
                      </button>
                    </div>
                  </div>
                  <input
                    type={showApiKeyInput ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="0x6dcd2d11df86d3e7450161a108217e2d66516aedd83b5160a65aaef399502291"
                    className="w-full bg-[#0b0806] border border-[#3b2012] focus:border-amber-400 rounded-lg px-3 py-2 text-amber-300 text-xs font-mono focus:outline-none"
                  />
                </div>

                {/* Field 3: Derived API Wallet Signer Public Address (Read-only) + Agent Name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] uppercase font-bold text-zinc-400">
                      <span>Dirección Pública API Signer (Derivada)</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(derivedSignerAddress, 'Dirección API Signer')}
                        className="text-amber-400 hover:underline cursor-pointer"
                      >
                        {copiedField === 'Dirección API Signer' ? 'Copiada' : 'Copiar'}
                      </button>
                    </div>
                    <div className="bg-[#0b0806] border border-[#2b170e] rounded-lg px-2.5 py-2 text-[11px] text-emerald-300 font-mono break-all">
                      {derivedSignerAddress || 'Clave inválida'}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-zinc-400 block">
                      Nombre del Agente Perps
                    </label>
                    <input
                      type="text"
                      value={apiWalletNameInput}
                      onChange={(e) => setApiWalletNameInput(e.target.value)}
                      placeholder="TonyMontana-AI-Perps"
                      className="w-full bg-[#0b0806] border border-[#3b2012] focus:border-amber-400 rounded-lg px-2.5 py-2 text-white text-xs font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={isSavingApiConfig}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black font-black text-xs uppercase cursor-pointer shadow-lg disabled:opacity-50"
                  >
                    {isSavingApiConfig ? 'Sincronizando L1...' : 'Guardar y Conectar API Wallet Perps'}
                  </button>
                  <button
                    type="button"
                    onClick={() => refreshRealBalances()}
                    disabled={isSyncingBalances}
                    className="py-2.5 px-3 rounded-xl bg-[#24150d] hover:bg-[#362014] text-amber-300 font-bold text-xs border border-amber-500/40 flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingBalances ? 'animate-spin' : ''}`} />
                    <span>Sincronizar L1</span>
                  </button>
                </div>

                {apiKeyInput.toLowerCase() !== HYPERLIQUID_API_WALLET.privateKey.toLowerCase() && (
                  <button
                    type="button"
                    onClick={() => setApiKeyInput(HYPERLIQUID_API_WALLET.privateKey)}
                    className="text-[10px] text-amber-400 hover:underline cursor-pointer"
                  >
                    Cargar clave API importada ({HYPERLIQUID_API_WALLET.address.slice(0, 8)}...)
                  </button>
                )}
              </form>

              {/* Real Hyperliquid Perps + Arbitrum Balances Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] text-zinc-400 uppercase font-bold">
                  <span>Balances Reales En Vivo (Cero Simulación)</span>
                  <span>
                    {wallet.lastSyncedAt
                      ? `Sincronizado: ${new Date(wallet.lastSyncedAt).toLocaleTimeString()}`
                      : 'Consultando nodo...'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="bg-[#140e0b] p-3 rounded-xl border border-emerald-500/30">
                    <span className="text-[10px] uppercase text-zinc-500 font-bold block">Perps Equity L1</span>
                    <span className="text-base font-black text-emerald-400 font-mono">
                      ${hlEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[9px] text-zinc-500 block mt-0.5">
                      Retirable: ${(wallet.hyperliquidWithdrawable ?? 0).toFixed(2)} USDC
                    </span>
                  </div>

                  <div className="bg-[#140e0b] p-3 rounded-xl border border-[#2b170e]">
                    <span className="text-[10px] uppercase text-zinc-500 font-bold block">Margen En Uso L1</span>
                    <span className="text-base font-black text-amber-300 font-mono">
                      ${(wallet.hyperliquidMarginUsed ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[9px] text-zinc-500 block mt-0.5">Posiciones Abiertas</span>
                  </div>

                  <div className="bg-[#140e0b] p-3 rounded-xl border border-[#2b170e]">
                    <span className="text-[10px] uppercase text-zinc-500 font-bold block">Arbitrum One USDC</span>
                    <span className="text-base font-black text-cyan-300 font-mono">
                      ${(wallet.arbitrumUsdc ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[9px] text-zinc-500 block mt-0.5">Native USDC L2</span>
                  </div>

                  <div className="bg-[#140e0b] p-3 rounded-xl border border-[#2b170e]">
                    <span className="text-[10px] uppercase text-zinc-500 font-bold block">ETH (Gas Arbitrum)</span>
                    <span className="text-base font-black text-amber-200 font-mono">
                      {wallet.balances.ETH.toFixed(4)}
                    </span>
                    <span className="text-[9px] text-zinc-500 block mt-0.5">Chain ID 42161</span>
                  </div>

                  <div className="bg-[#140e0b] p-3 rounded-xl border border-[#2b170e]">
                    <span className="text-[10px] uppercase text-zinc-500 font-bold block">HYPE (Spot L1)</span>
                    <span className="text-base font-black text-amber-400 font-mono">
                      {wallet.balances.HYPE.toFixed(2)}
                    </span>
                    <span className="text-[9px] text-zinc-500 block mt-0.5">Hyperliquid Spot</span>
                  </div>

                  <div className="bg-[#140e0b] p-3 rounded-xl border border-[#2b170e]">
                    <span className="text-[10px] uppercase text-zinc-500 font-bold block">ARB (Arbitrum)</span>
                    <span className="text-base font-black text-blue-400 font-mono">
                      {wallet.balances.ARB.toFixed(2)}
                    </span>
                    <span className="text-[9px] text-zinc-500 block mt-0.5">ERC-20 L2</span>
                  </div>
                </div>
              </div>

              {/* Deposit QR Card */}
              <div className="bg-[#140e0b] p-3.5 rounded-xl border border-[#2b170e] flex items-center space-x-3">
                {qrCodeDataUrl ? (
                  <img src={qrCodeDataUrl} alt="QR Code" className="w-16 h-16 rounded border border-[#3b2012] bg-white p-1" />
                ) : (
                  <div className="w-16 h-16 rounded bg-[#20150f] flex items-center justify-center text-zinc-500">
                    <QrCode className="w-8 h-8" />
                  </div>
                )}
                <div className="text-xs space-y-1">
                  <span className="font-bold text-amber-200 uppercase text-[11px] block">
                    QR de Depósito ({wallet.masterAddress ? 'Cuenta Master' : 'API Signer'})
                  </span>
                  <p className="text-[10px] text-zinc-400">
                    Deposita USDC en Arbitrum o Hyperliquid hacia tu Cuenta Master pública para que la API Wallet ejecute compras y ventas.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CREAR WALLET */}
          {activeTab === 'create' && (
            <div className="space-y-4">
              <div className="bg-[#140e0b] p-4 rounded-xl border border-[#2b170e] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-200 uppercase">
                    Generador Criptográfico de Nueva Bóveda
                  </span>
                  <button
                    onClick={handleGenerateNew}
                    className="px-2 py-1 text-[10px] font-bold bg-[#26150d] hover:bg-[#3b1f13] text-amber-300 rounded border border-[#4a2614] flex items-center space-x-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Generar Otra</span>
                  </button>
                </div>

                {tempCreatedWallet && (
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-400">
                        <span>Dirección Pública (0x)</span>
                        <button
                          onClick={() => copyToClipboard(tempCreatedWallet.address, 'Dirección Pública')}
                          className="text-amber-400 hover:underline flex items-center space-x-1 cursor-pointer"
                        >
                          <Copy className="w-2.5 h-2.5" />
                          <span>Copiar Dirección</span>
                        </button>
                      </div>
                      <div className="bg-[#0b0806] px-3 py-2 rounded border border-[#21140c] text-xs text-white font-mono break-all">
                        {tempCreatedWallet.address}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[10px] text-zinc-400">
                        <span className="font-bold uppercase text-amber-300">
                          Frase Semilla (12 Palabras)
                        </span>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setShowSeedPhrase(!showSeedPhrase)}
                            className="text-zinc-400 hover:text-white flex items-center space-x-1 cursor-pointer"
                          >
                            {showSeedPhrase ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            <span>{showSeedPhrase ? 'Ocultar' : 'Ver'}</span>
                          </button>
                          <button
                            onClick={() => copyToClipboard(tempCreatedWallet.seedPhrase, 'Frase Semilla')}
                            className="text-amber-400 hover:underline flex items-center space-x-1 cursor-pointer font-bold"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copiar Frase</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 bg-[#0a0705] p-2.5 rounded-lg border border-[#26150d]">
                        {tempCreatedWallet.seedPhrase.split(' ').map((word, i) => (
                          <div
                            key={i}
                            className="bg-[#140e0a] border border-[#24150c] rounded px-2 py-1 text-[11px] flex items-center space-x-1.5"
                          >
                            <span className="text-zinc-500 text-[9px] w-4">{i + 1}.</span>
                            <span className="text-amber-100 font-bold">
                              {showSeedPhrase ? word : '••••••'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[10px] text-zinc-400">
                        <span className="font-bold uppercase text-red-400">
                          Clave Secreta (Private Key 0x...)
                        </span>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setShowPrivateKey(!showPrivateKey)}
                            className="text-zinc-400 hover:text-white flex items-center space-x-1 cursor-pointer"
                          >
                            {showPrivateKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            <span>{showPrivateKey ? 'Ocultar' : 'Ver'}</span>
                          </button>
                          <button
                            onClick={() => copyToClipboard(tempCreatedWallet.privateKey, 'Clave Secreta')}
                            className="text-amber-400 hover:underline flex items-center space-x-1 cursor-pointer font-bold"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copiar Clave</span>
                          </button>
                        </div>
                      </div>
                      <div className="bg-[#0b0806] px-3 py-2 rounded border border-[#21140c] text-xs text-red-300 font-mono break-all">
                        {showPrivateKey ? tempCreatedWallet.privateKey : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <button
                        onClick={() =>
                          handleDownloadBackup(
                            tempCreatedWallet.address,
                            tempCreatedWallet.privateKey,
                            tempCreatedWallet.seedPhrase
                          )
                        }
                        className="py-2 rounded-lg bg-[#1f130c] hover:bg-[#2b190f] text-zinc-300 text-[11px] font-bold border border-[#3d2012] flex items-center justify-center space-x-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-amber-400" />
                        <span>Descargar Backup JSON</span>
                      </button>

                      <button
                        onClick={handleApplyCreatedWallet}
                        className="py-2 rounded-lg bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black font-black text-[11px] uppercase tracking-wider shadow-lg cursor-pointer"
                      >
                        Activar Esta Bóveda
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: IMPORTAR WALLET */}
          {activeTab === 'import' && (
            <div className="space-y-4">
              <div className="flex border border-[#2f190f] rounded-lg p-0.5 bg-[#120c08] text-xs">
                <button
                  onClick={() => setImportMethod('key')}
                  className={`flex-1 py-1.5 rounded font-bold transition-all cursor-pointer ${
                    importMethod === 'key'
                      ? 'bg-[#2b170e] text-amber-300'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Clave Privada (0x...)
                </button>
                <button
                  onClick={() => setImportMethod('seed')}
                  className={`flex-1 py-1.5 rounded font-bold transition-all cursor-pointer ${
                    importMethod === 'seed'
                      ? 'bg-[#2b170e] text-amber-300'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Frase Semilla (12 Palabras)
                </button>
                <button
                  onClick={() => setImportMethod('qr')}
                  className={`flex-1 py-1.5 rounded font-bold transition-all cursor-pointer ${
                    importMethod === 'qr'
                      ? 'bg-[#2b170e] text-amber-300'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Subir QR
                </button>
              </div>

              {importMethod === 'key' && (
                <form onSubmit={handleImportKey} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-400 font-bold uppercase">
                      Clave Privada en Formato Hexadecimal (0x...):
                    </label>
                    <input
                      type="password"
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      placeholder="0x6dcd... (64 caracteres hex)"
                      className="w-full bg-[#140e0b] border border-[#3b2012] focus:border-amber-400 rounded-lg px-3 py-2.5 text-white text-xs font-mono focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-lg bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black font-black text-xs uppercase tracking-wider cursor-pointer shadow-md"
                  >
                    Importar Clave y Sincronizar L1
                  </button>
                </form>
              )}

              {importMethod === 'seed' && (
                <form onSubmit={handleImportSeed} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-400 font-bold uppercase">
                      Introduce tus 12 o 24 palabras separadas por espacios:
                    </label>
                    <textarea
                      value={seedInput}
                      onChange={(e) => setSeedInput(e.target.value)}
                      rows={3}
                      placeholder="abandon ability able..."
                      className="w-full bg-[#140e0b] border border-[#3b2012] focus:border-amber-400 rounded-lg p-3 text-white text-xs font-mono focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-lg bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black font-black text-xs uppercase tracking-wider cursor-pointer shadow-md"
                  >
                    Restaurar Bóveda y Sincronizar L1
                  </button>
                </form>
              )}

              {importMethod === 'qr' && (
                <div className="bg-[#140e0b] p-4 rounded-xl border border-[#2b170e] text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-[#20150f] mx-auto flex items-center justify-center text-amber-400 border border-[#3b2012]">
                    <Camera className="w-8 h-8" />
                  </div>
                  <div className="text-xs space-y-1">
                    <h4 className="font-bold text-amber-200 uppercase">Cargar Imagen QR de Clave</h4>
                    <p className="text-[10px] text-zinc-400 max-w-sm mx-auto">
                      Selecciona una imagen QR que contenga tu clave privada 0x para importarla en el campo de Clave Privada.
                    </p>
                  </div>
                  <div className="flex justify-center space-x-2 pt-1">
                    <label className="px-4 py-2 rounded-lg bg-[#24150d] hover:bg-[#381f13] text-amber-300 font-bold text-xs border border-[#4a2615] cursor-pointer flex items-center space-x-1.5">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Seleccionar Imagen</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={() => {
                          setImportMethod('key');
                          addToast({
                            type: 'info',
                            title: 'Introduce la Clave 0x',
                            message: 'Pega la clave hexadecimal directamente en el campo Clave Privada para validación criptográfica exacta.',
                          });
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: RETIROS Y TRANSFERENCIAS ON-CHAIN */}
          {activeTab === 'transfers' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-200 flex items-start space-x-2.5">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold uppercase">Seguridad de Protocolo Hyperliquid L1</div>
                  <p className="text-zinc-300">
                    Por diseño de Hyperliquid, una <strong>API Wallet (Agent)</strong> únicamente tiene permisos para abrir/cerrar órdenes Perps y Spot; <strong>nunca puede retirar fondos</strong>. Los retiros de USDC a Arbitrum deben firmarse directamente con tu Cuenta Master en <em>app.hyperliquid.xyz</em>.
                  </p>
                </div>
              </div>

              <form onSubmit={handleExecuteTransfer} className="bg-[#140e0b] p-4 rounded-xl border border-[#2b170e] space-y-3">
                <div className="text-xs font-bold text-amber-200 uppercase flex items-center space-x-1.5">
                  <Send className="w-4 h-4 text-emerald-400" />
                  <span>Registro de Envío L1 (Solo Cuenta Master)</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 uppercase font-bold">Activo</label>
                    <select
                      value={transferAsset}
                      onChange={(e: any) => setTransferAsset(e.target.value)}
                      className="w-full bg-[#0b0806] border border-[#3b2012] text-white rounded p-2 text-xs font-mono focus:outline-none"
                    >
                      <option value="USDC">USDC (Disponible: ${wallet.balances.USDC})</option>
                      <option value="ETH">ETH (Saldo: {wallet.balances.ETH})</option>
                      <option value="HYPE">HYPE (Saldo: {wallet.balances.HYPE})</option>
                      <option value="ARB">ARB (Saldo: {wallet.balances.ARB})</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 uppercase font-bold">Monto</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-[#0b0806] border border-[#3b2012] text-white rounded p-2 text-xs font-mono focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setTransferAmount(wallet.balances[transferAsset].toString())}
                        className="absolute right-2 top-2 text-[10px] text-amber-400 font-bold hover:underline cursor-pointer"
                      >
                        MAX
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 uppercase font-bold">
                    Dirección de Destino (0x...)
                  </label>
                  <input
                    type="text"
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    placeholder="0x71C... (40 caracteres hex)"
                    className="w-full bg-[#0b0806] border border-[#3b2012] text-white rounded p-2 text-xs font-mono focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isTransferring || wallet.balances[transferAsset] <= 0}
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-500 hover:to-green-600 text-white font-black text-xs uppercase tracking-wider cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isTransferring ? 'Verificando firma...' : 'Enviar On-Chain'}
                </button>
              </form>

              <div className="space-y-2">
                <span className="text-xs font-bold text-zinc-400 uppercase">
                  Historial de Transferencias ({onChainTransfers.length})
                </span>
                {onChainTransfers.length === 0 ? (
                  <p className="text-center text-zinc-600 text-xs py-3">No hay transferencias registradas.</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {onChainTransfers.map((tx) => (
                      <div
                        key={tx.id}
                        className="p-2 rounded bg-[#130d09] border border-[#21130a] flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-white">
                            -{tx.amount} {tx.asset}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono">
                            A: {tx.to.slice(0, 8)}...{tx.to.slice(-6)}
                          </div>
                        </div>
                        <div className="text-right space-y-0.5">
                          <span className="text-[10px] text-emerald-400 font-bold block">CONFIRMADA</span>
                          <button
                            type="button"
                            onClick={() => openHashVerifier(tx.hash)}
                            className="text-[9px] font-mono text-amber-300 hover:text-white bg-[#22130a] hover:bg-[#341d10] px-1.5 py-0.5 rounded border border-[#482513] hover:border-amber-400 cursor-pointer flex items-center space-x-1"
                            title={`Verificar Hash On-Chain: ${tx.hash}`}
                          >
                            <span>TX: {tx.hash.slice(0, 8)}...</span>
                            <span className="text-amber-400 font-bold">L1</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
