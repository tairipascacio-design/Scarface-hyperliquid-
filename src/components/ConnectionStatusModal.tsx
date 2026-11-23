import React, { useState, useEffect, useCallback } from 'react';
import { useTrading } from '../context/TradingContext';
import { isStandaloneApkRuntime } from '../services/api';
import {
  ShieldCheck,
  Activity,
  Cpu,
  Wallet,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';

interface ConnectionStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ConnectionCheckResult {
  id: string;
  name: string;
  endpoint: string;
  ok: boolean;
  httpStatus: number;
  latencyMs: number;
  details: string;
  meta?: Record<string, any>;
}

async function runDirectStandaloneProbes(masterAddress: string, apiWalletAddress: string): Promise<ConnectionCheckResult[]> {
  const targetUser = (masterAddress || apiWalletAddress || '').trim();
  const agentAddr = (apiWalletAddress || '').trim();

  const probeInfo = async (): Promise<ConnectionCheckResult> => {
    const t0 = performance.now();
    try {
      const r = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'allMids' }),
      });
      const latencyMs = Math.round(performance.now() - t0);
      const mids = r.ok ? await r.json() : null;
      const pairCount = mids ? Object.keys(mids).length : 0;
      return {
        id: 'hl_info',
        name: 'Hyperliquid L1 Info API (Directo)',
        endpoint: 'https://api.hyperliquid.xyz/info',
        ok: pairCount > 0,
        httpStatus: r.status,
        latencyMs,
        details: `${pairCount} pares perpetuos/spot en vivo`,
      };
    } catch (e: any) {
      return { id: 'hl_info', name: 'Hyperliquid L1 Info API', endpoint: 'https://api.hyperliquid.xyz/info', ok: false, httpStatus: 0, latencyMs: Math.round(performance.now() - t0), details: e?.message || 'Error de red' };
    }
  };

  const probeExchange = async (): Promise<ConnectionCheckResult> => {
    const t0 = performance.now();
    try {
      const r = await fetch('https://api.hyperliquid.xyz/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const latencyMs = Math.round(performance.now() - t0);
      const reachable = r.status > 0 && r.status < 500;
      return {
        id: 'hl_exchange',
        name: 'Hyperliquid L1 Exchange Gateway (Órdenes)',
        endpoint: 'https://api.hyperliquid.xyz/exchange',
        ok: reachable,
        httpStatus: r.status,
        latencyMs,
        details: reachable ? `Gateway L1 activo (HTTP ${r.status})` : `Error HTTP ${r.status}`,
      };
    } catch (e: any) {
      return { id: 'hl_exchange', name: 'Hyperliquid L1 Exchange Gateway', endpoint: 'https://api.hyperliquid.xyz/exchange', ok: false, httpStatus: 0, latencyMs: Math.round(performance.now() - t0), details: e?.message || 'Error de red' };
    }
  };

  const probeExplorer = async (): Promise<ConnectionCheckResult> => {
    const t0 = performance.now();
    try {
      const r = await fetch('https://rpc.hyperliquid.xyz/explorer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'txDetails', hash: '0x0000000000000000000000000000000000000000000000000000000000000000' }),
      });
      const latencyMs = Math.round(performance.now() - t0);
      const reachable = r.status > 0 && r.status < 500;
      return {
        id: 'hl_explorer',
        name: 'Hyperliquid L1 Explorer RPC (Auditoría TxHash)',
        endpoint: 'https://rpc.hyperliquid.xyz/explorer',
        ok: reachable,
        httpStatus: r.status,
        latencyMs,
        details: reachable ? `Explorer L1 activo (HTTP ${r.status})` : `Error HTTP ${r.status}`,
      };
    } catch (e: any) {
      return { id: 'hl_explorer', name: 'Hyperliquid L1 Explorer RPC', endpoint: 'https://rpc.hyperliquid.xyz/explorer', ok: false, httpStatus: 0, latencyMs: Math.round(performance.now() - t0), details: e?.message || 'Error Explorer' };
    }
  };

  const probeArb = async (): Promise<ConnectionCheckResult> => {
    const t0 = performance.now();
    try {
      const r = await fetch('https://arb1.arbitrum.io/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      });
      const latencyMs = Math.round(performance.now() - t0);
      const d = r.ok ? await r.json() : null;
      const blk = d?.result ? parseInt(d.result, 16) : 0;
      return {
        id: 'arbitrum_rpc',
        name: 'Arbitrum One Mainnet RPC (42161)',
        endpoint: 'https://arb1.arbitrum.io/rpc',
        ok: blk > 0,
        httpStatus: r.status,
        latencyMs,
        details: blk > 0 ? `Bloque #${blk.toLocaleString()} confirmado` : 'Sin bloque',
      };
    } catch (e: any) {
      return { id: 'arbitrum_rpc', name: 'Arbitrum One Mainnet RPC', endpoint: 'https://arb1.arbitrum.io/rpc', ok: false, httpStatus: 0, latencyMs: Math.round(performance.now() - t0), details: e?.message || 'Error RPC' };
    }
  };

  const probeWallet = async (): Promise<ConnectionCheckResult> => {
    const t0 = performance.now();
    if (!/^0x[a-fA-F0-9]{40}$/.test(targetUser)) {
      return { id: 'hl_wallet', name: 'Hyperliquid L1 Clearinghouse, Spot, HLP & API Agent', endpoint: 'https://api.hyperliquid.xyz/info', ok: false, httpStatus: 400, latencyMs: 0, details: 'Sin dirección Master 0x configurada' };
    }
    try {
      const [chR, spotR, roleR, extraR, vaultR] = await Promise.all([
        fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'clearinghouseState', user: targetUser }) }),
        fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'spotClearinghouseState', user: targetUser }) }),
        /^0x[a-fA-F0-9]{40}$/.test(agentAddr)
          ? fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'userRole', user: agentAddr }) })
          : Promise.resolve(null),
        fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'extraAgents', user: targetUser }) }),
        fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'userVaultEquities', user: targetUser }) }),
      ]);
      const latencyMs = Math.round(performance.now() - t0);
      const ch = chR.ok ? await chR.json() : null;
      const sp = spotR.ok ? await spotR.json() : null;
      const rl = roleR && roleR.ok ? await roleR.json() : null;
      const ex = extraR.ok ? await extraR.json() : [];
      const vt = vaultR.ok ? await vaultR.json() : [];

      const val = parseFloat(ch?.marginSummary?.accountValue || '0');
      const withdrawable = parseFloat(ch?.withdrawable || '0');
      const spotRow = Array.isArray(sp?.balances) ? sp.balances.find((b: any) => b.coin === 'USDC') : null;
      const spotUsdc = spotRow ? Math.max(0, parseFloat(spotRow.total || '0') - parseFloat(spotRow.hold || '0')) : 0;
      const hlpRow = Array.isArray(vt) ? vt.find((v: any) => String(v.vaultAddress || '').toLowerCase() === '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303') : null;
      const hlpEq = hlpRow ? parseFloat(hlpRow.equity || '0') : 0;

      const userRole = rl?.role || 'missing';
      const isReg = Array.isArray(ex) && Boolean(agentAddr) && ex.some((ag: any) => (ag.address || '').toLowerCase() === agentAddr.toLowerCase());
      const isSelfMaster = Boolean(masterAddress) && Boolean(agentAddr) && masterAddress.trim().toLowerCase() === agentAddr.trim().toLowerCase() && (val > 0 || spotUsdc > 0);
      const ready = (isReg || isSelfMaster) && (val > 0 || spotUsdc > 0 || hlpEq > 0);

      return {
        id: 'hl_wallet',
        name: 'Hyperliquid L1 Clearinghouse, Spot, HLP & API Agent',
        endpoint: 'https://api.hyperliquid.xyz/info',
        ok: chR.ok && ready,
        httpStatus: chR.status,
        latencyMs,
        details: ready
          ? `Perps: $${val.toFixed(2)} (Retirable $${withdrawable.toFixed(2)}) | Spot: $${spotUsdc.toFixed(2)} | HLP: $${hlpEq.toFixed(2)} | Rol: ${userRole}`
          : `Perps: $${val.toFixed(2)} | Spot: $${spotUsdc.toFixed(2)} | HLP: $${hlpEq.toFixed(2)} | Rol: ${userRole} — ${!masterAddress ? 'Falta Master pública' : !isReg && !isSelfMaster ? 'API Agent no autorizado' : 'Sin fondos USDC'}`,
      };
    } catch (e: any) {
      return { id: 'hl_wallet', name: 'Hyperliquid L1 Clearinghouse & API Agent', endpoint: 'https://api.hyperliquid.xyz/info', ok: false, httpStatus: 0, latencyMs: Math.round(performance.now() - t0), details: e?.message || 'Error wallet' };
    }
  };

  return Promise.all([probeInfo(), probeExchange(), probeExplorer(), probeArb(), probeWallet()]);
}

