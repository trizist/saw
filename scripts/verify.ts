import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const network = hre.network.name;

  // Load latest deployment file
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const files = fs.readdirSync(deploymentsDir)
    .filter((f) => f.startsWith(network) && f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    throw new Error(`No deployment found for network: ${network}`);
  }

  const latest = JSON.parse(
    fs.readFileSync(path.join(deploymentsDir, files[files.length - 1]), "utf-8")
  );

  console.log(`\n🔍 Verifying contracts on ${network}...`);

  const verifications = [
    {
      name:    "SAWToken",
      address: latest.contracts.SAWToken,
      args:    [latest.deployer, "QmSAWProtocolGenesisCIDPlaceholder"],
    },
    {
      name:    "SAWAllocator",
      address: latest.contracts.SAWAllocator,
      args:    [latest.deployer],
    },
    {
      name:    "SAWSettlement",
      address: latest.contracts.SAWSettlement,
      args:    [latest.deployer, latest.contracts.SAWToken, latest.contracts.SAWAllocator],
    },
    {
      name:    "SAWGovernance",
      address: latest.contracts.SAWGovernance,
      args:    [latest.deployer, latest.contracts.SAWToken],
    },
    {
      name:    "SAWLaunch",
      address: latest.contracts.SAWLaunch,
      args:    [
        latest.deployer,
        latest.contracts.SAWToken,
        latest.contracts.SAWAllocator,
        latest.contracts.SAWSettlement,
      ],
    },
  ];

  for (const v of verifications) {
    try {
      console.log(`\n  Verifying ${v.name} (${v.address})...`);
      await hre.run("verify:verify", {
        address:              v.address,
        constructorArguments: v.args,
      });
      console.log(`  ✅ ${v.name} verified`);
    } catch (err: any) {
      if (err.message.includes("Already Verified")) {
        console.log(`  ℹ️  ${v.name} already verified`);
      } else {
        console.error(`  ❌ ${v.name} verification failed:`, err.message);
      }
    }
  }

  console.log("\n✅ Verification complete\n");
}

main().catch((err) => {
  console.error("❌ Verification failed:", err);
  process.exit(1);
});
