import { ethers } from "ethers";
import { logger } from "../utils/logger";
import {
  fetchDrandLatest, fetchBtcLatestBlock, fetchNtpConsensus,
  fetchEthBlockTimestamp, computeBtcAnchor, fetchFutureBlockHash
} from "./sources";
import type {
  EntropySources, FinalizedEntropy, QuantumTimestampData
} from "../utils/types";

// ─── Entropy Aggregator ───────────────────────────────────────────────────────
// Implements: E = H(futureBlockHash || drandRound || btcAnchor)
// Anti-manipulation: no single actor controls all 3 sources simultaneously

export class EntropyAggregator {
  private provider: ethers.Provider;
  private locked: EntropySources | null = null;
  private finalized: FinalizedEntropy | null = null;

  constructor(provider: ethers.Provider) {
    this.provider = provider;
  }

  // ─── Step 1: Lock Entropy Sources at Genesis (State 2) ──────────────────────
  /// Lock sources NOW, but futureBlockHash is placeholder — finalized later
  async lockEntropySources(futureBlocksAhead = 20): Promise<{
    sources: EntropySources;
    currentBlock: number;
  }> {
    logger.info("[Aggregator] Locking entropy sources...");

    const [drand, btc, ntp, eth] = await Promise.all([
      fetchDrandLatest(),
      fetchBtcLatestBlock(),
      fetchNtpConsensus(),
      fetchEthBlockTimestamp(this.provider),
    ]);

    const lockedAtBlock = eth.blockNumber + futureBlocksAhead;
    const btcAnchor     = computeBtcAnchor(btc.height, btc.hash);

    // drand randomness as bytes32
    const drandHash = "0x" + drand.randomness.slice(0, 64).padStart(64, "0");

    // Placeholder for future block hash (not known yet)
    const placeholder = ethers.keccak256(
      ethers.toUtf8Bytes(`SAW_PLACEHOLDER_BLOCK_${lockedAtBlock}`)
    );

    this.locked = {
      futureBlockHash: placeholder,  // will be replaced in finalizeEntropy
      drandRound:      drandHash,
      btcAnchor:       btcAnchor,
      lockedAtBlock:   lockedAtBlock,
    };

    logger.info(`[Aggregator] Entropy locked. Future block target: ${lockedAtBlock}`);
    logger.info(`[Aggregator] drand round ${drand.round}: ${drandHash.slice(0, 18)}...`);
    logger.info(`[Aggregator] BTC anchor (block ${btc.height}): ${btcAnchor.slice(0, 18)}...`);

    return { sources: this.locked, currentBlock: eth.blockNumber };
  }

  // ─── Step 2: Finalize Entropy When Future Block is Mined ────────────────────
  /// Fetches the actual future block hash and computes: E = H(blockHash || drand || btcAnchor)
  async finalizeEntropy(): Promise<FinalizedEntropy | null> {
    if (!this.locked) throw new Error("[Aggregator] Entropy not locked yet");
    if (this.finalized) return this.finalized;

    const actualHash = await fetchFutureBlockHash(this.provider, this.locked.lockedAtBlock);
    if (!actualHash) {
      logger.warn(`[Aggregator] Future block ${this.locked.lockedAtBlock} not yet available`);
      return null;
    }

    // Final entropy: E = H(futureBlockHash || drandRound || btcAnchor)
    const finalSeed = computeEntropy(actualHash, this.locked.drandRound, this.locked.btcAnchor);

    const ethBlock = await this.provider.getBlock(this.locked.lockedAtBlock);
    this.finalized = {
      seed:          finalSeed,
      sources:       { ...this.locked, futureBlockHash: actualHash },
      finalizedAt:   ethBlock?.timestamp ?? Math.floor(Date.now() / 1000),
      blockNumber:   this.locked.lockedAtBlock,
    };

    logger.info(`[Aggregator] Entropy finalized: ${finalSeed.slice(0, 18)}...`);
    return this.finalized;
  }

  // ─── Quantum Timestamp ───────────────────────────────────────────────────────
  // Implements: T_q = H(T_eth || T_btc || T_ntp || T_beacon)
  async computeQuantumTimestamp(): Promise<QuantumTimestampData> {
    logger.info("[Aggregator] Computing quantum timestamp...");

    const [drand, btc, ntp, eth] = await Promise.all([
      fetchDrandLatest(),
      fetchBtcLatestBlock(),
      fetchNtpConsensus(),
      fetchEthBlockTimestamp(this.provider),
    ]);

    const tEth    = eth.timestamp;
    const tBtc    = btc.timestamp;
    const tNtp    = ntp.timestamp;
    const tBeacon = Math.floor(drand.round * 30 + 1677685200); // drand epoch approximation

    // T_q = H(T_eth || T_btc || T_ntp || T_beacon)
    const fingerprint = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "uint256", "uint256"],
        [tEth, tBtc, tNtp, tBeacon]
      )
    );

    const result: QuantumTimestampData = {
      tEth,
      tBtc,
      tNtp,
      tBeacon,
      fingerprint,
      sources: {
        ethBlockNumber: eth.blockNumber,
        btcBlockHeight: btc.height,
        ntpServers:     ntp.servers,
        drandRound:     drand.round,
      },
    };

    logger.info(`[Aggregator] T_q = ${fingerprint.slice(0, 18)}...`);
    return result;
  }

  getLockedSources(): EntropySources | null { return this.locked; }
  getFinalizedEntropy(): FinalizedEntropy | null { return this.finalized; }
}

// ─── Pure Crypto Functions (also used by verifier) ───────────────────────────

export function computeEntropy(
  futureBlockHash: string,
  drandRound: string,
  btcAnchor: string
): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["bytes32", "bytes32", "bytes32"],
      [futureBlockHash, drandRound, btcAnchor]
    )
  );
}

export function computeQuantumTimestamp(
  tEth: number, tBtc: number, tNtp: number, tBeacon: number
): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "uint256", "uint256", "uint256"],
      [tEth, tBtc, tNtp, tBeacon]
    )
  );
}

export function computeOrderKey(entropy: string, wallet: string): string {
  return ethers.keccak256(
    ethers.solidityPacked(["bytes32", "address"], [entropy, wallet])
  );
}

export function computeCommitment(wallet: string, amount: bigint, nonce: string): string {
  return ethers.keccak256(
    ethers.solidityPacked(["address", "uint256", "bytes32"], [wallet, amount, nonce])
  );
}

export function computeFinalStateHash(
  allocationHash: string,
  quantumTs: string,
  entropy: string
): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["bytes32", "bytes32", "bytes32"],
      [allocationHash, quantumTs, entropy]
    )
  );
}

export function sortParticipants(
  participants: string[],
  entropy: string
): { address: string; orderKey: string; rank: number }[] {
  const withKeys = participants.map((addr) => ({
    address:  addr,
    orderKey: computeOrderKey(entropy, addr),
  }));

  withKeys.sort((a, b) => (a.orderKey < b.orderKey ? -1 : 1));

  return withKeys.map((p, i) => ({ ...p, rank: i + 1 }));
}
