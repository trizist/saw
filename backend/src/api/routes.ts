import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import { EntropyAggregator, computeOrderKey, computeCommitment, sortParticipants } from "../entropy/aggregator";
import { AuditVerifier } from "../verifier/recompute";
import { logger } from "../utils/logger";

const router = Router();

// ─── Validation Schemas ───────────────────────────────────────────────────────
const CommitSchema = z.object({
  wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  amount: z.string(),
  nonce:  z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

const VerifyOrderSchema = z.object({
  entropy:     z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  participant: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

const AuditSchema = z.object({
  futureBlockHash: z.string(),
  drandRound:      z.string(),
  btcAnchor:       z.string(),
  tEth:            z.number(),
  tBtc:            z.number(),
  tNtp:            z.number(),
  tBeacon:         z.number(),
  participants:    z.array(z.object({ address: z.string(), amount: z.string() })),
  totalTokens:     z.string(),
  onChainEntropy:  z.string(),
  onChainQuantumTs:z.string(),
  onChainAllocations: z.array(z.object({
    address: z.string(), tokenAmount: z.string(), rank: z.number()
  })),
  onChainFinalStateHash: z.string(),
});

// ─── Middleware ───────────────────────────────────────────────────────────────
const validate = (schema: z.ZodSchema) => (req: Request, res: Response, next: Function) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Validation failed", details: result.error.issues });
    return;
  }
  next();
};

// ─── Health ───────────────────────────────────────────────────────────────────
router.get("/health", (_req, res) => {
  res.json({ status: "ok", protocol: "SAW", version: "1.0.0", timestamp: Date.now() });
});

// ─── Protocol State ───────────────────────────────────────────────────────────
router.get("/state", async (req, res) => {
  try {
    const indexer = req.app.locals.indexer;
    if (!indexer) return res.json({ state: 0, stateName: "FOUNDATION", message: "Indexer not connected" });
    res.json({
      current:       indexer.getCurrentState(),
      history:       indexer.getStateHistory(),
      participants:  indexer.getParticipantCount(),
      validCount:    indexer.getValidParticipantCount(),
      entropy:       indexer.getFinalEntropy(),
      quantumTs:     indexer.getQuantumTs(),
      finalHash:     indexer.getFinalHash(),
      settlementHash:indexer.getSettlementHash(),
    });
  } catch (err) {
    logger.error("[API] /state error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Entropy ──────────────────────────────────────────────────────────────────
router.get("/entropy/sources", async (req, res) => {
  try {
    const aggregator: EntropyAggregator = req.app.locals.aggregator;
    const provider: ethers.Provider     = req.app.locals.provider;

    if (!provider) return res.status(503).json({ error: "No provider connected" });

    const { sources, currentBlock } = await aggregator.lockEntropySources();
    res.json({
      sources,
      currentBlock,
      message: `Entropy locked. Future block target: ${sources.lockedAtBlock}`,
    });
  } catch (err: any) {
    logger.error("[API] /entropy/sources error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/entropy/finalize", async (req, res) => {
  try {
    const aggregator: EntropyAggregator = req.app.locals.aggregator;
    const finalized = await aggregator.finalizeEntropy();
    if (!finalized) {
      return res.status(202).json({ message: "Future block not yet mined. Try again later." });
    }
    res.json({ finalized, message: "Entropy finalized successfully" });
  } catch (err: any) {
    logger.error("[API] /entropy/finalize error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/entropy/status", (req, res) => {
  const aggregator: EntropyAggregator = req.app.locals.aggregator;
  const locked    = aggregator.getLockedSources();
  const finalized = aggregator.getFinalizedEntropy();
  res.json({
    locked:    !!locked,
    finalized: !!finalized,
    sources:   locked,
    entropy:   finalized?.seed ?? null,
    finalizedAt: finalized?.finalizedAt ?? null,
  });
});

// ─── Quantum Timestamp ────────────────────────────────────────────────────────
router.get("/timestamp", async (req, res) => {
  try {
    const aggregator: EntropyAggregator = req.app.locals.aggregator;
    const tsData = await aggregator.computeQuantumTimestamp();
    res.json({
      quantumTimestamp: tsData,
      formula: "T_q = H(T_eth || T_btc || T_ntp || T_beacon)",
      fingerprint: tsData.fingerprint,
    });
  } catch (err: any) {
    logger.error("[API] /timestamp error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Commitment Helpers ───────────────────────────────────────────────────────
router.post("/commitment/compute", validate(CommitSchema), (req, res) => {
  try {
    const { wallet, amount, nonce } = req.body;
    const commitHash = computeCommitment(wallet, BigInt(amount), nonce);
    res.json({
      commitHash,
      formula:  "C_i = H(wallet || amount || nonce)",
      inputs:   { wallet, amount, nonce },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Fair Ordering ────────────────────────────────────────────────────────────
router.post("/order/verify", validate(VerifyOrderSchema), (req, res) => {
  try {
    const { entropy, participant } = req.body;
    const orderKey = computeOrderKey(entropy, participant);
    res.json({
      orderKey,
      formula: "Order_i = H(E || wallet_i)",
      inputs:  { entropy, participant },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/order/sort", (req, res) => {
  try {
    const { entropy, participants } = req.body as { entropy: string; participants: string[] };
    if (!entropy || !Array.isArray(participants)) {
      return res.status(400).json({ error: "entropy and participants[] required" });
    }
    const sorted = sortParticipants(participants, entropy);
    res.json({
      sorted,
      formula: "Order_i = H(E || wallet_i), sorted ascending",
      totalParticipants: sorted.length,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Participants ─────────────────────────────────────────────────────────────
router.get("/participants", (req, res) => {
  const indexer = req.app.locals.indexer;
  if (!indexer) return res.json({ participants: [], total: 0 });
  res.json({
    participants: indexer.getCommitments(),
    total:        indexer.getParticipantCount(),
    valid:        indexer.getValidParticipantCount(),
  });
});

router.get("/participants/:address", (req, res) => {
  const indexer = req.app.locals.indexer;
  if (!indexer) return res.status(503).json({ error: "Indexer not connected" });
  const commitment = indexer.getCommitment(req.params.address);
  const allocation = indexer.getAllocation(req.params.address);
  if (!commitment) return res.status(404).json({ error: "Participant not found" });
  res.json({ commitment, allocation });
});

// ─── Allocations ─────────────────────────────────────────────────────────────
router.get("/allocations", (req, res) => {
  const indexer = req.app.locals.indexer;
  if (!indexer) return res.json({ allocations: [], total: 0 });
  res.json({
    allocations: indexer.getAllocations(),
    total:       indexer.getAllocations().length,
    settlementHash: indexer.getSettlementHash(),
  });
});

router.get("/allocations/:address", (req, res) => {
  const indexer = req.app.locals.indexer;
  if (!indexer) return res.status(503).json({ error: "Indexer not connected" });
  const alloc = indexer.getAllocation(req.params.address);
  if (!alloc) return res.status(404).json({ error: "Allocation not found" });
  res.json(alloc);
});

// ─── Audit / Verification ─────────────────────────────────────────────────────
router.post("/audit/verify", validate(AuditSchema), (req, res) => {
  try {
    const verifier = new AuditVerifier();
    const input = {
      ...req.body,
      participants: req.body.participants.map((p: any) => ({
        address: p.address,
        amount:  BigInt(p.amount),
      })),
      totalTokens: BigInt(req.body.totalTokens),
      onChainAllocations: req.body.onChainAllocations.map((a: any) => ({
        address:     a.address,
        tokenAmount: BigInt(a.tokenAmount),
        rank:        a.rank,
      })),
    };
    const result = verifier.verify(input);
    res.json(result);
  } catch (err: any) {
    logger.error("[API] /audit/verify error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/audit/report", (req, res) => {
  const indexer = req.app.locals.indexer;
  if (!indexer) return res.status(503).json({ error: "Indexer not connected" });
  res.json({
    finalStateHash:  indexer.getFinalHash(),
    entropy:         indexer.getFinalEntropy(),
    quantumTs:       indexer.getQuantumTs(),
    settlementHash:  indexer.getSettlementHash(),
    totalParticipants: indexer.getParticipantCount(),
    validParticipants: indexer.getValidParticipantCount(),
    stateHistory:    indexer.getStateHistory(),
    generatedAt:     Date.now(),
    instructions: {
      step1: "Entropy: verify E = H(futureBlockHash || drandRound || btcAnchor) via public explorers",
      step2: "Ordering: apply Order_i = H(E || wallet_i) and confirm ascending sort matches on-chain",
      step3: "Allocations: verify pro-rata distribution weights were applied correctly",
      step4: "Timestamp: validate T_q = H(T_eth || T_btc || T_ntp || T_beacon) against historical data",
    },
  });
});

// ─── Tokenomics ───────────────────────────────────────────────────────────────
router.get("/tokenomics", (_req, res) => {
  res.json({
    totalSupply:      "1,000,000,000 SAW",
    totalSupplyWei:   "1000000000000000000000000000",
    distribution: [
      { bucket: "Public Participants",   bps: 4000, pct: "40%", tokens: "400,000,000", state: "State 8: Power" },
      { bucket: "Governance Emissions",  bps: 3000, pct: "30%", tokens: "300,000,000", state: "State 12: Transcendence" },
      { bucket: "Liquidity (Protocol)",  bps: 1000, pct: "10%", tokens: "100,000,000", state: "State 2: Genesis" },
      { bucket: "Liquidity (LP)",        bps: 1000, pct: "10%", tokens: "100,000,000", state: "State 9: Reflection" },
      { bucket: "Ecosystem Treasury",    bps:  800, pct:  "8%", tokens:  "80,000,000", state: "State 10: Growth" },
      { bucket: "Early Contributors",    bps:  200, pct:  "2%", tokens:  "20,000,000", state: "State 3: Awakening" },
    ],
  });
});

export default router;
