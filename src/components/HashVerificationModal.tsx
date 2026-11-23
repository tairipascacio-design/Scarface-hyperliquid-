import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTrading } from '../context/TradingContext';
import { isValidTxHash, isNumericOid } from '../services/walletCrypto';
import { verifyHyperliquidL1Transaction } from '../services/web3Balance';
import { HashVerificationRecord } from '../types/trading';
import {
  ShieldCheck,
  CheckCircle2,
  Copy,
  ExternalLink,
  X,
  Search,
  Cpu,
  FileCode,
  Shield,
  Award,
  Zap,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialHash?: string | null;
}

export const HashVerificationModal: React.FC<Props> = ({
  isOpen,
  onClose,
  initialHash,
}) => {
  const {
    wallet,
    positions,
    closedTrades,
    onChainTransfers,
    arbitragePositions,
    addToast,
  } = useTrading();

  const [inputHash, setInputHash] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'certificate' | 'cryptography' | 'payload'>('certificate');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isQueryingL1, setIsQueryingL1] = useState<boolean>(false);
  const [verifiedRecord, setVerifiedRecord] = useState<HashVerificationRecord | null>(null);

  const queryUserAddress = wallet.masterAddress || wallet.address || '';

  const availableHashes = useMemo(() => {
    const list: Array<{
      hash: string;
      label: string;
      type: 'REAL_ORDER' | 'AI_ORDER' | 'ONCHAIN_TRANSFER' | 'CLOSE_POSITION' | 'CUSTOM_HASH';
      timestamp: number;
      details?: Partial<HashVerificationRecord>;
    }> = [];

    positions.forEach((p) => {
      const refId = p.txHash || (p.breakEvenOid ? String(p.breakEvenOid) : '');
      if (refId) {
        list.push({
          hash: refId,
          label: `${p.side} ${p.symbol} (${p.openedBy === 'AI_BOT' ? 'IA' : 'Manual'})`,
          type: p.openedBy === 'AI_BOT' ? 'AI_ORDER' : 'REAL_ORDER',
          timestamp: p.openedAt,
          details: {
            symbol: p.symbol,
            side: p.side,
            amountOrSize: p.size,
            margin: p.margin,
            leverage: p.leverage,
            executionPrice: p.entryPrice,
            timestamp: p.openedAt,
          },
        });
      }
    });

    closedTrades.forEach((ct) => {
      if (ct.txHash) {
        list.push({
          hash: ct.txHash,
          label: `Cerrada: ${ct.side} ${ct.symbol} (${ct.realizedPnl >= 0 ? '+' : ''}$${ct.realizedPnl})`,
          type: 'REAL_ORDER',
          timestamp: ct.closedAt,
          details: {
            symbol: ct.symbol,
            side: ct.side,
            amountOrSize: ct.size,
            margin: ct.margin,
            leverage: ct.leverage,
            executionPrice: ct.exitPrice,
            timestamp: ct.closedAt,
          },
        });
      }
    });

    arbitragePositions.forEach((arb) => {
      const spotRef = isValidTxHash(arb.spotTxHash)
        ? arb.spotTxHash
        : arb.spotOid
        ? String(arb.spotOid)
        : arb.spotTxHash;
      if (spotRef) {
        list.push({
          hash: spotRef,
          label: `Delta-0 Spot: ${arb.spotToken}`,
          type: 'REAL_ORDER',
          timestamp: arb.openedAt,
          details: {
            symbol: arb.symbol,
            side: 'LONG',
            amountOrSize: arb.spotAmount,
            margin: +(arb.allocatedUsdc / 2).toFixed(2),
            leverage: 1,
            executionPrice: arb.spotEntryPrice,
            timestamp: arb.openedAt,
          },
        });
      }
      const perpRef = isValidTxHash(arb.perpTxHash)
        ? arb.perpTxHash
        : arb.perpOid
        ? String(arb.perpOid)
        : arb.perpTxHash;
      if (perpRef) {
        list.push({
          hash: perpRef,
          label: `Delta-0 Perp: ${arb.symbol}`,
          type: 'REAL_ORDER',
          timestamp: arb.openedAt,
          details: {
            symbol: arb.symbol,
            side: 'SHORT',
            amountOrSize: arb.perpShortSize,
            margin: +(arb.allocatedUsdc / 2).toFixed(2),
            leverage: 1,
            executionPrice: arb.perpEntryPrice,
            timestamp: arb.openedAt,
          },
        });
      }
    });

    onChainTransfers.forEach((tx) => {
      list.push({
        hash: tx.hash,
        label: `Envío On-Chain: ${tx.amount} ${tx.asset}`,
        type: 'ONCHAIN_TRANSFER',
        timestamp: tx.timestamp,
        details: {
          symbol: `${tx.asset}-PERP`,
          amountOrSize: tx.amount,
          fromAddress: tx.from,
          toAddress: tx.to,
          gasFee: tx.gasUsed,
          blockNumber: tx.blockNumber,
          timestamp: tx.timestamp,
        },
      });
    });

    return list;
  }, [positions, closedTrades, arbitragePositions, onChainTransfers]);

  useEffect(() => {
    if (!isOpen) return;
    if (initialHash) {
      setInputHash(initialHash);
    } else if (availableHashes.length > 0 && !inputHash) {
      setInputHash(availableHashes[0].hash);
    }
  }, [isOpen, initialHash, availableHashes, inputHash]);

  const runLiveL1Audit = useCallback(
    async (queryToAudit: string) => {
      const clean = queryToAudit.trim();
      if (!clean) {
        setVerifiedRecord(null);
        return;
      }
      const matched = availableHashes.find((item) => item.hash.toLowerCase() === clean.toLowerCase());
      setIsQueryingL1(true);
      try {
        const result = await verifyHyperliquidL1Transaction({
          query: clean,
          userAddress: queryUserAddress,
          fallbackRecord: matched?.details,
        });
        setVerifiedRecord(result);
      } finally {
        setIsQueryingL1(false);
      }
    },
    [availableHashes, queryUserAddress]
  );

  useEffect(() => {
    if (!isOpen || !inputHash.trim()) return;
    runLiveL1Audit(inputHash);
  }, [isOpen, inputHash, runLiveL1Audit]);

  if (!isOpen) return null;

  const isHex64Valid = isValidTxHash(inputHash);
  const isOidValid = isNumericOid(inputHash);
  const isRealVerified = Boolean(verifiedRecord?.isRealOnChain);
  const isSynthetic = verifiedRecord?.status === 'SYNTHETIC_LOCAL';

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    addToast({
      type: 'success',
      title: 'Copiado al Portapapeles',
      message: `${label} copiado con éxito.`,
    });
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0b0806] border border-amber-500/40 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl shadow-amber-950/50 overflow-hidden font-mono ring-1 ring-amber-400/20">

        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#2b170d] bg-gradient-to-r from-[#170c07] via-[#24130a] to-[#120804] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-red-950/80 border border-amber-400 flex items-center justify-center text-amber-300 shadow-md">
              <ShieldCheck className={`w-6 h-6 ${isRealVerified ? 'text-emerald-400' : 'text-amber-400'}`} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-black text-sm sm:text-base text-amber-100 uppercase tracking-wider">
                  AUDITOR L1 EN VIVO (EXPLORER RPC + ORDERSTATUS)
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[9px] font-black border flex items-center space-x-1 ${
                    isQueryingL1
                      ? 'bg-amber-950 text-amber-300 border-amber-500'
                      : isRealVerified
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-500'
                      : 'bg-red-950 text-red-300 border-red-500'
                  }`}
                >
                  {isRealVerified ? (
                    <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                  ) : (
                    <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                  )}
                  <span>
                    {isQueryingL1
                      ? 'CONSULTANDO L1...'
                      : isRealVerified
                      ? `CONFIRMADO L1 (${verifiedRecord?.status})`
                      : isSynthetic
                      ? 'ID LOCAL SINTÉTICO'
                      : 'SIN REGISTRO EN L1'}
                  </span>
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Consulta real en rpc.hyperliquid.xyz/explorer (`txDetails`) y api.hyperliquid.xyz/info (`orderStatus` / `userFills`)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#1a0f0a] hover:bg-[#2b170e] text-zinc-400 hover:text-white flex items-center justify-center border border-[#3b1f12] cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Hash / OID Search Toolbar */}
        <div className="px-5 py-3 border-b border-[#241309] bg-[#0f0a07] space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                <Search className="w-4 h-4 text-amber-400" />
              </div>
              <input
                type="text"
                value={inputHash}
                onChange={(e) => setInputHash(e.target.value.trim())}
                placeholder="Pega TxHash (0x + 64 hex) u OID numérico de Hyperliquid L1..."
                className="w-full pl-9 pr-8 py-2 bg-[#080504] border border-[#3d2011] focus:border-amber-400 rounded-xl text-xs text-amber-100 placeholder-zinc-600 focus:outline-none"
              />
              {inputHash && (
                <button
                  onClick={() => setInputHash('')}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => runLiveL1Audit(inputHash)}
                disabled={!inputHash || isQueryingL1}
                className="px-3 py-2 rounded-xl bg-[#1c100a] hover:bg-[#2b180f] text-cyan-300 text-xs font-bold border border-[#3b1f11] flex items-center space-x-1.5 cursor-pointer disabled:opacity-40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isQueryingL1 ? 'animate-spin' : ''}`} />
                <span>Verificar L1</span>
              </button>
              <button
                type="button"
                onClick={() => copyToClipboard(verifiedRecord?.hash || inputHash, 'Hash / OID')}
                disabled={!inputHash}
                className="px-3 py-2 rounded-xl bg-[#1c100a] hover:bg-[#2b180f] text-zinc-300 hover:text-amber-300 text-xs font-bold border border-[#3b1f11] flex items-center space-x-1.5 cursor-pointer disabled:opacity-40"
              >
                <Copy className="w-3.5 h-3.5 text-amber-400" />
                <span>Copiar</span>
              </button>
              <a
                href={
                  isValidTxHash(verifiedRecord?.hash || inputHash)
                    ? `https://app.hyperliquid.xyz/explorer/tx/${verifiedRecord?.hash || inputHash}`
                    : `https://app.hyperliquid.xyz/explorer`
                }
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-xl bg-gradient-to-r from-amber-600/30 to-yellow-600/20 hover:from-amber-600/50 hover:to-yellow-600/40 text-amber-200 text-xs font-bold border border-amber-500/50 flex items-center space-x-1.5 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                <span>Explorador L1</span>
              </a>
            </div>
          </div>

          {availableHashes.length > 0 && (
            <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar pt-1 text-[11px]">
              <span className="text-zinc-500 shrink-0 font-bold uppercase text-[10px]">
                Recientes ({availableHashes.length}):
              </span>
              {availableHashes.slice(0, 6).map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setInputHash(item.hash)}
                  className={`px-2.5 py-1 rounded-lg border text-[10px] shrink-0 font-mono transition-all cursor-pointer flex items-center space-x-1.5 ${
                    inputHash.toLowerCase() === item.hash.toLowerCase()
                      ? 'bg-amber-500 text-black font-extrabold border-amber-400 shadow-md'
                      : 'bg-[#180f0a] hover:bg-[#24150e] text-zinc-300 border-[#381e11]'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isValidTxHash(item.hash) ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span>{item.label}</span>
                  <span className="opacity-60 text-[9px]">({item.hash.slice(0, 8)}...)</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 bg-[#0d0805] border-b border-[#241309] flex space-x-2 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('certificate')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all cursor-pointer flex items-center space-x-2 border-t border-x ${
              activeTab === 'certificate'
                ? 'bg-[#150d08] text-amber-200 border-[#3d2011] border-b-transparent'
                : 'text-zinc-500 hover:text-zinc-300 border-transparent'
            }`}
          >
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span>Resultado L1 Real</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cryptography')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all cursor-pointer flex items-center space-x-2 border-t border-x ${
              activeTab === 'cryptography'
                ? 'bg-[#150d08] text-amber-200 border-[#3d2011] border-b-transparent'
                : 'text-zinc-500 hover:text-zinc-300 border-transparent'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <span>Bloque, Acción & OrderStatus L1</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('payload')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all cursor-pointer flex items-center space-x-2 border-t border-x ${
              activeTab === 'payload'
                ? 'bg-[#150d08] text-amber-200 border-[#3d2011] border-b-transparent'
                : 'text-zinc-500 hover:text-zinc-300 border-transparent'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 text-cyan-400" />
            <span>JSON Crudo Hyperliquid L1</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 max-h-[60vh]">
          {!inputHash ? (
            <div className="p-8 text-center text-zinc-400 text-xs space-y-2">
              <Search className="w-8 h-8 text-amber-400 mx-auto" />
              <p>Ingresa un TxHash de 64 caracteres hexadecimales o un OID numérico real de Hyperliquid L1 para auditarlo en tiempo real contra la red Mainnet.</p>
            </div>
          ) : !verifiedRecord ? (
            <div className="p-8 text-center text-zinc-400 text-xs">
              Consultando Hyperliquid L1 Explorer RPC e Info API...
            </div>
          ) : (
            <>
              {activeTab === 'certificate' && (
                <div className="space-y-4">
                  {/* Real Status Banner */}
                  <div
                    className={`relative p-5 rounded-2xl border shadow-xl overflow-hidden ${
                      isRealVerified
                        ? 'bg-gradient-to-r from-[#0e1c14] via-[#102418] to-[#0a140f] border-emerald-500/40'
                        : 'bg-gradient-to-r from-[#1f100b] via-[#26120c] to-[#170907] border-red-500/40'
                    }`}
                  >
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                              isRealVerified ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'
                            }`}
                          >
                            {isRealVerified ? 'VERIFICADO EN HYPERLIQUID L1' : verifiedRecord.status}
                          </span>
                          <span className="text-zinc-300 text-xs">
                            {verifiedRecord.blockNumber > 0
                              ? `Bloque L1 #${verifiedRecord.blockNumber.toLocaleString()}`
                              : verifiedRecord.oid
                              ? `OID #${verifiedRecord.oid}`
                              : 'Sin bloque confirmado'}
                          </span>
                        </div>
                        <h4 className="text-base sm:text-lg font-black text-white tracking-wide">
                          {isRealVerified
                            ? 'REGISTRO CONFIRMADO DIRECTO EN HYPERLIQUID MAINNET'
                            : isSynthetic
                            ? 'IDENTIFICADOR LOCAL ANTIGUO (NO ES HASH ON-CHAIN)'
                            : 'NO ENCONTRADO EN LIBRO MAYOR / EXPLORER L1'}
                        </h4>
                        <p className="text-xs text-zinc-300 max-w-xl">
                          {verifiedRecord.notes}
                        </p>
                      </div>

                      <div className="flex flex-col items-start md:items-end bg-black/50 p-3 rounded-xl border border-white/10">
                        <span className="text-[10px] text-zinc-400 uppercase">Latencia Consulta L1</span>
                        <span className="text-base font-black text-cyan-300 font-mono">
                          {verifiedRecord.consensusTimeMs} ms
                        </span>
                        <span className="text-[10px] text-amber-300/80">{verifiedRecord.validatorQuorum}</span>
                      </div>
                    </div>
                  </div>

                  {/* Hash & Fee Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="bg-[#120b08] p-3.5 rounded-xl border border-[#2b170e] space-y-1.5">
                      <div className="flex justify-between text-zinc-400 text-[11px]">
                        <span className="font-bold uppercase text-amber-300">Identificador Consultado / Hash L1</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(verifiedRecord.hash, 'TxHash')}
                          className="text-amber-400 hover:text-white flex items-center space-x-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{copiedField === 'TxHash' ? 'Copiado!' : 'Copiar'}</span>
                        </button>
                      </div>
                      <div className="bg-[#080503] p-2.5 rounded-lg border border-[#211209] font-mono text-[11px] text-amber-100 break-all select-all">
                        {verifiedRecord.hash}
                      </div>
                      <div className="text-[10px] text-zinc-500 flex items-center justify-between pt-0.5">
                        <span>
                          Formato: {isHex64Valid ? 'TxHash 64-hex' : isOidValid ? 'OID Hyperliquid' : 'No estándar'}
                        </span>
                        <span className={isRealVerified ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                          {isRealVerified ? '● Confirmado L1' : '● Sin prueba L1'}
                        </span>
                      </div>
                    </div>

                    <div className="bg-[#120b08] p-3.5 rounded-xl border border-[#2b170e] space-y-1.5">
                      <div className="flex justify-between text-zinc-400 text-[11px]">
                        <span className="font-bold uppercase text-emerald-400">Estado & Comisión L1</span>
                        <span className={`font-bold ${isRealVerified ? 'text-emerald-400' : 'text-zinc-400'}`}>
                          {verifiedRecord.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="bg-[#080503] p-2 rounded border border-[#211209]">
                          <span className="text-[10px] text-zinc-500 block">Comisión / Gas L1:</span>
                          <span className="text-xs font-bold text-amber-200">{verifiedRecord.gasFee}</span>
                        </div>
                        <div className="bg-[#080503] p-2 rounded border border-[#211209]">
                          <span className="text-[10px] text-zinc-500 block">Timestamp L1:</span>
                          <span className="text-xs font-bold text-zinc-200">
                            {verifiedRecord.timestamp > 0
                              ? new Date(verifiedRecord.timestamp).toLocaleString()
                              : 'Sin timestamp'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Trade / Execution Grid (NO FAKE DEFAULTS) */}
                  <div className="bg-[#120b08] p-4 rounded-xl border border-[#2b170e] space-y-3 text-xs">
                    <div className="flex items-center justify-between border-b border-[#211209] pb-2">
                      <span className="font-bold text-amber-200 uppercase flex items-center space-x-1.5">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span>Datos Reales Devueltos por L1</span>
                      </span>
                      {verifiedRecord.side && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            verifiedRecord.side === 'LONG'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                              : 'bg-red-950 text-red-300 border border-red-700'
                          }`}
                        >
                          {verifiedRecord.side} {verifiedRecord.leverage ? `${verifiedRecord.leverage}x` : ''}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="bg-[#080503] p-2.5 rounded-lg border border-[#1f1108]">
                        <span className="text-[10px] text-zinc-500 block">Activo / Par L1</span>
                        <span className="text-sm font-black text-amber-200 font-mono">
                          {verifiedRecord.symbol || '—'}
                        </span>
                      </div>

                      <div className="bg-[#080503] p-2.5 rounded-lg border border-[#1f1108]">
                        <span className="text-[10px] text-zinc-500 block">Precio Real L1</span>
                        <span className="text-sm font-black text-white font-mono">
                          {typeof verifiedRecord.executionPrice === 'number'
                            ? `$${verifiedRecord.executionPrice}`
                            : '—'}
                        </span>
                      </div>

                      <div className="bg-[#080503] p-2.5 rounded-lg border border-[#1f1108]">
                        <span className="text-[10px] text-zinc-500 block">Tamaño Ejecutado</span>
                        <span className="text-sm font-black text-emerald-400 font-mono">
                          {typeof verifiedRecord.amountOrSize === 'number'
                            ? `${verifiedRecord.amountOrSize} ${verifiedRecord.symbol?.replace('-PERP', '') || ''}`
                            : '—'}
                        </span>
                      </div>

                      <div className="bg-[#080503] p-2.5 rounded-lg border border-[#1f1108]">
                        <span className="text-[10px] text-zinc-500 block">OID / Bloque L1</span>
                        <span className="text-sm font-black text-amber-300 font-mono">
                          {verifiedRecord.oid
                            ? `#${verifiedRecord.oid}`
                            : verifiedRecord.blockNumber > 0
                            ? `Blk #${verifiedRecord.blockNumber}`
                            : '—'}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-[#080503] rounded-lg border border-[#1f1108] space-y-1.5 text-[11px]">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-zinc-400 gap-1">
                        <span>
                          <strong className="text-zinc-300">Cuenta / Usuario L1:</strong> {verifiedRecord.fromAddress}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-amber-400 hidden sm:block" />
                        <span>
                          <strong className="text-zinc-300">Destino:</strong> {verifiedRecord.toAddress}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'cryptography' && (
                <div className="space-y-4 text-xs font-mono">
                  <div className="bg-[#120b08] p-4 rounded-xl border border-[#2b170e] space-y-3">
                    <div className="flex items-center justify-between border-b border-[#211209] pb-2">
                      <span className="font-bold text-amber-200 uppercase flex items-center space-x-1.5">
                        <Shield className="w-4 h-4 text-emerald-400" />
                        <span>Evidencia Real en Hyperliquid L1 Explorer (`txDetails`)</span>
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          verifiedRecord.rawExplorerData
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                            : 'bg-zinc-900 text-zinc-400 border-zinc-700'
                        }`}
                      >
                        {verifiedRecord.rawExplorerData ? 'INCLUIDA EN BLOQUE L1' : 'SIN txDetails EN EXPLORER'}
                      </span>
                    </div>

                    {verifiedRecord.rawExplorerData ? (
                      <div className="space-y-2 text-[11px]">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-[#080503] p-2.5 rounded border border-[#1f1108]">
                            <span className="text-zinc-500 block text-[10px]">Altura de Bloque L1:</span>
                            <span className="text-emerald-300 font-bold">
                              #{Number(verifiedRecord.rawExplorerData.block).toLocaleString()}
                            </span>
                          </div>
                          <div className="bg-[#080503] p-2.5 rounded border border-[#1f1108]">
                            <span className="text-zinc-500 block text-[10px]">Error Reportado L1:</span>
                            <span className={verifiedRecord.rawExplorerData.error ? 'text-red-400 font-bold' : 'text-emerald-300 font-bold'}>
                              {verifiedRecord.rawExplorerData.error || 'null (Ejecución limpia)'}
                            </span>
                          </div>
                        </div>
                        <div className="bg-[#080503] p-2.5 rounded border border-[#1f1108]">
                          <span className="text-zinc-500 block text-[10px] mb-1">Acción Firmada (MsgPack / EIP-712 L1):</span>
                          <pre className="text-[10px] text-amber-200 overflow-x-auto">
                            {JSON.stringify(verifiedRecord.rawExplorerData.action, null, 2)}
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <p className="text-zinc-400 text-xs">
                        No hubo respuesta `txDetails` del Explorer para esta consulta. Si consultaste un OID sin hash de fill o un identificador sintético local, Hyperliquid Explorer solo indexa TxHashes reales de 64 hex confirmados en bloque.
                      </p>
                    )}
                  </div>

                  <div className="bg-[#120b08] p-4 rounded-xl border border-[#2b170e] space-y-2">
                    <span className="font-bold text-amber-200 uppercase text-[11px] block">
                      Estado de Orden L1 (`orderStatus` para {queryUserAddress || 'sin dirección'})
                    </span>
                    {verifiedRecord.rawOrderStatus ? (
                      <pre className="bg-[#080503] p-3 rounded border border-[#1f1108] text-[10px] text-cyan-300 overflow-x-auto">
                        {JSON.stringify(verifiedRecord.rawOrderStatus, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-[11px] text-zinc-500">
                        Sin registro en `orderStatus` para este OID/cuenta.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'payload' && (
                <div className="space-y-3 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 uppercase font-bold text-[11px]">
                      Respuesta Real Consolidada L1 (Sin Campos Fabricados)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(JSON.stringify(verifiedRecord, null, 2), 'Payload JSON')
                      }
                      className="px-2.5 py-1 rounded bg-[#1f120a] hover:bg-[#2d1a0f] text-amber-300 text-[11px] font-bold border border-[#3d2011] flex items-center space-x-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copiar JSON</span>
                    </button>
                  </div>

                  <pre className="bg-[#060403] p-4 rounded-xl border border-[#241309] text-[11px] text-emerald-300/90 overflow-x-auto max-h-80 select-all font-mono leading-relaxed">
                    {JSON.stringify(verifiedRecord, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-[#241309] bg-[#0c0704] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2 text-[11px] text-zinc-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Auditoría Directa Hyperliquid L1 (rpc.hyperliquid.xyz/explorer + /info)</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => copyToClipboard(verifiedRecord?.hash || inputHash, 'Hash')}
              disabled={!inputHash}
              className="px-4 py-1.5 rounded-lg bg-[#180f0a] hover:bg-[#26160e] text-amber-200 text-xs font-bold border border-[#3b1f11] cursor-pointer disabled:opacity-40"
            >
              Copiar Referencia
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black text-xs font-black uppercase tracking-wider cursor-pointer shadow-lg"
            >
              Cerrar Verificador
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
