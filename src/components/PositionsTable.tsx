import React, { useMemo, useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { Bot, User, XCircle, Clock, ShieldAlert, ShieldCheck, Volume2 } from 'lucide-react';
import { BE_TRIGGER_R, BE_PRICE_BUFFER_PCT } from '../services/riskConstants';

export const PositionsTable: React.FC = () => {
  const {
    positions,
    closedTrades,
    closePosition,
    closeAllPositions,
    openHashVerifier,
    isBreakEvenShieldEnabled,
    toggleBreakEvenShield,
    togglePositionBreakEven,
    playTTS,
  } = useTrading();
  const [tab, setTab] = useState<'open' | 'history'>('open');
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'AI_BOT' | 'MANUAL'>('ALL');

  const aiTrades = useMemo(
    () => closedTrades.filter((t) => t.openedBy === 'AI_BOT'),
    [closedTrades]
  );

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'AI_BOT') return closedTrades.filter((t) => t.openedBy === 'AI_BOT');
    if (historyFilter === 'MANUAL') return closedTrades.filter((t) => t.openedBy !== 'AI_BOT');
    return closedTrades;
  }, [closedTrades, historyFilter]);

  const aiStats = useMemo(() => {
    const count = aiTrades.length;
    const pnl = aiTrades.reduce((acc, t) => acc + (t.realizedPnl || 0), 0);
    const wins = aiTrades.filter((t) => (t.realizedPnl || 0) > 0).length;
    const winRate = count > 0 ? Math.round((wins / count) * 100) : 0;
    return { count, pnl, winRate };
  }, [aiTrades]);

  const totalOpenPnl = positions.reduce((acc, p) => acc + (p.unrealizedPnl || 0), 0);
  const totalRealizedPnl = filteredHistory.reduce((acc, t) => acc + (t.realizedPnl || 0), 0);
  const displayPnl = tab === 'open' ? totalOpenPnl : totalRealizedPnl;
  const fmtPx = (p: number) => (p < 0.01 ? p.toFixed(6) : p < 1 ? p.toFixed(4) : p.toFixed(2));
  const fmtTime = (ts: number) => {
    if (!ts) return '--:--';
    return new Date(ts).toLocaleString('es-MX', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className="bg-[#0e0a08] border border-white/10 rounded-xl overflow-hidden flex flex-col">
      <div className="px-3 sm:px-4 py-2.5 border-b border-white/10 bg-[#140e0b] flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('open')}
            className={`px-3 py-1 rounded text-xs font-mono font-bold transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'open'
                ? 'bg-[#29170e] text-amber-300 border border-[#4d2815]'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Posiciones Abiertas ({positions.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`px-3 py-1 rounded text-xs font-mono font-bold transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'history'
                ? 'bg-[#29170e] text-amber-300 border border-[#4d2815]'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Historial ({closedTrades.length})
          </button>

          {tab === 'history' && (
            <div className="flex items-center border border-white/10 rounded bg-black/40 overflow-hidden ml-0 sm:ml-2">
              {([
                { id: 'ALL', label: `Todas (${closedTrades.length})` },
                { id: 'AI_BOT', label: `Solo IA (${aiTrades.length})` },
                { id: 'MANUAL', label: `Manual (${closedTrades.length - aiTrades.length})` },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setHistoryFilter(opt.id)}
                  className={`px-2.5 py-1 text-[11px] font-mono font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    historyFilter === opt.id
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums">
          {tab === 'history' && (
            <div className="text-[11px] text-zinc-400 flex items-center gap-2 border-r border-white/10 pr-3">
              <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
                <Bot className="w-3.5 h-3.5" />
                Trades IA: {aiStats.count}
              </span>
              <span>·</span>
              <span className={aiStats.pnl >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                PnL IA: {aiStats.pnl >= 0 ? '+' : '-'}${Math.abs(aiStats.pnl).toFixed(2)}
              </span>
              <span>·</span>
              <span className="text-zinc-200 font-semibold">Win Rate IA: {aiStats.winRate}%</span>
            </div>
          )}

          <div className="text-xs font-bold">
            <span className="text-zinc-400 mr-1.5">
              {tab === 'open' ? 'PnL Abierto:' : 'PnL Realizado:'}
            </span>
            <span className={displayPnl >= 0 ? 'text-emerald-400 font-black' : 'text-red-400 font-black'}>
              {displayPnl >= 0 ? '+' : '-'}${Math.abs(displayPnl).toFixed(2)} USDC
            </span>
          </div>

          {tab === 'open' && (
            <button
              type="button"
              onClick={toggleBreakEvenShield}
              className={`px-2.5 py-1 text-[11px] font-mono font-bold rounded border transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                isBreakEvenShieldEnabled
                  ? 'text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 border-emerald-700'
                  : 'text-zinc-400 bg-zinc-900 hover:bg-zinc-800 border-white/10'
              }`}
              title={`Activa automáticamente Stop Break-Even L1 (+${(BE_PRICE_BUFFER_PCT * 100).toFixed(2)}% sobre entrada para cubrir coste L1 0.12%) en toda posición al llegar a +${BE_TRIGGER_R}R`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Seguro B.E.: {isBreakEvenShieldEnabled ? 'ON' : 'OFF'}</span>
            </button>
          )}

          {tab === 'open' && positions.length > 0 && (
            <button
              type="button"
              onClick={closeAllPositions}
              className="px-2.5 py-1 text-[11px] font-mono font-bold text-red-400 hover:text-red-300 bg-red-950/60 hover:bg-red-900/60 rounded border border-red-800 transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cerrar Todo</span>
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        {tab === 'open' ? (
          positions.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 font-mono text-xs">
              <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
              <p>No hay posiciones activas en este momento.</p>
              <p className="text-[11px] text-zinc-600 mt-1">
                Abre una orden manual o activa Autonomía ON para que el bot de Tony opere con el saldo de tu wallet.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs font-mono tabular-nums">
              <thead className="bg-[#120c09] text-[10px] text-zinc-500 uppercase border-b border-white/10">
                <tr>
                  <th className="py-2.5 px-3">Par & Operador</th>
                  <th className="py-2.5 px-3">Lado</th>
                  <th className="py-2.5 px-3">Tamaño</th>
                  <th className="py-2.5 px-3">Entrada</th>
                  <th className="py-2.5 px-3">Precio Mark</th>
                  <th className="py-2.5 px-3">Liq. Estimada</th>
                  <th className="py-2.5 px-3">Margen</th>
                  <th className="py-2.5 px-3">Seguro B.E.</th>
                  <th className="py-2.5 px-3">PnL No Realizado</th>
                  <th className="py-2.5 px-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {positions.map((pos) => {
                  const isProfit = pos.unrealizedPnl >= 0;
                  const isLong = pos.side === 'LONG';

                  return (
                    <tr key={pos.id} className="hover:bg-[#160f0b] transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold text-amber-200">{pos.symbol}</span>
                          {pos.isRealLive ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-red-950 text-red-300 border border-red-700">
                              REAL L1
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-cyan-300 bg-cyan-950/50 border border-cyan-800">
                              SIM
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-1.5 text-[10px] mt-1">
                          {pos.openedBy === 'AI_BOT' ? (
                            <span className="text-amber-400 flex items-center font-bold">
                              <Bot className="w-3 h-3 mr-0.5" /> IA Little Friend
                            </span>
                          ) : (
                            <span className="text-zinc-400 flex items-center">
                              <User className="w-3 h-3 mr-0.5" /> Manual
                            </span>
                          )}
                          {pos.txHash && (
                            <button
                              type="button"
                              onClick={() => openHashVerifier(pos.txHash)}
                              className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-950/70 hover:bg-amber-900 text-amber-300 border border-amber-600/70 hover:border-amber-400 transition-all cursor-pointer group"
                              title={`Haz clic para ver la verificación on-chain del Hash: ${pos.txHash}`}
                            >
                              <ShieldCheck className="w-2.5 h-2.5 text-amber-400 group-hover:scale-110" />
                              <span>TX: {pos.txHash.substring(0, 6)}...</span>
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              isLong
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-red-950 text-red-400 border border-red-800'
                            }`}
                          >
                            {pos.side} {pos.leverage}x
                          </span>
                          {pos.isIsolated && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-950/70 text-cyan-300 border border-cyan-700/70"
                              title="Margen Aislado: pérdida máxima topada desde el segundo uno"
                            >
                              AISLADO
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-zinc-300 font-bold">{pos.size}</td>
                      <td className="py-3 px-3 text-zinc-400">${fmtPx(pos.entryPrice)}</td>
                      <td className="py-3 px-3 text-amber-200 font-bold">${fmtPx(pos.currentPrice)}</td>
                      <td className="py-3 px-3 text-red-400 font-bold">${fmtPx(pos.liquidationPrice)}</td>
                      <td className="py-3 px-3 text-zinc-300">${pos.margin.toFixed(2)} USDC</td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {pos.breakEvenStatus === 'ARMED_L1' ? (
                          <div
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-700/70"
                            title={
                              pos.breakEvenOid
                                ? `Orden Reduce-Only Break-Even activa en Hyperliquid L1 (OID ${pos.breakEvenOid})`
                                : 'Protección Break-Even activa'
                            }
                          >
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            <span>Protegido ${fmtPx(pos.breakEvenPrice || pos.entryPrice)}</span>
                          </div>
                        ) : pos.breakEvenStatus === 'OFF' ? (
                          <button
                            type="button"
                            onClick={() => togglePositionBreakEven(pos.id, false)}
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-white/10 cursor-pointer"
                          >
                            Activar B.E.
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {pos.unrealizedPnlPercent >= 0.35 ? (
                              <button
                                type="button"
                                onClick={() => togglePositionBreakEven(pos.id, true)}
                                className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 cursor-pointer"
                                title={`Fijar Stop Break-Even L1 ahora en $${fmtPx(pos.breakEvenPrice || pos.entryPrice)}`}
                              >
                                Fijar B.E.
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => togglePositionBreakEven(pos.id, false)}
                                className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/[0.04] hover:bg-white/[0.08] text-amber-200 border border-white/10 cursor-pointer"
                                title={`Se armará automáticamente en L1 al llegar a +${BE_TRIGGER_R}R ($${fmtPx(pos.breakEvenPrice || pos.entryPrice)}). Click para pausar en esta posición.`}
                              >
                                Auto +{BE_TRIGGER_R}R (${fmtPx(pos.breakEvenPrice || pos.entryPrice)})
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <div className={`font-black ${isProfit ? 'text-emerald-400' : 'text-red-400'} flex items-center`}>
                          {isProfit ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                          <span className="ml-1 text-[10px]">
                            ({isProfit ? '+' : ''}{pos.unrealizedPnlPercent.toFixed(2)}%)
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              playTTS(
                                `${pos.symbol} en ${pos.side} a ${pos.leverage}x. Entrada ${fmtPx(pos.entryPrice)}, precio mark ${fmtPx(pos.currentPrice)}. Margen ${pos.margin.toFixed(2)} dólares. PnL no realizado ${isProfit ? 'más' : 'menos'} ${Math.abs(pos.unrealizedPnl).toFixed(2)} dólares (${pos.unrealizedPnlPercent.toFixed(2)} por ciento). Seguro Break-Even ${pos.breakEvenStatus === 'ARMED_L1' ? `armado en ${fmtPx(pos.breakEvenPrice || pos.entryPrice)}` : pos.breakEvenStatus}. ${pos.aiRationale || ''}`,
                                { interrupt: true, force: true }
                              )
                            }
                            className="p-1.5 rounded bg-white/[0.04] hover:bg-white/[0.09] text-amber-300 border border-white/10 cursor-pointer"
                            title="Escuchar detalles completos de esta posición"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => closePosition(pos.id, 'MANUAL_CLOSE')}
                            className="px-2.5 py-1 text-[11px] font-bold bg-[#26150d] hover:bg-[#3d1d10] text-amber-300 rounded border border-[#522916] transition-all cursor-pointer whitespace-nowrap"
                          >
                            Cerrar Mercado
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : filteredHistory.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 font-mono text-xs">
            <Clock className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
            <p>
              {historyFilter === 'AI_BOT'
                ? 'Todavía no hay trades cerrados ejecutados por la IA.'
                : historyFilter === 'MANUAL'
                ? 'Todavía no hay trades manuales cerrados.'
                : 'No hay operaciones cerradas registradas todavía.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs font-mono tabular-nums">
            <thead className="bg-[#120c09] text-[10px] text-zinc-500 uppercase border-b border-white/10">
              <tr>
                <th className="py-2.5 px-3">Par & Motivo</th>
                <th className="py-2.5 px-3">Operador</th>
                <th className="py-2.5 px-3">Lado</th>
                <th className="py-2.5 px-3">Entrada / Salida</th>
                <th className="py-2.5 px-3">Margen</th>
                <th className="py-2.5 px-3">PnL Realizado</th>
                <th className="py-2.5 px-3">Diagnóstico / Lección</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredHistory.slice(0, 30).map((ct) => {
                const isProfit = ct.realizedPnl >= 0;
                const noteText =
                  ct.aiLessonLearned ||
                  ct.aiRationale ||
                  (ct.openedBy === 'AI_BOT'
                    ? 'Ejecución autónoma registrada en Hyperliquid L1.'
                    : 'Operación manual sincronizada desde Hyperliquid L1.');

                return (
                  <tr key={ct.id} className="hover:bg-[#160f0b] transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-amber-200">{ct.symbol}</span>
                        {ct.isRealLive ? (
                          <span className="px-1 py-0.5 rounded text-[8px] font-black bg-red-950 text-red-300 border border-red-700">
                            REAL L1
                          </span>
                        ) : (
                          <span className="px-1 py-0.5 rounded text-[8px] font-mono text-cyan-300 bg-cyan-950/40">
                            SIM
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-500 flex items-center flex-wrap gap-1 mt-0.5">
                        <span>{ct.closedReason}</span>
                        <span>· {fmtTime(ct.closedAt)}</span>
                        {ct.txHash && (
                          <button
                            type="button"
                            onClick={() => openHashVerifier(ct.txHash)}
                            className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-[#24140b] hover:bg-[#381e10] text-amber-300 border border-[#4a2614] hover:border-amber-400 transition-all cursor-pointer"
                            title={`Verificar Hash: ${ct.txHash}`}
                          >
                            <ShieldCheck className="w-2.5 h-2.5 text-amber-400" />
                            <span>Ver Hash</span>
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {ct.openedBy === 'AI_BOT' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/70 text-amber-300 border border-amber-700/60">
                          <Bot className="w-3 h-3 text-amber-400" />
                          IA Little Friend
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-900 text-zinc-300 border border-white/10">
                          <User className="w-3 h-3 text-zinc-400" />
                          Manual
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          ct.side === 'LONG' ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {ct.side} {ct.leverage}x
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-zinc-400 whitespace-nowrap">
                      ${fmtPx(ct.entryPrice)} → ${fmtPx(ct.exitPrice)}
                    </td>

                    <td className="py-2.5 px-3 text-zinc-400 whitespace-nowrap">${ct.margin.toFixed(2)} USDC</td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isProfit ? '+' : '-'}${Math.abs(ct.realizedPnl).toFixed(2)} ({isProfit ? '+' : ''}
                        {ct.realizedPnlPercent.toFixed(2)}%)
                      </span>
                    </td>

                    <td
                      onClick={() =>
                        playTTS(
                          `Operación cerrada en ${ct.symbol} (${ct.side} ${ct.leverage}x). Entrada ${fmtPx(ct.entryPrice)}, salida ${fmtPx(ct.exitPrice)}. Resultado ${isProfit ? 'positivo' : 'negativo'} de ${Math.abs(ct.realizedPnl).toFixed(2)} dólares (${ct.realizedPnlPercent.toFixed(2)} por ciento). Motivo: ${ct.closedReason}. ${noteText}${ct.aiAdjustmentNote ? ` Ajuste: ${ct.aiAdjustmentNote}.` : ''}`,
                          { interrupt: true, force: true }
                        )
                      }
                      className="py-2.5 px-3 text-zinc-300 hover:text-amber-200 text-[11px] max-w-xs cursor-pointer group"
                      title={`Haz clic para escuchar completo: ${noteText}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Volume2 className="w-3.5 h-3.5 text-amber-400/75 group-hover:text-amber-300 shrink-0" />
                        <span className="truncate">{noteText}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

