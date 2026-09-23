import { useEffect, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Sparkles, Check, ImagePlus, X, Lock } from "lucide-react";

export default function CreateAsset() {
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [decimals, setDecimals] = useState("8");
  const [initialSupply, setInitialSupply] = useState("");
  const [reserveLock, setReserveLock] = useState<number | null>(null);
  const [capped, setCapped] = useState(false);
  const [supplyCap, setSupplyCap] = useState("");
  const [lockMintAuthorityTransfer, setLockMintAuthorityTransfer] = useState(false);
  const [lockMetadataAuthorityTransfer, setLockMetadataAuthorityTransfer] = useState(false);
  const [tokenType, setTokenType] = useState<"standard" | "vesting">("standard");
  const [vestingStartHeight, setVestingStartHeight] = useState("");
  const [vestingDurationBlocks, setVestingDurationBlocks] = useState("");
  const [vestingCliffBlocks, setVestingCliffBlocks] = useState("0");
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

  const MAX_WHOLE_INITIAL_SUPPLY = 1000000000n;

  useEffect(() => {
    let cancelled = false;

    invoke<{ height: number; minReserveLock: number }>(
      "wallet_get_token_issuance_params"
    )
      .then((params) => {
        if (!cancelled) {
          setReserveLock(params.minReserveLock);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReserveLock(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const isWholeNumber = (value: string) => /^\d+$/.test(value);

  const wholeToRawUnits = (value: string, decimalsValue: string) => {
    const whole = BigInt(value);
    const places = BigInt(parseInt(decimalsValue || "0"));
    return (whole * (10n ** places)).toString();
  };

  const initialSupplyValue =
    isWholeNumber(initialSupply) ? BigInt(initialSupply) : 0n;

  const initialSupplyTooHigh =
    initialSupplyValue > MAX_WHOLE_INITIAL_SUPPLY;

  const supplyCapValue =
    isWholeNumber(supplyCap) ? BigInt(supplyCap) : 0n;

  const vestingDurationValue =
    parseInt(vestingDurationBlocks || "0");

  const vestingCliffValue =
    parseInt(vestingCliffBlocks || "0");

  const canSubmit =
    /^[A-Z0-9]{1,12}$/.test(symbol) &&
    name.trim().length > 0 &&
    name.length <= 32 &&
    isWholeNumber(initialSupply) &&
    initialSupplyValue > 0n &&
    !initialSupplyTooHigh &&
    (!capped ||
      (isWholeNumber(supplyCap) &&
        supplyCapValue >= initialSupplyValue)) &&
    (tokenType !== "vesting" ||
      (/^\d+$/.test(vestingStartHeight) &&
        /^\d+$/.test(vestingDurationBlocks) &&
        /^\d+$/.test(vestingCliffBlocks) &&
        vestingDurationValue > 0 &&
        vestingCliffValue <= vestingDurationValue)) &&
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
      const rawInitialSupply =
        wholeToRawUnits(initialSupply, decimals);

      const rawSupplyCap =
        capped ? wholeToRawUnits(supplyCap, decimals) : undefined;

      setStatusMsg("Issuing token...");

      const result = await invoke<{ tokenId: string }>("wallet_create_token", {
        symbol,
        name,
        decimals: parseInt(decimals),
        initialSupply: rawInitialSupply,
        capped,
        supplyCap: rawSupplyCap,
        tokenType,
        vestingStartHeight:
          tokenType === "vesting"
            ? parseInt(vestingStartHeight)
            : undefined,
        vestingDurationBlocks:
          tokenType === "vesting"
            ? vestingDurationValue
            : undefined,
        vestingCliffBlocks:
          tokenType === "vesting"
            ? vestingCliffValue
            : undefined,
        lockMintAuthorityTransfer:
          capped ? lockMintAuthorityTransfer : false,
        lockMetadataAuthorityTransfer,
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
      setLockMintAuthorityTransfer(false);
      setLockMetadataAuthorityTransfer(false);
    } catch (e: any) {
      setStatusMsg("");
      setError(String(e).replace(/^RPC error:\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-7">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Create Asset
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Issue a native asset on CivicNet's Hybrid Value Layer.
          </p>
        </div>

        <div className="space-y-4">
          {/* Identity */}
          <section className="rounded-2xl border border-white/5 bg-[#111726] p-6">
            <div className="mb-5">
              <h2 className="text-sm font-semibold text-white">
                Asset Identity
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Define how your asset will appear in CivicNet wallets.
              </p>
            </div>

            <div className="mb-5">
              <label className="mb-1.5 block text-xs font-medium text-slate-400">
                Logo
                <span className="ml-1 font-normal text-slate-600">
                  optional
                </span>
              </label>

              {logoPath ? (
                <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                  <img
                    src={convertFileSrc(logoPath)}
                    alt="Logo preview"
                    className="h-12 w-12 rounded-xl object-cover"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-slate-300">
                      {logoPath.split(/[\\/]/).pop()}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-600">
                      Asset logo selected
                    </div>
                  </div>

                  <button
                    onClick={() => setLogoPath("")}
                    className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handlePickLogo}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-black/10 py-4 text-sm text-slate-400 transition-colors hover:border-blue-500/30 hover:bg-blue-500/[0.03] hover:text-slate-300"
                >
                  <ImagePlus size={16} />
                  Choose logo image
                </button>
              )}
            </div>

            <div className="grid grid-cols-[1fr_140px] gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Symbol
                </label>
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) =>
                    setSymbol(e.target.value.toUpperCase().slice(0, 12))
                  }
                  placeholder="MYTOKEN"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Decimals
                </label>
                <input
                  type="number"
                  min="0"
                  max="8"
                  value={decimals}
                  onChange={(e) => setDecimals(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-blue-500"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-slate-400">
                Asset Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 32))}
                placeholder="My Token"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:border-blue-500"
              />
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-slate-400">
                Description
                <span className="ml-1 font-normal text-slate-600">
                  optional
                </span>
              </label>
              <textarea
                value={description}
                onChange={(e) =>
                  setDescription(e.target.value.slice(0, 500))
                }
                placeholder="What is this asset for?"
                rows={3}
                className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:border-blue-500"
              />
            </div>
          </section>

          {/* Optional links */}
          <section className="rounded-2xl border border-white/5 bg-[#111726] p-6">
            <div className="mb-5">
              <h2 className="text-sm font-semibold text-white">
                Public Links
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Optional references included with your asset metadata.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Website
                </label>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Twitter / X
                </label>
                <input
                  type="text"
                  value={twitter}
                  onChange={(e) => setTwitter(e.target.value)}
                  placeholder="@handle"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Telegram
                </label>
                <input
                  type="text"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="t.me/..."
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
                />
              </div>
            </div>
          </section>

          {/* Asset type */}
          <section className="rounded-2xl border border-white/5 bg-[#111726] p-6">
            <div className="mb-5">
              <h2 className="text-sm font-semibold text-white">
                Asset Type
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Choose how the initial supply is distributed.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTokenType("standard")}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  tokenType === "standard"
                    ? "border-blue-500/40 bg-blue-500/[0.06]"
                    : "border-white/10 bg-black/10 hover:bg-white/[0.02]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">
                    Standard
                  </span>

                  {tokenType === "standard" && (
                    <Check size={15} className="text-blue-400" />
                  )}
                </div>

                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                  Initial supply is immediately available to the issuer.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setTokenType("vesting")}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  tokenType === "vesting"
                    ? "border-blue-500/40 bg-blue-500/[0.06]"
                    : "border-white/10 bg-black/10 hover:bg-white/[0.02]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">
                    Vesting
                  </span>

                  {tokenType === "vesting" && (
                    <Check size={15} className="text-blue-400" />
                  )}
                </div>

                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                  Initial supply follows a block-based vesting schedule.
                </p>
              </button>
            </div>

            {tokenType === "vesting" && (
              <div className="mt-5 border-t border-white/5 pt-5">
                <div className="mb-4">
                  <div className="text-xs font-medium text-slate-300">
                    Vesting Schedule
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">
                    Heights and durations are measured in CivicNet blocks.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      Start Height
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={vestingStartHeight}
                      onChange={(e) => setVestingStartHeight(e.target.value)}
                      placeholder="Block height"
                      className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      Duration
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={vestingDurationBlocks}
                      onChange={(e) =>
                        setVestingDurationBlocks(e.target.value)
                      }
                      placeholder="Blocks"
                      className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      Cliff
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={vestingCliffBlocks}
                      onChange={(e) =>
                        setVestingCliffBlocks(e.target.value)
                      }
                      placeholder="0"
                      className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
                    />
                  </div>
                </div>

                {vestingDurationValue > 0 &&
                  vestingCliffValue > vestingDurationValue && (
                    <p className="mt-2 text-xs text-red-400">
                      Vesting cliff cannot exceed vesting duration.
                    </p>
                  )}
              </div>
            )}
          </section>

          {/* Supply */}
          <section className="rounded-2xl border border-white/5 bg-[#111726] p-6">
            <div className="mb-5">
              <h2 className="text-sm font-semibold text-white">
                Supply & Reserve
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Configure the initial supply and CIVIC reserve backing.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label className="text-xs font-medium text-slate-400">
                    Initial Supply
                  </label>

                  <span className="text-[11px] text-slate-600">
                    Max 1,000,000,000
                  </span>
                </div>

                <input
                  type="number"
                  min="1"
                  value={initialSupply}
                  onChange={(e) => setInitialSupply(e.target.value)}
                  placeholder="1000000"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
                />

                {initialSupplyTooHigh && (
                  <p className="mt-1.5 text-xs text-red-400">
                    Initial supply cannot exceed 1,000,000,000 tokens.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Reserve Lock
                </label>

                <div className="flex h-[42px] items-center rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white">
                  {reserveLock !== null
                    ? `${reserveLock.toLocaleString(undefined, {
                        maximumFractionDigits: 8,
                      })} CIVIC`
                    : "Loading protocol rule..."}
                </div>

                <p className="mt-1.5 text-[11px] text-slate-600">
                  Automatically set by the current CivicNet protocol rule.
                </p>
              </div>
            </div>

            <div className="mt-5 border-t border-white/5 pt-5">
              <div className="mb-3">
                <div className="text-xs font-medium text-slate-300">
                  Supply Mode
                </div>
                <div className="mt-1 text-[11px] text-slate-600">
                  Choose whether supply is fixed or can increase later.
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCapped(false);
                    setLockMintAuthorityTransfer(false);
                  }}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    !capped
                      ? "border-blue-500/40 bg-blue-500/[0.06]"
                      : "border-white/10 bg-black/10 hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">
                      Fixed Supply
                    </span>

                    {!capped && (
                      <Check size={15} className="text-blue-400" />
                    )}
                  </div>

                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                    No additional tokens can be minted after creation.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setCapped(true)}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    capped
                      ? "border-blue-500/40 bg-blue-500/[0.06]"
                      : "border-white/10 bg-black/10 hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">
                      Capped Supply
                    </span>

                    {capped && (
                      <Check size={15} className="text-blue-400" />
                    )}
                  </div>

                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                    Additional supply may be minted up to a permanent cap.
                  </p>
                </button>
              </div>

              {capped && (
                <div className="mt-4">
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">
                    Maximum Supply
                  </label>

                  <input
                    type="number"
                    min={initialSupply || "0"}
                    value={supplyCap}
                    onChange={(e) => setSupplyCap(e.target.value)}
                    placeholder="10000000"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
                  />
                </div>
              )}
            </div>

            <div className="mt-5 border-t border-white/5 pt-5">
              <div className="mb-3">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                  <Lock size={13} />
                  Creator Power Lock
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-slate-600">
                  Permanently restrict whether authority control can ever be
                  transferred to another address.
                </div>
              </div>

              <div className="grid gap-3">
                <button
                  type="button"
                  disabled={!capped}
                  onClick={() => {
                    if (capped) {
                      setLockMintAuthorityTransfer((value) => !value);
                    }
                  }}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    !capped
                      ? "cursor-not-allowed border-white/5 bg-black/10 opacity-45"
                      : lockMintAuthorityTransfer
                        ? "border-blue-500/40 bg-blue-500/[0.06]"
                        : "border-white/10 bg-black/10 hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-white">
                        Lock Mint Authority Transfer
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                        {capped
                          ? "Minting can remain active, but control of mint authority can never be transferred to another address."
                          : "Available only for Capped Supply assets. Fixed Supply assets have no operational mint authority."}
                      </p>
                    </div>

                    {lockMintAuthorityTransfer && capped && (
                      <Check
                        size={15}
                        className="mt-0.5 shrink-0 text-blue-400"
                      />
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setLockMetadataAuthorityTransfer((value) => !value)
                  }
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    lockMetadataAuthorityTransfer
                      ? "border-blue-500/40 bg-blue-500/[0.06]"
                      : "border-white/10 bg-black/10 hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-white">
                        Lock Metadata Authority Transfer
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                        Metadata may remain editable, but control of metadata
                        authority can never be transferred to another address.
                      </p>
                    </div>

                    {lockMetadataAuthorityTransfer && (
                      <Check
                        size={15}
                        className="mt-0.5 shrink-0 text-blue-400"
                      />
                    )}
                  </div>
                </button>
              </div>

              {(lockMintAuthorityTransfer ||
                lockMetadataAuthorityTransfer) && (
                <div className="mt-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.06] px-4 py-3 text-xs leading-relaxed text-amber-300">
                  Permanent protocol commitment. Selected Creator Power Locks
                  are written at issuance and cannot be removed later.
                </div>
              )}
            </div>
          </section>

          {error && (
            <div className="rounded-xl border border-red-500/15 bg-red-500/[0.08] px-4 py-3 text-xs text-red-400">
              {error}
            </div>
          )}

          {tokenId && !busy && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.08] px-4 py-3 text-xs text-emerald-400">
              <Check size={14} className="mt-0.5 shrink-0" />
              <span>
                Asset created successfully. ID:{" "}
                <span className="font-mono">
                  {tokenId.slice(0, 12)}...{tokenId.slice(-8)}
                </span>
              </span>
            </div>
          )}

          <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-[#111726] p-4">
            <div>
              <div className="text-sm font-medium text-white">
                Ready to issue
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Review the settings above before creating the asset.
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={!canSubmit}
              className="flex min-w-[180px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles size={15} />
              {busy ? statusMsg || "Creating..." : "Create Asset"}
            </button>
          </div>
        </div>
      </div>

      {showUnlock && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#151b2c] p-5 shadow-2xl">
            <div className="mb-3 flex items-center gap-2 text-white">
              <Lock size={16} />
              <span className="text-sm font-semibold">Unlock Wallet</span>
            </div>

            <p className="mb-3 text-xs leading-relaxed text-slate-400">
              Creating an asset requires signing a transaction. Unlock your
              wallet to continue.
            </p>

            <input
              type="password"
              autoFocus
              value={unlockPassphrase}
              onChange={(e) => setUnlockPassphrase(e.target.value)}
              placeholder="Wallet passphrase"
              className="mb-3 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
            />

            <label className="mb-4 flex items-start gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={unlockStakingOnly}
                onChange={(e) => setUnlockStakingOnly(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-black/20"
              />

              <span>
                Unlock for staking only. Leave unchecked to allow this asset
                creation transaction.
              </span>
            </label>

            {unlockError && (
              <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {unlockError}
              </div>
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
                    setUnlockError(
                      String(e).replace(/^RPC error:\s*/, "")
                    );
                  } finally {
                    setUnlockBusy(false);
                  }
                }}
                disabled={unlockBusy || !unlockPassphrase}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {unlockBusy ? "Unlocking..." : "Unlock"}
              </button>

              <button
                onClick={() => {
                  setShowUnlock(false);
                  setUnlockPassphrase("");
                  setUnlockError("");
                }}
                className="flex-1 rounded-xl bg-white/5 py-2.5 text-sm text-slate-300 hover:bg-white/10"
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
