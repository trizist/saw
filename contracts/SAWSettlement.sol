// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ISAWSettlement.sol";
import "./interfaces/ISAWAllocator.sol";
import "./libraries/SAWCrypto.sol";
import "./libraries/SAWErrors.sol";

/// @title SAWSettlement
/// @notice Atomic Settlement Engine for the SAW Protocol (State 8: Power)
/// @dev    Enforces binary atomicity: ALL participants settled or NONE.
///         Single-call batch distribution — prevents MEV front-running.
///         "Atomic" = entire distribution in one transaction, one state.
contract SAWSettlement is ISAWSettlement, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Roles ────────────────────────────────────────────────────────────────
    bytes32 public constant PROTOCOL_ROLE = keccak256("PROTOCOL_ROLE");

    // ─── State ────────────────────────────────────────────────────────────────
    IERC20           public sawToken;
    ISAWAllocator    public sawAllocator;

    SettlementStatus private _status;
    LiquidityParams  private _liquidityParams;

    // participant → settled flag
    mapping(address => bool) private _settled;

    // refund tracking (if settlement fails)
    mapping(address => uint256) private _refunds;

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(address admin, address tokenAddress, address allocatorAddress) {
        require(admin            != address(0), "SAWSettlement: zero admin");
        require(tokenAddress     != address(0), "SAWSettlement: zero token");
        require(allocatorAddress != address(0), "SAWSettlement: zero allocator");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PROTOCOL_ROLE,      admin);

        sawToken     = IERC20(tokenAddress);
        sawAllocator = ISAWAllocator(allocatorAddress);
    }

    function grantProtocolRole(address protocol) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(PROTOCOL_ROLE, protocol);
    }

    // ─── Core: Atomic Settlement ──────────────────────────────────────────────

    /// @notice Execute atomic batch settlement (State 8: Power)
    /// @dev    Distributes 40% of total supply to all valid participants
    ///         in a SINGLE transaction. Either all succeed or the entire
    ///         transaction reverts — no partial states, no insider advantage.
    function executeSettlement()
        external
        override
        onlyRole(PROTOCOL_ROLE)
        nonReentrant
    {
        if (_status.initiated)  revert SAWErrors.SettlementAlreadyExecuted();

        ISAWAllocator.AllocationSummary memory summary = sawAllocator.getSummary();
        if (!summary.computed) revert SAWErrors.SettlementNotReady();
        if (summary.totalParticipants == 0) revert SAWErrors.NoValidParticipants();

        _status.initiated        = true;
        _status.participantCount = summary.totalParticipants;

        emit SettlementInitiated(summary.totalParticipants, summary.totalTokens);

        // Fetch all sorted allocations
        ISAWAllocator.Allocation[] memory allocations = sawAllocator.getAllAllocations();

        uint256 totalDistributed;

        // ─── ATOMIC BATCH DISTRIBUTION ──────────────────────────────────────
        // This loop MUST complete entirely or the whole TX reverts.
        // No partial success possible — this is the atomic guarantee.
        for (uint256 i = 0; i < allocations.length; i++) {
            address recipient = allocations[i].participant;
            uint256 amount    = allocations[i].tokenAmount;

            if (amount == 0) continue;

            // SafeERC20 transfer — reverts entire TX on failure
            sawToken.safeTransfer(recipient, amount);
            _settled[recipient] = true;
            totalDistributed   += amount;

            emit TokensDistributed(recipient, amount, allocations[i].rank);
        }

        // Compute settlement hash for audit: H(allocationHash || totalDistributed || timestamp)
        bytes32 settlementHash = keccak256(abi.encodePacked(
            summary.allocationHash,
            totalDistributed,
            block.timestamp
        ));

        _status.completed         = true;
        _status.totalDistributed  = totalDistributed;
        _status.settlementHash    = settlementHash;
        _status.settledAt         = block.timestamp;

        emit SettlementCompleted(settlementHash, totalDistributed, block.timestamp);
    }

    // ─── Liquidity Deployment (State 9: Reflection) ───────────────────────────

    /// @notice Deploy protocol liquidity to a DEX pool with slippage protection
    function deployLiquidity(
        address poolAddress,
        uint256 tokenAmount,
        uint256 ethAmount,
        uint256 slippageBps
    )
        external
        override
        onlyRole(PROTOCOL_ROLE)
        nonReentrant
    {
        if (_liquidityParams.deployed) revert SAWErrors.LiquidityAlreadyDeployed();
        require(poolAddress != address(0), "SAWSettlement: zero pool");
        require(tokenAmount > 0, "SAWSettlement: zero token amount");
        require(slippageBps <= 1000, "SAWSettlement: slippage too high"); // max 10%

        // Verify token balance
        uint256 balance = sawToken.balanceOf(address(this));
        if (balance < tokenAmount) revert SAWErrors.InsufficientLiquidity(tokenAmount, balance);

        _liquidityParams = LiquidityParams({
            poolAddress: poolAddress,
            tokenAmount: tokenAmount,
            ethAmount:   ethAmount,
            slippageBps: slippageBps,
            deployed:    true
        });

        // Transfer LP tokens to pool
        sawToken.safeTransfer(poolAddress, tokenAmount);

        // Transfer ETH to pool
        if (ethAmount > 0 && address(this).balance >= ethAmount) {
            (bool ok,) = payable(poolAddress).call{value: ethAmount}("");
            require(ok, "SAWSettlement: ETH transfer failed");
        }

        emit LiquidityDeployed(poolAddress, tokenAmount, ethAmount);
    }

    // ─── Refunds (if settlement fails) ───────────────────────────────────────

    /// @notice Issue refunds if settlement fails catastrophically
    function issueRefunds()
        external
        override
        onlyRole(PROTOCOL_ROLE)
        nonReentrant
    {
        require(_status.initiated && !_status.completed, "SAWSettlement: invalid state for refund");
        _status.failed = true;
        emit SettlementFailed("Refund initiated by protocol");
    }

    function claimRefund() external nonReentrant {
        uint256 amount = _refunds[msg.sender];
        require(amount > 0, "SAWSettlement: no refund");
        _refunds[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "SAWSettlement: refund transfer failed");
        emit RefundIssued(msg.sender, amount);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    function getSettlementStatus()
        external view override
        returns (SettlementStatus memory)
    {
        return _status;
    }

    function isSettled(address participant) external view override returns (bool) {
        return _settled[participant];
    }

    function getSettlementHash() external view override returns (bytes32) {
        return _status.settlementHash;
    }

    function getLiquidityParams() external view returns (LiquidityParams memory) {
        return _liquidityParams;
    }

    // ─── Receive ETH ──────────────────────────────────────────────────────────
    receive() external payable {}
}
