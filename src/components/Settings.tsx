import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Download, Check, Info, KeyRound, Upload, AlertTriangle, Power } from "lucide-react";
import { exit } from "@tauri-apps/plugin-process";

export default function Settings() {
  const [version, setVersion] = useState("");
  const [height, setHeight] = useState(0);
  const [peers, setPeers] = useState(0);
  const [backingUp, setBackingUp] = useState(false);
  const [backedUp, setBackedUp] = useState(false);
  const [backupError, setBackupError] = useState("");

  const [exporting, setExporting] = useState(false);
  const [exportPath, setExportPath] = useState("");
  const [exportError, setExportError] = useState("");
  const [singleKey, setSingleKey] = useState("");
  const [importingSingle, setImportingSingle] = useState(false);
  const [singleImported, setSingleImported] = useState(false);
  const [singleImportError, setSingleImportError] = useState("");

  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [importError, setImportError] = useState("");

  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [changingPass, setChangingPass] = useState(false);
  const [passChanged, setPassChanged] = useState(false);
  const [passError, setPassError] = useState("");

  useEffect(() => {
    invoke<string>("get_app_version").then(setVersion).catch(() => {});
    invoke<{ height: number; peers: number }>("get_node_status")
      .then((s) => {
        setHeight(s.height);
        setPeers(s.peers);
      })
      .catch(() => {});
  }, []);

  async function handleBackup() {
    setBackingUp(true);
    setBackupError("");
    setBackedUp(false);
    try {
      const filename = `civicnet-wallet-backup-${Date.now()}.dat`;
      await invoke("wallet_backup", { destination: filename });
      setBackedUp(true);
    } catch (e: any) {
      setBackupError(String(e).replace(/^RPC error:\s*/, ""));
    } finally {
      setBackingUp(false);
    }
  }

  async function handleExportKeys() {
    setExporting(true);
    setExportError("");
    setExportPath("");
    try {
      const path = await invoke<string>("wallet_export_keys");
      setExportPath(path);
    } catch (e: any) {
      setExportError(String(e).replace(/^RPC error:\s*/, ""));
    } finally {
      setExporting(false);
    }
  }

  async function handleImportSingleKey() {
    if (!singleKey.trim()) return;
    setImportingSingle(true);
    setSingleImportError("");
    setSingleImported(false);
    try {
      await invoke("wallet_import_single_key", { privkey: singleKey.trim() });
      setSingleImported(true);
      setSingleKey("");
    } catch (e: any) {
      setSingleImportError(String(e).replace(/^RPC error:\s*/, ""));
    } finally {
      setImportingSingle(false);
    }
  }

  async function handleImportKeys() {
    const selected = await open({ multiple: false });
    if (!selected || typeof selected !== "string") return;
    setImporting(true);
    setImportError("");
    setImported(false);
    try {
      await invoke("wallet_import_keys", { path: selected });
      setImported(true);
    } catch (e: any) {
      setImportError(String(e).replace(/^RPC error:\s*/, ""));
    } finally {
      setImporting(false);
    }
  }

  const canChangePass = oldPass.length > 0 && newPass.length > 0 && newPass === confirmPass && !changingPass;

  async function handleChangePassphrase() {
    setChangingPass(true);
    setPassError("");
    setPassChanged(false);
    try {
      await invoke("wallet_change_passphrase", { oldPassphrase: oldPass, newPassphrase: newPass });
      setPassChanged(true);
      setOldPass("");
      setNewPass("");
      setConfirmPass("");
    } catch (e: any) {
      setPassError(String(e).replace(/^RPC error:\s*/, ""));
    } finally {
      setChangingPass(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-slate-500">Wallet and network preferences</p>
      </div>

      <div className="mb-4 max-w-lg rounded-2xl border border-white/5 bg-[#111726] p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-white">
          <KeyRound size={15} /> Change Passphrase
        </h2>
        <div className="space-y-3">
          <input
            type="password"
            value={oldPass}
            onChange={(e) => setOldPass(e.target.value)}
            placeholder="Current passphrase"
            className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
          />
          <input
            type="password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            placeholder="New passphrase"
            className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
          />
          <input
            type="password"
            value={confirmPass}
            onChange={(e) => setConfirmPass(e.target.value)}
            placeholder="Confirm new passphrase"
            className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
          />
          {newPass && confirmPass && newPass !== confirmPass && (
            <p className="text-xs text-red-400">New passphrases don't match</p>
          )}
          {passError && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{passError}</div>}
          {passChanged && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
              <Check size={14} /> Passphrase changed successfully
            </div>
          )}
          <button
            onClick={handleChangePassphrase}
            disabled={!canChangePass}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {changingPass ? "Changing..." : "Change Passphrase"}
          </button>
        </div>
      </div>

      <div className="mb-4 max-w-lg rounded-2xl border border-red-500/20 bg-[#1a1218] p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
          <AlertTriangle size={15} className="text-red-400" /> Export / Import Private Keys
        </h2>
        <p className="mb-4 text-xs text-red-300/80">
          This file contains every private key in this wallet, in plain readable form. Anyone who gets it can
          spend all your funds. Store it offline, encrypted, and never share it.
        </p>

        {exportError && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{exportError}</div>}
        {exportPath && (
          <div className="mb-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
            <div className="flex items-center gap-2">
              <Check size={14} /> Keys exported
            </div>
            <div className="mt-1 break-all font-mono text-slate-300">{exportPath}</div>
          </div>
        )}
        <button
          onClick={handleExportKeys}
          disabled={exporting}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-white/5 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
        >
          <Download size={15} /> {exporting ? "Exporting..." : "Export All Private Keys"}
        </button>

        <div className="mb-3">
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Import a Single Private Key</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={singleKey}
              onChange={(e) => setSingleKey(e.target.value)}
              placeholder="Paste private key here"
              className="flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 font-mono text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500"
            />
            <button
              onClick={handleImportSingleKey}
              disabled={importingSingle || !singleKey.trim()}
              className="shrink-0 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {importingSingle ? "Importing..." : "Import"}
            </button>
          </div>
          {singleImportError && <p className="mt-1.5 text-xs text-red-400">{singleImportError}</p>}
          {singleImported && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-400">
              <Check size={12} /> Key imported successfully
            </p>
          )}
        </div>

        <div className="my-4 border-t border-white/5" />

        <label className="mb-1.5 block text-xs font-medium text-slate-400">Or Import a Full Keys File</label>
        {importError && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{importError}</div>}
        {imported && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
            <Check size={14} /> Keys imported successfully
          </div>
        )}
        <button
          onClick={handleImportKeys}
          disabled={importing}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/5 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
        >
          <Upload size={15} /> {importing ? "Importing..." : "Import Private Keys from File"}
        </button>
      </div>

      <div className="mb-4 max-w-lg rounded-2xl border border-white/5 bg-[#111726] p-5">
        <h2 className="mb-4 text-sm font-medium text-white">Wallet Backup</h2>
        <p className="mb-4 text-sm text-slate-500">
          Save a copy of your wallet file. Keep it somewhere safe — anyone with this file can access your funds.
        </p>
        {backupError && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{backupError}</div>}
        {backedUp && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
            <Check size={14} /> Backup saved to your wallet data folder
          </div>
        )}
        <button
          onClick={handleBackup}
          disabled={backingUp}
          className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
        >
          <Download size={15} /> {backingUp ? "Backing up..." : "Backup Wallet"}
        </button>
      </div>

      <div className="mb-4 max-w-lg rounded-2xl border border-white/5 bg-[#111726] p-5">
        <button
          onClick={() => exit(0)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/5 py-2.5 text-sm font-medium text-white hover:bg-red-500/10 hover:text-red-400"
        >
          <Power size={15} /> Exit Wallet
        </button>
      </div>

      <div className="max-w-lg rounded-2xl border border-white/5 bg-[#111726] p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-white">
          <Info size={15} /> About
        </h2>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Wallet Version</span>
            <span className="text-slate-200">{version || "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Network</span>
            <span className="text-slate-200">CivicNet Mainnet</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Block Height</span>
            <span className="text-slate-200">{height.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Connections</span>
            <span className="text-slate-200">{peers}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
