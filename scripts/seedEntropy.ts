import hre, { ethers } from "hardhat";
import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

// ─── Seed Entropy & Quantum Timestamp ────────────────────────────────────────
// This script is called by the backend ORACLE_ROLE after State 2 (Genesis)
// to lock entropy sources and set the quantum timestamp fingerprint.

async function fetchDrand(): Promise<{ randomness: string; round: number }> {
  const url = `https://drand.cloudflare.com/8990e7a9aaed2ffed73dbd7092123d6f289930540d7651336225dc172e51b2ce/public/latest`;
  const { data } = await axios.get(url, { timeout: 10_000 });
  return data;
}

async function fetchBtcLatest(): Promise<{ height: number; hash: string; timestamp: number }> {
  const { data: height } = await axios.get("https://blockstream.info/api/blocks/tip/height", { timeout: 10_000 });
  const { data: hash   } = await axios.get("https://blockstream.info/api/blocks/tip/hash",   { timeout: 10_000 });
  const { data: block  } = await axios.get(`https://blockstream.info/api/block/${hash}`,       { timeout: 10_000 });
  return { height: Number(height), hash, timestamp: block.timestamp };
}

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const launchAddr = process.env.SAW_LAUNCH_ADDRESS;
  if (!launchAddr) throw new Error("SAW_LAUNCH_ADDRESS not set in .env");

  const LAUNCH_ABI = [
    "function lockEntropy(bytes32,bytes32,bytes32,uint256) external",
    "function finalizeEntropy() external",
    "function setQuantumTimestamp(uint256,uint256,uint256,uint256) external",
    "function currentState() external view returns (uint8)",
  ];
  const launch = new ethers.Contract(launchAddr, LAUNCH_ABI, signer);

  console.log("\n🔐 SAW Protocol — Entropy Seeding");
  console.log("─".repeat(50));

  const ethBlock = await hre.ethers.provider.getBlock("latest");
  if (!ethBlock) throw new Error("Could not fetch ETH block");

  const FUTURE_BLOCKS_AHEAD = 20;
  const lockedAtBlock = ethBlock.number + FUTURE_BLOCKS_AHEAD;

  console.log(`  ETH block: ${ethBlock.number}`);
  console.log(`  Future block target: ${lockedAtBlock}`);

  // Fetch external entropy sources
  console.log("\n📡 Fetching entropy sources...");
  const [drand, btc] = await Promise.all([fetchDrand(), fetchBtcLatest()]);

  const drandHash = "0x" + drand.randomness.slice(0, 64).padStart(64, "0");
  const btcAnchor = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "bytes32"],
      [btc.height, "0x" + btc.hash.padStart(64, "0")]
    )
  );
  const placeholder = ethers.keccak256(
    ethers.toUtf8Bytes(`SAW_PLACEHOLDER_BLOCK_${lockedAtBlock}`)
  );

  console.log(`  drand round ${drand.round}: ${drandHash.slice(0, 18)}...`);
  console.log(`  BTC block ${btc.height}: ${btcAnchor.slice(0, 18)}...`);

  // Lock entropy
  console.log("\n🔒 Locking entropy on-chain...");
  const lockTx = await launch.lockEntropy(placeholder, drandHash, btcAnchor, lockedAtBlock);
  await lockTx.wait();
  console.log(`  ✅ Entropy locked. TX: ${lockTx.hash}`);

  // Set quantum timestamp
  const tNtp = Math.floor(Date.now() / 1000);
  const tBeacon = Math.floor(drand.round * 30 + 1677685200);

  console.log("\n⏱️ Setting quantum timestamp...");
  const tsTx = await launch.setQuantumTimestamp(
    ethBlock.timestamp,
    btc.timestamp,
    tNtp,
    tBeacon
  );
  await tsTx.wait();
  console.log(`  ✅ Quantum timestamp set. TX: ${tsTx.hash}`);
  console.log(`  T_q = H(${ethBlock.timestamp} || ${btc.timestamp} || ${tNtp} || ${tBeacon})`);

  console.log(`\n⏳ Waiting for block ${lockedAtBlock} to be mined...`);
  console.log(`   Run finalizeEntropy.ts after block ${lockedAtBlock} is mined.`);
  console.log("─".repeat(50) + "\n");
}

main().catch((err) => {
  console.error("❌ seedEntropy failed:", err);
  process.exit(1);
});
