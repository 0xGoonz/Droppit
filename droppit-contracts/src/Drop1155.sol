// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract Drop1155 is ERC1155Upgradeable, OwnableUpgradeable, ReentrancyGuard {
    // --- Constants ---
    uint256 public constant TOKEN_ID = 1;
    uint256 public constant MAX_EDITION_SIZE = 10_000;

    // --- Immutable-after-init storage (no setters) ---
    uint256 public editionSize;          // hard cap
    uint256 public mintPrice;            // price per token (wei)
    uint256 public totalMinted;          // total minted so far

    address payable public payoutRecipient;      // withdraw destination (creator proceeds)
    address payable public protocolFeeRecipient; // protocol fee destination
    uint256 public protocolFeePerMint;           // flat wei amount per mint (NOT %)

    address public factory;              // factory that initialized this clone
    string private _tokenUri;            // frozen token URI for TOKEN_ID
    bytes32 public lockedMessageCommitment; // hash of the locked message

    // --- Events ---
    event Mint(address indexed to, uint256 quantity, uint256 totalCost);
    event Withdraw(address indexed payoutRecipient, uint256 amount);
    event LockedMessageCommitted(bytes32 commitment);

    // --- Errors (gas-friendly) ---
    error InvalidEditionSize();
    error InvalidRecipient();
    error InvalidTokenId();
    error InvalidQuantity();
    error SoldOut();
    error IncorrectPayment();
    error ProtocolFeeTransferFailed();
    error WithdrawFailed();

    /// @dev Lock the implementation contract (best practice for clones).
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the drop. Intended to be called exactly once by the factory on a fresh clone.
     * @param initialOwner Owner of this drop (creator / admin)
     * @param editionSize_ Max supply, must be 1..10,000
     * @param mintPrice_ Price per token in wei
     * @param payoutRecipient_ Where creator proceeds are withdrawn to (fixed)
     * @param protocolFeeRecipient_ Where protocol fees are sent to during mint
     * @param protocolFeePerMint_ Flat wei protocol fee per mint (not %)
     * @param tokenUri_ Frozen metadata URI for TOKEN_ID
     * @param lockedMessageCommitment_ Hash of the locked premium content
     */
    function initialize(
        address initialOwner,
        uint256 editionSize_,
        uint256 mintPrice_,
        address payable payoutRecipient_,
        address payable protocolFeeRecipient_,
        uint256 protocolFeePerMint_,
        string calldata tokenUri_,
        bytes32 lockedMessageCommitment_
    ) external initializer {
        if (initialOwner == address(0)) revert InvalidRecipient();
        if (payoutRecipient_ == address(0)) revert InvalidRecipient();
        if (protocolFeeRecipient_ == address(0)) revert InvalidRecipient();
        if (editionSize_ == 0 || editionSize_ > MAX_EDITION_SIZE) revert InvalidEditionSize();
        if (bytes(tokenUri_).length == 0) revert InvalidRecipient(); // reuse error (keeps ABI small)

        __ERC1155_init("");
        __Ownable_init(initialOwner);

        factory = msg.sender;

        editionSize = editionSize_;
        mintPrice = mintPrice_;
        payoutRecipient = payoutRecipient_;
        protocolFeeRecipient = protocolFeeRecipient_;
        protocolFeePerMint = protocolFeePerMint_;

        _tokenUri = tokenUri_;
        lockedMessageCommitment = lockedMessageCommitment_;
        
        emit LockedMessageCommitted(lockedMessageCommitment_);
    }

    // --- Public minting ---

    function mint(uint256 quantity) external payable nonReentrant {
        _mintInternal(msg.sender, quantity);
    }

    function mintTo(address to, uint256 quantity) external payable nonReentrant {
        if (to == address(0)) revert InvalidRecipient();
        _mintInternal(to, quantity);
    }

    // --- Withdraw ---

    /**
     * @notice Withdraws all remaining ETH (creator proceeds) to payoutRecipient.
     * @dev Protocol fees are sent during mint; this withdraw is pull-based for proceeds.
     */
    function withdraw() external nonReentrant onlyOwner {
        uint256 amount = address(this).balance;
        if (amount == 0) {
            emit Withdraw(payoutRecipient, 0);
            return;
        }

        (bool ok, ) = payoutRecipient.call{value: amount}("");
        if (!ok) revert WithdrawFailed();

        emit Withdraw(payoutRecipient, amount);
    }

    // --- Metadata ---

    function uri(uint256 id) public view override returns (string memory) {
        if (id != TOKEN_ID) revert InvalidTokenId();
        return _tokenUri;
    }

    // --- Internal ---

    function _mintInternal(address to, uint256 quantity) internal {
        if (quantity == 0) revert InvalidQuantity();

        uint256 minted = totalMinted;
        if (minted + quantity > editionSize) revert SoldOut();

        // exact payment required
        uint256 perTokenTotal = mintPrice + protocolFeePerMint;
        uint256 totalCost = perTokenTotal * quantity;
        if (msg.value != totalCost) revert IncorrectPayment();

        // Effects
        totalMinted = minted + quantity;

        // Mint (single token id)
        _mint(to, TOKEN_ID, quantity, "");

        // Interactions: forward protocol fee immediately; revert if transfer fails
        uint256 protocolFee = protocolFeePerMint * quantity;
        if (protocolFee != 0) {
            (bool ok, ) = protocolFeeRecipient.call{value: protocolFee}("");
            if (!ok) revert ProtocolFeeTransferFailed();
        }

        emit Mint(to, quantity, totalCost);
    }
}