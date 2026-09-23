# CivicNet Wallet for HVL

Official desktop wallet for [CivicNet (CIVIC)](https://civiclight.xyz/).

CivicNet Wallet is a full desktop wallet for managing CIVIC, participating in staking, and using CivicNet's native Hybrid Value Layer (HVL) token system.

The wallet bundles CivicNet Core and manages the node automatically, so users can interact with the CivicNet blockchain without manually configuring a node, RPC connection, or command-line environment.

## Features

### CIVIC Wallet

- Send and receive CIVIC
- Generate multiple receiving addresses
- QR-code receiving addresses
- Per-address balances
- Full CIVIC transaction activity
- Wallet backup
- Wallet encryption and passphrase management
- Private key export and import
- Full wallet key dump export and import

### Staking

CivicNet uses a hybrid Proof-of-Work and Proof-of-Stake consensus model.

The wallet supports:

- PoS staking directly from the desktop wallet
- Staking-only wallet unlock
- Normal wallet unlock for spending
- Wallet lock controls
- Staking status and balance information

Staking-only unlock allows the wallet to participate in staking while keeping normal spending operations locked.

## Hybrid Value Layer (HVL)

HVL is CivicNet's native protocol-level token layer.

Tokens are created and managed directly on the CivicNet blockchain without requiring smart contracts or an external token network.

CivicNet Wallet provides a graphical interface for HVL operations.

### Token Creation

Users can create tokens with:

- Custom token name
- Custom symbol
- 0-8 decimal places
- Initial supply
- Fixed or capped/mintable supply model
- Optional vesting
- CIVIC reserve backing
- Logo and metadata
- Description
- Website
- X / Twitter
- Telegram

Token metadata can be stored through IPFS and linked to the token on-chain.

### Token Operations

Supported HVL operations include:

- Issue
- Mint
- Transfer
- Burn
- Convert Out / Redeem
- Metadata update
- Token authority transfer
- Mint authority relinquishment
- Metadata finalization / permanent metadata immutability

### Convert Out / Redeem

HVL tokens can use CIVIC locked in their reserve.

Convert Out allows supported tokens to be redeemed according to the token's reserve state and CivicNet consensus rules.

The wallet automatically tracks the current reserve output required for subsequent redemption transactions.

### Token Authority

HVL provides explicit authority controls.

Depending on the token configuration, an issuer may be able to:

- mint additional supply;
- transfer token authority;
- relinquish mint authority;
- update metadata;
- permanently make metadata immutable.

Authority state is recorded by CivicNet and can be inspected from the wallet or block explorer.

### Token Details

The wallet displays detailed token information including:

- Token ID
- Symbol
- Name
- Decimals
- Current supply
- Initial supply
- Supply cap
- Reserve amount
- Issuer
- Mint state
- Metadata state
- Authority state
- Token activity
- Lifecycle information

## Token Supply and Decimals

HVL supports token decimals from `0` to `8`.

Token amounts are handled internally as exact raw integer units. The wallet converts between human-readable token amounts and raw units without using floating-point arithmetic for transaction amounts.

Token issuance is subject to CivicNet consensus limits and validation rules.

## CIVIC Reserve

HVL token issuance requires CIVIC to be locked as reserve according to CivicNet consensus rules.

The current minimum reserve required by the network is:

250 CIVIC

Reserve funds remain part of the token's on-chain state and may be used by supported Convert Out / Redeem operations.

## How It Works

CivicNet Wallet is built with:

- Tauri
- Rust
- React
- TypeScript
- Tailwind CSS

The application bundles a `civicnet-node` sidecar.

When the wallet starts:

1. CivicNet Core starts in the background.
2. The wallet connects to the local node through RPC.
3. CivicNet Core validates and synchronizes the blockchain.
4. Wallet operations are submitted to the local node.
5. HVL validation and token state are handled by CivicNet consensus logic.

The wallet does not depend on a remote custodial service for normal blockchain operation. Private keys and wallet data remain under the user's local wallet environment.

## Installation

Download the latest Windows installer from the official [GitHub Releases](https://github.com/CivicLight/civicnet-wallet-for-hvl/releases) page.

Run the installer and launch **CivicNet Wallet**.

### Windows SmartScreen

The installer is currently not code-signed, so Windows may display a SmartScreen warning.

If the installer was downloaded from the official CivicLight GitHub repository:

1. Click **More info**
2. Click **Run anyway**

## First Launch

On first launch, CivicNet Wallet:

1. Creates its local CivicNet node data directory.
2. Creates or opens the wallet.
3. Starts the bundled CivicNet Core node.
4. Connects to the CivicNet network.
5. Begins blockchain synchronization.

Some wallet and HVL operations require the node to be fully synchronized.

Synchronization time depends on network connectivity, disk performance, and the current blockchain state.

## Sending CIVIC

Open **Send** and:

1. Enter the destination CivicNet address.
2. Enter the amount of CIVIC.
3. Review the transaction.
4. Confirm and broadcast.

The wallet prepares and submits the transaction through the local CivicNet Core node.

## Receiving CIVIC

Open **Receive** to view a receiving address and QR code.

You can generate additional receiving addresses at any time.

Previously generated addresses remain valid and balances from all wallet addresses contribute to the wallet's total balance.

## Staking

Open the **Staking** page to manage Proof-of-Stake participation.

For an encrypted wallet:

1. Open **Staking**.
2. Unlock the wallet using staking-only mode.
3. Keep the wallet and node running while staking.

Staking-only mode allows staking operations while preventing normal spending operations.

When spending CIVIC or performing HVL operations, the wallet may require a normal wallet unlock instead.

## Creating an HVL Token

Open **Create Asset**.

The wallet guides the issuer through the token issuance process, including:

1. Token name
2. Symbol
3. Decimals
4. Initial supply
5. Supply model
6. Supply cap, when applicable
7. CIVIC reserve
8. Optional vesting
9. Logo and metadata
10. Issuance confirmation

The wallet prepares, funds, signs, and broadcasts the required transaction.

Protocol fees, reserve requirements, and issuance validation are enforced by CivicNet consensus rules.

## Managing an HVL Token

For tokens controlled by the active wallet, supported management operations may include:

- Mint additional supply
- Transfer tokens
- Burn tokens
- Convert Out / Redeem
- Update metadata
- Transfer token authority
- Relinquish mint authority
- Permanently make metadata immutable

Available operations depend on the token's current state and authority configuration.

Once an authority is permanently relinquished or metadata is made immutable, that state is enforced by the CivicNet protocol and cannot be reversed through the wallet.

## Assets

The **Assets** page displays:

- CIVIC
- HVL tokens held by the wallet
- Token balances
- Token logos and metadata when available

Selecting a token opens its detailed view.

## Token Detail

The token detail view provides access to available token information and supported operations.

Depending on the token, this may include:

- Supply information
- Reserve information
- Issuer information
- Authority status
- Metadata status
- Mint controls
- Burn controls
- Transfer
- Convert Out
- Authority management
- Token lifecycle information

## Activity

The **Activity** page displays wallet transaction history.

Transaction details may include:

- Transaction ID
- Confirmation status
- Block height
- CIVIC transfers
- HVL operations
- Token amounts
- Transaction direction

## Addresses

The **Addresses** page lists addresses generated or managed by the wallet together with their individual CIVIC balances.

## Wallet Backup & Security

The wallet provides tools for:

- Wallet encryption
- Passphrase changes
- Wallet backup
- Private key export
- Private key import
- Full wallet key dump export
- Full wallet key dump import

### Important Security Notes

- Use a strong wallet passphrase.
- Keep wallet backups in a secure location.
- Keep exported private keys offline whenever possible.
- Never share private keys or wallet dump files.
- Anyone with access to a private key can control funds associated with that key.
- Verify wallet downloads against the official CivicLight repositories.

## Building from Source

### Requirements

- Node.js 18+
- Rust stable
- Tauri development dependencies
- MinGW cross-compile toolchain for Windows builds from Linux or WSL

Install dependencies:

    npm install

Run in development mode:

    npm run tauri dev

Build the Windows release installer:

    cargo tauri build --target x86_64-pc-windows-gnu

The wallet expects the CivicNet Core sidecar in:

    src-tauri/binaries/

Tauri requires the target triple in the sidecar filename.

Example:

    civicnet-node-x86_64-pc-windows-gnu.exe

CivicNet Core source and releases are available at:

https://github.com/CivicLight/CivicNet

## Project Links

- Website: https://civiclight.xyz
- CivicNet Core: https://github.com/CivicLight/CivicNet
- Wallet Releases: https://github.com/CivicLight/civicnet-wallet-for-hvl/releases
- Block Explorer: https://explorer2.civiclight.xyz
- Public RPC: https://rpc.civiclight.xyz
- Telegram: https://t.me/civiclight
- X / Twitter: https://x.com/civiclight

## License

See the CivicNet Core repository for project license information.
