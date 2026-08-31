import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowUpRight, Check } from "lucide-react";

interface SendProps {
  balance: number;
  onSent: () => void;
}

export default function Send({ balance, onSent }: SendProps) {
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [txid, setTxid] = useState("");

  const amountNum = parseFloat(amount);
  const canSend = address.trim().length > 0 && amountNum > 0 && amountNum <= balance && !busy;

  async function handleSend() {
    setBusy(true);
    setError("");
    setTxid("");
    try {
      const result = await invoke<string>("wallet_send_to_address", {
        address: address.trim(),
        amount: amountNum,
      });
      setTxid(result);
      setAddress("");
      setAmount("");
      onSent();
    } catch (e: any) {
      setError(String(e).replace(/^RPC error:\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Send</h1>
        <p className="text-sm text-slate-500">Send CIVIC to another address</p>
      </div>

      <div className="max-w-lg rounded-2xl border border-white/5 bg-[#111726] p-6">
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Recipient Address</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="rcivc1q..."
            className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 font-mono text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
          />
        </div>

        <div className="mb-1">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-medium text-slate-400">Amount</label>
            <button
              onClick={() => setAmount(balance.toString())}
              className="text-xs text-blue-400 hover:underline"
            >
              Max: {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} CIVIC
            </button>
          </div>
          <div className="relative">
            <input
              type="number"
              step="0.00000001"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500">
              CIVIC
            </span>
          </div>
          {amountNum > balance && amount !== "" && (
            <p className="mt-1.5 text-xs text-red-400">Amount exceeds available balance</p>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
        )}

        {txid && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-400">
            <Check size={14} className="mt-0.5 shrink-0" />
            <span>
              Sent! Transaction ID:{" "}
              <span className="font-mono">
                {txid.slice(0, 12)}...{txid.slice(-8)}
              </span>
            </span>
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={!canSend}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUpRight size={16} /> {busy ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
