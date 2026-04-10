// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SAWEvents
/// @notice Shared event definitions for cross-contract indexing
library SAWEvents {
    // Emitted by any SAW contract for unified indexing
    event ProtocolStateChanged(address indexed contract_, uint8 fromState, uint8 toState, bytes32 stateHash);
    event CryptographicResidue(uint8 state, bytes32 hash, uint256 blockNumber);
    event AuditCheckpoint(string label, bytes32 value, uint256 timestamp);
}
