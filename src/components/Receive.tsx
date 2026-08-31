import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, RefreshCw } from "lucide-react";

interface ReceiveProps {
  address: string;
  onGenerateNew: () => Promise<void>;
}

export default function Receive({ address, onGenerateNew }: ReceiveProps) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  function handleCopy() {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleNew() {
    setBusy(true);
    try {
      await onGenerateNew();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Receive</h1>
        <p className="text-sm text-slate-500">Share your address to receive CIVIC</p>
      </div>

      <div className="max-w-lg rounded-2xl border border-white/5 bg-[#111726] p-6">
        <div className="mb-5 flex justify-center">
          <div className="rounded-xl bg-white p-4">
            {address ? (
              <QRCodeSVG value={address} size={180} />
            ) : (
              <div className="flex h-[180px] w-[180px] items-center justify-center text-xs text-slate-400">
                Generating...
              </div>
            )}
          </div>
        </div>

        <label className="mb-1.5 block text-xs font-medium text-slate-400">Your CivicNet Address</label>
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
          <span className="flex-1 truncate font-mono text-sm text-white">{address || "—"}</span>
          <button onClick={handleCopy} className="shrink-0 text-slate-400 hover:text-white">
            {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
          </button>
        </div>

        <button
          onClick={handleNew}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/5 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw size={15} className={busy ? "animate-spin" : ""} /> Generate New Address
        </button>

        <p className="mt-4 text-xs text-slate-500">
          Each address can be used multiple times, but generating a new one for each transaction improves privacy.
        </p>
      </div>
    </div>
  );
}
