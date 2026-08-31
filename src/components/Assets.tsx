import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Layers, ChevronRight } from "lucide-react";
import civicLogo from "../assets/civic-logo.png";
import type { View } from "./Sidebar";
import TokenDetail from "./TokenDetail";
import { fetchTokenImageUrl } from "../lib/tokenMetadata";

interface AssetsProps {
  balance: number;
  onNavigate: (view: View) => void;
}

interface TokenBalance {
  tokenId: string;
  symbol: string;
  name: string;
  decimals: number;
  amount: number;
  metadataUri?: string;
}

function formatTokenAmount(amount: number, decimals: number): string {
  const divisor = Math.pow(10, decimals);
  return (amount / divisor).toLocaleString(undefined, { maximumFractionDigits: decimals });
}

export default function Assets({ balance, onNavigate }: AssetsProps) {
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TokenBalance | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await invoke<TokenBalance[]>("wallet_list_tokens");
        if (!cancelled) setTokens(result);

        for (const t of result) {
          if (t.metadataUri && !images[t.tokenId]) {
            fetchTokenImageUrl(t.metadataUri).then((url) => {
              if (url && !cancelled) {
                setImages((prev) => ({ ...prev, [t.tokenId]: url }));
              }
            });
          }
        }
      } catch {
        /* HVL RPCs not available on this node yet */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (selected) {
    return <TokenDetail tokenId={selected.tokenId} amount={selected.amount} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Assets</h1>
          <p className="text-sm text-slate-500">All tokens and assets held in this wallet</p>
        </div>
        <button
          onClick={() => onNavigate("create-asset")}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          + Create Asset
        </button>
      </div>

      <div className="rounded-2xl border border-white/5 bg-[#111726] p-2">
        <button
          onClick={() => onNavigate("activity")}
          className="flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left hover:bg-white/5"
        >
          <div className="flex items-center gap-3">
            <img src={civicLogo} alt="CIVIC" className="h-10 w-10 rounded-full object-cover" />
            <div>
              <div className="text-sm font-medium text-white">CivicNet</div>
              <div className="text-xs text-slate-500">CIVIC · native coin</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold text-white">
                {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-600" />
          </div>
        </button>

        {tokens.map((t) => (
          <button
            key={t.tokenId}
            onClick={() => setSelected(t)}
            className="flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left hover:bg-white/5"
          >
            <div className="flex items-center gap-3">
              {images[t.tokenId] ? (
                <img src={images[t.tokenId]} alt={t.symbol} className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/20 text-purple-400">
                  <Layers size={18} />
                </div>
              )}
              <div>
                <div className="text-sm font-medium text-white">{t.name}</div>
                <div className="text-xs text-slate-500">
                  {t.symbol} · {t.tokenId.slice(0, 8)}...{t.tokenId.slice(-6)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-semibold text-white">{formatTokenAmount(t.amount, t.decimals)}</div>
                <div className="text-xs text-slate-500">{t.symbol}</div>
              </div>
              <ChevronRight size={16} className="text-slate-600" />
            </div>
          </button>
        ))}
      </div>

      {!loading && tokens.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-8 text-center">
          <p className="text-sm text-slate-500">No custom tokens yet. Create one to see it appear here.</p>
        </div>
      )}
    </div>
  );
}
