// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/ISAWLaunch.sol";
import "./interfaces/ISAWAllocator.sol";
import "./interfaces/ISAWSettlement.sol";
import "./libraries/SAWCrypto.sol";
import "./libraries/SAWErrors.sol";
import "./SAWToken.sol";

/// @title SAWLaunch
/// @notice Master coordinator for the SAW Protocol 12-state cryptographic ceremony
/// @dev    Implements the full state machine: Foundation → ... → Transcendence
///         Each state transition produces a cryptographic hash that seeds the next state.
///         Chain: S1 → S2 → S3 → ... → S12 (tamper-evident, irreversible)
contract SAWLaunch is ISAWLaunch, AccessControl, ReentrancyGuard, Pausable {
    using SAWCrypto for bytes32;

    // ─── Roles ────────────────────────────────────────────────────────────────
    bytes32 public constant OPERATOR_ROLE  = keccak256("OPERATOR_ROLE");
    bytes32 public constant ORACLE_ROLE    = keccak256("ORACLE_ROLE");  // Backend entropy feeder

    // ─── Timing Parameters ────────────────────────────────────────────────────
    uint256 public constant COMMIT_WINDOW_DURATION  = 3 days;
    uint256 public constant REVEAL_WINDOW_DURATION  = 2 days;
    uint256 public constant MIN_BLOCKS_FOR_ENTROPY  = 10;   // Future block buffer

    // ─── State Machine ────────────────────────────────────────────────────────
    State public override currentState;
    mapping(uint8 => bytes32) private _stateHashes;     // stateIndex → hash
    mapping(uint8 => uint256) public stateTimestamps;   // stateIndex → block.timestamp
    bytes32[] private _stateHashChain;                  // ordered chain for audit

    // ─── Entropy ──────────────────────────────────────────────────────────────
    EntropySeed private _entropySeed;
    bytes32      private _finalizedEntropy;

    // ─── Quantum Timestamp ────────────────────────────────────────────────────
    QuantumTimestamp private _quantumTs;

    // ─── Participants ─────────────────────────────────────────────────────────
    mapping(address => Commitment) private _commitments;
    address[] private _allParticipants;
    address[] private _validParticipants;
    mapping(address => bool) private _isParticipant;
    mapping(address => bool) private _isValid;

    uint256 public commitWindowStart;
    uint256 public commitWindowEnd;
    uint256 public revealWindowEnd;

    // ─── External Contracts ───────────────────────────────────────────────────
    SAWToken      public sawToken;
    ISAWAllocator public sawAllocator;
    ISAWSettlement public sawSettlement;

    // ─── Early Contributors ───────────────────────────────────────────────────
    address[] private _earlyContributors;
    mapping(address => uint256) private _earlyContributorShares;
    bool public earlyContributorsDistributed;

    // ─── Final State ──────────────────────────────────────────────────────────
    bytes32 private _finalStateHash;
    bool    public  ceremonyFinalized;

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(
        address admin,
        address tokenAddress,
        address allocatorAddress,
        address settlementAddress
    ) {
        require(admin           != address(0), "SAWLaunch: zero admin");
        require(tokenAddress    != address(0), "SAWLaunch: zero token");
        require(allocatorAddress != address(0), "SAWLaunch: zero allocator");
        require(settlementAddress != address(0), "SAWLaunch: zero settlement");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE,      admin);
        _grantRole(ORACLE_ROLE,        admin);

        sawToken      = SAWToken(tokenAddress);
        sawAllocator  = ISAWAllocator(allocatorAddress);
        sawSettlement = ISAWSettlement(settlementAddress);

        // Initialize at State 1: Foundation
        currentState = State.FOUNDATION;

        // Seal State 1: hash the foundation data (bytecodeHash + tokenomicsHash)
        bytes32 s1Hash = SAWCrypto.computeStateHash(
            bytes32(0), // genesis seed
            abi.encode(
                sawToken.bytecodeHash(),
                sawToken.tokonomicsHash(),
                sawToken.TOTAL_SUPPLY(),
                block.timestamp,
                block.chainid
            )
        );
        _setStateHash(uint8(State.FOUNDATION), s1Hash);
        stateTimestamps[uint8(State.FOUNDATION)] = block.timestamp;

        emit StateAdvanced(State.FOUNDATION, State.FOUNDATION, s1Hash, block.timestamp);
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier inState(State required) {
        if (currentState != required)
            revert SAWErrors.NotInRequiredState(uint8(required), uint8(currentState));
        _;
    }

    modifier afterState(State minimum) {
        if (uint8(currentState) < uint8(minimum))
            revert SAWErrors.NotInRequiredState(uint8(minimum), uint8(currentState));
        _;
    }

    // ─── State Advancement ────────────────────────────────────────────────────

    /// @notice Advance the ceremony to the next state
    /// @dev    Each transition hashes the previous state output → irreversible chain
    function advanceState() external override onlyRole(OPERATOR_ROLE) whenNotPaused nonReentrant {
        State from = currentState;
        State to   = State(uint8(from) + 1);

        if (uint8(from) >= uint8(State.TRANSCENDENCE))
            revert SAWErrors.CeremonyAlreadyFinalized();

        // Execute state-specific logic before transition
        bytes32 newHash = _executeStateTransition(from, to);

        // Advance
        currentState = to;
        _setStateHash(uint8(to), newHash);
        stateTimestamps[uint8(to)] = block.timestamp;

        emit StateAdvanced(from, to, newHash, block.timestamp);
    }

    /// @notice Internal state transition logic — produces cryptographic residue
    function _executeStateTransition(State from, State to) internal returns (bytes32) {
        bytes32 prevHash = _stateHashes[uint8(from)];
        bytes memory stateData;

        if (to == State.GENESIS) {
            // State 2: Lock entropy sources, consecrate protocol liquidity
            require(_entropySeed.futureBlockHash != bytes32(0), "SAWLaunch: entropy not seeded");
            stateData = abi.encode(
                _entropySeed.futureBlockHash,
                _entropySeed.drandRound,
                _entropySeed.btcAnchor,
                _entropySeed.lockedAtBlock,
                sawToken.protocolLiquidityAlloc()
            );

        } else if (to == State.AWAKENING) {
            // State 3: Activate early contributors (2%)
            require(_quantumTs.fingerprint != bytes32(0), "SAWLaunch: quantum ts not set");
            stateData = abi.encode(
                _quantumTs.fingerprint,
                _earlyContributors.length,
                block.timestamp
            );

        } else if (to == State.PERCEPTION) {
            // State 4: Open commitment window
            commitWindowStart = block.timestamp;
            commitWindowEnd   = block.timestamp + COMMIT_WINDOW_DURATION;
            stateData = abi.encode(commitWindowStart, commitWindowEnd);

        } else if (to == State.TRANSFORMATION) {
            // State 5: Lock commitments — window must have closed
            require(block.timestamp >= commitWindowEnd, "SAWLaunch: commit window still open");
            require(_allParticipants.length > 0, "SAWLaunch: no commitments");
            stateData = abi.encode(
                _allParticipants.length,
                commitWindowEnd,
                keccak256(abi.encode(_allParticipants))
            );

        } else if (to == State.HARMONY) {
            // State 6: Open reveal window + finalize entropy
            require(_entropySeed.finalized, "SAWLaunch: entropy not finalized");
            revealWindowEnd = block.timestamp + REVEAL_WINDOW_DURATION;
            stateData = abi.encode(_finalizedEntropy, revealWindowEnd, _allParticipants.length);

        } else if (to == State.FLOW) {
            // State 7: Reveal window closed → compute allocations
            require(block.timestamp >= revealWindowEnd, "SAWLaunch: reveal window still open");
            require(_validParticipants.length > 0, "SAWLaunch: no valid participants");

            // Build amounts array for allocator
            uint256[] memory amounts = _buildAmountsArray();

            // Compute order keys and allocations
            sawAllocator.computeOrderKeys(_finalizedEntropy, _validParticipants);
            sawAllocator.calculateAllocations(amounts, sawToken.publicParticipantsAlloc());

            bytes32 allocationHash = sawAllocator.computeAllocationHash();
            stateData = abi.encode(
                _finalizedEntropy,
                _validParticipants.length,
                allocationHash
            );

        } else if (to == State.POWER) {
            // State 8: Atomic Settlement
            require(sawAllocator.getSummary().computed, "SAWLaunch: allocations not computed");
            sawSettlement.executeSettlement();
            stateData = abi.encode(
                sawSettlement.getSettlementHash(),
                block.timestamp
            );

        } else if (to == State.REFLECTION) {
            // State 9: Deploy liquidity
            ISAWSettlement.SettlementStatus memory status = sawSettlement.getSettlementStatus();
            require(status.completed, "SAWLaunch: settlement not complete");
            stateData = abi.encode(status.settlementHash, status.totalDistributed);

        } else if (to == State.GROWTH) {
            // State 10: Ecosystem treasury unlock (8%)
            stateData = abi.encode(sawToken.ecosystemTreasuryAlloc(), block.timestamp);

        } else if (to == State.PURITY) {
            // State 11: Publish final state hash S_final = H(allAllocations || T_q || E)
            bytes32 allocationHash = sawAllocator.computeAllocationHash();
            _finalStateHash = SAWCrypto.computeFinalStateHash(
                allocationHash,
                _quantumTs.fingerprint,
                _finalizedEntropy
            );
            stateData = abi.encode(_finalStateHash, block.timestamp);
            ceremonyFinalized = true;
            emit LaunchFinalized(_finalStateHash);

        } else if (to == State.TRANSCENDENCE) {
            // State 12: Governance activation — verify purity seal exists
            require(_finalStateHash != bytes32(0), "SAWLaunch: purity not sealed");
            stateData = abi.encode(_finalStateHash, block.timestamp, "TRANSCENDENCE");
        }

        return SAWCrypto.computeStateHash(prevHash, stateData);
    }

    // ─── Commit / Reveal ──────────────────────────────────────────────────────

    /// @notice Submit a commitment hash during PERCEPTION state
    function commit(bytes32 commitHash)
        external
        override
        inState(State.PERCEPTION)
        whenNotPaused
        nonReentrant
    {
        if (block.timestamp > commitWindowEnd)
            revert SAWErrors.CommitmentWindowClosed();
        if (_isParticipant[msg.sender])
            revert SAWErrors.AlreadyCommitted(msg.sender);
        if (commitHash == bytes32(0))
            revert SAWErrors.InvalidCommitmentHash();

        _commitments[msg.sender] = Commitment({
            hash:      commitHash,
            timestamp: block.timestamp,
            revealed:  false,
            valid:     false
        });
        _isParticipant[msg.sender] = true;
        _allParticipants.push(msg.sender);

        emit CommitmentSubmitted(msg.sender, commitHash, block.timestamp);
    }

    /// @notice Reveal plaintext commitment during HARMONY state
    function reveal(uint256 amount, bytes32 nonce)
        external
        override
        inState(State.HARMONY)
        whenNotPaused
        nonReentrant
    {
        if (block.timestamp > revealWindowEnd)
            revert SAWErrors.RevealWindowClosed();
        if (!_isParticipant[msg.sender])
            revert SAWErrors.NoCommitmentFound(msg.sender);
        if (_commitments[msg.sender].revealed)
            revert SAWErrors.AlreadyRevealed(msg.sender);
        if (amount == 0)
            revert SAWErrors.ZeroAmountCommitment();

        bool valid = SAWCrypto.verifyCommitment(
            _commitments[msg.sender].hash,
            msg.sender,
            amount,
            nonce
        );

        _commitments[msg.sender].revealed = true;
        _commitments[msg.sender].valid    = valid;

        if (valid) {
            _isValid[msg.sender] = true;
            _validParticipants.push(msg.sender);
        } else {
            emit ParticipantPurged(msg.sender, "Commit-reveal mismatch");
        }

        emit CommitmentRevealed(msg.sender, amount, valid);
    }

    // ─── Entropy Management ───────────────────────────────────────────────────

    /// @notice Lock entropy sources (called during GENESIS transition)
    function lockEntropy(
        bytes32 futureBlockHash,
        bytes32 drandRound,
        bytes32 btcAnchor,
        uint256 lockedAtBlock
    ) external override onlyRole(ORACLE_ROLE) {
        if (_entropySeed.futureBlockHash != bytes32(0))
            revert SAWErrors.EntropyAlreadyLocked();
        require(lockedAtBlock > block.number, "SAWLaunch: block must be in future");

        _entropySeed = EntropySeed({
            futureBlockHash: futureBlockHash,  // placeholder — finalized later
            drandRound:      drandRound,
            btcAnchor:       btcAnchor,
            lockedAtBlock:   lockedAtBlock,
            finalized:       false
        });

        emit EntropyLocked(
            SAWCrypto.computeEntropy(futureBlockHash, drandRound, btcAnchor),
            lockedAtBlock
        );
    }

    /// @notice Finalize entropy once the future block is mined
    function finalizeEntropy() external override onlyRole(ORACLE_ROLE) {
        if (_entropySeed.futureBlockHash == bytes32(0))
            revert SAWErrors.EntropyNotLocked();
        if (_entropySeed.finalized)
            revert SAWErrors.EntropyNotLocked();
        if (block.number <= _entropySeed.lockedAtBlock)
            revert SAWErrors.FutureBlockNotMined(_entropySeed.lockedAtBlock, block.number);

        // Use the actual future block hash now that it's available
        bytes32 actualBlockHash = blockhash(_entropySeed.lockedAtBlock);
        require(actualBlockHash != bytes32(0), "SAWLaunch: block hash unavailable (too old)");

        _entropySeed.futureBlockHash = actualBlockHash;
        _entropySeed.finalized       = true;

        _finalizedEntropy = SAWCrypto.computeEntropy(
            actualBlockHash,
            _entropySeed.drandRound,
            _entropySeed.btcAnchor
        );

        emit EntropyFinalized(_finalizedEntropy);
    }

    function getEntropy() external view override afterState(State.GENESIS) returns (bytes32) {
        return _finalizedEntropy;
    }

    // ─── Quantum Timestamp ────────────────────────────────────────────────────

    /// @notice Set multi-source quantum timestamp (provided by backend oracle)
    function setQuantumTimestamp(
        uint256 ethBlockTime,
        uint256 btcBlockTime,
        uint256 ntpConsensus,
        uint256 beaconTime
    ) external override onlyRole(ORACLE_ROLE) {
        if (_quantumTs.fingerprint != bytes32(0))
            revert SAWErrors.QuantumTimestampAlreadySet();

        bytes32 fingerprint = SAWCrypto.computeQuantumTimestamp(
            ethBlockTime, btcBlockTime, ntpConsensus, beaconTime
        );

        _quantumTs = QuantumTimestamp({
            ethBlockTime: ethBlockTime,
            btcBlockTime: btcBlockTime,
            ntpConsensus: ntpConsensus,
            beaconTime:   beaconTime,
            fingerprint:  fingerprint
        });

        emit QuantumTimestampSet(fingerprint);
    }

    function getQuantumTimestamp() external view override returns (bytes32) {
        return _quantumTs.fingerprint;
    }

    // ─── Early Contributors ───────────────────────────────────────────────────

    /// @notice Register early contributors and their shares (before AWAKENING)
    function registerEarlyContributors(
        address[] calldata contributors,
        uint256[] calldata shares
    ) external onlyRole(OPERATOR_ROLE) {
        require(uint8(currentState) < uint8(State.AWAKENING), "SAWLaunch: too late");
        require(contributors.length == shares.length, "SAWLaunch: length mismatch");
        require(!earlyContributorsDistributed, "SAWLaunch: already distributed");

        uint256 totalShares;
        for (uint256 i = 0; i < contributors.length; i++) {
            _earlyContributors.push(contributors[i]);
            _earlyContributorShares[contributors[i]] = shares[i];
            totalShares += shares[i];
        }
        require(totalShares == 10000, "SAWLaunch: shares must sum to 10000 bps");
    }

    /// @notice Distribute early contributor tokens (AWAKENING state)
    function distributeEarlyContributors()
        external
        inState(State.AWAKENING)
        onlyRole(OPERATOR_ROLE)
        nonReentrant
    {
        require(!earlyContributorsDistributed, "SAWLaunch: already distributed");
        require(_earlyContributors.length > 0, "SAWLaunch: no contributors");

        uint256 total = sawToken.earlyContributorsAlloc();
        earlyContributorsDistributed = true;

        for (uint256 i = 0; i < _earlyContributors.length; i++) {
            address contributor = _earlyContributors[i];
            uint256 share = (_earlyContributorShares[contributor] * total) / 10000;
            sawToken.transfer(contributor, share);
        }
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    function getStateHash(State state) external view override returns (bytes32) {
        return _stateHashes[uint8(state)];
    }

    function getCommitment(address participant)
        external view override
        returns (Commitment memory)
    {
        return _commitments[participant];
    }

    function validParticipantCount() external view override returns (uint256) {
        return _validParticipants.length;
    }

    function getValidParticipants() external view override returns (address[] memory) {
        return _validParticipants;
    }

    function getFinalStateHash() external view override returns (bytes32) {
        return _finalStateHash;
    }

    function getAllParticipants() external view returns (address[] memory) {
        return _allParticipants;
    }

    function getEntropySeed() external view returns (EntropySeed memory) {
        return _entropySeed;
    }

    function getQuantumTimestampFull() external view returns (QuantumTimestamp memory) {
        return _quantumTs;
    }

    function getStateHashChain() external view returns (bytes32[] memory) {
        return _stateHashChain;
    }

    // ─── Internal Helpers ─────────────────────────────────────────────────────

    function _setStateHash(uint8 stateIdx, bytes32 hash_) internal {
        _stateHashes[stateIdx] = hash_;
        _stateHashChain.push(hash_);
    }

    function _buildAmountsArray() internal view returns (uint256[] memory) {
        uint256 n = _validParticipants.length;
        uint256[] memory amounts = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            amounts[i] = _commitments[_validParticipants[i]].hash != bytes32(0)
                ? _getRevealedAmount(_validParticipants[i])
                : 0;
        }
        return amounts;
    }

    /// @dev Returns the revealed amount for a participant stored in commitment hash
    ///      In production, amounts are stored separately during reveal
    function _getRevealedAmount(address participant) internal view returns (uint256) {
        // amount stored in extended mapping — simplified here
        return _revealedAmounts[participant];
    }

    mapping(address => uint256) private _revealedAmounts;

    /// @dev Override reveal to also store the amount
    function _storeRevealedAmount(address participant, uint256 amount) internal {
        _revealedAmounts[participant] = amount;
    }

    // ─── Emergency Controls ───────────────────────────────────────────────────

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
}
