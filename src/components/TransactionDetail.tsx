import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, Copy, Check } from "lucide-react";

interface TransactionDetailProps {
  txid: string;
  onBack: () => void;
}

interface TxInfo {
  txid: string;
  amount: number;
  fee?: number;
  confirmations: number;
  blockhash?: string;
  blockheight?: number;
  blocktime?: number;
  time: number;
  details: { address?: string; category: string; amount: number }[];
}

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

export default function TransactionDetail({ txid, onBack }: TransactionDetailProps) {
  const [info, setInfo] = useState<TxInfo | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    invoke<TxInfo>("wallet_get_transaction", { txid })
      .then(setInfo)
      .catch((e) => setError(String(e)));
  }, [txid]);

  function handleCopy() {
    navigator.clipboard.writeText(txid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        <ArrowLeft size={15} /> Back to Activity
      </button>

      {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}

      {info && (
        <div className="max-w-2xl">
          <h1 className="mb-6 text-2xl font-semibold text-white">Transaction Details</h1>

          <div className="mb-4 rounded-2xl border border-white/5 bg-[#111726] p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-slate-400">Net Amount</span>
              {info.confirmations > 0 ? (
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Confirmed
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" /> Pending
                </span>
              )}
            </div>
            <div className={`text-2xl font-semibold ${info.amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {info.amount >= 0 ? "+" : ""}
              {info.amount.toFixed(8)} <span className="text-sm font-normal text-slate-400">CIVIC</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-[#111726] p-5">
            <div className="space-y-3 text-xs">
              <div className="flex items-start justify-between gap-3">
                <span className="shrink-0 text-slate-500">Transaction ID</span>
                <div className="flex items-center gap-1.5">
                  <span className="break-all text-right font-mono text-slate-200">{info.txid}</span>
                  <button onClick={handleCopy} className="shrink-0 text-slate-500 hover:text-white">
                    {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Confirmations</span>
                <span className="text-slate-200">{info.confirmations}</span>
              </div>
              {info.blockheight !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Confirmed in Block</span>
                  <span className="text-slate-200">{info.blockheight.toLocaleString()}</span>
                </div>
              )}
              {info.fee !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Fee</span>
                  <span className="text-slate-200">{Math.abs(info.fee).toFixed(8)} CIVIC</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Date</span>
                <span className="text-slate-200">{formatDate(info.time)}</span>
              </div>
              {info.blockhash && (
                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-slate-500">Block Hash</span>
                  <span className="break-all text-right font-mono text-slate-200">
                    {info.blockhash.slice(0, 12)}...{info.blockhash.slice(-8)}
                  </span>
                </div>
              )}
            </div>

            {info.details && info.details.length > 0 && (
              <>
                <div className="my-4 border-t border-white/5" />
                <div className="mb-2 text-xs font-medium text-slate-400">Breakdown</div>
                <div className="space-y-2">
                  {info.details.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-slate-400">
                        {d.address ? `${d.address.slice(0, 10)}...${d.address.slice(-6)}` : d.category}
                      </span>
                      <span className={d.amount >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {d.amount >= 0 ? "+" : ""}
                        {d.amount.toFixed(8)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
