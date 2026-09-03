import { useState } from "react";
import { Lock, Unlock, ShieldCheck, Zap, Coins } from "lucide-react";

interface StakingProps {
  balance: number;
  stakingUnlocked: boolean;
  walletEncrypted: boolean;
  onUnlockStaking: (passphrase: string, stakingOnly: boolean) => Promise<void>;
  onLockWallet: () => Promise<void>;
  onEncryptWallet: (passphrase: string) => Promise<void>;
}

export default function Staking({
  balance,
  stakingUnlocked,
  walletEncrypted,
  onUnlockStaking,
  onLockWallet,
  onEncryptWallet,
}: StakingProps) {
  const [showForm, setShowForm] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [stakingOnly, setStakingOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!passphrase) return;
    setBusy(true);
    setError("");
    try {
      await onUnlockStaking(passphrase, stakingOnly);
      setPassphrase("");
      setShowForm(false);
    } catch (e: any) {
      setError(String(e).replace(/^RPC error:\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  async function submitEncrypt() {
    if (!passphrase || passphrase !== confirmPassphrase) return;
    setBusy(true);
    setError("");
    try {
      await onEncryptWallet(passphrase);
      setPassphrase("");
      setConfirmPassphrase("");
      setShowForm(false);
    } catch (e: any) {
      setError(String(e).replace(/^RPC error:\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  async function handleLock() {
    setBusy(true);
    try {
      await onLockWallet();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Staking</h1>
        <p className="text-sm text-slate-500">Earn CIVIC rewards by helping secure the network</p>
      </div>

      <div className="mb-6 max-w-2xl rounded-2xl border border-white/5 bg-[#111726] p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="mb-1 text-sm text-slate-400">Status</div>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${stakingUnlocked ? "bg-emerald-400" : "bg-slate-600"}`} />
              <span className="text-lg font-semibold text-white">
                {stakingUnlocked ? "Staking Active" : "Not Staking"}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="mb-1 text-sm text-slate-400">Eligible Balance</div>
            <div className="text-lg font-semibold text-white">
              {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-sm font-normal text-blue-400">CIVIC</span>
            </div>
          </div>
        </div>

        {!walletEncrypted ? (
          !showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 py-2.5 text-sm font-medium text-white hover:bg-amber-500"
            >
              <Unlock size={16} /> Set Wallet Passphrase
            </button>
          ) : (
            <div>
              <input
                type="password"
                autoFocus
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="New passphrase"
                className="mb-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-500"
              />
              <input
                type="password"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitEncrypt()}
                placeholder="Confirm passphrase"
                className="mb-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-500"
              />
              {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={submitEncrypt}
                  disabled={busy || !passphrase || passphrase !== confirmPassphrase}
                  className="flex-1 rounded-lg bg-amber-600 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                >
                  {busy ? "Encrypting..." : "Confirm"}
                </button>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setError("");
                    setPassphrase("");
                    setConfirmPassphrase("");
                  }}
                  className="rounded-lg bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          )
        ) : !stakingUnlocked ? (
          !showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              <Unlock size={16} /> Unlock for Staking
            </button>
          ) : (
            <div>
              <input
                type="password"
                autoFocus
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Wallet passphrase"
                className="mb-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500"
              />
              <label className="mb-2 flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={stakingOnly}
                  onChange={(e) => setStakingOnly(e.target.checked)}
                />
                Staking only (spending stays locked). Uncheck to also allow sending funds.
              </label>
              {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={submit}
                  disabled={busy || !passphrase}
                  className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {busy ? "Unlocking..." : "Confirm"}
                </button>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setError("");
                    setPassphrase("");
                  }}
                  className="rounded-lg bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          )
        ) : (
          <button
            onClick={handleLock}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/5 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
          >
            <Lock size={16} /> Lock Wallet
          </button>
        )}
      </div>

      <div className="max-w-2xl rounded-2xl border border-white/5 bg-[#111726] p-6">
        <h2 className="mb-4 text-sm font-medium text-white">How staking works on CivicNet</h2>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
              <ShieldCheck size={16} />
            </div>
            <div>
              <div className="text-sm font-medium text-white">No minimum balance</div>
              <p className="text-sm text-slate-500">
                Any amount of CIVIC in your unlocked wallet is automatically eligible to stake — there's no
                threshold to meet.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-purple-400">
              <Zap size={16} />
            </div>
            <div>
              <div className="text-sm font-medium text-white">Stay unlocked to stay eligible</div>
              <p className="text-sm text-slate-500">
                Staking only happens while your wallet is unlocked. Use "staking only" mode to earn rewards
                without exposing your funds to spending.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <Coins size={16} />
            </div>
            <div>
              <div className="text-sm font-medium text-white">Rewards land in your balance</div>
              <p className="text-sm text-slate-500">
                When your wallet successfully stakes a block, the reward is added directly to your CIVIC balance —
                you'll see it appear in Recent Activity.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
