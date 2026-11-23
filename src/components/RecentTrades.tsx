import React from 'react';
import { useTrading } from '../context/TradingContext';

export const RecentTrades: React.FC = () => {
  const { recentTrades, activeSymbol, markets } = useTrading();
  const curMarket = markets[activeSymbol] || Object.values(markets)[0];
  const pxDec =
    (curMarket?.price || 0) < 0.01
      ? 6
      : (curMarket?.price || 0) < 1
      ? 4
      : (curMarket?.tickSize || 0.01) < 0.01
      ? 3
      : 2;

  return (
    <div className="bg-[#0e0a08] border border-[#2e190e] rounded-xl overflow-hidden flex flex-col h-full shadow-lg">
      <div className="px-3 py-2 border-b border-[#24150c] bg-[#140e0b] flex items-center justify-between gap-2 shrink-0">
        <span className="text-xs font-bold text-amber-200 uppercase tracking-wider font-mono whitespace-nowrap">
          Cinta L1
        </span>
        <span className="text-[10px] font-mono font-bold text-emerald-400 whitespace-nowrap">
          En Vivo
        </span>
      </div>

      <div className="grid grid-cols-3 px-2.5 py-1 text-[10px] font-mono text-zinc-500 uppercase border-b border-[#1c120b] bg-[#0c0806] shrink-0">
        <span>Precio</span>
        <span className="text-right">Tam</span>
        <span className="text-right">Hora</span>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-1 space-y-0.5 text-[11px] font-mono tabular-nums">
        {recentTrades.slice(0, 18).map((trade) => {
          const isBuy = trade.side === 'buy';
          const timeStr = new Date(trade.time).toLocaleTimeString([], {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });

          return (
            <div key={trade.id} className="grid grid-cols-3 px-1.5 py-0.5 hover:bg-[#1a110a] rounded">
              <span className={`font-semibold truncate ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
                ${trade.price.toFixed(pxDec)}
              </span>
              <span className="text-right text-zinc-300 truncate">{trade.size.toFixed(2)}</span>
              <span className="text-right text-zinc-500 text-[10px] truncate">{timeStr}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
