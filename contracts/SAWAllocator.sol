// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/ISAWAllocator.sol";
import "./libraries/SAWCrypto.sol";
import "./libraries/SAWErrors.sol";

/// @title SAWAllocator
/// @notice Fair Ordering Engine for the SAW Protocol
/// @dev    Implements: Order_i = H(E || wallet_i) → ascending sort → pro-rata distribution
///         Anti-MEV: order determined by math, not gas speed
///         Anti-Sniping: entropy only known after commit window closes
contract SAWAllocator is ISAWAllocator, AccessControl, ReentrancyGuard {

    // ─── Roles ────────────────────────────────────────────────────────────────
    bytes32 public constant PROTOCOL_ROLE = keccak256("PROTOCOL_ROLE");

    // ─── Storage ──────────────────────────────────────────────────────────────
    bytes32 public finalizedEntropy;

    // participant → allocation
    mapping(address => Allocation) private _allocations;

    // sorted array of participants (ascending by order key)
    address[] private _sortedParticipants;

    AllocationSummary private _summary;

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PROTOCOL_ROLE,      admin);
    }

    // ─── Access ───────────────────────────────────────────────────────────────
    function grantProtocolRole(address protocol) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(PROTOCOL_ROLE, protocol);
    }

    // ─── Core: Compute Order Keys ─────────────────────────────────────────────

    /// @notice Step 1: Compute Order_i = H(E || wallet_i) for every participant
    ///         Then sort ascending — removes ALL speed/gas advantages
    function computeOrderKeys(
        bytes32 entropy,
        address[] calldata participants
    ) external override onlyRole(PROTOCOL_ROLE) nonReentrant {
        if (_summary.computed) revert SAWErrors.AllocationAlreadyComputed();
        if (participants.length == 0) revert SAWErrors.NoValidParticipants();

        finalizedEntropy = entropy;
        uint256 n = participants.length;

        // Build unsorted arrays
        address[] memory addrs = new address[](n);
        bytes32[] memory keys  = new bytes32[](n);

        for (uint256 i = 0; i < n; i++) {
            addrs[i] = participants[i];
            keys[i]  = SAWCrypto.computeOrderKey(entropy, participants[i]);
        }

        // Sort ascending (insertion sort — sufficient for typical launch sizes)
        (address[] memory sorted, bytes32[] memory sortedKeys) =
            SAWCrypto.sortAscending(addrs, keys);

        // Store rank and order key for each participant
        for (uint256 i = 0; i < n; i++) {
            _allocations[sorted[i]].participant = sorted[i];
            _allocations[sorted[i]].orderKey    = sortedKeys[i];
            _allocations[sorted[i]].rank        = i + 1; // 1-based
            _sortedParticipants.push(sorted[i]);
        }
    }

    // ─── Core: Calculate Allocations ──────────────────────────────────────────

    /// @notice Step 2: Calculate pro-rata token allocations
    ///         weight_i = amount_i / totalAmount  →  tokens_i = weight_i × totalTokens
    function calculateAllocations(
        uint256[] calldata amounts,
        uint256 totalTokens
    ) external override onlyRole(PROTOCOL_ROLE) nonReentrant {
        uint256 n = _sortedParticipants.length;
        require(amounts.length == n, "SAWAllocator: amounts length mismatch");
        if (totalTokens == 0) revert SAWErrors.NoValidParticipants();

        // Calculate total committed
        uint256 totalCommitted;
        for (uint256 i = 0; i < n; i++) {
            totalCommitted += amounts[i];
            _allocations[_sortedParticipants[i]].amount = amounts[i];
        }
        require(totalCommitted > 0, "SAWAllocator: zero total committed");

        // Assign token amounts (pro-rata)
        uint256 distributed;
        for (uint256 i = 0; i < n; i++) {
            address p = _sortedParticipants[i];
            uint256 tokenAmt;

            if (i == n - 1) {
                // Last participant gets remainder (dust prevention)
                tokenAmt = totalTokens - distributed;
            } else {
                tokenAmt = SAWCrypto.computeProRataAllocation(
                    amounts[i], totalCommitted, totalTokens
                );
            }

            _allocations[p].tokenAmount = tokenAmt;
            _allocations[p].weight      = (amounts[i] * 1e18) / totalCommitted; // scaled weight
            distributed += tokenAmt;

            emit AllocationComputed(p, _allocations[p].rank, tokenAmt);
        }

        // Finalize summary
        _summary = AllocationSummary({
            totalParticipants: n,
            totalCommitted:    totalCommitted,
            totalTokens:       totalTokens,
            allocationHash:    computeAllocationHash(),
            computed:          true
        });

        emit AllocationFinalized(_summary.allocationHash, n);
        emit WeightsCalculated(n, totalCommitted);
    }

    // ─── Verification ─────────────────────────────────────────────────────────

    /// @notice Verify a participant's order key deterministically
    function verifyOrderKey(
        bytes32 entropy,
        address participant
    ) external pure override returns (bytes32) {
        return SAWCrypto.computeOrderKey(entropy, participant);
    }

    /// @notice Full audit verification: recompute all order keys and confirm sorting
    function verifyAllocations(bytes32 entropy) external view override returns (bool) {
        uint256 n = _sortedParticipants.length;
        if (n == 0) return false;

        bytes32 prevKey = bytes32(0);
        for (uint256 i = 0; i < n; i++) {
            address p = _sortedParticipants[i];
            bytes32 expectedKey = SAWCrypto.computeOrderKey(entropy, p);
            // Verify stored key matches recomputed key
            if (_allocations[p].orderKey != expectedKey) return false;
            // Verify ascending order
            if (expectedKey < prevKey) return false;
            prevKey = expectedKey;
        }
        return true;
    }

    // ─── Allocation Hash ──────────────────────────────────────────────────────

    /// @notice Compute H(all allocations) for audit trail
    function computeAllocationHash() public view override returns (bytes32) {
        uint256 n = _sortedParticipants.length;
        address[] memory participants = new address[](n);
        uint256[] memory amounts      = new uint256[](n);

        for (uint256 i = 0; i < n; i++) {
            participants[i] = _sortedParticipants[i];
            amounts[i]      = _allocations[_sortedParticipants[i]].tokenAmount;
        }

        return SAWCrypto.computeAllocationHash(participants, amounts);
    }

    // ─── Settlement Integration ───────────────────────────────────────────────

    /// @notice Mark an allocation as settled (called by SAWSettlement)
    function markSettled(address participant) external onlyRole(PROTOCOL_ROLE) {
        _allocations[participant].settled = true;
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    function getAllocation(address participant)
        external view override
        returns (Allocation memory)
    {
        return _allocations[participant];
    }

    function getAllAllocations()
        external view override
        returns (Allocation[] memory)
    {
        uint256 n = _sortedParticipants.length;
        Allocation[] memory result = new Allocation[](n);
        for (uint256 i = 0; i < n; i++) {
            result[i] = _allocations[_sortedParticipants[i]];
        }
        return result;
    }

    function getSummary() external view override returns (AllocationSummary memory) {
        return _summary;
    }

    function getSortedParticipants() external view returns (address[] memory) {
        return _sortedParticipants;
    }

    function getParticipantCount() external view returns (uint256) {
        return _sortedParticipants.length;
    }
}
