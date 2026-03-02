// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IDrop1155 {
    function initialize(
        address initialOwner,
        uint256 editionSize,
        uint256 mintPrice,
        address payable payoutRecipient,
        address payable protocolFeeRecipient,
        uint256 protocolFeePerMint,
        string calldata tokenUri,
        bytes32 lockedMessageCommitment
    ) external;
}

contract DropFactory is Ownable {
    using Clones for address;

    // --- State ---
    address public implementation;

    address payable public protocolFeeRecipient;
    uint256 public defaultProtocolFeePerMint;

    // --- Events ---
    event DropCreated(
        address indexed creator,
        address indexed drop,
        uint256 editionSize,
        uint256 mintPrice,
        address payoutRecipient,
        address protocolFeeRecipient,
        uint256 protocolFeePerMint,
        string tokenUri
    );

    event ImplementationUpdated(address indexed newImplementation);
    event ProtocolFeeRecipientUpdated(address indexed newRecipient);
    event DefaultProtocolFeeUpdated(uint256 newFee);

    // --- Errors ---
    error ZeroAddress();

    constructor(
        address implementation_,
        address payable protocolFeeRecipient_,
        uint256 defaultProtocolFeePerMint_
    ) Ownable(msg.sender) {
        if (implementation_ == address(0)) revert ZeroAddress();
        if (protocolFeeRecipient_ == address(0)) revert ZeroAddress();

        implementation = implementation_;
        protocolFeeRecipient = protocolFeeRecipient_;
        defaultProtocolFeePerMint = defaultProtocolFeePerMint_;
    }

    /**
     * @notice Create a new Drop1155 clone and initialize it.
     * @param editionSize Max supply (Drop enforces 1..10,000)
     * @param mintPrice Price per token (wei)
     * @param payoutRecipient Creator proceeds destination (withdraw())
     * @param tokenUri Frozen metadata URI for tokenId=1
     * @param lockedMessageCommitment Hash of the locked premium content
     */
    function createDrop(
        uint256 editionSize,
        uint256 mintPrice,
        address payable payoutRecipient,
        string calldata tokenUri,
        bytes32 lockedMessageCommitment
    ) external returns (address drop) {
        drop = Clones.clone(implementation);

        IDrop1155(drop).initialize(
            msg.sender,                 // initialOwner
            editionSize,
            mintPrice,
            payoutRecipient,
            protocolFeeRecipient,
            defaultProtocolFeePerMint,  // always use factory default (not creator-configurable)
            tokenUri,
            lockedMessageCommitment
        );

        emit DropCreated(
            msg.sender,
            drop,
            editionSize,
            mintPrice,
            payoutRecipient,
            protocolFeeRecipient,
            defaultProtocolFeePerMint,
            tokenUri
        );
    }

    // --- Admin controls (optional but useful for ops) ---

    function setImplementation(address newImplementation) external onlyOwner {
        if (newImplementation == address(0)) revert ZeroAddress();
        implementation = newImplementation;
        emit ImplementationUpdated(newImplementation);
    }

    function setProtocolFeeRecipient(address payable newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        protocolFeeRecipient = newRecipient;
        emit ProtocolFeeRecipientUpdated(newRecipient);
    }

    function setDefaultProtocolFeePerMint(uint256 newFee) external onlyOwner {
        defaultProtocolFeePerMint = newFee;
        emit DefaultProtocolFeeUpdated(newFee);
    }
}