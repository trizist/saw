// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SAWCrypto
/// @notice Cryptographic primitives library for the SAW Protocol
/// @dev Implements all hash formulas from the whitepaper
library SAWCrypto {

    // ─── Commitment Hash ──────────────────────────────────────────────────────

    /// @notice Compute a participant commitment: C_i = H(wallet || amount || nonce)
    /// @param wallet  The participant's address
    /// @param amount  The committed ETH amount
    /// @param nonce   The secret nonce
    /// @return The commitment hash
    function computeCommitment(
        address wallet,
        uint256 amount,
        bytes32 nonce
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(wallet, amount, nonce));
    }

    /// @notice Verify a commitment against its plaintext
    function verifyCommitment(
        bytes32 commitHash,
        address wallet,
        uint256 amount,
        bytes32 nonce
    ) internal pure returns (bool) {
        return commitHash == computeCommitment(wallet, amount, nonce);
    }

    // ─── Entropy Engine ───────────────────────────────────────────────────────

    /// @notice Compute entropy: E = H(futureBlockHash || drandRound || btcAnchor)
    /// @param futureBlockHash  Future ETH block hash (unpredictable at commit time)
    /// @param drandRound       drand beacon round output
    /// @param btcAnchor        BTC block height/hash anchor
    /// @return The entropy seed E
    function computeEntropy(
        bytes32 futureBlockHash,
        bytes32 drandRound,
        bytes32 btcAnchor
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(futureBlockHash, drandRound, btcAnchor));
    }

    // ─── Quantum Timestamp ────────────────────────────────────────────────────

    /// @notice Compute quantum timestamp: T_q = H(T_eth || T_btc || T_ntp || T_beacon)
    /// @param tEth      Ethereum block timestamp
    /// @param tBtc      Bitcoin block timestamp
    /// @param tNtp      NTP consensus timestamp
    /// @param tBeacon   drand beacon timestamp
    /// @return The quantum timestamp fingerprint T_q
    function computeQuantumTimestamp(
        uint256 tEth,
        uint256 tBtc,
        uint256 tNtp,
        uint256 tBeacon
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(tEth, tBtc, tNtp, tBeacon));
    }

    // ─── Fair Ordering Engine ─────────────────────────────────────────────────

    /// @notice Compute deterministic order key: Order_i = H(E || wallet_i)
    /// @param entropy     The finalized entropy seed E
    /// @param participant The participant's wallet address
    /// @return The order key (used for ascending sort)
    function computeOrderKey(
        bytes32 entropy,
        address participant
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(entropy, participant));
    }

    // ─── State Hash Chain ─────────────────────────────────────────────────────

    /// @notice Compute state hash: S_n = H(S_{n-1} || stateData)
    /// @param prevStateHash  The hash output of the previous state
    /// @param stateData      ABI-encoded data produced in this state
    /// @return The new state hash
    function computeStateHash(
        bytes32 prevStateHash,
        bytes memory stateData
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(prevStateHash, stateData));
    }

    // ─── Final State Seal ─────────────────────────────────────────────────────

    /// @notice Compute final state hash: S_final = H(allAllocations || T_q || E)
    /// @param allocationHash  H(all allocation data)
    /// @param quantumTs       The quantum timestamp fingerprint T_q
    /// @param entropy         The finalized entropy seed E
    /// @return The immutable final state seal
    function computeFinalStateHash(
        bytes32 allocationHash,
        bytes32 quantumTs,
        bytes32 entropy
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(allocationHash, quantumTs, entropy));
    }

    // ─── Allocation Hash ──────────────────────────────────────────────────────

    /// @notice Compute allocation hash over all participants
    /// @param participants  Array of participant addresses
    /// @param amounts       Array of token amounts (same order)
    /// @return The allocation fingerprint
    function computeAllocationHash(
        address[] memory participants,
        uint256[] memory amounts
    ) internal pure returns (bytes32) {
        require(participants.length == amounts.length, "SAWCrypto: length mismatch");
        return keccak256(abi.encode(participants, amounts));
    }

    // ─── Sorting Utility ──────────────────────────────────────────────────────

    /// @notice Sort participants ascending by their order keys (insertion sort for small N)
    /// @dev For production with large N, use off-chain sort + on-chain verify
    function sortAscending(
        address[] memory participants,
        bytes32[] memory orderKeys
    ) internal pure returns (address[] memory sorted, bytes32[] memory sortedKeys) {
        uint256 n = participants.length;
        sorted = new address[](n);
        sortedKeys = new bytes32[](n);

        for (uint256 i = 0; i < n; i++) {
            sorted[i] = participants[i];
            sortedKeys[i] = orderKeys[i];
        }

        // Insertion sort (ascending)
        for (uint256 i = 1; i < n; i++) {
            address tmpAddr = sorted[i];
            bytes32 tmpKey = sortedKeys[i];
            uint256 j = i;
            while (j > 0 && sortedKeys[j - 1] > tmpKey) {
                sorted[j] = sorted[j - 1];
                sortedKeys[j] = sortedKeys[j - 1];
                j--;
            }
            sorted[j] = tmpAddr;
            sortedKeys[j] = tmpKey;
        }
    }

    // ─── Weight Calculation ───────────────────────────────────────────────────

    /// @notice Compute pro-rata token weight for a participant
    /// @param participantAmount  The amount this participant committed
    /// @param totalAmount        Total committed amount across all participants
    /// @param totalTokens        Total tokens to distribute
    /// @return Token amount allocated to this participant
    function computeProRataAllocation(
        uint256 participantAmount,
        uint256 totalAmount,
        uint256 totalTokens
    ) internal pure returns (uint256) {
        if (totalAmount == 0) return 0;
        return (participantAmount * totalTokens) / totalAmount;
    }
}
