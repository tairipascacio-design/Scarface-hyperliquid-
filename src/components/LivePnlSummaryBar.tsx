import React, { useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { TrendingUp, TrendingDown } from 'lucide-react';

export const LivePnlSummaryBar: React.FC = () => {
  const { positions, closedTrades, wallet } = useTrading();

  const stats = useMemo(() => {
    const unrealized = positions.reduce((acc, p) => acc + (p.unrealizedPnl || 0), 0);
    const realized = closedTrades.reduce((acc, t) => acc + (t.realizedPnl || 0), 0);
    const netTotal = unrealized + realized;

    const totalClosed = closedTrades.length;
    const wins = closedTrades.filter((t) => t.realizedPnl > 0).length;
    const winRate = totalClosed > 0 ? +((wins / totalClosed) * 100).toFixed(1) : 0;

    const equity = Math.max(wallet.hyperliquidAccountValue || 0, wallet.balances.USDC || 0);
    const marginUsed = wallet.hyperliquidMarginUsed || positions.reduce((acc, p) => acc + (p.margin || 0), 0);
    const roePct =
      marginUsed > 0
        ? +((unrealized / marginUsed) * 100).toFixed(2)
        : equity > 0
        ? +((netTotal / equity) * 100).toFixed(2)
        : 0;

    return {
      unrealized: +unrealized.toFixed(2),
      realized: +realized.toFixed(2),
      netTotal: +netTotal.toFixed(2),
      totalClosed,
      wins,
      winRate,
      equity: +equity.toFixed(2),
      marginUsed: +marginUsed.toFixed(2),
      roePct,
    };
  }, [positions, closedTrades, wallet.hyperliquidAccountValue, wallet.balances.USDC, wallet.hyperliquidMarginUsed]);

  const fmtSigned = (v: number) =>
    `${v >= 0 ? '+' : '-'}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <section
      aria-label="Resumen PnL en Vivo Hyperliquid L1"
      className="bg-[#0c0a09] border border-white/10 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-white/10 font-mono tabular-nums overflow-hidden"
    >
      {/* 1. PnL Total Neto */}
      <div className="p-3.5 sm:px-5 sm:py-3.5 flex flex-col justify-between border-r border-white/10 lg:border-r-0">
        <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
          <span>PnL Neto L1</span>
          {stats.netTotal >= 0 ? (
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0" />
          )}
        </div>
        <div className={`text-base sm:text-lg font-black mt-1 ${stats.netTotal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {fmtSigned(stats.netTotal)} <span className="text-[11px] font-semibold text-zinc-500">USDC</span>
        </div>
        <div className="text-[11px] text-zinc-500 mt-0.5">
          ROE {stats.roePct >= 0 ? '+' : ''}{stats.roePct}% · Abierto + Cerrado
        </div>
      </div>

      {/* 2. PnL Abierto */}
      <div className="p-3.5 sm:px-5 sm:py-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
          <span>PnL Abierto</span>
          <span className="text-amber-300 font-semibold">{positions.length} pos.</span>
        </div>
        <div className={`text-base sm:text-lg font-black mt-1 ${stats.unrealized >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {fmtSigned(stats.unrealized)} <span className="text-[11px] font-semibold text-zinc-500">USDC</span>
        </div>
        <div className="text-[11px] text-zinc-500 mt-0.5">
          Margen en uso: ${stats.marginUsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      {/* 3. PnL Realizado */}
      <div className="p-3.5 sm:px-5 sm:py-3.5 flex flex-col justify-between border-r border-white/10 lg:border-r-0">
        <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
          <span>PnL Realizado</span>
          <span className="text-zinc-300 font-semibold">{stats.totalClosed} cierres</span>
        </div>
        <div className={`text-base sm:text-lg font-black mt-1 ${stats.realized >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {fmtSigned(stats.realized)} <span className="text-[11px] font-semibold text-zinc-500">USDC</span>
        </div>
        <div className="text-[11px] text-zinc-500 mt-0.5">
          Win Rate: <strong className="text-amber-200">{stats.winRate}%</strong> ({stats.wins}/{stats.totalClosed})
        </div>
      </div>

      {/* 4. Capital Disponible */}
      <div className="p-3.5 sm:px-5 sm:py-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
          <span>Capital L1</span>
          <span className="text-emerald-400 font-semibold">USDC</span>
        </div>
        <div className="text-base sm:text-lg font-black mt-1 text-amber-200">
          ${stats.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
          <span className="text-[11px] font-semibold text-zinc-500">USDC</span>
        </div>
        <div className="text-[11px] text-zinc-500 mt-0.5">
          Retirable: ${(wallet.hyperliquidWithdrawable || 0).toFixed(2)} USDC
        </div>
      </div>
    </section>
  );
};
