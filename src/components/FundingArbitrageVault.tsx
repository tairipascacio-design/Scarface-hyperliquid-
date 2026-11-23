import React, { useState, useEffect } from 'react';
import { useTrading } from '../context/TradingContext';
import { MarketSymbol } from '../types/trading';
import { fetchHyperliquidSpotAsset, HyperliquidSpotAssetInfo } from '../services/web3Balance';
import { isValidTxHash } from '../services/walletCrypto';
import {
  DELTA0_MIN_APY_PCT,
  DELTA0_MIN_TOTAL_USDC,
  isWhitelistedSymbol,
} from '../services/riskConstants';
import {
  ShieldCheck,
  Zap,
  Percent,
  Coins,
  Shield,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Wallet,
  Volume2,
} from 'lucide-react';

export const FundingArbitrageVault: React.FC = () => {
  const {
    markets,
    wallet,
    arbitragePositions,
    isAutoArbitrageActive,
    toggleAutoArbitrage,
    openFundingArbitrage,
    closeFundingArbitrage,
    claimArbitrageFunding,
    lastArbitrageError,
    isMevShieldActive,
    toggleMevShield,
    totalMevSavedUsdc,
    mevShieldEvents,
    autoCompoundVault,
    toggleAutoCompoundVault,
    depositToAutoCompoundVault,
    withdrawFromAutoCompoundVault,
    openHashVerifier,
    refreshRealBalances,
    isSyncingBalances,
    setIsWalletModalOpen,
    openConnectionModal,
    playTTS,
    stopTTS,
    isTTSPlaying,
  } = useTrading();

  const perpFreeUsdc = Math.max(0, +((wallet.hyperliquidAccountValue || 0) - (wallet.hyperliquidMarginUsed || 0)).toFixed(2));
  const perpWithdrawableUsdc = +(wallet.hyperliquidWithdrawable || 0).toFixed(2);
  const spotFreeUsdc = +(wallet.hyperliquidSpotUsdc || 0).toFixed(2);
  const totalHlUsdc = +(perpFreeUsdc + spotFreeUsdc).toFixed(2);
  const heldSpotTokens = (wallet.hyperliquidSpotBalances || []).filter((b) => b.coin !== 'USDC' && b.total > 0);
  const isSignerMaster =
    !wallet.masterAddress ||
    wallet.address.toLowerCase() === wallet.masterAddress.toLowerCase();

  const [selectedSymbol, setSelectedSymbol] = useState<MarketSymbol>('HYPE-PERP');
  const [deployUsdcAmount, setDeployUsdcAmount] = useState<string>('25');
  const [depositAmount, setDepositAmount] = useState<string>('10');
  const [withdrawAmount, setWithdrawAmount] = useState<string>('10');
  const [activeSubTab, setActiveSubTab] = useState<'arbitrage' | 'vault' | 'mev'>('arbitrage');
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [isVaultBusy, setIsVaultBusy] = useState<boolean>(false);
  const [spotAssetInfo, setSpotAssetInfo] = useState<HyperliquidSpotAssetInfo | null>(null);
  const [checkingSpot, setCheckingSpot] = useState<boolean>(false);

  const curMarket = markets[selectedSymbol] || Object.values(markets)[0];

  // Fetch REAL Hyperliquid Spot asset pair metadata for the selected token
  useEffect(() => {
    let mounted = true;
    const loadSpot = async () => {
      setCheckingSpot(true);
      const base = selectedSymbol.replace('-PERP', '');
      const info = await fetchHyperliquidSpotAsset(base);
      if (mounted) {
        setSpotAssetInfo(info);
        setCheckingSpot(false);
      }
    };
    loadSpot();
    return () => {
      mounted = false;
    };
  }, [selectedSymbol]);

  const spotPrice = spotAssetInfo?.midPx || curMarket?.price || 0;
  const spreadPct =
    spotPrice > 0 && curMarket?.price
      ? +(((curMarket.price - spotPrice) / spotPrice) * 100).toFixed(3)
      : 0;
  const apyPct = +(((curMarket?.fundingRate || 0) * 3 * 365) * 100).toFixed(2);

  const totalArbitrageAllocated = arbitragePositions
    .filter((p) => p.status === 'ACTIVE')
    .reduce((acc, p) => acc + p.allocatedUsdc, 0);

  const totalAccruedFunding = arbitragePositions
    .filter((p) => p.status === 'ACTIVE')
    .reduce((acc, p) => acc + p.accruedFundingUsdc, 0);

  const handleDeployArbitrage = async () => {
    const amount = parseFloat(deployUsdcAmount) || 0;
    setIsDeploying(true);
    try {
      await openFundingArbitrage(selectedSymbol, amount);
    } finally {
      setIsDeploying(false);
    }
  };

  const handleVaultDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(depositAmount) || 0;
    if (amount <= 0) return;
    setIsVaultBusy(true);
    try {
      const ok = await depositToAutoCompoundVault(amount);
      if (ok) setDepositAmount('');
    } finally {
      setIsVaultBusy(false);
    }
  };

  const handleVaultWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(withdrawAmount) || 0;
    if (amount <= 0) return;
    setIsVaultBusy(true);
    try {
      const ok = await withdrawFromAutoCompoundVault(amount);
      if (ok) setWithdrawAmount('');
    } finally {
      setIsVaultBusy(false);
    }
  };

  const walletReadyForL1 = totalHlUsdc > 0 && (wallet.isAgentAuthorized || wallet.hyperliquidUserRole === 'user');

  return (
    <div className="space-y-4 max-w-[1680px] mx-auto pb-12 font-mono text-zinc-200">
      {/* Top L1 Header & Live Connection Diagnostic Strip */}
      <section className="bg-[#0c0a09] border border-white/10 rounded-xl p-4 sm:px-5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <h2 className="text-base sm:text-lg font-bold text-amber-200 tracking-tight">
                Delta-0 Spot/Perp & Bóveda HLP Hyperliquid L1
              </h2>
              <span className="text-zinc-500">·</span>
              <span className="text-emerald-400 font-bold">Ejecución Real Mainnet L1 (Sin Paper)</span>
            </div>
            <p className="text-xs text-zinc-400 font-sans">
              Cobertura real Delta Neutral comprando Spot en el libro L1 de Hyperliquid + Short Perp 1x en la misma cuenta, o depósito directo en la Bóveda oficial HLP ({autoCompoundVault.currentApy}% APR en vivo).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                isTTSPlaying
                  ? stopTTS()
                  : playTTS(
                      `Estado de Delta Cero y Bóveda HLP Mainnet. Perps libre ${perpFreeUsdc} dólares, retirable ${perpWithdrawableUsdc} dólares. Spot libre ${spotFreeUsdc} dólares. Bóveda HLP depositados ${autoCompoundVault.depositedUsdc} dólares al ${autoCompoundVault.currentApy} por ciento APR. Posiciones Delta Cero activas: ${arbitragePositions.filter((p) => p.status === 'ACTIVE').length}. ${lastArbitrageError ? `Último diagnóstico L1: ${lastArbitrageError}` : ''}`,
                      { interrupt: true, force: true }
                    )
              }
              className="px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/15 text-xs font-bold text-amber-300 flex items-center gap-1.5 cursor-pointer"
              title="Escuchar balances reales L1, Bóveda HLP y diagnóstico"
            >
              <Volume2 className="w-3.5 h-3.5 text-amber-400" />
              <span>{isTTSPlaying ? 'Detener' : 'Escuchar'}</span>
            </button>

            <button
              type="button"
              onClick={() => refreshRealBalances()}
              disabled={isSyncingBalances}
              className="px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/15 text-xs font-bold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isSyncingBalances ? 'animate-spin' : ''}`} />
              <span>{isSyncingBalances ? 'Sincronizando...' : 'Sincronizar L1'}</span>
            </button>

            <button
              type="button"
              onClick={openConnectionModal}
              className="px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/15 text-xs font-bold text-cyan-300 cursor-pointer"
            >
              Verificar Conexiones
            </button>

            <button
              type="button"
              onClick={toggleAutoArbitrage}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 border cursor-pointer ${
                isAutoArbitrageActive
                  ? 'bg-emerald-500 text-black border-emerald-300'
                  : 'bg-[#150d09] hover:bg-[#22150e] text-zinc-300 border-white/15'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{isAutoArbitrageActive ? 'Auto-Arbitraje ON' : 'Auto-Arbitraje OFF'}</span>
            </button>
          </div>
        </div>

        {/* Live L1 Balances & Authorization Diagnostic Bar */}
        <div className="pt-2.5 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
          <div>
            <div className="text-[10px] text-zinc-500">Perps L1 Libre / Retirable</div>
            <div className="font-bold text-emerald-400">
              ${perpFreeUsdc.toLocaleString()} <span className="text-[10px] text-zinc-400">(${perpWithdrawableUsdc} ret.)</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-500">Spot L1 USDC</div>
            <div className="font-bold text-amber-300">${spotFreeUsdc.toLocaleString()} USDC</div>
            {heldSpotTokens.length > 0 && (
              <div className="text-[10px] text-zinc-400 truncate">
                {heldSpotTokens.map((t) => `${t.total} ${t.coin}`).join(' · ')}
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] text-zinc-500">Bóveda HLP Mainnet</div>
            <div className="font-bold text-white">
              ${autoCompoundVault.depositedUsdc.toLocaleString()} USDC{' '}
              <span className="text-[10px] text-emerald-400">({autoCompoundVault.currentApy}% APR)</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] text-zinc-500">Firma L1 / Rol</div>
              <div className={`font-bold ${walletReadyForL1 ? 'text-emerald-400' : 'text-amber-300'}`}>
                {walletReadyForL1 ? 'Autorizada L1' : `Rol: ${wallet.hyperliquidUserRole || 'missing'}`}
              </div>
            </div>
            {!walletReadyForL1 && (
              <button
                type="button"
                onClick={() => setIsWalletModalOpen(true)}
                className="px-2.5 py-1 rounded bg-amber-500 text-black font-bold text-[10px] cursor-pointer flex items-center gap-1 shrink-0"
              >
                <Wallet className="w-3 h-3" />
                <span>Conectar</span>
              </button>
            )}
          </div>
        </div>

        {/* Explicit L1 Diagnostic Error Banner */}
        {lastArbitrageError && (
          <div
            onClick={() => playTTS(`Diagnóstico Hyperliquid L1: ${lastArbitrageError}`, { interrupt: true, force: true })}
            className="p-3 rounded-lg bg-red-950/60 hover:bg-red-950/80 border border-red-600/60 text-xs text-red-200 flex items-start gap-2 font-sans cursor-pointer transition-colors"
            title="Haz clic para escuchar el diagnóstico completo"
          >
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 flex-1">
              <div className="font-bold font-mono text-[11px] text-red-300 flex items-center gap-1.5">
                <span>Diagnóstico Hyperliquid L1</span>
                <Volume2 className="w-3.5 h-3.5 text-red-300" />
              </div>
              <div>{lastArbitrageError}</div>
            </div>
          </div>
        )}
      </section>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0c0a09] border border-white/10 rounded-lg w-fit text-xs">
        <button
          type="button"
          onClick={() => setActiveSubTab('arbitrage')}
          className={`px-3.5 py-1.5 rounded-md font-bold cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === 'arbitrage' ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Coins className="w-3.5 h-3.5" />
          <span>Cobertura Delta-0 L1 ({arbitragePositions.filter((p) => p.status === 'ACTIVE').length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('vault')}
          className={`px-3.5 py-1.5 rounded-md font-bold cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === 'vault' ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Percent className="w-3.5 h-3.5" />
          <span>Bóveda Oficial HLP (${autoCompoundVault.depositedUsdc})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('mev')}
          className={`px-3.5 py-1.5 rounded-md font-bold cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === 'mev' ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Enrutamiento HyperBFT ({mevShieldEvents.length})</span>
        </button>
      </div>

      {/* SECTION 1: FUNDING ARBITRAGE DELTA-NEUTRAL REAL L1 */}
      {activeSubTab === 'arbitrage' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Deploy Console: 5 cols */}
          <div className="lg:col-span-5 bg-[#0c0a09] border border-white/10 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 text-xs">
              <span className="font-bold text-amber-200 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Abrir Cobertura Delta-0 Real L1</span>
              </span>
              <span className="text-[11px] text-zinc-400 tabular-nums">
                Total HL: <strong className="text-emerald-400">${totalHlUsdc} USDC</strong>
              </span>
            </div>

            {/* Priority L1 Pairs with Native Spot + High Funding */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-zinc-400 uppercase font-bold block">
                Tokens L1 (Hyperliquid Spot + Perp Funding APY)
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {Object.values(markets)
                  .filter((m) => m && m.price > 0 && isWhitelistedSymbol(m.symbol))
                  .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate))
                  .slice(0, 8)
                  .map((m) => {
                    const sym = m.symbol;
                    const tokenApy = +((m.fundingRate * 3 * 365) * 100).toFixed(1);
                    return (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => setSelectedSymbol(sym)}
                        className={`p-2 rounded-lg text-left border transition-colors cursor-pointer ${
                          selectedSymbol === sym
                            ? 'bg-amber-500 text-black border-amber-400 font-bold'
                            : 'bg-black/30 hover:bg-white/[0.05] text-zinc-300 border-white/10'
                        }`}
                      >
                        <div className="text-xs truncate">{sym.replace('-PERP', '')}</div>
                        <div
                          className={`text-[10px] font-bold tabular-nums ${
                            selectedSymbol === sym ? 'text-black' : 'text-emerald-400'
                          }`}
                        >
                          {tokenApy}% APY
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Capital Input */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] tabular-nums">
                <span className="text-zinc-400 font-bold">Capital Total (USDC)</span>
                <span className="text-zinc-500">50% Spot L1 + 50% Short Perp 1x</span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="5"
                  min={DELTA0_MIN_TOTAL_USDC}
                  value={deployUsdcAmount}
                  onChange={(e) => setDeployUsdcAmount(e.target.value)}
                  className="w-full bg-black/40 border border-white/15 focus:border-amber-400 rounded-lg px-3 py-2 text-white text-sm tabular-nums focus:outline-none"
                  placeholder="25"
                />
                <button
                  type="button"
                  onClick={() => setDeployUsdcAmount(Math.max(DELTA0_MIN_TOTAL_USDC, Math.floor(totalHlUsdc)).toString())}
                  className="absolute right-3 top-2.5 text-[10px] text-amber-400 font-bold hover:underline cursor-pointer"
                >
                  MAX (${Math.floor(totalHlUsdc)})
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {[25, 50, 100, 250].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setDeployUsdcAmount(amt.toString())}
                    className="py-1 text-[11px] bg-white/[0.03] hover:bg-white/[0.08] text-zinc-300 rounded border border-white/10 cursor-pointer tabular-nums"
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Spot vs Perp Contract Breakdown */}
            <div className="bg-black/30 p-3 rounded-lg border border-white/10 space-y-1.5 text-[11px] tabular-nums">
              <div className="flex justify-between text-zinc-400">
                <span>Mercado Spot L1 Nativo:</span>
                <span className={`font-bold ${spotAssetInfo ? 'text-emerald-400' : 'text-red-400'}`}>
                  {checkingSpot
                    ? 'Verificando en L1...'
                    : spotAssetInfo
                    ? `${spotAssetInfo.baseTokenName}/USDC (${spotAssetInfo.pairName} · ID #${spotAssetInfo.assetId})`
                    : 'Sin Spot USDC nativo en L1'}
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Precio Spot L1 / Mark Perp L1:</span>
                <span className="text-white font-bold">
                  ${spotPrice.toFixed(4)} / ${(curMarket?.price || 0).toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Funding Rate 8h / APY Real:</span>
                <span className="text-emerald-400 font-bold">
                  +{(curMarket?.fundingRate * 100 || 0).toFixed(4)}% · {apyPct}% APY
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Spread Base L1:</span>
                <span className="text-amber-300 font-bold">{spreadPct}%</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDeployArbitrage}
              disabled={isDeploying}
              className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4" />
              <span>
                {isDeploying
                  ? 'Enviando Spot + Short L1...'
                  : `Ejecutar Delta-0 L1 ($${deployUsdcAmount || '0'} USDC)`}
              </span>
            </button>

            <p className="text-[10px] text-zinc-500 leading-relaxed font-sans">
              Nota Hyperliquid L1: El mínimo real por pierna es $11.50 USD (${DELTA0_MIN_TOTAL_USDC} total) con Funding &ge; {DELTA0_MIN_APY_PCT}% APY. Necesitas la mitad en <strong>Spot USDC</strong> y la mitad en <strong>Perps USDC</strong> dentro de Hyperliquid.
            </p>
          </div>

          {/* Active Arbitrage Positions List: 7 cols */}
          <div className="lg:col-span-7 bg-[#0c0a09] border border-white/10 rounded-xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 text-xs">
              <span className="font-bold text-amber-200">
                Coberturas Delta-0 Activas ({arbitragePositions.filter((p) => p.status === 'ACTIVE').length})
              </span>
              <div className="flex items-center gap-3 tabular-nums text-[11px]">
                <span className="text-zinc-400">
                  Desplegado: <strong className="text-white">${totalArbitrageAllocated.toLocaleString()}</strong>
                </span>
                {totalAccruedFunding > 0 && (
                  <button
                    type="button"
                    onClick={() => claimArbitrageFunding()}
                    className="text-emerald-400 hover:underline font-bold cursor-pointer"
                  >
                    Cosechar +${totalAccruedFunding.toFixed(2)}
                  </button>
                )}
              </div>
            </div>

            {arbitragePositions.length === 0 ? (
              <div className="p-10 text-center text-zinc-500 text-xs font-sans">
                No hay coberturas Delta-0 activas todavía. Conecta tu Master/API Wallet con USDC en Spot + Perps y ejecuta tu primera cobertura real en Hyperliquid L1.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {arbitragePositions.map((arb) => {
                  const isActive = arb.status === 'ACTIVE';
                  return (
                    <div
                      key={arb.id}
                      className={`p-3 rounded-lg border text-xs ${
                        isActive ? 'bg-black/30 border-white/10' : 'bg-black/15 border-white/5 opacity-60'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{arb.symbol}</span>
                          <span className={`text-[10px] font-bold ${Math.abs(arb.delta) <= 0.01 ? 'text-emerald-400' : 'text-amber-300'}`}>
                            Delta {arb.delta > 0 ? `+${arb.delta}` : arb.delta.toFixed(4)}
                          </span>
                          <span className="text-[10px] text-zinc-500">· {arb.status}</span>
                        </div>

                        <div className="flex items-center gap-3 tabular-nums">
                          <span className="text-[11px] text-zinc-400">
                            Capital: <strong className="text-amber-200">${arb.allocatedUsdc} USDC</strong>
                          </span>
                          {isActive && (
                            <button
                              type="button"
                              onClick={() => closeFundingArbitrage(arb.id)}
                              className="px-2.5 py-1 rounded bg-red-950/70 hover:bg-red-900 text-red-300 text-[10px] font-bold border border-red-800 cursor-pointer"
                            >
                              Cerrar Ambas Piernas L1
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] tabular-nums">
                        <div>
                          <span className="text-[10px] text-zinc-500 block">Spot Long L1</span>
                          <span className="font-bold text-white">
                            +{arb.spotAmount} {arb.spotToken} (${arb.spotEntryPrice})
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 block">Perp Short L1 (1x)</span>
                          <span className="font-bold text-red-400">
                            -{arb.perpShortSize} {arb.spotToken} (${arb.perpEntryPrice})
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 block">Spread & APY</span>
                          <span className="font-bold text-amber-300">
                            {arb.spreadPct}% | {arb.currentApy}% APY
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 block">
                            Verificación L1 {arb.spotOid ? `(OID ${arb.spotOid})` : ''}
                          </span>
                          <span className="text-zinc-300">
                            <button
                              type="button"
                              onClick={() =>
                                openHashVerifier(
                                  isValidTxHash(arb.spotTxHash)
                                    ? arb.spotTxHash
                                    : arb.spotOid
                                    ? String(arb.spotOid)
                                    : arb.spotTxHash
                                )
                              }
                              className="hover:text-amber-300 underline cursor-pointer inline-flex items-center gap-1"
                            >
                              <span>Auditar L1</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 2: OFFICIAL HYPERLIQUID HLP VAULT (GENUINE vaultTransfer L1) */}
      {activeSubTab === 'vault' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 bg-[#0c0a09] border border-white/10 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Bóveda Oficial HLP (Hyperliquidity Provider L1)
                </h3>
                <p className="text-[11px] text-zinc-400 font-sans">
                  Contrato L1: <span className="font-mono text-zinc-300">{autoCompoundVault.vaultAddress || '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303'}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={toggleAutoCompoundVault}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                  autoCompoundVault.isActive
                    ? 'bg-emerald-950/70 text-emerald-300 border-emerald-600'
                    : 'bg-black/40 text-zinc-400 border-white/15'
                }`}
              >
                {autoCompoundVault.isActive ? 'Monitoreo L1 ACTIVO' : 'Monitoreo L1 OFF'}
              </button>
            </div>

            <div className="grid grid-cols-3 border border-white/10 rounded-lg divide-x divide-white/10 bg-black/30 tabular-nums text-xs">
              <div className="p-3">
                <div className="text-[10px] text-zinc-500">Tu Equidad Real en HLP</div>
                <div className="text-lg font-bold text-amber-200 mt-0.5">
                  ${autoCompoundVault.depositedUsdc.toLocaleString()} USDC
                </div>
              </div>
              <div className="p-3">
                <div className="text-[10px] text-zinc-500">APR En Vivo HLP</div>
                <div className="text-lg font-bold text-emerald-400 mt-0.5">
                  {autoCompoundVault.currentApy}% APR
                </div>
              </div>
              <div className="p-3">
                <div className="text-[10px] text-zinc-500">TVL Real Mainnet</div>
                <div className="text-lg font-bold text-cyan-300 mt-0.5">
                  ${((autoCompoundVault.vaultTvlUsdc || 0) / 1e6).toFixed(2)}M
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs tabular-nums pt-1">
              <div className="p-3 rounded-lg bg-black/25 border border-white/5">
                <div className="text-[10px] text-zinc-500">Proyección 30 Días (tu equidad)</div>
                <div className="font-bold text-white mt-0.5">+${autoCompoundVault.projectedMonthlyUsdc} USDC</div>
              </div>
              <div className="p-3 rounded-lg bg-black/25 border border-white/5">
                <div className="text-[10px] text-zinc-500">Proyección 1 Año</div>
                <div className="font-bold text-emerald-400 mt-0.5">+${autoCompoundVault.projectedYearlyUsdc} USDC</div>
              </div>
              <div className="p-3 rounded-lg bg-black/25 border border-white/5">
                <div className="text-[10px] text-zinc-500">PnL Histórico en HLP</div>
                <div className="font-bold text-amber-300 mt-0.5">
                  ${autoCompoundVault.totalCompoundedUsdc.toFixed(2)} USDC
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 bg-[#0c0a09] border border-white/10 rounded-xl p-4 sm:p-5 space-y-4">
            <h4 className="font-bold text-amber-200 text-xs border-b border-white/10 pb-2">
              Transferencia Real `vaultTransfer` a HLP L1
            </h4>

            <form onSubmit={handleVaultDeposit} className="space-y-2">
              <div className="flex justify-between text-[11px] tabular-nums">
                <span className="text-zinc-400 font-bold">Depositar a HLP (Min $5)</span>
                <span className="text-zinc-500">Retirable L1: ${perpWithdrawableUsdc} USDC</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="1"
                  min="5"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/15 focus:border-amber-400 rounded-lg px-3 py-2 text-white text-xs tabular-nums focus:outline-none"
                  placeholder="10"
                />
                <button
                  type="submit"
                  disabled={isVaultBusy}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {isVaultBusy ? 'Enviando...' : 'Depositar L1'}
                </button>
              </div>
            </form>

            <form onSubmit={handleVaultWithdraw} className="space-y-2 pt-2 border-t border-white/10">
              <div className="flex justify-between text-[11px] tabular-nums">
                <span className="text-zinc-400 font-bold">Retirar de HLP a Perps</span>
                <span className="text-zinc-500">En HLP: ${autoCompoundVault.depositedUsdc} USDC</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/15 focus:border-amber-400 rounded-lg px-3 py-2 text-white text-xs tabular-nums focus:outline-none"
                  placeholder="10"
                />
                <button
                  type="submit"
                  disabled={isVaultBusy}
                  className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-amber-300 font-bold text-xs rounded-lg border border-white/15 cursor-pointer disabled:opacity-50"
                >
                  {isVaultBusy ? 'Enviando...' : 'Retirar L1'}
                </button>
              </div>
            </form>

            {!isSignerMaster && (
              <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-[10px] text-amber-200 font-sans">
                <strong>Aviso L1:</strong> Estás conectado con una API Agent Wallet. Para enviar{' '}
                <code>vaultTransfer</code> a HLP Mainnet necesitas firmar con tu Master Wallet o realizar el depósito en{' '}
                <em>app.hyperliquid.xyz/vaults</em> (aquí verás tu equidad en vivo).
              </div>
            )}

            <p className="text-[10px] text-zinc-500 leading-relaxed font-sans">
              Importante L1: Hyperliquid exige firmar `vaultTransfer` con la **Master Wallet** (las API Agent Keys solo operan Spot/Perps) y aplica un bloqueo estándar de 4 días por depósito en HLP.
            </p>
          </div>
        </div>
      )}

      {/* SECTION 3: ENRUTAMIENTO HYPERBFT ZERO-MEMPOOL L1 */}
      {activeSubTab === 'mev' && (
        <section className="bg-[#0c0a09] border border-white/10 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                Enrutamiento HyperBFT L1 Cero-Mempool & Órdenes Maker Alo
              </h3>
              <p className="text-[11px] text-zinc-400 font-sans">
                Tus órdenes se envían directamente al secuenciador L1 de Hyperliquid (sin mempool público EVM para sandwich bots) y el bot autónomo usa Post-Only (`Alo`) para cobrar rebate en vez de pagar comisión Taker.
              </p>
            </div>
            <button
              type="button"
              onClick={toggleMevShield}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold border cursor-pointer ${
                isMevShieldActive
                  ? 'bg-cyan-950/70 text-cyan-300 border-cyan-500/60'
                  : 'bg-black/40 text-zinc-400 border-white/15'
              }`}
            >
              {isMevShieldActive ? 'Modo Zero-Mempool L1 ON' : 'Modo Zero-Mempool OFF'}
            </button>
          </div>

          <div className="flex items-center justify-between text-xs border-b border-white/5 pb-3 tabular-nums">
            <span className="text-zinc-400">
              Ahorro acumulado registrado: <strong className="text-cyan-300">${totalMevSavedUsdc.toFixed(2)} USDC</strong>
            </span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Consensus HyperBFT Directo</span>
            </span>
          </div>

          {mevShieldEvents.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500 font-sans">
              Sin eventos registrados aún. Se registran únicamente ejecuciones reales enviadas en L1.
            </div>
          ) : (
            <div className="divide-y divide-white/5 max-h-72 overflow-y-auto text-xs">
              {mevShieldEvents.map((evt) => (
                <div key={evt.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{evt.description}</span>
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      {evt.route} · TX {evt.txHash.slice(0, 12)}...
                    </div>
                  </div>
                  <span className="text-cyan-300 font-bold tabular-nums">+${evt.mevSavedUsdc.toFixed(2)} USDC</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