export const ConnectionStatusModal: React.FC<ConnectionStatusModalProps> = ({ isOpen, onClose }) => {
  const {
    wallet,
    isAutoBotActive,
    isLiveOrderFlowConnected,
    isMevShieldActive,
    totalMevSavedUsdc,
    unifiedBrainMetrics,
    refreshRealBalances,
    addToast,
  } = useTrading();

  const [isPinging, setIsPinging] = useState(false);
  const [checks, setChecks] = useState<ConnectionCheckResult[]>([]);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const runLiveVerification = useCallback(async (showToast = false) => {
    setIsPinging(true);
    setVerifyError(null);
    try {
      let results: ConnectionCheckResult[] | null = null;
      let verifiedTimestamp = new Date().toISOString();

      if (!isStandaloneApkRuntime()) {
        try {
          const [res] = await Promise.all([
            fetch('/api/connections/verify', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                masterAddress: wallet.masterAddress || '',
                apiWalletAddress: wallet.apiWalletAddress || wallet.address,
              }),
            }),
            refreshRealBalances(),
          ]);
          if (res.ok) {
            const data = await res.json();
            results = Array.isArray(data.results) ? data.results : [];
            verifiedTimestamp = data.verifiedAt || verifiedTimestamp;
          }
        } catch {
          // Fall back to direct probes below
        }
      }

      if (!results) {
        const [directResults] = await Promise.all([
          runDirectStandaloneProbes(wallet.masterAddress || '', wallet.apiWalletAddress || wallet.address),
          refreshRealBalances(),
        ]);
        results = directResults;
      }

      setChecks(results);
      setVerifiedAt(verifiedTimestamp);

      if (showToast) {
        const passed = results.filter((r) => r.ok).length;
        const total = results.length;
        addToast({
          type: passed === total ? 'success' : 'warning',
          title: 'Auditoría Genuina de Conexiones Completa',
          message: `${passed}/${total} endpoints verificados con respuesta real en vivo.`,
        });
      }
    } catch (err: any) {
      setVerifyError(err?.message || 'Error verificando conexiones reales');
    } finally {
      setIsPinging(false);
    }
  }, [wallet.masterAddress, wallet.apiWalletAddress, wallet.address, refreshRealBalances, addToast]);

  useEffect(() => {
    if (isOpen) {
      runLiveVerification(false);
    }
  }, [isOpen, runLiveVerification]);

  if (!isOpen) return null;

  const passedCount = checks.filter((c) => c.ok).length;
  const totalCount = checks.length;
  const avgLatency =
    checks.length > 0
      ? Math.round(checks.reduce((acc, c) => acc + (c.latencyMs || 0), 0) / checks.length)
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 font-mono">
      <div className="relative w-full max-w-2xl bg-[#0c0907] border border-amber-500/40 rounded-2xl shadow-2xl shadow-amber-950/40 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 bg-gradient-to-r from-[#170e0a] via-[#24130a] to-[#120703] border-b border-[#3b1f11] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-center">
              <Activity className="w-5 h-5 text-amber-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-black text-white tracking-wider uppercase">
                  VERIFICACIÓN GENUINA DE CONEXIONES EN VIVO
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[9px] font-black border uppercase ${
                    totalCount > 0 && passedCount === totalCount
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-600/60'
                      : 'bg-amber-950 text-amber-300 border-amber-600/60'
                  }`}
                >
                  {isPinging ? 'SONDEANDO...' : totalCount > 0 ? `${passedCount}/${totalCount} OK` : 'VERIFICANDO'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Sondeo real punto a punto: Hyperliquid /info, /exchange, Arbitrum RPC, Cuenta Master/API, APK & IA
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
          {verifyError && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-700/60 text-red-200 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{verifyError}</span>
            </div>
          )}

          {/* Card 1: 6 Live Endpoint Probes */}
          <div className="p-3.5 rounded-xl bg-[#120d09] border border-[#2b170e] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isLiveOrderFlowConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                  }`}
                />
                <span className="font-black text-amber-200 uppercase tracking-wide">
                  1. ENDPOINTS REALES & LATENCIA MEDIDA
                </span>
              </div>
              <span className="text-[10px] text-zinc-400">
                Latencia Promedio: <strong className="text-emerald-400">{avgLatency} ms</strong>
              </span>
            </div>

            {checks.length === 0 ? (
              <div className="p-4 text-center text-zinc-400">
                Ejecutando pruebas reales de red contra Hyperliquid L1 y Arbitrum One...
              </div>
            ) : (
              <div className="space-y-2">
                {checks.map((chk) => (
                  <div
                    key={chk.id}
                    className="p-2.5 rounded-lg bg-black/50 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        {chk.ok ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        )}
                        <span className="font-bold text-white">{chk.name}</span>
                      </div>
                      <div className="text-[10px] text-zinc-500 break-all">{chk.endpoint}</div>
                      <div className="text-[11px] text-zinc-300">{chk.details}</div>
                    </div>

                    <div className="flex sm:flex-col items-end justify-between shrink-0 text-right gap-1">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          chk.ok
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-700/60'
                            : 'bg-amber-950 text-amber-300 border-amber-700/60'
                        }`}
                      >
                        HTTP {chk.httpStatus || 0} • {chk.ok ? 'ACTIVO' : 'REVISAR'}
                      </span>
                      <span className="text-[10px] text-cyan-300 font-bold">{chk.latencyMs} ms</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {verifiedAt && (
              <div className="text-[10px] text-zinc-500 text-right">
                Última verificación real: {new Date(verifiedAt).toLocaleTimeString()}
              </div>
            )}
          </div>

          {/* Card 2: Hyperliquid Perps Master & API Wallet */}
          <div className="p-3.5 rounded-xl bg-[#120d09] border border-[#2b170e] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Wallet className="w-4 h-4 text-amber-400" />
                <span className="font-black text-amber-200 uppercase tracking-wide">
                  2. CUENTA MASTER & API WALLET HYPERLIQUID PERPS
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold border font-mono ${
                  wallet.isAgentAuthorized
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-600/60'
                    : 'bg-amber-950/80 text-amber-300 border-amber-600/60'
                }`}
              >
                {wallet.isAgentAuthorized ? 'AGENTE AUTORIZADO EN L1' : `ROL: ${(wallet.hyperliquidUserRole || 'API_SIGNER').toUpperCase()}`}
              </span>
            </div>

            <div className="p-2.5 rounded bg-black/40 border border-white/5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-500 uppercase">Master Pública (/info):</span>
                <span className="text-xs font-mono font-bold text-zinc-200 break-all">
                  {wallet.masterAddress || 'Sin asignar (usando API Wallet)'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-500 uppercase">API Wallet Signer (/exchange):</span>
                <span className="text-xs font-mono font-bold text-amber-300 break-all">
                  {wallet.apiWalletAddress || wallet.address}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 uppercase">Equity Perps L1 (Master):</span>
                <span className="text-sm font-mono font-black text-emerald-400">
                  ${(wallet.hyperliquidAccountValue ?? wallet.balances.USDC).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDC
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 uppercase">USDC en Arbitrum One:</span>
                <span className="text-xs font-mono font-bold text-cyan-300">
                  ${(wallet.arbitrumUsdc ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDC
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/5">
                <span className="text-zinc-400">Autorización del Bot Autónomo:</span>
                <span className={`font-bold ${isAutoBotActive ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {isAutoBotActive ? 'AUTORIZADO PARA FUEGO REAL (BOTÓN ON)' : 'STANDBY (BOTÓN OFF)'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Cerebro Maestro Unificado EV+ */}
          <div className="p-3.5 rounded-xl bg-[#120d09] border border-[#2b170e] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Cpu className="w-4 h-4 text-cyan-400" />
                <span className="font-black text-amber-200 uppercase tracking-wide">
                  3. CEREBRO MAESTRO UNIFICADO EV+ (7 PILARES)
                </span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-700/60 font-mono">
                {unifiedBrainMetrics
                  ? `SCORE: ${unifiedBrainMetrics.compositeScore > 0 ? '+' : ''}${unifiedBrainMetrics.compositeScore}`
                  : 'SIN DATOS L1'}
              </span>
            </div>

            <div className="text-[11px] text-zinc-300 leading-relaxed bg-black/40 p-2.5 rounded border border-white/5">
              {unifiedBrainMetrics?.rationale || 'Esperando velas reales y orderbook L2 desde Hyperliquid para calcular la estrategia EV+.'}
            </div>

            <div className="grid grid-cols-4 gap-2 text-[10px]">
              <div className="p-1.5 rounded bg-black/30 border border-white/5">
                <div className="text-zinc-500">Veredicto</div>
                <div className="font-black text-amber-300">{unifiedBrainMetrics?.verdict || 'WAIT'}</div>
              </div>
              <div className="p-1.5 rounded bg-black/30 border border-white/5">
                <div className="text-zinc-500">Valor Esperado</div>
                <div className={`font-black ${(unifiedBrainMetrics?.expectedValuePct || 0) > 0 ? 'text-emerald-400' : 'text-zinc-300'}`}>
                  {unifiedBrainMetrics ? `${unifiedBrainMetrics.expectedValuePct > 0 ? '+' : ''}${unifiedBrainMetrics.expectedValuePct}%` : '0.00%'}
                </div>
              </div>
              <div className="p-1.5 rounded bg-black/30 border border-white/5">
                <div className="text-zinc-500">Ratio R:R</div>
                <div className="font-black text-cyan-300">{unifiedBrainMetrics ? `${unifiedBrainMetrics.riskRewardRatio}:1` : '0:1'}</div>
              </div>
              <div className="p-1.5 rounded bg-black/30 border border-white/5">
                <div className="text-zinc-500">Puerta EV+</div>
                <div className={`font-black ${unifiedBrainMetrics?.positiveEntryApproved ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {unifiedBrainMetrics?.positiveEntryApproved ? 'APROBADA' : 'FILTRADA'}
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: MEV Shield */}
          <div className="p-3.5 rounded-xl bg-[#120d09] border border-[#2b170e] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="font-black text-amber-200 uppercase tracking-wide">
                  4. TÚNEL PRIVADO MEV SHIELD
                </span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-600/60 font-mono">
                {isMevShieldActive ? 'ACTIVO (ZERO-MEMPOOL L1)' : 'INACTIVO'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded bg-black/40 border border-white/5 text-[11px]">
              <span className="text-zinc-400">Ahorro Real Registrado en Ejecuciones L1:</span>
              <span className="font-black text-emerald-400 font-mono text-sm">
                +${totalMevSavedUsdc.toFixed(2)} USDC
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[#0a0705] border-t border-[#26140b] flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => runLiveVerification(true)}
            disabled={isPinging}
            className="px-4 py-2 rounded-xl bg-[#1e120b] hover:bg-[#2c190f] text-amber-300 border border-amber-600/50 hover:border-amber-400 transition-all font-bold text-xs flex items-center space-x-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
            <span>Probar Latencia & Re-verificar Todo</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg"
          >
            Entendido, Todo en Orden
          </button>
        </div>
      </div>
    </div>
  );
};
