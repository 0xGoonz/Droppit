# Droppit Smart Contracts

ERC-1155 drop factory system for Base (mainnet and Sepolia).

The `lib/` directory is intentionally vendored into this repository to keep public clones reproducible without git submodule setup.

## Architecture

```
DropFactory (owner-managed)
  |- createDrop() -> deploys Drop1155 clone
  |- setDefaultProtocolFeePerMint()   (owner-only, global default)
  `- setProtocolFeeRecipient()        (owner-only)

Drop1155 (per-drop clone)
  |- mint(quantity) / mintTo(to, quantity)
  |- withdraw()                       (owner-only, sends proceeds to payoutRecipient)
  `- protocolFeePerMint               (immutable per clone)
```

## Protocol Fee Model

| Parameter | Value |
|-----------|-------|
| MVP Default | `0.0001 ETH` (`100000000000000` wei) |
| Per-Mint Fee | Flat wei amount, not percentage |
| Forwarding | Immediate to `protocolFeeRecipient` during mint |
| Creator Proceeds | `mintPrice * quantity` held until `withdraw()` |

## Environment Variables

Preferred standardized names:

```bash
DEPLOYER_PRIVATE_KEY=0x...
BASE_SEPOLIA_RPC_URL=https://...
BASE_MAINNET_RPC_URL=https://...
DROPPIT_PROTOCOL_FEE_RECIPIENT=0x...
DROPPIT_DEFAULT_PROTOCOL_FEE_WEI=100000000000000
BASESCAN_API_KEY=...
DEPLOY_ARTIFACTS_DIR=deployments
```

Backward-compatible aliases still supported:

- `PRIVATE_KEY`
- `PROTOCOL_FEE_RECIPIENT`
- `DEFAULT_PROTOCOL_FEE`
- `BASE_SEPOLIA_RPC`
- `BASE_MAINNET_RPC`
- `RPC_URL` (fallback if specific network RPC env is missing)

## Deployment

PowerShell deploy helper with per-network presets:

```powershell
# Base Sepolia (default), verify enabled by default
.\deploy.ps1

# Base mainnet
.\deploy.ps1 -Network base

# Skip verification
.\deploy.ps1 -NoVerify

# Override profile, RPC, artifact directory
.\deploy.ps1 -Profile deploy -RpcUrl https://... -ArtifactsDir deployments
```

Under the hood the script runs:

```bash
forge script script/Deploy.s.sol:DeployScript --profile deploy --rpc-url <RPC> --chain <base|base-sepolia> --broadcast [--verify ...]
```

## Foundry Profiles and Network Aliases

`foundry.toml` defines:

- `profile.default` for local compile/test defaults
- `profile.deploy` for deployment-focused optimizer settings
- `rpc_endpoints.base` / `rpc_endpoints.base-sepolia`
- `etherscan.base` / `etherscan.base-sepolia`

You can deploy directly with aliases:

```bash
forge script script/Deploy.s.sol:DeployScript --profile deploy --rpc-url base-sepolia --chain base-sepolia --broadcast
forge script script/Deploy.s.sol:DeployScript --profile deploy --rpc-url base --chain base --broadcast
```

## Deployment Artifacts (Machine-Readable)

Every deployment writes JSON artifacts to `DEPLOY_ARTIFACTS_DIR` (default `deployments/`):

- `chain-<chainId>.json`
- `latest.json`
- `web-config-chain-<chainId>.json`

`web-config-chain-<chainId>.json` includes canonical values for web app env sync, including:

- `factoryAddress`
- `implementationAddress`
- `NEXT_PUBLIC_FACTORY_ADDRESS`
- `NEXT_PUBLIC_IMPLEMENTATION_ADDRESS`
- chain-specific keys:
  - `NEXT_PUBLIC_BASE_FACTORY_ADDRESS`
  - `NEXT_PUBLIC_BASE_IMPLEMENTATION_ADDRESS`
  - `NEXT_PUBLIC_BASE_SEPOLIA_FACTORY_ADDRESS`
  - `NEXT_PUBLIC_BASE_SEPOLIA_IMPLEMENTATION_ADDRESS`

This is intended for deterministic, scriptable sync into `droppit-web` config.

## Test

```bash
forge test -vvv
```

## Key Contracts

| Contract | Description |
|----------|-------------|
| `src/Drop1155.sol` | ERC-1155 implementation (edition cap, mint price, payout, fee) |
| `src/DropFactory.sol` | Clone factory with owner-managed global fee configuration |

## Repository Notice

First-party Solidity contracts, deploy scripts, and Solidity tests in `droppit-contracts/` are licensed under the MIT License. See [`LICENSE`](LICENSE).

Vendored dependencies under `lib/` retain their upstream licenses.
