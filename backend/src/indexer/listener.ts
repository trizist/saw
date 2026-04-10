import { ethers } from "ethers";
import { logger } from "../utils/logger";
import type { ProtocolState, CommitmentData, ParticipantAllocation } from "../utils/types";

// ─── SAW Protocol Event Indexer ───────────────────────────────────────────────
// Listens to on-chain events and maintains a local cache for the frontend API

const STATE_NAMES = [
  "FOUNDATION", "GENESIS", "AWAKENING", "PERCEPTION",
  "TRANSFORMATION", "HARMONY", "FLOW", "POWER",
  "REFLECTION", "GROWTH", "PURITY", "TRANSCENDENCE",
];

// Minimal ABIs for event listening
const LAUNCH_ABI = [
  "event StateAdvanced(uint8 indexed from, uint8 indexed to, bytes32 stateHash, uint256 timestamp)",
  "event CommitmentSubmitted(address indexed participant, bytes32 commitHash, uint256 timestamp)",
  "event CommitmentRevealed(address indexed participant, uint256 amount, bool valid)",
  "event EntropyLocked(bytes32 entropyHash, uint256 blockNumber)",
  "event EntropyFinalized(bytes32 finalEntropy)",
  "event QuantumTimestampSet(bytes32 fingerprint)",
  "event ParticipantPurged(address indexed participant, string reason)",
  "event LaunchFinalized(bytes32 finalStateHash)",
];

const ALLOCATOR_ABI = [
  "event AllocationComputed(address indexed participant, uint256 rank, uint256 tokenAmount)",
  "event AllocationFinalized(bytes32 allocationHash, uint256 totalParticipants)",
];

const SETTLEMENT_ABI = [
  "event SettlementInitiated(uint256 participantCount, uint256 totalTokens)",
  "event SettlementCompleted(bytes32 settlementHash, uint256 totalDistributed, uint256 timestamp)",
  "event TokensDistributed(address indexed recipient, uint256 amount, uint256 rank)",
  "event LiquidityDeployed(address indexed pool, uint256 tokenAmount, uint256 ethAmount)",
];

export class ProtocolIndexer {
  private provider: ethers.Provider;
  private launchContract: ethers.Contract;
  private allocatorContract: ethers.Contract;
  private settlementContract: ethers.Contract;

  // In-memory state cache
  private currentStateIdx = 0;
  private stateHistory: ProtocolState[] = [];
  private commitments  = new Map<string, CommitmentData>();
  private allocations  = new Map<string, ParticipantAllocation>();
  private finalEntropy: string | null = null;
  private quantumTs   : string | null = null;
  private finalHash   : string | null = null;
  private settlementHash: string | null = null;

  constructor(
    provider: ethers.Provider,
    launchAddr: string,
    allocatorAddr: string,
    settlementAddr: string
  ) {
    this.provider          = provider;
    this.launchContract    = new ethers.Contract(launchAddr,     LAUNCH_ABI,     provider);
    this.allocatorContract = new ethers.Contract(allocatorAddr,  ALLOCATOR_ABI,  provider);
    this.settlementContract= new ethers.Contract(settlementAddr, SETTLEMENT_ABI, provider);
  }

  // ─── Start Listening ────────────────────────────────────────────────────────
  async startListening(): Promise<void> {
    logger.info("[Indexer] Starting event listeners...");

    // ── SAWLaunch Events ──────────────────────────────────────────────────────
    this.launchContract.on("StateAdvanced", (from, to, stateHash, timestamp) => {
      const toIdx = Number(to);
      this.currentStateIdx = toIdx;
      const state: ProtocolState = {
        stateIndex:  toIdx,
        stateName:   STATE_NAMES[toIdx] ?? `STATE_${toIdx}`,
        stateHash:   stateHash,
        timestamp:   Number(timestamp),
        blockNumber: 0,
      };
      this.stateHistory.push(state);
      logger.info(`[Indexer] State → ${state.stateName} | hash=${stateHash.slice(0, 18)}...`);
    });

    this.launchContract.on("CommitmentSubmitted", (participant, commitHash, timestamp) => {
      this.commitments.set(participant.toLowerCase(), {
        participantAddress: participant,
        commitHash,
        timestamp:          Number(timestamp),
        revealed:           false,
        valid:              false,
      });
      logger.debug(`[Indexer] Commitment: ${participant.slice(0,10)}... → ${commitHash.slice(0,18)}...`);
    });

    this.launchContract.on("CommitmentRevealed", (participant, amount, valid) => {
      const existing = this.commitments.get(participant.toLowerCase());
      if (existing) {
        existing.revealed = true;
        existing.valid    = valid;
      }
      logger.debug(`[Indexer] Reveal: ${participant.slice(0,10)}... valid=${valid}`);
    });

    this.launchContract.on("EntropyFinalized", (finalEntropy) => {
      this.finalEntropy = finalEntropy;
      logger.info(`[Indexer] Entropy finalized: ${finalEntropy.slice(0, 18)}...`);
    });

    this.launchContract.on("QuantumTimestampSet", (fingerprint) => {
      this.quantumTs = fingerprint;
      logger.info(`[Indexer] Quantum timestamp: ${fingerprint.slice(0, 18)}...`);
    });

    this.launchContract.on("LaunchFinalized", (finalStateHash) => {
      this.finalHash = finalStateHash;
      logger.info(`[Indexer] 🎉 Launch finalized: S_final=${finalStateHash.slice(0, 18)}...`);
    });

    // ── SAWAllocator Events ───────────────────────────────────────────────────
    this.allocatorContract.on("AllocationComputed", (participant, rank, tokenAmount) => {
      const existing = this.allocations.get(participant.toLowerCase()) ?? {
        address:         participant,
        rank:            Number(rank),
        orderKey:        "",
        committedAmount: "0",
        tokenAmount:     tokenAmount.toString(),
        weight:          "0",
        settled:         false,
      };
      existing.rank        = Number(rank);
      existing.tokenAmount = tokenAmount.toString();
      this.allocations.set(participant.toLowerCase(), existing);
    });

    // ── SAWSettlement Events ──────────────────────────────────────────────────
    this.settlementContract.on("SettlementCompleted", (settlementHash, totalDistributed, timestamp) => {
      this.settlementHash = settlementHash;
      logger.info(`[Indexer] ⚡ Atomic settlement complete! hash=${settlementHash.slice(0,18)}...`);
    });

    this.settlementContract.on("TokensDistributed", (recipient, amount, rank) => {
      const alloc = this.allocations.get(recipient.toLowerCase());
      if (alloc) alloc.settled = true;
    });

    logger.info("[Indexer] All event listeners active ✅");
  }

  // ─── State Queries ──────────────────────────────────────────────────────────
  getCurrentState()  { return { index: this.currentStateIdx, name: STATE_NAMES[this.currentStateIdx] }; }
  getStateHistory()  { return [...this.stateHistory]; }
  getCommitments()   { return Array.from(this.commitments.values()); }
  getCommitment(addr: string) { return this.commitments.get(addr.toLowerCase()); }
  getAllocations()   { return Array.from(this.allocations.values()).sort((a, b) => a.rank - b.rank); }
  getAllocation(addr: string) { return this.allocations.get(addr.toLowerCase()); }
  getFinalEntropy()  { return this.finalEntropy; }
  getQuantumTs()     { return this.quantumTs; }
  getFinalHash()     { return this.finalHash; }
  getSettlementHash() { return this.settlementHash; }
  getParticipantCount() { return this.commitments.size; }
  getValidParticipantCount() { return Array.from(this.commitments.values()).filter(c => c.valid).length; }
}
