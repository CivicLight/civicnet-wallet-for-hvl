import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, Plus, Check } from "lucide-react";

interface WalletSwitcherProps {
  address: string;
  onSwitched: () => void;
}

function shortAddr(addr: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 8)}...${addr.slice(-5)}`;
}

export default function WalletSwitcher({ address, onSwitched }: WalletSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [wallets, setWallets] = useState<string[]>([]);
  const [active, setActive] = useState("main");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadWallets() {
    try {
      const [list, current] = await Promise.all([
        invoke<string[]>("wallet_list_all"),
        invoke<string>("wallet_get_active"),
      ]);
      setWallets(list);
      setActive(current);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    loadWallets();
  }, []);

  useEffect(() => {
    if (open) loadWallets();
  }, [open]);

  async function handleSwitch(name: string) {
    if (name === active) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await invoke("wallet_switch", { name });
      setActive(name);
      setOpen(false);
      onSwitched();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      await invoke("wallet_create_named", { name });
      await invoke("wallet_switch", { name });
      setActive(name);
      setNewName("");
      setCreating(false);
      setOpen(false);
      onSwitched();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg bg-white/5 px-3 py-2 hover:bg-white/10"
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <span className="text-[10px] font-bold">C</span>
          </div>
          <div className="flex min-w-0 flex-col items-start">
            <span className="truncate text-xs font-medium text-white">{active}</span>
            <span className="truncate text-[11px] text-slate-400">{shortAddr(address)}</span>
          </div>
        </div>
        <ChevronDown size={14} className="shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-white/10 bg-[#151b2c] p-2 shadow-xl">
          {error && (
            <div className="mb-2 rounded bg-red-500/10 px-2 py-1 text-[11px] text-red-400">{error}</div>
          )}
          <div className="max-h-48 overflow-y-auto">
            {wallets.map((w) => (
              <button
                key={w}
                onClick={() => handleSwitch(w)}
                disabled={busy}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-white/5 disabled:opacity-50"
              >
                <span className="truncate">{w}</span>
                {w === active && <Check size={13} className="text-emerald-400" />}
              </button>
            ))}
          </div>
          <div className="my-2 border-t border-white/10" />
          {creating ? (
            <div className="space-y-1.5 px-1">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Wallet name"
                className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={handleCreate}
                  disabled={busy || !newName.trim()}
                  className="flex-1 rounded-md bg-blue-600 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                  }}
                  className="flex-1 rounded-md bg-white/5 py-1 text-xs text-slate-300 hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-blue-400 hover:bg-white/5"
            >
              <Plus size={13} /> Create New Wallet
            </button>
          )}
        </div>
      )}
    </div>
  );
}
