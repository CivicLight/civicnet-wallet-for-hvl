# CivicNet Wallet for HVL

Official desktop wallet for [CivicNet (CIVIC)](https://civiclight.xyz/) — send and receive CIVIC, stake to earn rewards, and create your own tokens on CivicNet's Hybrid Value Layer (HVL).

## Features

* Modern dashboard UI (React + Tailwind)
* Bundles a full CivicNet node — no separate node setup required
* Send / Receive CIVIC with QR codes
* Staking with a dedicated "staking-only" wallet unlock (spending stays locked while staking)
* Create custom tokens on the Hybrid Value Layer: fixed or capped (mintable) supply, optional vesting, logo + description + social links stored on IPFS
* View all tokens you hold or created, with live balances and logos
* Full transaction and token history
* Multiple receiving addresses with per-address balances
* Wallet encryption, passphrase change, private key export/import (single key or full wallet dump)

## Requirements

* Windows 10 or newer, 64-bit

## How it works

This wallet bundles a `civicnet-node` binary and runs it in the background, communicating over the local RPC interface — the same node used for mining pools and the standalone `civicnet-qt` wallet, but managed automatically so you never touch a config file or the command line.

## Installation

Download the latest installer from the [Releases](https://github.com/CivicLight/civicnet-wallet-for-hvl/releases) page and run it. Windows may show a SmartScreen warning since the installer isn't code-signed — click "More info" → "Run anyway".

## Getting Started

### First launch

On first launch, the wallet creates a new node data directory and wallet, then begins syncing with the CivicNet network. This can take a few minutes depending on your connection. You'll see the sync progress on the Overview page.

### Protect your wallet (do this first!)

New wallets are **not encrypted by default**. Before you send any funds to this wallet, go to **Overview** or **Staking** and use the "Set Wallet Passphrase" prompt on the Staking card to set your first passphrase. Anyone with access to your computer can spend your funds until you do this. Once set, use **Settings → Change Passphrase** if you ever want to change it later.

### Sending & Receiving CIVIC

* **Receive**: go to the Receive page for your address and QR code. Click "Generate New Address" for a fresh one — old addresses stay valid and their balance is included in your total.
* **Send**: go to Send, paste the recipient's address, enter an amount, confirm.

### Staking

CivicNet uses a hybrid PoW/PoS design — any CIVIC in your unlocked wallet is automatically eligible to stake, with no minimum balance and no lock-up period. To stake:

1. Go to **Staking**.
2. Click **Unlock for Staking** and enter your passphrase.
3. Your wallet is now unlocked in staking-only mode — it can stake blocks, but spending (Send, token creation, etc.) stays locked until you unlock normally or click **Lock Wallet**.

### Creating a Token (Hybrid Value Layer)

CivicNet's Hybrid Value Layer lets any wallet issue its own token directly on the CivicNet blockchain — no smart contracts, fully native. Anti-spam fee logic, transaction structure, and validation are all part of the network's consensus rules.

To create a token:

1. Go to **Create Asset**.
2. **Symbol**: 1-12 characters, A-Z and 0-9 only (e.g. `MYTOKEN`).
3. **Decimals**: how many decimal places your token supports (0-8). This also determines your token's *maximum possible whole-number supply*, since the network's hard cap is 1,000,000,000 in the token's smallest unit:

   | Decimals | Max whole-token supply |
   |---|---|
   | 0 | 1,000,000,000 |
   | 2 | 10,000,000 |
   | 4 | 100,000 |
   | 6 | 1,000 |
   | 8 | 10 |

   Pick a low decimal count (0-2) for a large supply; pick a higher one only if you need fine-grained fractional amounts.
4. **Token Name**: a display name up to 32 characters.
5. **Initial Supply**: how many whole tokens to mint at creation (the form shows your live maximum based on the Decimals you picked above).
6. **Reserve Lock**: CIVIC to lock as your token's reserve (required, must be greater than 0).
7. **Allow minting more supply later (capped)**: check this if you want the ability to mint additional supply after creation, up to a **Supply Cap** you set. Leave unchecked for a permanently fixed supply — this is visible to everyone who looks up your token, and is a trust signal for holders (no mint authority means no future inflation risk).
8. **Logo** (optional): click "Choose Logo Image" and pick a PNG/JPG/WEBP/SVG file. You can also add a **Description** and **Website / Twitter / Telegram** links. These are uploaded to IPFS automatically and attached to your token on-chain as a follow-up transaction once the issuance confirms.
9. Click **Create Asset**. The wallet builds, funds, signs, and broadcasts the issuance transaction for you — including the network's anti-spam issuance fee, computed automatically.

Your new token appears on the **Assets** page once the transaction confirms (usually within a couple of minutes).

### Viewing your Assets

The **Assets** page lists CIVIC plus every token you hold, with live balances and logos. Click any token to see its full details — issuer, supply, decimals, mint status, and more.

### Activity

The **Activity** page shows your full CIVIC transaction history. Click any transaction to see its confirmation status, block height, and a breakdown of the transfer.

### Addresses

The **Addresses** page lists every address this wallet has generated, along with its individual balance.

### Backup & Security (Settings page)

* **Change Passphrase**: change your wallet's existing passphrase.
* **Export/Import Private Keys**: export a full dump of every key in this wallet (keep this file offline and encrypted — anyone with it can spend your funds), import a single private key (e.g. from another wallet or an exchange), or import a full dump file from elsewhere.
* **Backup Wallet**: saves a copy of your wallet file.
* **Exit Wallet**: cleanly shuts down the wallet and its background node process.

## Building from Source

Requires Node.js 18+, Rust (stable), and for Windows builds from Linux/WSL, a MinGW cross-compile toolchain.

```bash
npm install
npm run tauri dev        # development mode
cargo tauri build --target x86_64-pc-windows-gnu   # release installer
```

The wallet expects a `civicnet-node` binary for each target platform in `src-tauri/binaries/` (see the [CivicNet Releases](https://github.com/CivicLight/CivicNet/releases) page for prebuilt node binaries) — Tauri's sidecar naming convention requires the target-triple suffix, e.g. `civicnet-node-x86_64-pc-windows-gnu.exe`.

## Links

* Website: https://civiclight.xyz
* Node & core wallet source: https://github.com/CivicLight/CivicNet
* Block explorer: https://explorer2.civiclight.xyz

## License

See the CivicNet main repository for license details.
