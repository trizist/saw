// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISAWSettlement
/// @notice Interface for the SAW Protocol atomic settlement engine
/// @dev Enforces all-or-nothing batch distribution — "atomic" binary outcome
interface ISAWSettlement {

    // ─── Structs ──────────────────────────────────────────────────────────────

    /// @notice Settlement status tracker
    struct SettlementStatus {
        bool initiated;
        bool completed;
        bool failed;
        uint256 totalDistributed;   // Total tokens sent
        uint256 participantCount;
        bytes32 settlementHash;     // Post-settlement verification hash
        uint256 settledAt;          // Block timestamp
    }

    /// @notice Liquidity deployment parameters
    struct LiquidityParams {
        address poolAddress;        // DEX pool address
        uint256 tokenAmount;        // Tokens for LP (10% of supply)
        uint256 ethAmount;          // ETH for LP (from commitments)
        uint256 slippageBps;        // Max slippage in basis points (e.g. 100 = 1%)
        bool deployed;
    }

    // ─── Events ───────────────────────────────────────────────────────────────

    event SettlementInitiated(uint256 participantCount, uint256 totalTokens);
    event SettlementCompleted(bytes32 settlementHash, uint256 totalDistributed, uint256 timestamp);
    event SettlementFailed(string reason);
    event TokensDistributed(address indexed recipient, uint256 amount, uint256 rank);
    event LiquidityDeployed(address indexed pool, uint256 tokenAmount, uint256 ethAmount);
    event RefundIssued(address indexed participant, uint256 ethAmount);

    // ─── Core Settlement ──────────────────────────────────────────────────────

    /// @notice Execute atomic batch settlement (State 8: Power)
    /// @dev Either ALL participants receive tokens or NONE do — atomic guarantee
    function executeSettlement() external;

    /// @notice Deploy liquidity to DEX (State 9: Reflection)
    function deployLiquidity(
        address poolAddress,
        uint256 tokenAmount,
        uint256 ethAmount,
        uint256 slippageBps
    ) external;

    /// @notice Issue refunds if settlement fails
    function issueRefunds() external;

    // ─── Status Queries ───────────────────────────────────────────────────────

    /// @notice Get the current settlement status
    function getSettlementStatus() external view returns (SettlementStatus memory);

    /// @notice Check if a participant has received their tokens
    function isSettled(address participant) external view returns (bool);

    /// @notice Get settlement hash for audit verification
    function getSettlementHash() external view returns (bytes32);
}
