import React, { useState } from 'react';
import { TradingProvider, useTrading } from './context/TradingContext';
import { Header } from './components/Header';
import { TradingTerminal } from './components/TradingTerminal';
import { QuantEngineTab } from './components/QuantEngineTab';
import { AIChatTab } from './components/AIChatTab';
import { KnowledgeBaseTab } from './components/KnowledgeBaseTab';
import { ExportProMasterTab } from './components/ExportProMasterTab';
import { FundingArbitrageVault } from './components/FundingArbitrageVault';
import { WalletModal } from './components/WalletModal';
import { HashVerificationModal } from './components/HashVerificationModal';
import { ConnectionStatusModal } from './components/ConnectionStatusModal';
import { ApkDownloadModal } from './components/ApkDownloadModal';
import { CheckCircle2, AlertTriangle, Info, XCircle, X, Volume2 } from 'lucide-react';

const MainApp: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<'terminal' | 'quant' | 'chat' | 'knowledge' | 'vault' | 'wallet' | 'export'>('terminal');
  const {
    isWalletModalOpen,
    setIsWalletModalOpen,
    isHashVerifierOpen,
    selectedVerifyHash,
    closeHashVerifier,
    isConnectionModalOpen,
    closeConnectionModal,
    isApkModalOpen,
    closeApkModal,
    toasts,
    removeToast,
    playTTS,
  } = useTrading();

  // If user clicks the wallet tab in header, open the wallet modal or view
  const handleTabChange = (tab: 'terminal' | 'quant' | 'chat' | 'knowledge' | 'vault' | 'wallet' | 'export') => {
    if (tab === 'wallet') {
      setIsWalletModalOpen(true);
    } else {
      setCurrentTab(tab);
    }
  };

  return (
    <div className="min-h-screen bg-[#070504] text-zinc-100 flex flex-col selection:bg-amber-500/30 selection:text-amber-200">
      <Header currentTab={currentTab} setCurrentTab={handleTabChange} />

      {/* Main Content Area (Persistent mount so switching tabs never resets panels or interrupts scans) */}
      <main className="flex-1 p-2.5 sm:p-4 lg:p-5 max-w-[1800px] w-full mx-auto">
        <div className={currentTab === 'terminal' ? 'block' : 'hidden'}>
          <TradingTerminal />
        </div>
        <div className={currentTab === 'quant' ? 'block' : 'hidden'}>
          <QuantEngineTab />
        </div>
        <div className={currentTab === 'chat' ? 'block' : 'hidden'}>
          <AIChatTab />
        </div>
        <div className={currentTab === 'knowledge' ? 'block' : 'hidden'}>
          <KnowledgeBaseTab />
        </div>
        <div className={currentTab === 'vault' ? 'block' : 'hidden'}>
          <FundingArbitrageVault />
        </div>
        <div className={currentTab === 'export' ? 'block' : 'hidden'}>
          <ExportProMasterTab />
        </div>
      </main>

      {/* Wallet Management Modal */}
      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
      />

      {/* Hash Verification Modal */}
      <HashVerificationModal
        isOpen={isHashVerifierOpen}
        onClose={closeHashVerifier}
        initialHash={selectedVerifyHash}
      />

      {/* Connection Verification & Diagnostics HUD Modal */}
      <ConnectionStatusModal
        isOpen={isConnectionModalOpen}
        onClose={closeConnectionModal}
      />

      {/* Android APK Download Modal */}
      <ApkDownloadModal
        isOpen={isApkModalOpen}
        onClose={closeApkModal}
      />

      {/* Toast Notification Container */}
      <div className="fixed bottom-3 right-3 left-3 sm:left-auto z-50 flex flex-col space-y-2 sm:w-full sm:max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3.5 rounded-xl border shadow-2xl flex items-start space-x-3 text-xs font-mono transition-all animate-in slide-in-from-right duration-300 ${
              toast.type === 'success'
                ? 'bg-[#0f1d13] border-emerald-600/80 text-emerald-200'
                : toast.type === 'error'
                ? 'bg-[#220d0f] border-red-600/80 text-red-200'
                : toast.type === 'warning'
                ? 'bg-[#22160a] border-amber-600/80 text-amber-200'
                : 'bg-[#150f0c] border-[#3d2012] text-zinc-200'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
            {toast.type === 'error' && <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
            {toast.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />}

            <div
              onClick={() => playTTS(`${toast.title}. ${toast.message}`, { interrupt: true, force: true })}
              className="flex-1 space-y-0.5 cursor-pointer group"
              title="Haz clic para que Tony lea esta notificación completa"
            >
              <div className="font-bold uppercase tracking-wider flex items-center gap-1.5">
                <span>{toast.title}</span>
                <Volume2 className="w-3 h-3 text-amber-400/70 group-hover:text-amber-300 shrink-0" />
              </div>
              <p className="text-[11px] text-zinc-300 leading-tight">{toast.message}</p>
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="text-zinc-500 hover:text-white p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <TradingProvider>
      <MainApp />
    </TradingProvider>
  );
}
