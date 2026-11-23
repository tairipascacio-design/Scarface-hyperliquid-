import React from 'react';
import { CandleChart } from './CandleChart';
import { OrderBook } from './OrderBook';
import { RecentTrades } from './RecentTrades';
import { OrderConsole } from './OrderConsole';
import { AutonomousBotPanel } from './AutonomousBotPanel';
import { PositionsTable } from './PositionsTable';
import { LiveTonyVerdictBanner } from './LiveTonyVerdictBanner';
import { LivePnlSummaryBar } from './LivePnlSummaryBar';

export const TradingTerminal: React.FC = () => {
  return (
    <div className="space-y-4 sm:space-y-5 max-w-[1680px] mx-auto pb-12">
      {/* Real-Time L1 PnL & Capital Strip */}
      <LivePnlSummaryBar />

      {/* Top Section: Chart + OrderBook + Live Tape */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-7 xl:col-span-8 min-w-0">
          <CandleChart />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:contents gap-4">
          <div className="lg:col-span-3 xl:col-span-2 h-[300px] lg:h-[468px] min-w-0">
            <OrderBook />
          </div>

          <div className="lg:col-span-2 xl:col-span-2 h-[300px] lg:h-[468px] min-w-0">
            <RecentTrades />
          </div>
        </div>
      </div>

      {/* Real-Time All-Tokens Tony Montana Verdict */}
      <LiveTonyVerdictBanner />

      {/* Execution & Autonomy Cockpit */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="order-2 lg:order-1 lg:col-span-5 min-w-0">
          <OrderConsole />
        </div>

        <div className="order-1 lg:order-2 lg:col-span-7 min-w-0">
          <AutonomousBotPanel />
        </div>
      </div>

      {/* Positions & Execution History */}
      <PositionsTable />
    </div>
  );
};
