import React from 'react';
import { useTrading } from '../context/TradingContext';

export const OrderBook: React.FC = () => {
  const { orderBook, activeSymbol, markets } = useTrading();
  const curMarket = markets[activeSymbol] || Object.values(markets)[0];
  const pxDec =
    (curMarket?.price || 0) < 0.01
      ? 6
      : (curMarket?.price || 0) < 1
      ? 4
      : (curMarket?.tickSize || 0.01) < 0.01
      ? 3
      : 2;

  const maxTotal = Math.max(
    ...orderBook.bids.map((b) => b.total),
    ...orderBook.asks.map((a) => a.total),
    1
  );

  return (
    <div className="bg-[#0e0a08] border border-[#2e190e] rounded-xl overflow-hidden flex flex-col h-full shadow-lg">
      <div className="px-3 py-2 border-b border-[#24150c] bg-[#140e0b] flex items-center justify-between gap-2 shrink-0">
        <span className="text-xs font-bold text-amber-200 uppercase tracking-wider font-mono whitespace-nowrap">
          Libro L2
        </span>
        <span className="text-[10px] font-mono text-zinc-400 tabular-nums whitespace-nowrap">
          Spread <strong className="text-amber-400">${orderBook.spread.toFixed(pxDec)}</strong>
        </span>
      </div>

      {/* Table Headers */}
      <div className="grid grid-cols-3 px-2.5 py-1 text-[10px] font-mono text-zinc-500 uppercase border-b border-[#1c120b] bg-[#0c0806] shrink-0">
        <span>Precio</span>
        <span className="text-right">Tam</span>
        <span className="text-right">Total</span>
      </div>

      <div className="flex-1 flex flex-col justify-between overflow-hidden p-1 text-[11px] font-mono tabular-nums">
        {/* Asks */}
        <div className="flex flex-col-reverse justify-end space-y-reverse space-y-0.5 overflow-hidden">
          {orderBook.asks.slice(0, 7).map((ask, i) => {
            const depthPct = Math.min(100, (ask.total / maxTotal) * 100);
            return (
              <div key={`ask-${i}`} className="relative grid grid-cols-3 px-1.5 py-0.5 hover:bg-red-950/30 rounded">
                <div
                  className="absolute right-0 top-0 bottom-0 bg-red-900/20 pointer-events-none"
                  style={{ width: `${depthPct}%` }}
                />
                <span className="text-red-400 font-semibold relative z-10 truncate">
                  ${ask.price.toFixed(pxDec)}
                </span>
                <span className="text-right text-zinc-300 relative z-10 truncate">{ask.size.toFixed(2)}</span>
                <span className="text-right text-zinc-400 relative z-10 truncate">{ask.total.toFixed(2)}</span>
              </div>
            );
          })}
        </div>

        {/* Mid Price Row */}
        <div className="my-1 py-1 px-2.5 bg-[#19100a] border-y border-[#3a2012] flex items-center justify-between gap-2 shrink-0">
          <span className="text-xs font-black text-amber-300 tabular-nums">
            ${(curMarket?.price || 0).toFixed(pxDec)}
          </span>
          <span className="text-[10px] text-zinc-400 uppercase whitespace-nowrap">Mark L1</span>
        </div>

        {/* Bids */}
        <div className="flex flex-col space-y-0.5 overflow-hidden">
          {orderBook.bids.slice(0, 7).map((bid, i) => {
            const depthPct = Math.min(100, (bid.total / maxTotal) * 100);
            return (
              <div key={`bid-${i}`} className="relative grid grid-cols-3 px-1.5 py-0.5 hover:bg-emerald-950/30 rounded">
                <div
                  className="absolute right-0 top-0 bottom-0 bg-emerald-900/20 pointer-events-none"
                  style={{ width: `${depthPct}%` }}
                />
                <span className="text-emerald-400 font-semibold relative z-10 truncate">
                  ${bid.price.toFixed(pxDec)}
                </span>
                <span className="text-right text-zinc-300 relative z-10 truncate">{bid.size.toFixed(2)}</span>
                <span className="text-right text-zinc-400 relative z-10 truncate">{bid.total.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
