import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, Layers } from "lucide-react";
import { fetchTokenImageUrl } from "../lib/tokenMetadata";

interface TokenDetailProps {
  tokenId: string;
  amount: number;
  onBack: () => void;
}

interface TokenInfo {
  tokenid: string;
  symbol: string;
  name: string;
  type: string;
  capped: boolean;
  decimals: number;
  initialSupply: number;
  currentSupply: number;
  initialReserveLocked: number;
  currentReserveLocked: number;
  issuerAddress: string;
  issueHeight: number;
  issueTxid: string;
  supplyCap?: number;
}

function formatAmount(amount: number, decimals: number): string {
  const divisor = Math.pow(10, decimals);
  return (amount / divisor).toLocaleString(undefined, { maximumFractionDigits: decimals });
}

export default function TokenDetail({ tokenId, amount, onBack }: TokenDetailProps) {
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [error, setError] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    invoke<TokenInfo>("wallet_get_token_info", { tokenId })
      .then((data) => {
        setInfo(data);
        const uri = (data as any).metadata?.uri;
        if (uri) {
          fetchTokenImageUrl(uri).then(setImageUrl);
        }
      })
      .catch((e) => setError(String(e)));
  }, [tokenId]);

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        <ArrowLeft size={15} /> Back to Assets
      </button>

      {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}

      {info && (
        <>
          <div className="mb-6 flex items-center gap-4">
            {imageUrl ? (
              <img src={imageUrl} alt={info.symbol} className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-purple-500/20 text-purple-400">
                <Layers size={26} />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-semibold text-white">{info.name}</h1>
              <p className="text-sm text-slate-500">{info.symbol}</p>
            </div>
          </div>

          <div className="mb-4 max-w-2xl rounded-2xl border border-white/5 bg-[#111726] p-5">
            <div className="mb-1 text-sm text-slate-400">Your Balance</div>
            <div className="text-2xl font-semibold text-white">
              {formatAmount(amount, info.decimals)} <span className="text-sm font-normal text-blue-400">{info.symbol}</span>
            </div>
          </div>

          <div className="max-w-2xl rounded-2xl border border-white/5 bg-[#111726] p-5">
            <h2 className="mb-4 text-sm font-medium text-white">Token Details</h2>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Token ID</span>
                <span className="font-mono text-slate-200">
                  {info.tokenid.slice(0, 10)}...{info.tokenid.slice(-8)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Type</span>
                <span className="text-slate-200 capitalize">{info.type}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Decimals</span>
                <span className="text-slate-200">{info.decimals}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Current Supply</span>
                <span className="text-slate-200">{formatAmount(info.currentSupply, info.decimals)}</span>
              </div>
              {info.capped && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Supply Cap</span>
                  <span className="text-slate-200">
                    {info.supplyCap ? formatAmount(info.supplyCap, info.decimals) : "—"}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Mintable</span>
                <span className="text-slate-200">{info.capped ? "Yes (issuer-controlled)" : "No, fixed supply"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Reserve Locked</span>
                <span className="text-slate-200">
                  {info.currentReserveLocked.toLocaleString(undefined, { minimumFractionDigits: 2 })} CIVIC
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Issuer</span>
                <span className="font-mono text-slate-200">
                  {info.issuerAddress.slice(0, 10)}...{info.issuerAddress.slice(-6)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Issued At Height</span>
                <span className="text-slate-200">{info.issueHeight.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
