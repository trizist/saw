// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SAWErrors
/// @notice Custom error definitions for the SAW Protocol (gas-efficient reverts)
library SAWErrors {

    // ─── State Machine Errors ─────────────────────────────────────────────────
    error InvalidStateTransition(uint8 from, uint8 to);
    error NotInRequiredState(uint8 required, uint8 current);
    error StateLocked(uint8 state);
    error CeremonyAlreadyFinalized();

    // ─── Commitment Errors ────────────────────────────────────────────────────
    error CommitmentWindowClosed();
    error CommitmentWindowNotClosed();
    error AlreadyCommitted(address participant);
    error NoCommitmentFound(address participant);
    error InvalidCommitmentHash();
    error RevealWindowClosed();
    error AlreadyRevealed(address participant);
    error CommitRevealMismatch(address participant);
    error ZeroAmountCommitment();

    // ─── Entropy Errors ───────────────────────────────────────────────────────
    error EntropyAlreadyLocked();
    error EntropyNotLocked();
    error EntropyNotFinalized();
    error FutureBlockNotMined(uint256 targetBlock, uint256 currentBlock);
    error InvalidEntropySource();

    // ─── Timestamp Errors ─────────────────────────────────────────────────────
    error QuantumTimestampAlreadySet();
    error QuantumTimestampNotSet();
    error TimestampDataStale(uint256 provided, uint256 current);

    // ─── Settlement Errors ────────────────────────────────────────────────────
    error SettlementAlreadyExecuted();
    error SettlementNotReady();
    error AtomicSettlementFailed(address participant);
    error LiquidityAlreadyDeployed();
    error InsufficientLiquidity(uint256 required, uint256 available);
    error SlippageExceeded(uint256 expected, uint256 actual);

    // ─── Allocation Errors ────────────────────────────────────────────────────
    error AllocationNotComputed();
    error AllocationAlreadyComputed();
    error NoValidParticipants();
    error ParticipantNotFound(address participant);
    error AllocationHashMismatch(bytes32 expected, bytes32 actual);

    // ─── Governance Errors ────────────────────────────────────────────────────
    error GovernanceNotActivated();
    error GovernanceAlreadyActive();
    error PurityNotSealed();
    error InvalidProposalId(uint256 id);
    error VotingPeriodEnded(uint256 proposalId);
    error VotingPeriodNotEnded(uint256 proposalId);
    error AlreadyVoted(address voter, uint256 proposalId);
    error ProposalNotSucceeded(uint256 proposalId);
    error UnauthorizedTreasuryPurpose(string purpose);
    error TreasuryInsufficientFunds(uint256 requested, uint256 available);

    // ─── Access Errors ────────────────────────────────────────────────────────
    error Unauthorized(address caller);
    error OnlyProtocolRole(address caller);
    error OnlyOwner(address caller);
}
