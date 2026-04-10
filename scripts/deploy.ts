import { ethers } from "ethers";
import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

// ─── Deployment Output ────────────────────────────────────────────────────────
interface DeploymentResult {
  network:         string;
  chainId:         number;
  deployer:        string;
  timestamp:       string;
  blockNumber:     number;
  contracts: {
    SAWToken:       string;
    SAWAllocator:   string;
    SAWSettlement:  string;
    SAWGovernance:  string;
    SAWLaunch:      string;
  };
  txHashes: Record<string, string>;
  gasUsed:  Record<string, string>;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network    = hre.network.name;
  const chainId    = (await hre.ethers.provider.getNetwork()).chainId;

  console.log("\n" + "═".repeat(60));
  console.log("  SAW Protocol — Deployment Script");
  console.log("  \"Twelve States. One Truth.\"");
  console.log("═".repeat(60));
  console.log(`  Network  : ${network} (chainId: ${chainId})`);
  console.log(`  Deployer : ${deployer.address}`);
  console.log(`  Balance  : ${ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address))} ETH`);
  console.log("═".repeat(60) + "\n");

  const result: DeploymentResult = {
    network,
    chainId:     Number(chainId),
    deployer:    deployer.address,
    timestamp:   new Date().toISOString(),
    blockNumber: await hre.ethers.provider.getBlockNumber(),
    contracts:   {} as any,
    txHashes:    {},
    gasUsed:     {},
  };

  const IPFS_CID = process.env.IPFS_MANIFEST_CID || "QmSAWProtocolGenesisCIDPlaceholder";

  // ── 1. Deploy SAWToken ────────────────────────────────────────────────────
  console.log("📦 [1/5] Deploying SAWToken...");
  const SAWToken = await hre.ethers.getContractFactory("SAWToken");
  const sawToken = await SAWToken.deploy(deployer.address, IPFS_CID);
  await sawToken.waitForDeployment();
  const tokenAddr = await sawToken.getAddress();
  result.contracts.SAWToken = tokenAddr;
  result.txHashes.SAWToken  = sawToken.deploymentTransaction()!.hash;
  console.log(`   ✅ SAWToken deployed: ${tokenAddr}`);
  console.log(`   TX: ${result.txHashes.SAWToken}`);

  // ── 2. Deploy SAWAllocator ────────────────────────────────────────────────
  console.log("\n📦 [2/5] Deploying SAWAllocator...");
  const SAWAllocator = await hre.ethers.getContractFactory("SAWAllocator");
  const sawAllocator = await SAWAllocator.deploy(deployer.address);
  await sawAllocator.waitForDeployment();
  const allocatorAddr = await sawAllocator.getAddress();
  result.contracts.SAWAllocator = allocatorAddr;
  result.txHashes.SAWAllocator  = sawAllocator.deploymentTransaction()!.hash;
  console.log(`   ✅ SAWAllocator deployed: ${allocatorAddr}`);

  // ── 3. Deploy SAWSettlement ───────────────────────────────────────────────
  console.log("\n📦 [3/5] Deploying SAWSettlement...");
  const SAWSettlement = await hre.ethers.getContractFactory("SAWSettlement");
  const sawSettlement = await SAWSettlement.deploy(
    deployer.address, tokenAddr, allocatorAddr
  );
  await sawSettlement.waitForDeployment();
  const settlementAddr = await sawSettlement.getAddress();
  result.contracts.SAWSettlement = settlementAddr;
  result.txHashes.SAWSettlement  = sawSettlement.deploymentTransaction()!.hash;
  console.log(`   ✅ SAWSettlement deployed: ${settlementAddr}`);

  // ── 4. Deploy SAWGovernance ───────────────────────────────────────────────
  console.log("\n📦 [4/5] Deploying SAWGovernance...");
  const SAWGovernance = await hre.ethers.getContractFactory("SAWGovernance");
  const sawGovernance = await SAWGovernance.deploy(deployer.address, tokenAddr);
  await sawGovernance.waitForDeployment();
  const governanceAddr = await sawGovernance.getAddress();
  result.contracts.SAWGovernance = governanceAddr;
  result.txHashes.SAWGovernance  = sawGovernance.deploymentTransaction()!.hash;
  console.log(`   ✅ SAWGovernance deployed: ${governanceAddr}`);

