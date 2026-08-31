import { useState } from "react";
import { ArrowUpRight, Download, Bell, Sun, Lock, Unlock } from "lucide-react";
import type { View } from "./Sidebar";

interface OverviewProps {
  balance: number;
  transactions: WalletTx[];
  onNavigate: (view: View) => void;
  address: string;
  stakingUnlocked: boolean;
  walletEncrypted: boolean;
  onUnlockStaking: (passphrase: string) => Promise<void>;
  onLockWallet: () => Promise<void>;
  onEncryptWallet: (passphrase: string) => Promise<void>;
  onTxClick: (txid: string) => void;
}

export interface WalletTx {
  txid: string;
  category: string;
  amount: number;
  address?: string;
  time: number;
}

function timeAgo(unixSeconds: number): string {
  const diffMs = Date.now() - unixSeconds * 1000;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function TxRow({ tx, onClick }: { tx: WalletTx; onClick: () => void }) {
  const isReceive = tx.category === "receive" || tx.category === "generate" || tx.category === "immature";
  const label = isReceive ? "Received" : tx.category === "send" ? "Sent" : tx.category;
  const sign = isReceive ? "+" : "-";
  const colorClass = isReceive ? "text-emerald-400" : "text-red-400";

  return (
    <button onClick={onClick} className="flex w-full items-center justify-between py-3 text-left hover:bg-white/5 rounded-lg px-2 -mx-2">
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
          <div className="text-xs text-slate-500">
            {tx.address ? `${tx.address.slice(0, 8)}...${tx.address.slice(-4)}` : tx.txid.slice(0, 10)}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className={`text-sm font-semibold ${colorClass}`}>
          {sign}
          {Math.abs(tx.amount).toFixed(2)} <span className="text-xs font-normal">CIVIC</span>
        </div>
        <div className="text-xs text-slate-500">{timeAgo(tx.time)}</div>
      </div>
    </button>
  );
}

function StakingCard({
  stakingUnlocked,
  walletEncrypted,
  onUnlockStaking,
  onLockWallet,
  onEncryptWallet,
}: {
  stakingUnlocked: boolean;
  walletEncrypted: boolean;
  onUnlockStaking: (passphrase: string) => Promise<void>;
  onLockWallet: () => Promise<void>;
  onEncryptWallet: (passphrase: string) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!passphrase) return;
    setBusy(true);
    setError("");
    try {
      await onUnlockStaking(passphrase);
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

  if (stakingUnlocked) {
    return (
      <div className="rounded-2xl border border-white/5 bg-[#111726] p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-slate-400">Staking</span>
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Active
          </span>
        </div>
        <p className="mb-5 text-sm text-slate-300">
          Your wallet is unlocked for staking. Your full balance is eligible to earn staking rewards automatically.
        </p>
        <button
          onClick={handleLock}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/5 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
        >
          <Lock size={16} /> Lock Wallet
        </button>
      </div>
    );
  }

  if (!walletEncrypted) {
    return (
      <div className="rounded-2xl border border-amber-500/20 bg-[#1a1610] p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-slate-400">Staking</span>
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
            Not Protected
          </span>
        </div>

        {!showForm ? (
          <>
            <p className="mb-5 text-sm text-slate-400">
              Set a passphrase to protect this wallet before staking. This encrypts your keys so spending always
              requires your passphrase.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 py-2.5 text-sm font-medium text-white hover:bg-amber-500"
            >
              <Lock size={16} /> Set Wallet Passphrase
            </button>
          </>
        ) : (
          <>
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
            {passphrase && confirmPassphrase && passphrase !== confirmPassphrase && (
              <p className="mb-2 text-xs text-red-400">Passphrases don't match</p>
            )}
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
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-[#111726] p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-slate-400">Staking</span>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-slate-400">Inactive</span>
      </div>

      {!showForm ? (
        <>
          <p className="mb-5 text-sm text-slate-500">
            Unlock your wallet for staking only to start earning rewards. Spending stays locked.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            <Unlock size={16} /> Unlock for Staking
          </button>
        </>
      ) : (
        <>
          <input
            type="password"
            autoFocus
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Wallet passphrase"
            className="mb-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500"
          />
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
        </>
      )}
    </div>
  );
}

export default function Overview({
  balance,
  transactions,
  onNavigate,
  stakingUnlocked,
  walletEncrypted,
  onUnlockStaking,
  onLockWallet,
  onEncryptWallet,
  onTxClick,
}: OverviewProps) {
  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Overview</h1>
          <p className="text-sm text-slate-500">Welcome back!</p>
        </div>
        <div className="flex items-center gap-3 text-slate-400">
          <button className="rounded-lg p-2 hover:bg-white/5">
            <Bell size={18} />
          </button>
          <button className="rounded-lg p-2 hover:bg-white/5">
            <Sun size={18} />
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/5 bg-[#111726] p-5">
          <div className="mb-3 text-sm text-slate-400">CIVIC Balance</div>
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-white">
              {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-sm font-medium text-blue-400">CIVIC</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onNavigate("send")}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
            >
              <ArrowUpRight size={16} /> Send
            </button>
            <button
              onClick={() => onNavigate("receive")}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white/5 py-2.5 text-sm font-medium text-white hover:bg-white/10"
            >
              <Download size={16} /> Receive
            </button>
          </div>
        </div>

        <StakingCard
          stakingUnlocked={stakingUnlocked}
          walletEncrypted={walletEncrypted}
          onUnlockStaking={onUnlockStaking}
          onLockWallet={onLockWallet}
          onEncryptWallet={onEncryptWallet}
        />
      </div>

      <div className="rounded-2xl border border-white/5 bg-[#111726] p-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-white">Recent Activity</span>
          <button onClick={() => onNavigate("activity")} className="text-xs text-blue-400 hover:underline">
            View all
          </button>
        </div>
        <div className="divide-y divide-white/5">
          {transactions.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">No recent activity</div>
          ) : (
            transactions.slice(0, 5).map((tx, i) => <TxRow key={`${tx.txid}-${i}`} tx={tx} onClick={() => onTxClick(tx.txid)} />)
          )}
        </div>
      </div>
    </div>
  );
}
