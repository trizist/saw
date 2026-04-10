import { ethers } from "ethers";
import {
  computeEntropy,
  computeQuantumTimestamp,
  computeOrderKey,
  computeFinalStateHash,
  sortParticipants,
} from "../entropy/aggregator";
import { logger } from "../utils/logger";
import type { AuditReport } from "../utils/types";

// ─── SAW Protocol Audit Verifier ─────────────────────────────────────────────
// Allows ANY observer to recompute the full launch and verify fairness.
// "Because the inputs (Entropy + Wallets) are public, any user can re-calculate
//  the entire launch after the fact to prove that the process was followed exactly."

export interface VerificationInput {
  // Entropy sources (publicly observable)
  futureBlockHash: string;
  drandRound: string;
  btcAnchor: string;
  // Quantum timestamp components
  tEth: number;
  tBtc: number;
  tNtp: number;
  tBeacon: number;
  // Participant data
  participants: { address: string; amount: bigint }[];
  totalTokens: bigint;
  // On-chain recorded values (to verify against)
  onChainEntropy: string;
  onChainQuantumTs: string;
  onChainAllocations: { address: string; tokenAmount: bigint; rank: number }[];
  onChainFinalStateHash: string;
}

export interface VerificationResult {
  passed: boolean;
  checks: {
    entropyMatch: boolean;
    quantumTsMatch: boolean;
    orderingCorrect: boolean;
    allocationCorrect: boolean;
    finalHashMatch: boolean;
  };
  recomputedEntropy: string;
  recomputedQuantumTs: string;
  recomputedFinalHash: string;
  sortedParticipants: { address: string; orderKey: string; rank: number }[];
  errors: string[];
}

