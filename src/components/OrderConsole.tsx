import React, { useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { TrendingUp, TrendingDown, ShieldCheck } from 'lucide-react';
import { MAX_GLOBAL_LEVERAGE, MIN_VIABLE_NOTIONAL_USDC } from '../services/riskConstants';

export const OrderConsole: React.FC = () => {
  const {
    activeSymbol,
    markets,
    wallet,
    openManualPosition,
    positions,
    openHashVerifier,
  } = useTrading();
  const curMarket = markets[activeSymbol] || Object.values(markets)[0];
  const pxDec = (curMarket?.price || 0) < 0.01 ? 6 : (curMarket?.price || 0) < 1 ? 4 : 2;
  const szDec = typeof curMarket?.szDecimals === 'number' ? curMarket.szDecimals : 2;

  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [leverage, setLeverage] = useState<number>(MAX_GLOBAL_LEVERAGE);
  const [marginUsdc, setMarginUsdc] = useState<string>('5');
  const [takeProfit, setTakeProfit] = useState<string>('');
  const [stopLoss, setStopLoss] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const availableUsdc = Math.max(wallet.hyperliquidAccountValue || 0, wallet.balances.USDC || 0);

  const numMargin = parseFloat(marginUsdc) || 0;
  const notionalUsd = numMargin * leverage;
  const sizeInCoin = curMarket?.price > 0 ? +(notionalUsd / curMarket.price).toFixed(szDec) : 0;

  const maxLoss = numMargin * 0.9;
  const liqDiff = sizeInCoin > 0 ? maxLoss / sizeInCoin : 0;
  const estimatedLiq =
    curMarket?.price > 0
      ? side === 'LONG'
        ? Math.max(0, +(curMarket.price - liqDiff).toFixed(pxDec))
        : +(curMarket.price + liqDiff).toFixed(pxDec)
      : 0;

  const handlePercentageClick = (pct: number) => {
    const calculated = +(availableUsdc * (pct / 100)).toFixed(2);
    setMarginUsdc(calculated.toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numMargin <= 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await openManualPosition({
        symbol: activeSymbol,
        side,
        margin: numMargin,
        leverage,
        takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
        stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="bg-[#0c0a09] border border-white/10 rounded-xl overflow-hidden flex flex-col h-full font-mono">
      <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-zinc-100">Orden Manual L1</h3>
          <p className="text-[11px] text-zinc-500">Firma EIP-712 directa vía API Wallet</p>
        </div>
        <span className="text-[11px] font-bold text-amber-300 tabular-nums">{activeSymbol}</span>
      </div>

      <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 text-xs flex-1 flex flex-col justify-between">
        <div className="space-y-4">
          {/* Long / Short Switch */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSide('LONG')}
              className={`py-2.5 rounded-lg font-black text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border ${
                side === 'LONG'
                  ? 'bg-emerald-600 text-white border-emerald-400'
                  : 'bg-white/[0.03] text-zinc-400 hover:text-white border-white/10'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>LONG</span>
            </button>

            <button
              type="button"
              onClick={() => setSide('SHORT')}
              className={`py-2.5 rounded-lg font-black text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border ${
                side === 'SHORT'
                  ? 'bg-red-600 text-white border-red-400'
                  : 'bg-white/[0.03] text-zinc-400 hover:text-white border-white/10'
              }`}
            >
              <TrendingDown className="w-4 h-4" />
              <span>SHORT</span>
            </button>
          </div>

          {/* Leverage Slider */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-zinc-400 font-bold">Apalancamiento</span>
              <span className="font-black text-amber-300 text-sm tabular-nums">{leverage}x Cross</span>
            </div>
            <input
              type="range"
              min="1"
              max={MAX_GLOBAL_LEVERAGE}
              value={Math.min(MAX_GLOBAL_LEVERAGE, leverage)}
              onChange={(e) => setLeverage(Math.min(MAX_GLOBAL_LEVERAGE, parseInt(e.target.value, 10) || 1))}
              className="w-full accent-amber-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-zinc-500 tabular-nums">
              <span>1x</span>
              <span>2x</span>
              <span>{MAX_GLOBAL_LEVERAGE}x Max Global</span>
            </div>
          </div>

          {/* Margin Input */}
          <div className="space-y-2">
            <div className="flex justify-between text-[11px] tabular-nums">
              <span className="text-zinc-400 font-bold">Margen (USDC)</span>
              <span className="text-zinc-400">
                Disp: <strong className="text-emerald-400">${availableUsdc.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
              </span>
            </div>
            <div className="relative">
              <input
                type="number"
                value={marginUsdc}
                onChange={(e) => setMarginUsdc(e.target.value)}
                step="any"
                min="0.5"
                className="w-full bg-black/40 border border-white/15 focus:border-amber-400 rounded-lg px-3 py-2 text-white tabular-nums text-sm focus:outline-none"
                placeholder="0.00"
              />
              <span className="absolute right-3 top-2.5 text-zinc-500 text-xs">USDC</span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handlePercentageClick(pct)}
                  className="py-1 text-[11px] bg-white/[0.03] hover:bg-white/[0.08] text-zinc-300 rounded border border-white/10 cursor-pointer tabular-nums"
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* TP / SL */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-[11px] text-zinc-400 font-bold">Take Profit ($)</label>
              <input
                type="number"
                step="any"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="Opcional"
                className="w-full bg-black/40 border border-white/15 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-white text-xs tabular-nums focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-zinc-400 font-bold">Stop Loss ($)</label>
              <input
                type="number"
                step="any"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="Opcional"
                className="w-full bg-black/40 border border-white/15 focus:border-red-400 rounded-lg px-2.5 py-1.5 text-white text-xs tabular-nums focus:outline-none"
              />
            </div>
          </div>

          {/* Clean Summary Rows (No nested box) */}
          <div className="pt-2 border-t border-white/10 space-y-1.5 text-[11px] tabular-nums">
            <div className="flex justify-between text-zinc-400">
              <span>Nocional L1:</span>
              <span className="text-white font-bold">
                ${notionalUsd.toLocaleString()} ({sizeInCoin} {activeSymbol.replace('-PERP', '')})
              </span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Precio Mark:</span>
              <span className="text-amber-200">${(curMarket?.price || 0).toFixed(pxDec)}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Liq. Estimada:</span>
              <span className="text-red-400 font-bold">${estimatedLiq}</span>
            </div>
          </div>

          {positions.length > 0 && positions[0].txHash && (
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
              <span className="text-zinc-500 truncate mr-2">TX: {positions[0].txHash.slice(0, 10)}...</span>
              <button
                type="button"
                onClick={() => openHashVerifier(positions[0].txHash)}
                className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 font-bold underline cursor-pointer shrink-0"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Verificar Hash</span>
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2 pt-2">
          <button
            type="submit"
            disabled={isSubmitting || numMargin <= 0 || numMargin > availableUsdc || curMarket.price <= 0}
            className={`w-full py-3 rounded-lg font-black text-xs uppercase tracking-wider transition-colors cursor-pointer ${
              side === 'LONG'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-red-600 hover:bg-red-500 text-white'
            } disabled:opacity-45 disabled:cursor-not-allowed`}
          >
            {isSubmitting
              ? 'Enviando orden a L1...'
              : `${side === 'LONG' ? 'Comprar Long' : 'Vender Short'} · ${leverage}x · $${numMargin} USDC`}
          </button>

          <p className="text-[10px] text-zinc-500 text-center tabular-nums">
            Mínimo viable L1: ${MIN_VIABLE_NOTIONAL_USDC.toFixed(2)} USD nocional · Tope único {MAX_GLOBAL_LEVERAGE}x
          </p>
        </div>
      </form>
    </section>
  );
};