  // ── 5. Deploy SAWLaunch ───────────────────────────────────────────────────
  console.log("\n📦 [5/5] Deploying SAWLaunch...");
  const SAWLaunch = await hre.ethers.getContractFactory("SAWLaunch");
  const sawLaunch = await SAWLaunch.deploy(
    deployer.address, tokenAddr, allocatorAddr, settlementAddr
  );
  await sawLaunch.waitForDeployment();
  const launchAddr = await sawLaunch.getAddress();
  result.contracts.SAWLaunch = launchAddr;
  result.txHashes.SAWLaunch  = sawLaunch.deploymentTransaction()!.hash;
  console.log(`   ✅ SAWLaunch deployed: ${launchAddr}`);

  // ── 6. Link contracts ─────────────────────────────────────────────────────
  console.log("\n🔗 Linking contracts...");
  const linkTx = await sawToken.linkContracts(launchAddr, settlementAddr, governanceAddr);
  await linkTx.wait();
  console.log(`   ✅ Contracts linked. TX: ${linkTx.hash}`);
  result.txHashes.linkContracts = linkTx.hash;

  // ── 7. Grant protocol roles ───────────────────────────────────────────────
  console.log("\n🔑 Granting protocol roles...");
  const PROTOCOL_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROTOCOL_ROLE"));

  const grantAllocator = await sawAllocator.grantProtocolRole(launchAddr);
  await grantAllocator.wait();
  console.log(`   ✅ Allocator: PROTOCOL_ROLE granted to SAWLaunch`);

  const grantSettlement = await sawSettlement.grantProtocolRole(launchAddr);
  await grantSettlement.wait();
  console.log(`   ✅ Settlement: PROTOCOL_ROLE granted to SAWLaunch`);

  // ── 8. Verify Foundation seal ─────────────────────────────────────────────
  console.log("\n🔐 Verifying Foundation seal (State 1)...");
  const bytecodeHash   = await sawToken.bytecodeHash();
  const tokenomicsHash = await sawToken.tokonomicsHash();
  console.log(`   Bytecode Hash:   ${bytecodeHash}`);
  console.log(`   Tokenomics Hash: ${tokenomicsHash}`);
  console.log(`   Foundation sealed: ${await sawToken.foundationSealed()}`);

  // ── 9. Save deployment output ─────────────────────────────────────────────
  const outDir  = path.join(__dirname, "..", "deployments");
  const outFile = path.join(outDir, `${network}-${Date.now()}.json`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(`\n💾 Deployment saved to: ${outFile}`);

  // ── 10. Generate .env snippet ─────────────────────────────────────────────
  const envSnippet = `
# ── SAW Protocol Contract Addresses (${network}) ──
SAW_TOKEN_ADDRESS=${tokenAddr}
SAW_LAUNCH_ADDRESS=${launchAddr}
SAW_ALLOCATOR_ADDRESS=${allocatorAddr}
SAW_SETTLEMENT_ADDRESS=${settlementAddr}
SAW_GOVERNANCE_ADDRESS=${governanceAddr}
VITE_SAW_LAUNCH_ADDRESS=${launchAddr}
VITE_SAW_TOKEN_ADDRESS=${tokenAddr}
`;
  const envFile = path.join(outDir, `${network}.env`);
  fs.writeFileSync(envFile, envSnippet.trim());
  console.log(`📋 .env snippet saved to: ${envFile}`);

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("  ✅ DEPLOYMENT COMPLETE");
  console.log("═".repeat(60));
  console.log(`  SAWToken:      ${tokenAddr}`);
  console.log(`  SAWLaunch:     ${launchAddr}`);
  console.log(`  SAWAllocator:  ${allocatorAddr}`);
  console.log(`  SAWSettlement: ${settlementAddr}`);
  console.log(`  SAWGovernance: ${governanceAddr}`);
  console.log("═".repeat(60));
  console.log("\n  Next Steps:");
  console.log("  1. Set entropy sources:  npx hardhat run scripts/seedEntropy.ts");
  console.log("  2. Verify contracts:     npx hardhat run scripts/verify.ts");
  console.log("  3. Start backend:        cd backend && npm run dev");
  console.log("  4. Start frontend:       cd frontend && npm run dev");
  console.log("═".repeat(60) + "\n");

  return result;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Deployment failed:", err);
    process.exit(1);
  });
