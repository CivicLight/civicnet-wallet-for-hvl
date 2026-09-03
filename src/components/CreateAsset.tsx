import { useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Sparkles, Check, ImagePlus, X, Lock } from "lucide-react";

export default function CreateAsset() {
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [decimals, setDecimals] = useState("8");
  const [initialSupply, setInitialSupply] = useState("");
  const [reserveLock, setReserveLock] = useState("1000");
  const [capped, setCapped] = useState(false);
  const [supplyCap, setSupplyCap] = useState("");
  const [logoPath, setLogoPath] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockPassphrase, setUnlockPassphrase] = useState("");
  const [unlockStakingOnly, setUnlockStakingOnly] = useState(false);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState("");

  const MAX_TOKEN_SUPPLY_CAP = 1000000000; // smallest-unit cap enforced by consensus
  const scale = Math.pow(10, parseInt(decimals || "0"));
  const maxWholeSupply = Math.floor(MAX_TOKEN_SUPPLY_CAP / scale);
  const initialSupplyTooHigh = parseInt(initialSupply || "0") * scale > MAX_TOKEN_SUPPLY_CAP;

  const canSubmit =
    /^[A-Z0-9]{1,12}$/.test(symbol) &&
    name.trim().length > 0 &&
    name.length <= 32 &&
    parseInt(initialSupply || "0") > 0 &&
    !initialSupplyTooHigh &&
    parseFloat(reserveLock || "0") > 0 &&
    (!capped || parseInt(supplyCap || "0") >= parseInt(initialSupply || "0")) &&
    !busy;

  async function handlePickLogo() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "svg"] }],
    });
    if (selected && typeof selected === "string") {
      setLogoPath(selected);
    }
  }

  async function handleCreate() {
    setBusy(true);
    setError("");
    setStatusMsg("");
    setTokenId("");
    try {
      // Creating a token signs/broadcasts a real spend, so the wallet must
      // be unlocked for spending (not staking-only, and not locked) before
      // we attempt it -- otherwise the node rejects with a raw RPC error
      // that's confusing to a user who doesn't know what "unlock" means here.
      try {
        const lock = await invoke<{ unlocked: boolean; staking_only: boolean; encrypted: boolean }>(
          "wallet_get_lock_status"
        );
        if (lock.encrypted && (!lock.unlocked || lock.staking_only)) {
          setBusy(false);
          setShowUnlock(true);
          return;
        }
      } catch {
        /* unencrypted wallet has no lock status -- spending is already allowed */
      }
      const scaleFactor = Math.pow(10, parseInt(decimals));
      setStatusMsg("Issuing token...");
      const result = await invoke<{ tokenId: string }>("wallet_create_token", {
        symbol,
        name,
        decimals: parseInt(decimals),
        initialSupply: Math.round(parseInt(initialSupply) * scaleFactor),
        reserveLockAmount: parseFloat(reserveLock),
        capped,
        supplyCap: capped ? Math.round(parseInt(supplyCap) * scaleFactor) : undefined,
      });
      setTokenId(result.tokenId);

      if (logoPath) {
        setStatusMsg("Waiting for confirmation...");
        // The issuance tx must be mined into a block before gettokeninfo (and
        // thus the metadata-update tx's issuer-address lookup) can see it --
        // poll until it confirms, rather than racing straight into the
        // metadata-update step.
        let confirmed = false;
        for (let i = 0; i < 40; i++) {
          try {
            await invoke("wallet_get_token_info", { tokenId: result.tokenId });
            confirmed = true;
            break;
          } catch {
            await new Promise((r) => setTimeout(r, 3000));
          }
        }
        if (!confirmed) {
          throw new Error("Token issuance did not confirm in time -- try attaching the logo again shortly.");
        }

        setStatusMsg("Uploading logo...");
        const upload = await invoke<{ metadataUri: string; metadataHash: string }>("wallet_upload_logo", {
          path: logoPath,
          symbol,
          name,
          description: description.trim() || undefined,
          website: website.trim() || undefined,
          twitter: twitter.trim() || undefined,
          telegram: telegram.trim() || undefined,
        });
        setStatusMsg("Attaching metadata to token...");
        await invoke("wallet_update_token_metadata", {
          tokenId: result.tokenId,
          metadataUri: upload.metadataUri,
          metadataHash: upload.metadataHash,
        });
      }

      setStatusMsg("");
      setSymbol("");
      setName("");
      setInitialSupply("");
      setLogoPath("");
    } catch (e: any) {
      setStatusMsg("");
      setError(String(e).replace(/^RPC error:\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Create Asset</h1>
        <p className="text-sm text-slate-500">Issue your own token on CivicNet's Hybrid Value Layer</p>
      </div>

      <div className="max-w-lg rounded-2xl border border-white/5 bg-[#111726] p-6">
        <div className="mb-5">
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Logo (optional)</label>
          {logoPath ? (
            <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <img
                src={convertFileSrc(logoPath)}
                alt="Logo preview"
                className="h-12 w-12 rounded-lg object-cover"
              />
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

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Symbol</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase().slice(0, 12))}
              placeholder="MYTOKEN"
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Decimals</label>
            <input
              type="number"
              min="0"
              max="8"
              value={decimals}
              onChange={(e) => setDecimals(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Token Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 32))}
            placeholder="My Token"
            className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            placeholder="What is this token for?"
            rows={3}
            className="w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
          />
        </div>

        <div className="mb-4 grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Website</label>
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Twitter/X</label>
            <input
              type="text"
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              placeholder="@handle"
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Telegram</label>
            <input
              type="text"
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
              placeholder="t.me/..."
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-medium text-slate-400">Initial Supply</label>
            <span className="text-xs text-slate-500">Max at {decimals} decimals: {maxWholeSupply.toLocaleString()}</span>
          </div>
          <input
            type="number"
            min="1"
            value={initialSupply}
            onChange={(e) => setInitialSupply(e.target.value)}
            placeholder="1000000"
            className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
          />
          {initialSupplyTooHigh && (
            <p className="mt-1.5 text-xs text-red-400">
              Exceeds the maximum supply for {decimals} decimals -- lower the supply or reduce decimals.
            </p>
          )}
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Reserve Lock (CIVIC)</label>
          <input
            type="number"
            min="0"
            value={reserveLock}
            onChange={(e) => setReserveLock(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
          />
        </div>

        <label className="mb-4 flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={capped}
            onChange={(e) => setCapped(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-black/20"
          />
          Allow minting more supply later (capped)
        </label>

        {capped && (
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Supply Cap</label>
            <input
              type="number"
              min={initialSupply || "0"}
              value={supplyCap}
              onChange={(e) => setSupplyCap(e.target.value)}
              placeholder="10000000"
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
            />
          </div>
        )}

        {error && <div className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}

        {tokenId && !busy && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-400">
            <Check size={14} className="mt-0.5 shrink-0" />
            <span>
              Token created! ID: <span className="font-mono">{tokenId.slice(0, 12)}...{tokenId.slice(-8)}</span>
            </span>
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={!canSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Sparkles size={16} /> {busy ? statusMsg || "Creating..." : "Create Asset"}
        </button>
      </div>

      {showUnlock && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#151b2c] p-5">
            <div className="mb-3 flex items-center gap-2 text-white">
              <Lock size={16} />
              <span className="text-sm font-semibold">Unlock Wallet</span>
            </div>
            <p className="mb-3 text-xs text-slate-400">
              Creating a token requires signing a transaction -- unlock your wallet to continue.
            </p>
            <input
              type="password"
              autoFocus
              value={unlockPassphrase}
              onChange={(e) => setUnlockPassphrase(e.target.value)}
              placeholder="Wallet passphrase"
              className="mb-3 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
            />
            <label className="mb-4 flex items-start gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={unlockStakingOnly}
                onChange={(e) => setUnlockStakingOnly(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-black/20"
              />
              <span>
                Unlock for staking only (spending stays locked). Leave unchecked to also allow this token
                creation -- your wallet will still be eligible to stake either way.
              </span>
            </label>
            {unlockError && (
              <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{unlockError}</div>
            )}
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setUnlockBusy(true);
                  setUnlockError("");
                  try {
                    await invoke("wallet_unlock", {
                      passphrase: unlockPassphrase,
                      stakingOnly: unlockStakingOnly,
                    });
                    setShowUnlock(false);
                    setUnlockPassphrase("");
                    if (!unlockStakingOnly) {
                      handleCreate();
                    }
                  } catch (e: any) {
                    setUnlockError(String(e).replace(/^RPC error:\s*/, ""));
                  } finally {
                    setUnlockBusy(false);
                  }
                }}
                disabled={unlockBusy || !unlockPassphrase}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {unlockBusy ? "Unlocking..." : "Unlock"}
              </button>
              <button
                onClick={() => {
                  setShowUnlock(false);
                  setUnlockPassphrase("");
                  setUnlockError("");
                }}
                className="flex-1 rounded-lg bg-white/5 py-2 text-sm text-slate-300 hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
