// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {Drop1155} from "../src/Drop1155.sol";
import {DropFactory} from "../src/DropFactory.sol";

contract DeployScript is Script {
    struct DeployConfig {
        uint256 deployerPrivateKey;
        address protocolFeeRecipient;
        uint256 defaultProtocolFeeWei;
        string network;
        string artifactsDir;
    }

    function run() public {
        DeployConfig memory config = _loadConfig();

        vm.startBroadcast(config.deployerPrivateKey);

        Drop1155 implementation = new Drop1155();
        console.log("Deployed Drop1155 Implementation to:", address(implementation));

        DropFactory factory = new DropFactory(
            address(implementation),
            payable(config.protocolFeeRecipient),
            config.defaultProtocolFeeWei
        );
        console.log("Deployed DropFactory to:", address(factory));

        vm.stopBroadcast();

        _writeDeploymentArtifacts(config, implementation, factory);
    }

    function _loadConfig() internal view returns (DeployConfig memory config) {
        // Standardized env names (preferred)
        // - DEPLOYER_PRIVATE_KEY
        // - DROPPIT_PROTOCOL_FEE_RECIPIENT
        // - DROPPIT_DEFAULT_PROTOCOL_FEE_WEI
        //
        // Backward-compatible fallback:
        // - PRIVATE_KEY
        // - PROTOCOL_FEE_RECIPIENT
        // - DEFAULT_PROTOCOL_FEE
        config.deployerPrivateKey = vm.envOr("DEPLOYER_PRIVATE_KEY", vm.envOr("PRIVATE_KEY", uint256(0)));
        require(config.deployerPrivateKey != 0, "Missing DEPLOYER_PRIVATE_KEY");

        config.protocolFeeRecipient = vm.envOr(
            "DROPPIT_PROTOCOL_FEE_RECIPIENT",
            vm.envOr("PROTOCOL_FEE_RECIPIENT", address(0))
        );
        require(config.protocolFeeRecipient != address(0), "Missing DROPPIT_PROTOCOL_FEE_RECIPIENT");

        string memory feeRaw = vm.envOr("DROPPIT_DEFAULT_PROTOCOL_FEE_WEI", string(""));
        if (bytes(feeRaw).length == 0) {
            feeRaw = vm.envOr("DEFAULT_PROTOCOL_FEE", string(""));
        }
        require(bytes(feeRaw).length > 0, "Missing DROPPIT_DEFAULT_PROTOCOL_FEE_WEI");
        config.defaultProtocolFeeWei = vm.parseUint(feeRaw);

        config.network = vm.envOr("DEPLOY_NETWORK", string("unknown"));
        config.artifactsDir = vm.envOr("DEPLOY_ARTIFACTS_DIR", string("deployments"));
    }

    function _writeDeploymentArtifacts(
        DeployConfig memory config,
        Drop1155 implementation,
        DropFactory factory
    ) internal {
        vm.createDir(config.artifactsDir, true);

        string memory chainIdTag = string.concat("chain-", vm.toString(block.chainid));
        string memory deployPath = string.concat(config.artifactsDir, "/", chainIdTag, ".json");
        string memory latestPath = string.concat(config.artifactsDir, "/latest.json");
        string memory webSyncPath = string.concat(config.artifactsDir, "/web-config-", chainIdTag, ".json");

        string memory deploymentObject = "deployment";
        vm.serializeString(deploymentObject, "version", "1");
        vm.serializeUint(deploymentObject, "chainId", block.chainid);
        vm.serializeString(deploymentObject, "network", config.network);
        vm.serializeAddress(deploymentObject, "implementationAddress", address(implementation));
        vm.serializeAddress(deploymentObject, "factoryAddress", address(factory));
        vm.serializeAddress(deploymentObject, "protocolFeeRecipient", config.protocolFeeRecipient);
        vm.serializeUint(deploymentObject, "defaultProtocolFeeWei", config.defaultProtocolFeeWei);
        vm.serializeUint(deploymentObject, "deployedAtTimestamp", block.timestamp);
        string memory deploymentJson = vm.serializeString(
            deploymentObject,
            "script",
            "script/Deploy.s.sol:DeployScript"
        );

        vm.writeJson(deploymentJson, deployPath);
        vm.writeJson(deploymentJson, latestPath);

        string memory webObject = "webConfig";
        vm.serializeUint(webObject, "chainId", block.chainid);
        vm.serializeString(webObject, "network", config.network);
        vm.serializeAddress(webObject, "factoryAddress", address(factory));
        vm.serializeAddress(webObject, "implementationAddress", address(implementation));
        vm.serializeAddress(webObject, "NEXT_PUBLIC_FACTORY_ADDRESS", address(factory));
        vm.serializeAddress(webObject, "NEXT_PUBLIC_IMPLEMENTATION_ADDRESS", address(implementation));

        if (block.chainid == 8453) {
            vm.serializeAddress(webObject, "NEXT_PUBLIC_BASE_FACTORY_ADDRESS", address(factory));
            vm.serializeAddress(webObject, "NEXT_PUBLIC_BASE_IMPLEMENTATION_ADDRESS", address(implementation));
        } else if (block.chainid == 84532) {
            vm.serializeAddress(webObject, "NEXT_PUBLIC_BASE_SEPOLIA_FACTORY_ADDRESS", address(factory));
            vm.serializeAddress(webObject, "NEXT_PUBLIC_BASE_SEPOLIA_IMPLEMENTATION_ADDRESS", address(implementation));
        }

        string memory webJson = vm.serializeString(
            webObject,
            "generatedFrom",
            "script/Deploy.s.sol:DeployScript"
        );
        vm.writeJson(webJson, webSyncPath);

        console.log("Wrote deployment artifact:", deployPath);
        console.log("Wrote latest artifact:", latestPath);
        console.log("Wrote web sync artifact:", webSyncPath);
    }
}