export class AuditVerifier {
  // ─── Full Audit Recomputation ──────────────────────────────────────────────
  /// Step-by-step verification as documented in the whitepaper:
  /// 1. Entropy Verification
  /// 2. Ordering Recomputation
  /// 3. Allocation Audit
  /// 4. Timestamp Integrity
  verify(input: VerificationInput): VerificationResult {
    const errors: string[] = [];
    const checks = {
      entropyMatch:      false,
      quantumTsMatch:    false,
      orderingCorrect:   false,
      allocationCorrect: false,
      finalHashMatch:    false,
    };

    // ── Step 1: Entropy Verification ─────────────────────────────────────────
    // Re-verify E = H(futureBlockHash || drandRound || btcAnchor)
    const recomputedEntropy = computeEntropy(
      input.futureBlockHash,
      input.drandRound,
      input.btcAnchor
    );
    checks.entropyMatch = recomputedEntropy.toLowerCase() === input.onChainEntropy.toLowerCase();
    if (!checks.entropyMatch) {
      errors.push(`Entropy mismatch: computed=${recomputedEntropy.slice(0,18)} on-chain=${input.onChainEntropy.slice(0,18)}`);
    }
    logger.info(`[Verifier] Step 1 - Entropy: ${checks.entropyMatch ? "✅ PASS" : "❌ FAIL"}`);

    // ── Step 2: Timestamp Integrity ───────────────────────────────────────────
    // Re-verify T_q = H(T_eth || T_btc || T_ntp || T_beacon)
    const recomputedQuantumTs = computeQuantumTimestamp(
      input.tEth, input.tBtc, input.tNtp, input.tBeacon
    );
    checks.quantumTsMatch = recomputedQuantumTs.toLowerCase() === input.onChainQuantumTs.toLowerCase();
    if (!checks.quantumTsMatch) {
      errors.push(`Quantum timestamp mismatch: computed=${recomputedQuantumTs.slice(0,18)} on-chain=${input.onChainQuantumTs.slice(0,18)}`);
    }
    logger.info(`[Verifier] Step 2 - Timestamp: ${checks.quantumTsMatch ? "✅ PASS" : "❌ FAIL"}`);

    // ── Step 3: Ordering Recomputation ────────────────────────────────────────
    // Apply Order_i = H(E || wallet_i) and verify ascending sort
    const addresses = input.participants.map((p) => p.address);
    const sorted    = sortParticipants(addresses, recomputedEntropy);

    checks.orderingCorrect = true;
    for (let i = 0; i < sorted.length; i++) {
      const onChain = input.onChainAllocations.find(
        (a) => a.address.toLowerCase() === sorted[i].address.toLowerCase()
      );
      if (!onChain || onChain.rank !== sorted[i].rank) {
        checks.orderingCorrect = false;
        errors.push(`Rank mismatch for ${sorted[i].address}: computed=${sorted[i].rank} on-chain=${onChain?.rank}`);
        break;
      }
    }
    logger.info(`[Verifier] Step 3 - Ordering: ${checks.orderingCorrect ? "✅ PASS" : "❌ FAIL"}`);

    // ── Step 4: Allocation Audit ──────────────────────────────────────────────
    // Verify token amounts follow pro-rata distribution
    const totalCommitted = input.participants.reduce((sum, p) => sum + p.amount, 0n);
    checks.allocationCorrect = true;

    for (const participant of input.participants) {
      const expectedTokens = totalCommitted > 0n
        ? (participant.amount * input.totalTokens) / totalCommitted
        : 0n;

      const onChain = input.onChainAllocations.find(
        (a) => a.address.toLowerCase() === participant.address.toLowerCase()
      );

      if (!onChain) {
        checks.allocationCorrect = false;
        errors.push(`Participant ${participant.address} not found in on-chain allocations`);
        continue;
      }

      // Allow 1 token unit tolerance for rounding (last participant gets remainder)
      const diff = expectedTokens > onChain.tokenAmount
        ? expectedTokens - onChain.tokenAmount
        : onChain.tokenAmount - expectedTokens;

      if (diff > 1n) {
        checks.allocationCorrect = false;
        errors.push(
          `Allocation mismatch for ${participant.address}: expected=${expectedTokens} on-chain=${onChain.tokenAmount}`
        );
      }
    }
    logger.info(`[Verifier] Step 4 - Allocations: ${checks.allocationCorrect ? "✅ PASS" : "❌ FAIL"}`);

    // ── Step 5: Final State Hash ───────────────────────────────────────────────
    // S_final = H(allAllocations || T_q || E)
    const allocationHash = computeOnChainAllocationHash(
      input.onChainAllocations.map((a) => a.address),
      input.onChainAllocations.map((a) => a.tokenAmount)
    );
    const recomputedFinalHash = computeFinalStateHash(
      allocationHash, recomputedQuantumTs, recomputedEntropy
    );
    checks.finalHashMatch = recomputedFinalHash.toLowerCase() === input.onChainFinalStateHash.toLowerCase();
    if (!checks.finalHashMatch) {
      errors.push(`Final state hash mismatch`);
    }
    logger.info(`[Verifier] Step 5 - Final Hash: ${checks.finalHashMatch ? "✅ PASS" : "❌ FAIL"}`);

    const passed = Object.values(checks).every(Boolean);
    logger.info(`[Verifier] Overall: ${passed ? "✅ ALL CHECKS PASSED" : "❌ VERIFICATION FAILED"}`);

    return {
      passed,
      checks,
      recomputedEntropy,
      recomputedQuantumTs,
      recomputedFinalHash,
      sortedParticipants: sorted,
      errors,
    };
  }

  // ─── Single Participant Order Key Verification ────────────────────────────
  verifyParticipantOrderKey(entropy: string, wallet: string): string {
    return computeOrderKey(entropy, wallet);
  }

  // ─── Generate Full Audit Report ───────────────────────────────────────────
  generateAuditReport(input: VerificationInput): AuditReport {
    const result = this.verify(input);
    return {
      finalStateHash:          result.recomputedFinalHash,
      entropyVerified:         result.checks.entropyMatch,
      orderingVerified:        result.checks.orderingCorrect,
      allocationVerified:      result.checks.allocationCorrect,
      timestampVerified:       result.checks.quantumTsMatch,
      totalParticipants:       input.participants.length,
      totalTokensDistributed:  input.totalTokens.toString(),
      generatedAt:             Math.floor(Date.now() / 1000),
    };
  }
}

// Helper: matches Solidity's keccak256(abi.encode(addresses, amounts))
function computeOnChainAllocationHash(addresses: string[], amounts: bigint[]): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address[]", "uint256[]"],
      [addresses, amounts]
    )
  );
}
