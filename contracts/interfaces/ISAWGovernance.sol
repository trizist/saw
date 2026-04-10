// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISAWGovernance
/// @notice Interface for the SAW Protocol DAO governance (State 12: Transcendence)
/// @dev Quadratic voting + multi-sig treasury + token-weighted emissions
interface ISAWGovernance {

    // ─── Enums ────────────────────────────────────────────────────────────────

    enum ProposalState {
        PENDING,
        ACTIVE,
        DEFEATED,
        SUCCEEDED,
        QUEUED,
        EXECUTED,
        CANCELLED
    }

    enum VoteType {
        AGAINST,
        FOR,
        ABSTAIN
    }

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct Proposal {
        uint256 id;
        address proposer;
        string description;
        bytes[] calldatas;
        address[] targets;
        uint256[] values;
        uint256 startBlock;
        uint256 endBlock;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        ProposalState state;
        bytes32 stateHash;     // Must follow SAW commit-reveal pattern for upgrades
    }

    struct TreasuryAction {
        address recipient;
        uint256 amount;
        string purpose;        // Must be: "audit", "infrastructure", or "pq-upgrade"
        bool executed;
    }

    // ─── Events ───────────────────────────────────────────────────────────────

    event ProposalCreated(uint256 indexed proposalId, address proposer, string description);
    event VoteCast(address indexed voter, uint256 proposalId, VoteType support, uint256 weight);
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalCancelled(uint256 indexed proposalId);
    event EmissionsDistributed(address indexed recipient, uint256 amount);
    event TreasuryActionExecuted(uint256 indexed actionId, address recipient, uint256 amount);
    event GovernanceActivated(bytes32 finalStateHash, uint256 timestamp);

    // ─── Governance Activation ────────────────────────────────────────────────

    /// @notice Activate governance — can only be called after Purity state is sealed
    function activateGovernance(bytes32 finalStateHash) external;

    /// @notice Check if governance is active
    function isGovernanceActive() external view returns (bool);

    // ─── Proposals ────────────────────────────────────────────────────────────

    /// @notice Create a new governance proposal
    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) external returns (uint256 proposalId);

    /// @notice Cast a vote with quadratic weight
    function castVote(uint256 proposalId, VoteType support) external;

    /// @notice Execute a successful proposal
    function execute(uint256 proposalId) external;

    /// @notice Cancel a proposal
    function cancel(uint256 proposalId) external;

    /// @notice Get proposal state
    function getProposalState(uint256 proposalId) external view returns (ProposalState);

    // ─── Treasury ─────────────────────────────────────────────────────────────

    /// @notice Request treasury funds (must be for audit/infrastructure/pq-upgrade)
    function requestTreasuryFunds(
        address recipient,
        uint256 amount,
        string calldata purpose
    ) external returns (uint256 actionId);

    /// @notice Get treasury balance
    function getTreasuryBalance() external view returns (uint256);

    // ─── Emissions ────────────────────────────────────────────────────────────

    /// @notice Distribute governance emissions per deterministic ordering
    function distributeEmissions(address[] calldata recipients, uint256[] calldata amounts) external;
}
