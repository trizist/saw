// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISAWAllocator
/// @notice Interface for the SAW Protocol fair ordering and allocation engine
/// @dev Implements deterministic sorting: Order_i = H(E || wallet_i)
interface ISAWAllocator {

    // ─── Structs ──────────────────────────────────────────────────────────────

    /// @notice Per-participant allocation result
    struct Allocation {
        address participant;    // Wallet address
        uint256 amount;         // Committed ETH amount (revealed)
        uint256 weight;         // Normalized allocation weight
        bytes32 orderKey;       // Order_i = H(E || wallet_i)
        uint256 rank;           // Ascending sort position (1-based)
        uint256 tokenAmount;    // Final token allocation
        bool settled;           // Whether tokens have been transferred
    }

    /// @notice Allocation summary for the entire pool
    struct AllocationSummary {
        uint256 totalParticipants;
        uint256 totalCommitted;    // Total ETH committed
        uint256 totalTokens;       // Total tokens to distribute (40% of supply)
        bytes32 allocationHash;    // H(all allocations) for audit
        bool computed;
    }

    // ─── Events ───────────────────────────────────────────────────────────────

    event AllocationComputed(address indexed participant, uint256 rank, uint256 tokenAmount);
    event AllocationFinalized(bytes32 allocationHash, uint256 totalParticipants);
    event WeightsCalculated(uint256 totalParticipants, uint256 totalCommitted);

    // ─── Core Allocation ──────────────────────────────────────────────────────

    /// @notice Compute deterministic order keys for all participants
    /// @param entropy The finalized entropy seed E
    /// @param participants Array of valid participant addresses
    function computeOrderKeys(bytes32 entropy, address[] calldata participants) external;

    /// @notice Calculate token allocation weights and amounts
    /// @param amounts Array of committed amounts per participant (indexed by participant order)
    /// @param totalTokens Total tokens available for distribution
    function calculateAllocations(uint256[] calldata amounts, uint256 totalTokens) external;

    /// @notice Get the sorted allocation for a participant
    function getAllocation(address participant) external view returns (Allocation memory);

    /// @notice Get all allocations sorted by rank (ascending)
    function getAllAllocations() external view returns (Allocation[] memory);

    /// @notice Get allocation summary
    function getSummary() external view returns (AllocationSummary memory);

    /// @notice Compute the allocation hash for audit
    /// @return H(concatenated allocation data)
    function computeAllocationHash() external view returns (bytes32);

    // ─── Verification ─────────────────────────────────────────────────────────

    /// @notice Verify a participant's order key on-chain
    /// @param entropy The finalized entropy E
    /// @param participant The wallet address
    /// @return orderKey The expected Order_i = H(E || wallet_i)
    function verifyOrderKey(bytes32 entropy, address participant) external pure returns (bytes32);

    /// @notice Verify the full allocation is correct for audit
    function verifyAllocations(bytes32 entropy) external view returns (bool);
}
