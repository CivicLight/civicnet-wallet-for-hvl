import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import Sidebar from "./components/Sidebar";
import type { View } from "./components/Sidebar";
import Overview from "./components/Overview";
import type { WalletTx } from "./components/Overview";
import RightPanel from "./components/RightPanel";
import Send from "./components/Send";
import Receive from "./components/Receive";
import Assets from "./components/Assets";
import CreateAsset from "./components/CreateAsset";
import Staking from "./components/Staking";
import Activity from "./components/Activity";
import Addresses from "./components/Addresses";
import Settings from "./components/Settings";
import TransactionDetail from "./components/TransactionDetail";

interface LockStatus {
  unlocked: boolean;
  staking_only: boolean;
  encrypted: boolean;
}

export default function App() {
  const [view, setView] = useState<View>("overview");
  const [status, setStatus] = useState<"starting" | "syncing" | "ready" | "error">("starting");
  const [errorMsg, setErrorMsg] = useState("");
  const [nodeHeight, setNodeHeight] = useState(0);
  const [peers, setPeers] = useState(0);
  const [balance, setBalance] = useState(0);
  const [address, setAddress] = useState("");
  const [transactions, setTransactions] = useState<WalletTx[]>([]);
  const [lockStatus, setLockStatus] = useState<LockStatus>({ unlocked: false, staking_only: false, encrypted: true });
  const [selectedTxid, setSelectedTxid] = useState<string | null>(null);

  const refreshWalletData = useCallback(async () => {
    try {
      const nodeStatus = await invoke<{ height: number; peers: number; synced: boolean }>("get_node_status");
      setNodeHeight(nodeStatus.height);
      setPeers(nodeStatus.peers);

      const bal = await invoke<number>("wallet_get_balance");
      setBalance(bal);

      const txs = await invoke<any[]>("wallet_list_transactions", { count: 20 });
      setTransactions(
        txs.map((t) => ({
          txid: t.txid,
          category: t.category,
          amount: t.amount,
          address: t.address,
          time: t.time,
        })).reverse()
      );

      try {
        const lock = await invoke<LockStatus>("wallet_get_lock_status");
        setLockStatus(lock);
      } catch {
        /* unencrypted wallet has no lock status; leave default */
      }

      setStatus("ready");
    } catch (e: any) {
      const msg = String(e);
      if (msg.includes("No wallet is loaded") || msg.includes("wallet")) {
        try {
          await invoke("wallet_create_wallet");
        } catch {
          /* wallet may already exist under a different state, ignore */
        }
      }
      setStatus("syncing");
    }
  }, []);

  const ensureAddress = useCallback(async () => {
    try {
      const addr = await invoke<string>("wallet_get_new_address");
      setAddress(addr);
    } catch {
      /* wallet not ready yet */
    }
  }, []);

  const ensureNewAddress = useCallback(async () => {
    const addr = await invoke<string>("wallet_get_new_address");
    setAddress(addr);
  }, []);

  const handleUnlockStaking = useCallback(async (passphrase: string, stakingOnly: boolean) => {
    await invoke("wallet_unlock", { passphrase, stakingOnly });
    const lock = await invoke<LockStatus>("wallet_get_lock_status");
    setLockStatus(lock);
  }, []);

  const handleEncryptWallet = useCallback(async (passphrase: string) => {
    await invoke("wallet_encrypt", { passphrase });
    const lock = await invoke<LockStatus>("wallet_get_lock_status");
    setLockStatus(lock);
  }, []);

  const handleLockWallet = useCallback(async () => {
    await invoke("wallet_lock");
    const lock = await invoke<LockStatus>("wallet_get_lock_status");
    setLockStatus(lock);
  }, []);

  const handleWalletSwitched = useCallback(async () => {
    setAddress("");
    setTransactions([]);
    setLockStatus({ unlocked: false, staking_only: false, encrypted: true });
    await refreshWalletData();
    const addr = await invoke<string>("wallet_get_new_address");
    setAddress(addr);
  }, [refreshWalletData]);

  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;

    async function boot() {
      try {
        await invoke("start_node");
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setErrorMsg(String(e));
          return;
        }
      }
      poll = setInterval(refreshWalletData, 5000);
      refreshWalletData();
    }

    boot();

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
    };
  }, [refreshWalletData]);

  useEffect(() => {
    if (status === "ready" && !address) {
      ensureAddress();
    }
  }, [status, address, ensureAddress]);

  if (status === "starting" || status === "syncing") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0b0f17] text-slate-300">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <span className="text-sm">
            {status === "starting" ? "Starting CivicNet node..." : "Syncing with the network..."}
          </span>
          {nodeHeight > 0 && <span className="text-xs text-slate-500">Block {nodeHeight.toLocaleString()}</span>}
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0b0f17] text-slate-300">
        <div className="max-w-md text-center">
          <p className="mb-2 text-sm font-medium text-red-400">Failed to start CivicNet node</p>
          <p className="text-xs text-slate-500">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (selectedTxid) {
    return (
      <div className="flex h-screen w-screen bg-[#0b0f17]">
        <Sidebar active={view} onNavigate={setView} nodeHeight={nodeHeight} nodeConnected={status === "ready"} />
        <TransactionDetail txid={selectedTxid} onBack={() => setSelectedTxid(null)} />
        <RightPanel address={address} balance={balance} nodeHeight={nodeHeight} peers={peers} onNavigate={setView} onWalletSwitched={handleWalletSwitched} />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-[#0b0f17]">
      <Sidebar active={view} onNavigate={setView} nodeHeight={nodeHeight} nodeConnected={status === "ready"} />

      {view === "overview" && (
        <Overview
          balance={balance}
          transactions={transactions}
          onNavigate={setView}
          address={address}
          stakingUnlocked={lockStatus.unlocked && lockStatus.staking_only}
          walletEncrypted={lockStatus.encrypted}
          onUnlockStaking={handleUnlockStaking}
          onLockWallet={handleLockWallet}
          onEncryptWallet={handleEncryptWallet}
          onTxClick={setSelectedTxid}
        />
      )}
      {view === "send" && <Send balance={balance} onSent={refreshWalletData} />}
      {view === "receive" && <Receive address={address} onGenerateNew={ensureNewAddress} />}
      {view === "assets" && <Assets balance={balance} onNavigate={setView} />}
      {view === "create-asset" && <CreateAsset />}
      {view === "staking" && (
        <Staking
          balance={balance}
          stakingUnlocked={lockStatus.unlocked && lockStatus.staking_only}
          walletEncrypted={lockStatus.encrypted}
          onUnlockStaking={handleUnlockStaking}
          onLockWallet={handleLockWallet}
          onEncryptWallet={handleEncryptWallet}
        />
      )}
      {view === "activity" && <Activity transactions={transactions} onTxClick={setSelectedTxid} />}
      {view === "addresses" && <Addresses />}
      {view === "settings" && <Settings onWalletImported={handleWalletSwitched} />}

      <RightPanel address={address} balance={balance} nodeHeight={nodeHeight} peers={peers} onNavigate={setView} onWalletSwitched={handleWalletSwitched} />
    </div>
  );
}
