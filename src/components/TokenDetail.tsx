import { useEffect, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ArrowLeft, Layers, ImagePlus, X, Sparkles, Send, Undo2, Check, Coins, Flame } from "lucide-react";
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
  const [hasMetadata, setHasMetadata] = useState(false);

  const [logoPath, setLogoPath] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [metaError, setMetaError] = useState("");
  const [metaAdded, setMetaAdded] = useState(false);

  const [showSend, setShowSend] = useState(false);
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendTxid, setSendTxid] = useState("");

  const [showRedeem, setShowRedeem] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemError, setRedeemError] = useState("");
  const [redeemTxid, setRedeemTxid] = useState("");

  const [showMint, setShowMint] = useState(false);
  const [mintAmount, setMintAmount] = useState("");
  const [mintBusy, setMintBusy] = useState(false);
  const [mintError, setMintError] = useState("");
  const [mintTxid, setMintTxid] = useState("");

  const [showBurn, setShowBurn] = useState(false);
  const [burnAmount, setBurnAmount] = useState("");
  const [burnBusy, setBurnBusy] = useState(false);
  const [burnError, setBurnError] = useState("");
  const [burnTxid, setBurnTxid] = useState("");

  function loadInfo() {
    invoke<TokenInfo>("wallet_get_token_info", { tokenId })
      .then((data) => {
        setInfo(data);
        const uri = (data as any).metadata?.uri;
        setHasMetadata(!!uri);
        if (uri) {
          fetchTokenImageUrl(uri).then(setImageUrl);
        }
      })
      .catch((e) => setError(String(e)));
  }

  useEffect(() => {
    loadInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenId]);

  async function handlePickLogo() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "svg"] }],
    });
    if (selected && typeof selected === "string") {
      setLogoPath(selected);
    }
  }

  async function handleSendToken() {
    if (!info || !sendAddress.trim() || !sendAmount) return;
    setSendBusy(true);
    setSendError("");
    setSendTxid("");
    try {
      const scale = Math.pow(10, info.decimals);
      const rawAmount = Math.round(parseFloat(sendAmount) * scale);
      const txid = await invoke<string>("wallet_transfer_token", {
        tokenId,
        toAddress: sendAddress.trim(),
        amount: rawAmount,
      });
      setSendTxid(txid);
      setSendAddress("");
      setSendAmount("");
      loadInfo();
    } catch (e: any) {
      setSendError(String(e).replace(/^RPC error:\s*/, ""));
    } finally {
      setSendBusy(false);
    }
  }

  async function handleRedeemToken() {
    if (!info || !redeemAmount) return;
    setRedeemBusy(true);
    setRedeemError("");
    setRedeemTxid("");
    try {
      const scale = Math.pow(10, info.decimals);
      const rawAmount = Math.round(parseFloat(redeemAmount) * scale);
      const txid = await invoke<string>("wallet_convert_token", {
        tokenId,
        amountToBurn: rawAmount,
      });
      setRedeemTxid(txid);
      setRedeemAmount("");
      loadInfo();
    } catch (e: any) {
      setRedeemError(String(e).replace(/^RPC error:\s*/, ""));
    } finally {
      setRedeemBusy(false);
    }
  }

  async function handleMintToken() {
    if (!info || !mintAmount) return;
    setMintBusy(true);
    setMintError("");
    setMintTxid("");
    try {
      const scale = Math.pow(10, info.decimals);
      const rawAmount = Math.round(parseFloat(mintAmount) * scale);
      const txid = await invoke<string>("wallet_mint_token", {
        tokenId,
        amountToMint: rawAmount,
      });
      setMintTxid(txid);
      setMintAmount("");
      loadInfo();
    } catch (e: any) {
      setMintError(String(e).replace(/^RPC error:\s*/, ""));
    } finally {
      setMintBusy(false);
    }
  }

  async function handleBurnToken() {
    if (!info || !burnAmount) return;
    setBurnBusy(true);
    setBurnError("");
    setBurnTxid("");
    try {
      const scale = Math.pow(10, info.decimals);
      const rawAmount = Math.round(parseFloat(burnAmount) * scale);
      const txid = await invoke<string>("wallet_burn_token", {
        tokenId,
        amountToBurn: rawAmount,
      });
      setBurnTxid(txid);
      setBurnAmount("");
      loadInfo();
    } catch (e: any) {
      setBurnError(String(e).replace(/^RPC error:\s*/, ""));
    } finally {
      setBurnBusy(false);
    }
  }

  async function handleAddMetadata() {
    if (!logoPath || !info) return;
    setBusy(true);
    setMetaError("");
    try {
      setStatusMsg("Uploading logo...");
      const upload = await invoke<{ metadataUri: string; metadataHash: string }>("wallet_upload_logo", {
        path: logoPath,
        symbol: info.symbol,
        name: info.name,
        description: description.trim() || undefined,
        website: website.trim() || undefined,
        twitter: twitter.trim() || undefined,
        telegram: telegram.trim() || undefined,
      });
      setStatusMsg("Attaching metadata to token...");
      await invoke("wallet_update_token_metadata", {
        tokenId,
        metadataUri: upload.metadataUri,
        metadataHash: upload.metadataHash,
      });
      setMetaAdded(true);
      setLogoPath("");
      setStatusMsg("");
      loadInfo();
    } catch (e: any) {
      setStatusMsg("");
      setMetaError(String(e).replace(/^RPC error:\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

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
            <div className="mb-4 text-2xl font-semibold text-white">
              {formatAmount(amount, info.decimals)} <span className="text-sm font-normal text-blue-400">{info.symbol}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSend(true)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                <Send size={14} /> Send
              </button>
              <button
                onClick={() => setShowRedeem(true)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white/5 py-2 text-sm font-medium text-slate-200 hover:bg-white/10"
              >
                <Undo2 size={14} /> Redeem for CIVIC
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              {info.capped && (
                <button
                  onClick={() => setShowMint(true)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white/5 py-2 text-sm font-medium text-slate-200 hover:bg-white/10"
                >
                  <Coins size={14} /> Mint
                </button>
              )}
              <button
                onClick={() => setShowBurn(true)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white/5 py-2 text-sm font-medium text-slate-200 hover:bg-white/10"
              >
                <Flame size={14} /> Burn
              </button>
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

          {!hasMetadata && (
            <div className="mt-4 max-w-2xl rounded-2xl border border-white/5 bg-[#111726] p-5">
              <h2 className="mb-1 text-sm font-medium text-white">Add Logo & Info</h2>
              <p className="mb-4 text-xs text-slate-500">
                This token doesn't have a logo or description yet -- add one now.
              </p>

              <div className="mb-4">
                {logoPath ? (
                  <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
                    <img src={convertFileSrc(logoPath)} alt="Logo preview" className="h-12 w-12 rounded-lg object-cover" />
                    <span className="flex-1 truncate text-xs text-slate-400">{logoPath.split(/[\\/]/).pop()}</span>
                    <button onClick={() => setLogoPath("")} className="text-slate-500 hover:text-white">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handlePickLogo}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 py-4 text-sm text-slate-400 hover:border-white/30 hover:text-slate-300"
                  >
                    <ImagePlus size={16} /> Choose Logo Image
                  </button>
                )}
              </div>

              <div className="mb-3">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                  placeholder="What is this token for? (optional)"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
                />
              </div>

              <div className="mb-4 grid grid-cols-3 gap-3">
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="Website"
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  value={twitter}
                  onChange={(e) => setTwitter(e.target.value)}
                  placeholder="Twitter/X"
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="Telegram"
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
                />
              </div>

              {metaError && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{metaError}</div>}
              {metaAdded && (
                <div className="mb-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                  Metadata added successfully
                </div>
              )}

              <button
                onClick={handleAddMetadata}
                disabled={!logoPath || busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Sparkles size={16} /> {busy ? statusMsg || "Saving..." : "Save Logo & Info"}
              </button>
            </div>
          )}
        </>
      )}

      {showSend && info && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#151b2c] p-5">
            <div className="mb-3 flex items-center gap-2 text-white">
              <Send size={16} />
              <span className="text-sm font-semibold">Send {info.symbol}</span>
            </div>
            <input
              type="text"
              value={sendAddress}
              onChange={(e) => setSendAddress(e.target.value)}
              placeholder="Recipient address"
              className="mb-3 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
            />
            <input
              type="number"
              value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value)}
              placeholder={`Amount (${info.symbol})`}
              className="mb-3 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
            />
            {sendError && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{sendError}</div>}
            {sendTxid && (
              <div className="mb-3 flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-400">
                <Check size={14} className="mt-0.5 shrink-0" />
                <span>Sent! txid: <span className="font-mono">{sendTxid.slice(0, 10)}...{sendTxid.slice(-8)}</span></span>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleSendToken}
                disabled={sendBusy || !sendAddress.trim() || !sendAmount}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {sendBusy ? "Sending..." : "Send"}
              </button>
              <button
                onClick={() => { setShowSend(false); setSendError(""); setSendTxid(""); }}
                className="flex-1 rounded-lg bg-white/5 py-2 text-sm text-slate-300 hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showRedeem && info && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#151b2c] p-5">
            <div className="mb-3 flex items-center gap-2 text-white">
              <Undo2 size={16} />
              <span className="text-sm font-semibold">Redeem {info.symbol} for CIVIC</span>
            </div>
            <p className="mb-3 text-xs text-slate-400">
              Burns your {info.symbol} in exchange for its proportional share of the locked CIVIC reserve, at the
              token's fixed conversion rate.
            </p>
            <input
              type="number"
              value={redeemAmount}
              onChange={(e) => setRedeemAmount(e.target.value)}
              placeholder={`Amount to redeem (${info.symbol})`}
              className="mb-3 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
            />
            {redeemError && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{redeemError}</div>}
            {redeemTxid && (
              <div className="mb-3 flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-400">
                <Check size={14} className="mt-0.5 shrink-0" />
                <span>Redeemed! txid: <span className="font-mono">{redeemTxid.slice(0, 10)}...{redeemTxid.slice(-8)}</span></span>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleRedeemToken}
                disabled={redeemBusy || !redeemAmount}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {redeemBusy ? "Redeeming..." : "Redeem"}
              </button>
              <button
                onClick={() => { setShowRedeem(false); setRedeemError(""); setRedeemTxid(""); }}
                className="flex-1 rounded-lg bg-white/5 py-2 text-sm text-slate-300 hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showMint && info && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#151b2c] p-5">
            <div className="mb-3 flex items-center gap-2 text-white">
              <Coins size={16} />
              <span className="text-sm font-semibold">Mint {info.symbol}</span>
            </div>
            <p className="mb-3 text-xs text-slate-400">
              Issues additional supply to your own issuer address, up to this token's supply cap.
            </p>
            <input
              type="number"
              value={mintAmount}
              onChange={(e) => setMintAmount(e.target.value)}
              placeholder={`Amount to mint (${info.symbol})`}
              className="mb-3 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
            />
            {mintError && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{mintError}</div>}
            {mintTxid && (
              <div className="mb-3 flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-400">
                <Check size={14} className="mt-0.5 shrink-0" />
                <span>Minted! txid: <span className="font-mono">{mintTxid.slice(0, 10)}...{mintTxid.slice(-8)}</span></span>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleMintToken}
                disabled={mintBusy || !mintAmount}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {mintBusy ? "Minting..." : "Mint"}
              </button>
              <button
                onClick={() => { setShowMint(false); setMintError(""); setMintTxid(""); }}
                className="flex-1 rounded-lg bg-white/5 py-2 text-sm text-slate-300 hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showBurn && info && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#151b2c] p-5">
            <div className="mb-3 flex items-center gap-2 text-white">
              <Flame size={16} />
              <span className="text-sm font-semibold">Burn {info.symbol}</span>
            </div>
            <p className="mb-3 text-xs text-slate-400">
              Permanently destroys your own {info.symbol}. This cannot be undone.
            </p>
            <input
              type="number"
              value={burnAmount}
              onChange={(e) => setBurnAmount(e.target.value)}
              placeholder={`Amount to burn (${info.symbol})`}
              className="mb-3 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
            />
            {burnError && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{burnError}</div>}
            {burnTxid && (
              <div className="mb-3 flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-400">
                <Check size={14} className="mt-0.5 shrink-0" />
                <span>Burned! txid: <span className="font-mono">{burnTxid.slice(0, 10)}...{burnTxid.slice(-8)}</span></span>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleBurnToken}
                disabled={burnBusy || !burnAmount}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {burnBusy ? "Burning..." : "Burn"}
              </button>
              <button
                onClick={() => { setShowBurn(false); setBurnError(""); setBurnTxid(""); }}
                className="flex-1 rounded-lg bg-white/5 py-2 text-sm text-slate-300 hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
