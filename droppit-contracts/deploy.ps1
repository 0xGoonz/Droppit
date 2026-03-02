param(
    [ValidateSet("base-sepolia", "base")]
    [string]$Network = "base-sepolia",

    [string]$Profile = "deploy",

    [string]$RpcUrl = "",

    [switch]$NoVerify,

    [string]$ArtifactsDir = "deployments"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Import-EnvFile([string]$Path) {
    if (!(Test-Path $Path)) {
        Write-Host "No $Path file found, using current process environment values."
        return
    }

    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { return }

        $parts = $line.Split("=", 2)
        if ($parts.Length -ne 2) { return }

        $key = $parts[0].Trim()
        $value = $parts[1].Trim()
        Set-Item -Path "Env:$key" -Value $value
    }
}

function Resolve-EnvValue([string[]]$Names, [bool]$Required = $true) {
    foreach ($name in $Names) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if (![string]::IsNullOrWhiteSpace($value)) {
            return $value
        }
    }

    if ($Required) {
        throw "Missing required environment variable. Tried: $($Names -join ', ')"
    }

    return ""
}

Import-EnvFile ".env"

$rpcByNetwork = @{
    "base-sepolia" = @("BASE_SEPOLIA_RPC_URL", "BASE_SEPOLIA_RPC", "RPC_URL")
    "base" = @("BASE_MAINNET_RPC_URL", "BASE_MAINNET_RPC", "RPC_URL")
}

$chainByNetwork = @{
    "base-sepolia" = "base-sepolia"
    "base" = "base"
}

$resolvedRpc = $RpcUrl
if ([string]::IsNullOrWhiteSpace($resolvedRpc)) {
    $resolvedRpc = Resolve-EnvValue -Names $rpcByNetwork[$Network] -Required $true
}

$deployerKey = Resolve-EnvValue -Names @("DEPLOYER_PRIVATE_KEY", "PRIVATE_KEY") -Required $true
$protocolRecipient = Resolve-EnvValue -Names @("DROPPIT_PROTOCOL_FEE_RECIPIENT", "PROTOCOL_FEE_RECIPIENT") -Required $true
$protocolFeeWei = Resolve-EnvValue -Names @("DROPPIT_DEFAULT_PROTOCOL_FEE_WEI", "DEFAULT_PROTOCOL_FEE") -Required $true

[Environment]::SetEnvironmentVariable("DEPLOYER_PRIVATE_KEY", $deployerKey)
[Environment]::SetEnvironmentVariable("DROPPIT_PROTOCOL_FEE_RECIPIENT", $protocolRecipient)
[Environment]::SetEnvironmentVariable("DROPPIT_DEFAULT_PROTOCOL_FEE_WEI", $protocolFeeWei)
[Environment]::SetEnvironmentVariable("DEPLOY_NETWORK", $Network)
[Environment]::SetEnvironmentVariable("DEPLOY_ARTIFACTS_DIR", $ArtifactsDir)

$forgePath = "C:\Users\Admin\.foundry\bin\forge.exe"
if (!(Test-Path $forgePath)) {
    throw "forge not found at $forgePath"
}

$args = @(
    "script",
    "script/Deploy.s.sol:DeployScript",
    "--profile", $Profile,
    "--rpc-url", $resolvedRpc,
    "--chain", $chainByNetwork[$Network],
    "--broadcast",
    "--slow",
    "-vvvv"
)

if (-not $NoVerify) {
    $basescanApiKey = Resolve-EnvValue -Names @("BASESCAN_API_KEY") -Required $true
    $args += @(
        "--verify",
        "--verifier", "etherscan",
        "--etherscan-api-key", $basescanApiKey
    )
}

Write-Host "Deploying to network: $Network"
Write-Host "Using profile: $Profile"
Write-Host "RPC source: $resolvedRpc"
Write-Host "Verification: $([bool](-not $NoVerify))"
Write-Host "Artifacts dir: $ArtifactsDir"

& $forgePath @args
