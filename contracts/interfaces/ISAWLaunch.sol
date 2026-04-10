// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISAWLaunch
/// @notice Interface for the SAW Protocol master launch coordinator
/// @dev Manages the full 12-state cryptographic ceremony lifecycle
interface ISAWLaunch {

    // ─── Enums ────────────────────────────────────────────────────────────────

    /// @notice The 12 deterministic states of the SAW ceremony
    enum State {
        FOUNDATION,      // State 1:  Define supply & contract logic (0% distributed)
        GENESIS,         // State 2:  Entropy locked, liquidity reserved (10%)
        AWAKENING,       // State 3:  Public activation, early contributors (2%)
        PERCEPTION,      // State 4:  Commitment window opens (0%)
        TRANSFORMATION,  // State 5:  Commitments sealed (40% reserved)
        HARMONY,         // State 6:  Reveal phase, bot purge (0%)
        FLOW,            // State 7:  Deterministic weight calculation (0%)
        POWER,           // State 8:  Atomic settlement executes (40% distributed)
        REFLECTION,      // State 9:  Liquidity deployed (10% LP-backed)
        GROWTH,          // State 10: Ecosystem treasury unlocked (8%)
        PURITY,          // State 11: Final state hash published (0%)
        TRANSCENDENCE    // State 12: DAO governance activated (30% emissions)
    }

    // ─── Structs ──────────────────────────────────────────────────────────────

    /// @notice A participant's commitment record
    struct Commitment {
        bytes32 hash;       // C_i = H(wallet || amount || nonce)
        uint256 timestamp;  // Block timestamp of commitment
        bool revealed;      // Whether plaintext has been revealed
        bool valid;         // Whether reveal was valid
    }

    /// @notice Entropy seed bundle from multiple sources
    struct EntropySeed {
        bytes32 futureBlockHash;   // Future ETH block hash
        bytes32 drandRound;        // drand beacon round hash
        bytes32 btcAnchor;         // BTC block height hash
        uint256 lockedAtBlock;     // ETH block number when entropy was locked
        bool finalized;            // Whether entropy is finalized
    }

    /// @notice Quantum timestamp fingerprint
    struct QuantumTimestamp {
        uint256 ethBlockTime;      // T_eth: Ethereum block timestamp
        uint256 btcBlockTime;      // T_btc: Bitcoin block timestamp
        uint256 ntpConsensus;      // T_ntp: NTP server consensus
        uint256 beaconTime;        // T_beacon: drand beacon timestamp
        bytes32 fingerprint;       // T_q = H(T_eth || T_btc || T_ntp || T_beacon)
    }

    /// @notice State transition record
    struct StateTransition {
        State from;
        State to;
        bytes32 stateHash;         // Hash of state output → seeds next state
        uint256 timestamp;
        uint256 blockNumber;
    }

    // ─── Events ───────────────────────────────────────────────────────────────

    event StateAdvanced(State indexed from, State indexed to, bytes32 stateHash, uint256 timestamp);
    event CommitmentSubmitted(address indexed participant, bytes32 commitHash, uint256 timestamp);
    event CommitmentRevealed(address indexed participant, uint256 amount, bool valid);
    event EntropyLocked(bytes32 entropyHash, uint256 blockNumber);
    event EntropyFinalized(bytes32 finalEntropy);
    event QuantumTimestampSet(bytes32 fingerprint);
    event ParticipantPurged(address indexed participant, string reason);
    event LaunchFinalized(bytes32 finalStateHash);

    // ─── Core State Machine ───────────────────────────────────────────────────

    /// @notice Advance to the next state in the ceremony
    function advanceState() external;

    /// @notice Get the current protocol state
    function currentState() external view returns (State);

    /// @notice Get the hash of a specific state output
    function getStateHash(State state) external view returns (bytes32);

    // ─── Commit / Reveal ──────────────────────────────────────────────────────

    /// @notice Submit a commitment hash during PERCEPTION state
    /// @param commitHash C_i = keccak256(abi.encodePacked(wallet, amount, nonce))
    function commit(bytes32 commitHash) external;

    /// @notice Reveal plaintext commitment during HARMONY state
    /// @param amount The ETH/token amount committed
    /// @param nonce  The secret nonce used in the hash
    function reveal(uint256 amount, bytes32 nonce) external;

    // ─── Entropy ──────────────────────────────────────────────────────────────

    /// @notice Lock entropy sources at GENESIS state
    function lockEntropy(
        bytes32 futureBlockHash,
        bytes32 drandRound,
        bytes32 btcAnchor,
        uint256 lockedAtBlock
    ) external;

    /// @notice Finalize entropy after future block is mined
    function finalizeEntropy() external;

    /// @notice Get the current entropy seed
    function getEntropy() external view returns (bytes32);

    // ─── Quantum Timestamp ────────────────────────────────────────────────────

    /// @notice Set the quantum timestamp fingerprint
    function setQuantumTimestamp(
        uint256 ethBlockTime,
        uint256 btcBlockTime,
        uint256 ntpConsensus,
        uint256 beaconTime
    ) external;

    /// @notice Get the quantum timestamp fingerprint
    function getQuantumTimestamp() external view returns (bytes32);

    // ─── Participant Queries ──────────────────────────────────────────────────

    /// @notice Get a participant's commitment
    function getCommitment(address participant) external view returns (Commitment memory);

    /// @notice Get the count of valid revealed participants
    function validParticipantCount() external view returns (uint256);

    /// @notice Get all valid participant addresses
    function getValidParticipants() external view returns (address[] memory);

    // ─── Final State ──────────────────────────────────────────────────────────

    /// @notice Get the final state hash S_final = H(allAllocations || T_q || E)
    function getFinalStateHash() external view returns (bytes32);
}
