import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Layers, Plus } from "lucide-react";
import civicLogo from "../assets/civic-logo.png";
import { fetchTokenImageUrl } from "../lib/tokenMetadata";
import type { View } from "./Sidebar";

interface RightPanelProps {
  address: string;
  balance: number;
  nodeHeight: number;
  peers: number;
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

function shortAddr(addr: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 8)}...${addr.slice(-5)}`;
}

function formatTokenAmount(amount: number, decimals: number): string {
  const divisor = Math.pow(10, decimals);
  return (amount / divisor).toLocaleString(undefined, { maximumFractionDigits: decimals });
}

export default function RightPanel({ address, balance, nodeHeight, peers, onNavigate }: RightPanelProps) {
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
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

  return (
    <aside className="flex h-full w-80 flex-col gap-4 overflow-y-auto border-l border-white/5 bg-[#0d1220] px-4 py-4">
      <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <span className="text-[10px] font-bold">C</span>
          </div>
          <span className="text-sm text-slate-200">{shortAddr(address)}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-white/5 bg-[#111726] p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-white">My Assets</span>
          <button onClick={() => onNavigate("assets")} className="text-xs text-blue-400 hover:underline">
            View all
          </button>
        </div>

        <button
          onClick={() => onNavigate("assets")}
          className="flex w-full items-center justify-between py-2 text-left hover:bg-white/5 rounded-lg px-1 -mx-1"
        >
          <div className="flex items-center gap-2.5">
            <img src={civicLogo} alt="CIVIC" className="h-8 w-8 rounded-full object-cover" />
            <span className="text-sm text-slate-200">CIVIC</span>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium text-white">
              {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </button>

        {tokens.slice(0, 3).map((t) => (
          <button
            key={t.tokenId}
            onClick={() => onNavigate("assets")}
            className="flex w-full items-center justify-between py-2 text-left hover:bg-white/5 rounded-lg px-1 -mx-1"
          >
            <div className="flex items-center gap-2.5">
              {images[t.tokenId] ? (
                <img src={images[t.tokenId]} alt={t.symbol} className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/20 text-purple-400">
                  <Layers size={15} />
                </div>
              )}
              <span className="text-sm text-slate-200">{t.symbol}</span>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium text-white">{formatTokenAmount(t.amount, t.decimals)}</div>
            </div>
          </button>
        ))}

        <button
          onClick={() => onNavigate("assets")}
          className="mt-2 w-full rounded-lg bg-white/5 py-2 text-xs font-medium text-slate-300 hover:bg-white/10"
        >
          View All Assets
        </button>
      </div>

      <div className="rounded-2xl border border-white/5 bg-[#111726] p-4">
        <div className="mb-3 text-sm font-medium text-white">Network Info</div>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Network</span>
            <span className="flex items-center gap-1.5 text-slate-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              CivicNet Mainnet
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Block Height</span>
            <span className="text-slate-200">{nodeHeight.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Connections</span>
            <span className="text-slate-200">{peers}</span>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-blue-600/20 to-purple-600/20 p-4">
        <div className="mb-1 text-sm font-semibold text-white">Create Your Own Asset</div>
        <p className="mb-3 text-xs text-slate-400">
          Easily create and manage your own digital asset on CivicNet.
        </p>
        <button
          onClick={() => onNavigate("create-asset")}
          className="flex items-center gap-1.5 rounded-lg border border-blue-500/40 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-500/10"
        >
          Create Asset <Plus size={13} />
        </button>
      </div>
    </aside>
  );
}
