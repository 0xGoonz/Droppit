// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {DropFactory} from "../src/DropFactory.sol";
import {Drop1155} from "../src/Drop1155.sol";

contract RevertingFeeRecipient {
    receive() external payable {
        revert("NO_RECEIVE");
    }
}

contract DropTest is Test {
    DropFactory factory;
    Drop1155 implementation;

    address payable protocolFeeRecipient = payable(makeAddr("protocolFeeRecipient"));
    address initialOwner = makeAddr("initialOwner");
    address payable payoutRecipient = payable(makeAddr("payoutRecipient"));
    address collector1 = makeAddr("collector1");
    address collector2 = makeAddr("collector2");

    uint256 defaultProtocolFee = 0.0001 ether; // 100_000_000_000_000 wei — matches Sepolia deployment
    uint256 mintPrice = 0.01 ether;
    uint256 editionSize = 100;
    string tokenUri = "ipfs://QmTest123";

    function setUp() public {
        vm.deal(collector1, 10 ether);
        vm.deal(collector2, 10 ether);

        // Deploy master implementation
        implementation = new Drop1155();

        // Deploy factory
        factory = new DropFactory(
            address(implementation),
            protocolFeeRecipient,
            defaultProtocolFee
        );
    }

    /// @dev 1. Factory clone deployment is working correctly.
    function test_cloneDeployment() public {
        vm.prank(initialOwner);
        address dropAddress = factory.createDrop(
            editionSize,
            mintPrice,
            payoutRecipient,
            tokenUri,
            bytes32(0)
        );

        Drop1155 drop = Drop1155(dropAddress);

        assertEq(drop.owner(), initialOwner);
        assertEq(drop.editionSize(), editionSize);
        assertEq(drop.mintPrice(), mintPrice);
        assertEq(drop.payoutRecipient(), payoutRecipient);
        assertEq(drop.protocolFeeRecipient(), protocolFeeRecipient);
        assertEq(drop.protocolFeePerMint(), defaultProtocolFee);
        assertEq(drop.uri(1), tokenUri);
    }

    /// @dev 2. Edition size limits (1-10,000) are enforced.
    function test_editionSizeLimits() public {
        // Test Zero Edition Size (Should Revert)
        vm.prank(initialOwner);
        vm.expectRevert(Drop1155.InvalidEditionSize.selector);
        factory.createDrop(
            0,
            mintPrice,
            payoutRecipient,
            tokenUri,
            bytes32(0)
        );

        // Test > 10,000 Edition Size (Should Revert)
        vm.prank(initialOwner);
        vm.expectRevert(Drop1155.InvalidEditionSize.selector);
        factory.createDrop(
            10001,
            mintPrice,
            payoutRecipient,
            tokenUri,
            bytes32(0)
        );

        // Test Exact Max Edition Size (Should Pass)
        vm.prank(initialOwner);
        address maxDrop = factory.createDrop(
            10000,
            mintPrice,
            payoutRecipient,
            tokenUri,
            bytes32(0)
        );
        assertEq(Drop1155(maxDrop).editionSize(), 10000);
    }

    /// @dev 3. Exact payment logic for minting (mintPrice + protocolFeePerMint).
    function test_exactPaymentMinting() public {
        vm.prank(initialOwner);
        address dropAddress = factory.createDrop(
            editionSize,
            mintPrice,
            payoutRecipient,
            tokenUri,
            bytes32(0)
        );
        Drop1155 drop = Drop1155(dropAddress);

        uint256 exactCostPerToken = mintPrice + defaultProtocolFee;

        // Underpay
        vm.prank(collector1);
        vm.expectRevert(Drop1155.IncorrectPayment.selector);
        drop.mint{value: exactCostPerToken - 1}(1);

        // Overpay
        vm.prank(collector1);
        vm.expectRevert(Drop1155.IncorrectPayment.selector);
        drop.mint{value: exactCostPerToken + 1}(1);

        // Exact Payment
        vm.prank(collector1);
        drop.mint{value: exactCostPerToken}(1);
        
        assertEq(drop.balanceOf(collector1, drop.TOKEN_ID()), 1);
        assertEq(drop.totalMinted(), 1);
    }

    /// @dev 4. Immediate forwarding of protocol fee.
    function test_immediateFeeForwarding() public {
        vm.prank(initialOwner);
        address dropAddress = factory.createDrop(
            editionSize,
            mintPrice,
            payoutRecipient,
            tokenUri,
            bytes32(0)
        );
        Drop1155 drop = Drop1155(dropAddress);

        uint256 exactCost = mintPrice + defaultProtocolFee;
        uint256 initialProtocolBalance = protocolFeeRecipient.balance;

        vm.prank(collector1);
        drop.mint{value: exactCost}(1);

        // Protocol fee must be forwarded immediately
        assertEq(protocolFeeRecipient.balance, initialProtocolBalance + defaultProtocolFee);
        // Contract balance must only hold the creator's proceeds
        assertEq(address(drop).balance, mintPrice);
    }

    /// @dev 5. Withdraw sends creator proceeds to payoutRecipient.
    function test_withdrawProceeds() public {
        vm.prank(initialOwner);
        address dropAddress = factory.createDrop(
            editionSize,
            mintPrice,
            payoutRecipient,
            tokenUri,
            bytes32(0)
        );
        Drop1155 drop = Drop1155(dropAddress);

        uint256 mints = 3;
        uint256 exactCost = (mintPrice + defaultProtocolFee) * mints;

        vm.prank(collector1);
        drop.mint{value: exactCost}(mints);

        uint256 originalPayoutBalance = payoutRecipient.balance;
        uint256 expectedCreatorProceeds = mintPrice * mints;

        assertEq(address(drop).balance, expectedCreatorProceeds);

        // Initial Owner calls withdraw
        vm.prank(initialOwner);
        drop.withdraw();

        assertEq(address(drop).balance, 0);
        assertEq(payoutRecipient.balance, originalPayoutBalance + expectedCreatorProceeds);
    }

    /// @dev Additional: Ensure only owner can withdraw
    function test_withdrawOnlyOwner() public {
        vm.prank(initialOwner);
        address dropAddress = factory.createDrop(
            editionSize,
            mintPrice,
            payoutRecipient,
            tokenUri,
            bytes32(0)
        );
        Drop1155 drop = Drop1155(dropAddress);

        uint256 exactCost = mintPrice + defaultProtocolFee;
        vm.prank(collector1);
        drop.mint{value: exactCost}(1);

        // Non-owner trying to withdraw should revert
        vm.prank(collector1);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", collector1));
        drop.withdraw();
    }

    /// @dev Invariant: mint must revert if protocol fee forwarding fails.
    function test_protocolFeeRecipientRevertCausesMintRevert() public {
        RevertingFeeRecipient revertingRecipient = new RevertingFeeRecipient();
        DropFactory localFactory = new DropFactory(
            address(implementation),
            payable(address(revertingRecipient)),
            defaultProtocolFee
        );

        vm.prank(initialOwner);
        address dropAddress = localFactory.createDrop(
            editionSize,
            mintPrice,
            payoutRecipient,
            tokenUri,
            bytes32(0)
        );
        Drop1155 drop = Drop1155(dropAddress);

        uint256 exactCost = mintPrice + defaultProtocolFee;

        vm.prank(collector1);
        vm.expectRevert(Drop1155.ProtocolFeeTransferFailed.selector);
        drop.mint{value: exactCost}(1);

        assertEq(drop.totalMinted(), 0);
        assertEq(drop.balanceOf(collector1, drop.TOKEN_ID()), 0);
        assertEq(address(drop).balance, 0);
    }

    /// @dev Invariant: mintTo must reject address(0).
    function test_mintToZeroAddressReverts() public {
        vm.prank(initialOwner);
        address dropAddress = factory.createDrop(
            editionSize,
            mintPrice,
            payoutRecipient,
            tokenUri,
            bytes32(0)
        );
        Drop1155 drop = Drop1155(dropAddress);

        uint256 exactCost = mintPrice + defaultProtocolFee;

        vm.prank(collector1);
        vm.expectRevert(Drop1155.InvalidRecipient.selector);
        drop.mintTo{value: exactCost}(address(0), 1);
    }

    /// @dev Invariant: supply cap is exact; multi-quantity mints cannot cross editionSize.
    function test_soldOutBoundariesMultiQuantityMints() public {
        vm.prank(initialOwner);
        address dropAddress = factory.createDrop(
            5,
            mintPrice,
            payoutRecipient,
            tokenUri,
            bytes32(0)
        );
        Drop1155 drop = Drop1155(dropAddress);

        uint256 perTokenTotal = mintPrice + defaultProtocolFee;

        // Leave exactly 1 token remaining.
        vm.prank(collector1);
        drop.mint{value: perTokenTotal * 4}(4);
        assertEq(drop.totalMinted(), 4);

        // Crossing the boundary by quantity must revert.
        vm.prank(collector2);
        vm.expectRevert(Drop1155.SoldOut.selector);
        drop.mint{value: perTokenTotal * 2}(2);

        // Exact boundary fill succeeds.
        vm.prank(collector2);
        drop.mint{value: perTokenTotal}(1);
        assertEq(drop.totalMinted(), 5);

        // Sold out now; any additional mint reverts.
        vm.prank(collector1);
        vm.expectRevert(Drop1155.SoldOut.selector);
        drop.mint{value: perTokenTotal}(1);
    }

    /// @dev Invariant: creator cannot override per-drop protocolFeePerMint at create time.
    /// Since createDrop() doesn't accept a fee parameter and initialize() can only be called once,
    /// manual setup attempts with custom fees will revert.
    function test_cannotOverrideProtocolFeePerMint() public {
        vm.prank(initialOwner);
        address dropAddress = factory.createDrop(
            editionSize,
            mintPrice,
            payoutRecipient,
            tokenUri,
            bytes32(0)
        );
        Drop1155 drop = Drop1155(dropAddress);

        // Attempt to re-initialize the same drop clone with a different (0) fee
        vm.prank(initialOwner);
        vm.expectRevert(abi.encodeWithSignature("InvalidInitialization()"));
        drop.initialize(
            initialOwner,
            editionSize,
            mintPrice,
            payoutRecipient,
            protocolFeeRecipient,
            0, // Custom 0 fee spoof
            tokenUri,
            bytes32(0)
        );

        // Factory-enforced fee is completely intact
        assertEq(drop.protocolFeePerMint(), defaultProtocolFee);
    }

    /// @dev Invariant: fee updates only affect new drops. Old drops retain their initialized fee.
    function test_feeUpdatesOnlyAffectNewDrops() public {
        // 1. Create Drop A with initial fee
        vm.prank(initialOwner);
        address dropA = factory.createDrop(
            editionSize,
            mintPrice,
            payoutRecipient,
            tokenUri,
            bytes32(0)
        );
        assertEq(Drop1155(dropA).protocolFeePerMint(), defaultProtocolFee);

        // 2. Factory Owner updates the global fee
        uint256 newFee = 0.0002 ether;
        factory.setDefaultProtocolFeePerMint(newFee);
        assertEq(factory.defaultProtocolFeePerMint(), newFee);

        // 3. Drop A maintains the OLD fee
        assertEq(Drop1155(dropA).protocolFeePerMint(), defaultProtocolFee);

        // 4. Create Drop B and ensure it gets the NEW fee
        vm.prank(initialOwner);
        address dropB = factory.createDrop(
            editionSize,
            mintPrice,
            payoutRecipient,
            tokenUri,
            bytes32(0)
        );
        assertEq(Drop1155(dropB).protocolFeePerMint(), newFee);
    }

    /// @dev Invariant: lockedMessageCommitment is initialized exactly once and preserved.
    function test_lockedMessageCommitmentInitializationIntegrity() public {
        bytes32 commitment = keccak256("locked-message-commitment");

        vm.recordLogs();
        vm.prank(initialOwner);
        address dropAddress = factory.createDrop(
            editionSize,
            mintPrice,
            payoutRecipient,
            tokenUri,
            commitment
        );
        Drop1155 drop = Drop1155(dropAddress);

        assertEq(drop.lockedMessageCommitment(), commitment);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 eventSig = keccak256("LockedMessageCommitted(bytes32)");
        bool foundEvent = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == dropAddress && logs[i].topics.length > 0 && logs[i].topics[0] == eventSig) {
                assertEq(abi.decode(logs[i].data, (bytes32)), commitment);
                foundEvent = true;
                break;
            }
        }
        assertTrue(foundEvent, "missing LockedMessageCommitted event");

        vm.expectRevert(abi.encodeWithSignature("InvalidInitialization()"));
        drop.initialize(
            initialOwner,
            editionSize,
            mintPrice,
            payoutRecipient,
            protocolFeeRecipient,
            defaultProtocolFee,
            tokenUri,
            bytes32(uint256(123))
        );
    }
}
