import { ArrowUpRight, Download, ChevronRight } from "lucide-react";
import type { WalletTx } from "./Overview";

interface ActivityProps {
  transactions: WalletTx[];
  onTxClick: (txid: string) => void;
}

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TxRow({ tx, onClick }: { tx: WalletTx; onClick: () => void }) {
  const isReceive = tx.category === "receive" || tx.category === "generate" || tx.category === "immature";
  const label =
    tx.category === "generate" || tx.category === "immature"
      ? "Staking / Mining Reward"
      : isReceive
      ? "Received"
      : tx.category === "send"
      ? "Sent"
      : tx.category;
  const sign = isReceive ? "+" : "-";
  const colorClass = isReceive ? "text-emerald-400" : "text-red-400";

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between border-b border-white/5 px-4 py-3.5 text-left last:border-0 hover:bg-white/5"
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full ${
            isReceive ? "bg-emerald-500/15 text-emerald-400" : "bg-purple-500/15 text-purple-400"
          }`}
        >
          {isReceive ? <Download size={16} /> : <ArrowUpRight size={16} />}
        </div>
        <div>
          <div className="text-sm font-medium text-white">{label}</div>
          <div className="font-mono text-xs text-slate-500">
            {tx.address ? `${tx.address.slice(0, 10)}...${tx.address.slice(-6)}` : tx.txid.slice(0, 14)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className={`text-sm font-semibold ${colorClass}`}>
            {sign}
            {Math.abs(tx.amount).toFixed(2)} <span className="text-xs font-normal">CIVIC</span>
          </div>
          <div className="text-xs text-slate-500">{formatDate(tx.time)}</div>
        </div>
        <ChevronRight size={16} className="text-slate-600" />
      </div>
    </button>
  );
}

export default function Activity({ transactions, onTxClick }: ActivityProps) {
  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Activity</h1>
        <p className="text-sm text-slate-500">Full transaction history for this wallet</p>
      </div>

      <div className="rounded-2xl border border-white/5 bg-[#111726]">
        {transactions.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">No transactions yet</div>
        ) : (
          transactions.map((tx, i) => (
            <TxRow key={`${tx.txid}-${i}`} tx={tx} onClick={() => onTxClick(tx.txid)} />
          ))
        )}
      </div>
    </div>
  );
}
