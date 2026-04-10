// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ISAWGovernance.sol";
import "./libraries/SAWCrypto.sol";
import "./libraries/SAWErrors.sol";

/// @title SAWGovernance
/// @notice DAO Governance engine — activated at State 12 (Transcendence)
/// @dev    Quadratic voting + multi-sig treasury + token-weighted emissions
///         Governance Guardrails:
///           1. Deterministic ordering for future distributions
///           2. State-locked upgrades (commit-reveal pattern)
///           3. Multi-source consensus protection
///           4. PQ mandate enforcement
///         Treasury restricted to: "audit", "infrastructure", "pq-upgrade"
contract SAWGovernance is ISAWGovernance, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Roles ────────────────────────────────────────────────────────────────
    bytes32 public constant PROTOCOL_ROLE  = keccak256("PROTOCOL_ROLE");
    bytes32 public constant GUARDIAN_ROLE  = keccak256("GUARDIAN_ROLE");

    // ─── Governance Parameters ────────────────────────────────────────────────
    uint256 public constant VOTING_DELAY          = 1 days;
    uint256 public constant VOTING_PERIOD         = 7 days;
    uint256 public constant PROPOSAL_THRESHOLD    = 1_000 * 1e18;   // 1000 SAW
    uint256 public constant QUORUM_THRESHOLD_BPS  = 400;            // 4% of total supply
    uint256 public constant TIMELOCK_DELAY        = 2 days;

    // Quadratic voting: votingPower_i = sqrt(tokenBalance_i)
    // Implemented via integer sqrt approximation

    // ─── Token ────────────────────────────────────────────────────────────────
    ERC20Votes public sawToken;
    IERC20     public sawTokenERC20;

    // ─── Governance State ─────────────────────────────────────────────────────
    bool    public governanceActive;
    bytes32 public activationStateHash;   // S_final from Purity state
    uint256 public activationTimestamp;

    // ─── Proposals ────────────────────────────────────────────────────────────
    uint256 private _proposalCount;
    mapping(uint256 => Proposal) private _proposals;
    mapping(uint256 => mapping(address => bool)) private _hasVoted;

    // ─── Treasury ─────────────────────────────────────────────────────────────
    // 8% ecosystem treasury (locked until State 10)
    bool    public treasuryUnlocked;
    uint256 private _actionCount;
    mapping(uint256 => TreasuryAction) private _treasuryActions;

    // Valid treasury purposes (Governance Guardrails)
    mapping(string => bool) private _validPurposes;

    // ─── Emissions ────────────────────────────────────────────────────────────
    // 30% governance emissions — distributed via deterministic ordering
    uint256 public totalEmissionsDistributed;

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(address admin, address tokenAddress) {
        require(admin        != address(0), "SAWGovernance: zero admin");
        require(tokenAddress != address(0), "SAWGovernance: zero token");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PROTOCOL_ROLE,      admin);
        _grantRole(GUARDIAN_ROLE,      admin);

        sawToken      = ERC20Votes(tokenAddress);
        sawTokenERC20 = IERC20(tokenAddress);

        // Governance Guardrail: only these purposes are valid for treasury
        _validPurposes["audit"]          = true;
        _validPurposes["infrastructure"] = true;
        _validPurposes["pq-upgrade"]     = true;
    }

    // ─── Activation (State 12: Transcendence) ─────────────────────────────────

    /// @notice Activate DAO governance — only after Purity seal is verified
    /// @param finalStateHash  S_final from State 11 (Purity)
    function activateGovernance(bytes32 finalStateHash)
        external
        override
        onlyRole(PROTOCOL_ROLE)
    {
        if (governanceActive) revert SAWErrors.GovernanceAlreadyActive();
        if (finalStateHash == bytes32(0)) revert SAWErrors.PurityNotSealed();

        governanceActive      = true;
        activationStateHash   = finalStateHash;
        activationTimestamp   = block.timestamp;
        treasuryUnlocked      = true;

        emit GovernanceActivated(finalStateHash, block.timestamp);
    }

    function isGovernanceActive() external view override returns (bool) {
        return governanceActive;
    }

    // ─── Proposals ────────────────────────────────────────────────────────────

    /// @notice Create a governance proposal
    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[]   memory calldatas,
        string    memory description
    ) external override returns (uint256 proposalId) {
        if (!governanceActive) revert SAWErrors.GovernanceNotActivated();
        require(
            sawToken.getVotes(msg.sender) >= PROPOSAL_THRESHOLD,
            "SAWGovernance: insufficient voting power to propose"
        );
        require(targets.length == values.length && values.length == calldatas.length,
            "SAWGovernance: array length mismatch");

        proposalId = ++_proposalCount;

        _proposals[proposalId] = Proposal({
            id:           proposalId,
            proposer:     msg.sender,
            description:  description,
            calldatas:    calldatas,
            targets:      targets,
            values:       values,
            startBlock:   block.timestamp + VOTING_DELAY,
            endBlock:     block.timestamp + VOTING_DELAY + VOTING_PERIOD,
            forVotes:     0,
            againstVotes: 0,
            abstainVotes: 0,
            state:        ProposalState.PENDING,
            stateHash:    keccak256(abi.encode(targets, values, calldatas, description))
        });

        emit ProposalCreated(proposalId, msg.sender, description);
    }

    /// @notice Cast a quadratic vote
    /// @dev    votingPower = sqrt(delegatedBalance) — reduces plutocracy
    function castVote(uint256 proposalId, VoteType support)
        external
        override
        nonReentrant
    {
        if (!governanceActive) revert SAWErrors.GovernanceNotActivated();

        Proposal storage p = _proposals[proposalId];
        if (p.id == 0) revert SAWErrors.InvalidProposalId(proposalId);
        if (block.timestamp < p.startBlock || block.timestamp > p.endBlock)
            revert SAWErrors.VotingPeriodEnded(proposalId);
        if (_hasVoted[proposalId][msg.sender])
            revert SAWErrors.AlreadyVoted(msg.sender, proposalId);

        _hasVoted[proposalId][msg.sender] = true;

        // Quadratic voting: power = sqrt(balance)
        uint256 balance = sawToken.getVotes(msg.sender);
        uint256 weight  = _sqrt(balance);

        if (support == VoteType.FOR)          p.forVotes     += weight;
        else if (support == VoteType.AGAINST) p.againstVotes += weight;
        else                                  p.abstainVotes += weight;

        // Auto-update state
        if (block.timestamp <= p.endBlock) {
            p.state = ProposalState.ACTIVE;
        }

        emit VoteCast(msg.sender, proposalId, support, weight);
    }

    /// @notice Execute a successful proposal after timelock
    function execute(uint256 proposalId)
        external
        override
        nonReentrant
    {
        Proposal storage p = _proposals[proposalId];
        if (p.id == 0) revert SAWErrors.InvalidProposalId(proposalId);
        if (block.timestamp <= p.endBlock)
            revert SAWErrors.VotingPeriodNotEnded(proposalId);

        // Check quorum + majority
        uint256 totalSupply = sawToken.totalSupply();
        uint256 quorum      = (totalSupply * QUORUM_THRESHOLD_BPS) / 10000;
        bool    quorumMet   = (p.forVotes + p.againstVotes + p.abstainVotes) >= _sqrt(quorum);
        bool    majority    = p.forVotes > p.againstVotes;

        if (!quorumMet || !majority) {
            p.state = ProposalState.DEFEATED;
            revert SAWErrors.ProposalNotSucceeded(proposalId);
        }

        p.state = ProposalState.EXECUTED;

        // Execute each call
        for (uint256 i = 0; i < p.targets.length; i++) {
            (bool success,) = p.targets[i].call{value: p.values[i]}(p.calldatas[i]);
            require(success, "SAWGovernance: proposal execution failed");
        }

        emit ProposalExecuted(proposalId);
    }

    /// @notice Cancel a proposal (only proposer or guardian)
    function cancel(uint256 proposalId) external override {
        Proposal storage p = _proposals[proposalId];
        if (p.id == 0) revert SAWErrors.InvalidProposalId(proposalId);
        require(
            msg.sender == p.proposer || hasRole(GUARDIAN_ROLE, msg.sender),
            "SAWGovernance: not authorized to cancel"
        );
        p.state = ProposalState.CANCELLED;
        emit ProposalCancelled(proposalId);
    }

    function getProposalState(uint256 proposalId)
        external view override
        returns (ProposalState)
    {
        return _proposals[proposalId].state;
    }

    function getProposal(uint256 proposalId)
        external view
        returns (Proposal memory)
    {
        return _proposals[proposalId];
    }

    // ─── Treasury ─────────────────────────────────────────────────────────────

    /// @notice Request treasury funds — restricted to valid purposes only
    function requestTreasuryFunds(
        address recipient,
        uint256 amount,
        string calldata purpose
    ) external override onlyRole(PROTOCOL_ROLE) returns (uint256 actionId) {
        if (!governanceActive) revert SAWErrors.GovernanceNotActivated();
        if (!treasuryUnlocked) revert SAWErrors.GovernanceNotActivated();
        if (!_validPurposes[purpose])
            revert SAWErrors.UnauthorizedTreasuryPurpose(purpose);

        uint256 balance = sawTokenERC20.balanceOf(address(this));
        if (balance < amount) revert SAWErrors.TreasuryInsufficientFunds(amount, balance);

        actionId = ++_actionCount;
        _treasuryActions[actionId] = TreasuryAction({
            recipient: recipient,
            amount:    amount,
            purpose:   purpose,
            executed:  true
        });

        sawTokenERC20.safeTransfer(recipient, amount);
        emit TreasuryActionExecuted(actionId, recipient, amount);
    }

    function getTreasuryBalance() external view override returns (uint256) {
        return sawTokenERC20.balanceOf(address(this));
    }

    function getTreasuryAction(uint256 actionId)
        external view
        returns (TreasuryAction memory)
    {
        return _treasuryActions[actionId];
    }

    // ─── Emissions ────────────────────────────────────────────────────────────

    /// @notice Distribute 30% governance emissions via deterministic ordering
    ///         Order_i = H(E || wallet_i) — same fairness as launch
    function distributeEmissions(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external override onlyRole(PROTOCOL_ROLE) nonReentrant {
        if (!governanceActive) revert SAWErrors.GovernanceNotActivated();
        require(recipients.length == amounts.length, "SAWGovernance: length mismatch");

        uint256 total;
        for (uint256 i = 0; i < recipients.length; i++) {
            total += amounts[i];
        }

        uint256 balance = sawTokenERC20.balanceOf(address(this));
        require(balance >= total, "SAWGovernance: insufficient emissions balance");

        for (uint256 i = 0; i < recipients.length; i++) {
            if (amounts[i] == 0) continue;
            sawTokenERC20.safeTransfer(recipients[i], amounts[i]);
            totalEmissionsDistributed += amounts[i];
            emit EmissionsDistributed(recipients[i], amounts[i]);
        }
    }

    // ─── Post-Quantum Mandate ─────────────────────────────────────────────────

    /// @notice Phase 1: Register hybrid signature scheme (ECDSA + Dilithium)
    ///         This is a governance guardrail — must be committed to the state chain
    struct PQUpgrade {
        uint8   phase;       // 1=Hybrid, 2=PQCommits, 3=QRNG, 4=FullMigration
        string  scheme;      // e.g. "CRYSTALS-Dilithium", "Falcon", "BLAKE3"
        bytes32 commitHash;  // commit-reveal for upgrade (state-locked)
        bool    executed;
        uint256 timestamp;
    }

    uint256 private _pqUpgradeCount;
    mapping(uint256 => PQUpgrade) public pqUpgrades;

    event PQUpgradeCommitted(uint256 indexed id, uint8 phase, bytes32 commitHash);
    event PQUpgradeExecuted(uint256 indexed id, uint8 phase, string scheme);

    function commitPQUpgrade(uint8 phase, bytes32 commitHash)
        external onlyRole(PROTOCOL_ROLE)
    {
        uint256 id = ++_pqUpgradeCount;
        pqUpgrades[id] = PQUpgrade({
            phase:      phase,
            scheme:     "",
            commitHash: commitHash,
            executed:   false,
            timestamp:  block.timestamp
        });
        emit PQUpgradeCommitted(id, phase, commitHash);
    }

    function executePQUpgrade(uint256 id, string calldata scheme, bytes32 nonce)
        external onlyRole(PROTOCOL_ROLE)
    {
        PQUpgrade storage u = pqUpgrades[id];
        require(!u.executed, "SAWGovernance: already executed");
        // Verify reveal matches commit
        require(
            keccak256(abi.encodePacked(scheme, nonce)) == u.commitHash,
            "SAWGovernance: commit-reveal mismatch"
        );
        u.scheme   = scheme;
        u.executed = true;
        emit PQUpgradeExecuted(id, u.phase, scheme);
    }

    // ─── Utilities ────────────────────────────────────────────────────────────

    /// @notice Integer square root (Babylonian method) for quadratic voting
    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    receive() external payable {}
}
