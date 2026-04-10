import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { logger } from "./utils/logger";
import { EntropyAggregator } from "./entropy/aggregator";
import { ProtocolIndexer } from "./indexer/listener";
import routes from "./api/routes";

dotenv.config();

// ─── App Setup ────────────────────────────────────────────────────────────────
const app  = express();
const PORT = parseInt(process.env.PORT || "4000", 10);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true,
}));
app.use(morgan("combined"));
app.use(express.json({ limit: "1mb" }));

// Rate limiting — prevent spam
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max:      500,
  message:  { error: "Too many requests — slow down" },
});
app.use("/api", limiter);

// ─── Blockchain Provider ──────────────────────────────────────────────────────
let provider: ethers.Provider | null = null;

async function setupProvider(): Promise<ethers.Provider | null> {
  const rpcUrl = process.env.ETH_RPC_URL;
  if (!rpcUrl) {
    logger.warn("[Server] ETH_RPC_URL not set — running in mock mode");
    return null;
  }
  try {
    const p = new ethers.JsonRpcProvider(rpcUrl);
    const network = await p.getNetwork();
    logger.info(`[Server] Connected to ${network.name} (chainId: ${network.chainId})`);
    return p;
  } catch (err) {
    logger.error("[Server] Provider connection failed:", err);
    return null;
  }
}

// ─── Protocol Services ────────────────────────────────────────────────────────
async function startServices(): Promise<void> {
  provider = await setupProvider();

  // Entropy Aggregator — works even without provider (uses mock data)
  const mockProvider = provider ?? new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const aggregator   = new EntropyAggregator(mockProvider);
  app.locals.aggregator = aggregator;
  app.locals.provider   = provider;

  // Protocol Indexer — only if we have contract addresses
  const launchAddr     = process.env.SAW_LAUNCH_ADDRESS;
  const allocatorAddr  = process.env.SAW_ALLOCATOR_ADDRESS;
  const settlementAddr = process.env.SAW_SETTLEMENT_ADDRESS;

  if (provider && launchAddr && allocatorAddr && settlementAddr) {
    logger.info("[Server] Starting protocol event indexer...");
    const indexer = new ProtocolIndexer(provider, launchAddr, allocatorAddr, settlementAddr);
    await indexer.startListening();
    app.locals.indexer = indexer;
    logger.info("[Server] Indexer active ✅");
  } else {
    logger.warn("[Server] Contract addresses not set — indexer disabled");
    app.locals.indexer = null;
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api", routes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("[Server] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function main() {
  await startServices();
  app.listen(PORT, "0.0.0.0", () => {
    logger.info(`\n${"─".repeat(60)}`);
    logger.info(`  SAW Protocol Backend — Running on port ${PORT}`);
    logger.info(`  "Twelve States. One Truth."`);
    logger.info(`${"─".repeat(60)}\n`);
    logger.info(`  Health:     http://localhost:${PORT}/api/health`);
    logger.info(`  State:      http://localhost:${PORT}/api/state`);
    logger.info(`  Entropy:    http://localhost:${PORT}/api/entropy/status`);
    logger.info(`  Timestamp:  http://localhost:${PORT}/api/timestamp`);
    logger.info(`  Audit:      http://localhost:${PORT}/api/audit/report`);
    logger.info(`  Tokenomics: http://localhost:${PORT}/api/tokenomics`);
    logger.info(`${"─".repeat(60)}\n`);
  });
}

main().catch((err) => {
  logger.error("[Server] Fatal startup error:", err);
  process.exit(1);
});

export default app;
