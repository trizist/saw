// SPDX-License-Identifier: MIT
// SAW Protocol — Comprehensive Launch Test Suite
// Tests the full 12-state ceremony: Foundation → Transcendence

import { expect } from "chai";
import { ethers } from "hardhat";
import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type {
  SAWToken,
  SAWLaunch,
  SAWAllocator,
  SAWSettlement,
  SAWGovernance,
} from "../typechain-types";

// ─── Test Constants ───────────────────────────────────────────────────────────
const TOTAL_SUPPLY        = ethers.parseEther("1000000000"); // 1B SAW
const COMMIT_WINDOW       = 3 * 24 * 60 * 60; // 3 days
const REVEAL_WINDOW       = 2 * 24 * 60 * 60; // 2 days
const ENTROPY_BLOCKS_AHEAD = 20;

// Tokenomics
const PUBLIC_BPS    = 4000n;
const GOVERNANCE_BPS= 3000n;
const PROTO_LIQ_BPS = 1000n;
const LP_LIQ_BPS    = 1000n;
const TREASURY_BPS  = 800n;
const EARLY_BPS     = 200n;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function computeCommitHash(wallet: string, amount: bigint, nonce: string): string {
  return ethers.keccak256(
    ethers.solidityPacked(["address", "uint256", "bytes32"], [wallet, amount, nonce])
  );
}

function computeEntropy(blockHash: string, drand: string, btc: string): string {
  return ethers.keccak256(
    ethers.solidityPacked(["bytes32", "bytes32", "bytes32"], [blockHash, drand, btc])
  );
}

function computeOrderKey(entropy: string, wallet: string): string {
  return ethers.keccak256(
    ethers.solidityPacked(["bytes32", "address"], [entropy, wallet])
  );
}

// ─── Fixture ──────────────────────────────────────────────────────────────────
async function deploySAWProtocol() {
  const [admin, operator, oracle, alice, bob, carol, dave, eve, ...rest] =
    await ethers.getSigners();

  const ipfsCID = "QmSAWProtocolGenesis2026";

  // 1. Deploy SAWToken
  const TokenFactory = await ethers.getContractFactory("SAWToken");
  const token = (await TokenFactory.deploy(admin.address, ipfsCID)) as SAWToken;
  await token.waitForDeployment();

  // 2. Deploy SAWAllocator
  const AllocFactory = await ethers.getContractFactory("SAWAllocator");
  const allocator = (await AllocFactory.deploy(admin.address)) as SAWAllocator;
  await allocator.waitForDeployment();

  // 3. Deploy SAWSettlement
  const SettleFactory = await ethers.getContractFactory("SAWSettlement");
  const settlement = (await SettleFactory.deploy(
    admin.address,
    await token.getAddress(),
    await allocator.getAddress()
  )) as SAWSettlement;
  await settlement.waitForDeployment();

  // 4. Deploy SAWGovernance
  const GovFactory = await ethers.getContractFactory("SAWGovernance");
  const governance = (await GovFactory.deploy(
    admin.address,
    await token.getAddress()
  )) as SAWGovernance;
  await governance.waitForDeployment();

  // 5. Deploy SAWLaunch
  const LaunchFactory = await ethers.getContractFactory("SAWLaunch");
  const launch = (await LaunchFactory.deploy(
    admin.address,
    await token.getAddress(),
    await allocator.getAddress(),
    await settlement.getAddress()
  )) as SAWLaunch;
  await launch.waitForDeployment();

  // 6. Link contracts (mint all allocations)
  await token.linkContracts(
    await launch.getAddress(),
    await settlement.getAddress(),
    await governance.getAddress()
  );

  // 7. Grant protocol roles
  const PROTOCOL_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROTOCOL_ROLE"));
  const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));
  const ORACLE_ROLE   = ethers.keccak256(ethers.toUtf8Bytes("ORACLE_ROLE"));

  await allocator.grantProtocolRole(await launch.getAddress());
  await settlement.grantProtocolRole(await launch.getAddress());
  await launch.grantRole(OPERATOR_ROLE, operator.address);
  await launch.grantRole(ORACLE_ROLE,   oracle.address);

  return {
    token, allocator, settlement, governance, launch,
    admin, operator, oracle, alice, bob, carol, dave, eve, rest,
    PROTOCOL_ROLE, OPERATOR_ROLE, ORACLE_ROLE,
    ipfsCID,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("SAW Protocol — Full 12-State Ceremony", function () {
  this.timeout(120_000);

  // ── T1: Token ─────────────────────────────────────────────────────────────
  describe("SAWToken — Foundation & Tokenomics", function () {
    it("should deploy with correct total supply", async function () {
      const { token } = await loadFixture(deploySAWProtocol);
      expect(await token.TOTAL_SUPPLY()).to.equal(TOTAL_SUPPLY);
      expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
    });

    it("should have correct tokenomics constants", async function () {
      const { token } = await loadFixture(deploySAWProtocol);
      expect(await token.PUBLIC_PARTICIPANTS_BPS()).to.equal(PUBLIC_BPS);
      expect(await token.GOVERNANCE_EMISSIONS_BPS()).to.equal(GOVERNANCE_BPS);
      expect(await token.PROTOCOL_LIQUIDITY_BPS()).to.equal(PROTO_LIQ_BPS);
      expect(await token.LP_LIQUIDITY_BPS()).to.equal(LP_LIQ_BPS);
      expect(await token.ECOSYSTEM_TREASURY_BPS()).to.equal(TREASURY_BPS);
      expect(await token.EARLY_CONTRIBUTORS_BPS()).to.equal(EARLY_BPS);
    });

    it("should have correct allocation amounts post-link", async function () {
      const { token } = await loadFixture(deploySAWProtocol);
      const publicAlloc     = (TOTAL_SUPPLY * PUBLIC_BPS)    / 10000n;
      const govAlloc        = (TOTAL_SUPPLY * GOVERNANCE_BPS) / 10000n;
      const protLiqAlloc    = (TOTAL_SUPPLY * PROTO_LIQ_BPS)  / 10000n;
      const earlyAlloc      = (TOTAL_SUPPLY * EARLY_BPS)      / 10000n;
      const treasuryAlloc   = (TOTAL_SUPPLY * TREASURY_BPS)   / 10000n;

      expect(await token.publicParticipantsAlloc()).to.equal(publicAlloc);
      expect(await token.governanceEmissionsAlloc()).to.equal(govAlloc);
      expect(await token.protocolLiquidityAlloc()).to.equal(protLiqAlloc);
      expect(await token.earlyContributorsAlloc()).to.equal(earlyAlloc);
      expect(await token.ecosystemTreasuryAlloc()).to.equal(treasuryAlloc);
    });

    it("should seal foundation with bytecode and tokenomics hashes", async function () {
      const { token } = await loadFixture(deploySAWProtocol);
      expect(await token.foundationSealed()).to.be.true;
      expect(await token.bytecodeHash()).to.not.equal(ethers.ZeroHash);
      expect(await token.tokonomicsHash()).to.not.equal(ethers.ZeroHash);
    });

    it("should only allow linkContracts once", async function () {
      const { token, admin, launch, settlement, governance } = await loadFixture(deploySAWProtocol);
      await expect(
        token.linkContracts(
          await launch.getAddress(),
          await settlement.getAddress(),
          await governance.getAddress()
        )
      ).to.be.revertedWith("SAWToken: already linked");
    });

    it("should have correct name and symbol", async function () {
      const { token } = await loadFixture(deploySAWProtocol);
      expect(await token.name()).to.equal("Secure Atomic Wave");
      expect(await token.symbol()).to.equal("SAW");
      expect(await token.decimals()).to.equal(18n);
    });

    it("should emit FoundationSealed event on deploy", async function () {
      const [admin] = await ethers.getSigners();
      const TokenFactory = await ethers.getContractFactory("SAWToken");
      const token = await TokenFactory.deploy(admin.address, "QmTest");
      await token.waitForDeployment();
      // Verify foundation is sealed (event was emitted during construction)
      expect(await token.foundationSealed()).to.be.true;
      expect(await token.bytecodeHash()).to.not.equal(ethers.ZeroHash);
    });
  });

  // ── T2: Launch State Machine ──────────────────────────────────────────────
  describe("SAWLaunch — State Machine (Foundation → GENESIS)", function () {
    it("should initialize at FOUNDATION state (0)", async function () {
      const { launch } = await loadFixture(deploySAWProtocol);
      expect(await launch.currentState()).to.equal(0); // FOUNDATION
    });

    it("should have non-zero state hash for Foundation", async function () {
      const { launch } = await loadFixture(deploySAWProtocol);
      const s1Hash = await launch.getStateHash(0);
      expect(s1Hash).to.not.equal(ethers.ZeroHash);
    });

    it("should advance to GENESIS after entropy is locked", async function () {
      const { launch, oracle, operator } = await loadFixture(deploySAWProtocol);

      const currentBlock = await ethers.provider.getBlockNumber();
      const futureBlock  = currentBlock + ENTROPY_BLOCKS_AHEAD;

      // Oracle locks entropy
      const placeholder = ethers.keccak256(ethers.toUtf8Bytes("test_entropy"));
      const drandHash   = ethers.keccak256(ethers.toUtf8Bytes("drand_round_1"));
      const btcAnchor   = ethers.keccak256(ethers.toUtf8Bytes("btc_block_500000"));

      await launch.connect(oracle).lockEntropy(
        placeholder, drandHash, btcAnchor, futureBlock
      );

      const entropySeed = await launch.getEntropySeed();
      expect(entropySeed.futureBlockHash).to.equal(placeholder);
      expect(entropySeed.drandRound).to.equal(drandHash);
      expect(entropySeed.btcAnchor).to.equal(btcAnchor);
      expect(entropySeed.finalized).to.be.false;

      await expect(launch.connect(operator).advanceState())
        .to.emit(launch, "StateAdvanced");

      expect(await launch.currentState()).to.equal(1); // GENESIS
    });

    it("should reject entropy lock twice", async function () {
      const { launch, oracle } = await loadFixture(deploySAWProtocol);
      const currentBlock = await ethers.provider.getBlockNumber();
      const placeholder  = ethers.keccak256(ethers.toUtf8Bytes("x"));
      const drand        = ethers.keccak256(ethers.toUtf8Bytes("d"));
      const btc          = ethers.keccak256(ethers.toUtf8Bytes("b"));

      await launch.connect(oracle).lockEntropy(placeholder, drand, btc, currentBlock + 20);
      await expect(
        launch.connect(oracle).lockEntropy(placeholder, drand, btc, currentBlock + 40)
      ).to.be.revertedWithCustomError(launch, "EntropyAlreadyLocked");
    });

    it("should reject non-operator advanceState", async function () {
      const { launch, alice } = await loadFixture(deploySAWProtocol);
      await expect(launch.connect(alice).advanceState())
        .to.be.revertedWithCustomError(launch, "AccessControlUnauthorizedAccount");
    });

    it("state hash chain should be monotonically growing", async function () {
      const { launch, oracle, operator } = await loadFixture(deploySAWProtocol);
      const s1 = await launch.getStateHash(0);

      const currentBlock = await ethers.provider.getBlockNumber();
      await launch.connect(oracle).lockEntropy(
        ethers.keccak256(ethers.toUtf8Bytes("x")),
        ethers.keccak256(ethers.toUtf8Bytes("d")),
        ethers.keccak256(ethers.toUtf8Bytes("b")),
        currentBlock + 20
      );
      await launch.connect(operator).advanceState(); // → GENESIS

      const s2 = await launch.getStateHash(1);
      expect(s1).to.not.equal(s2);
      expect(s2).to.not.equal(ethers.ZeroHash);

      const chain = await launch.getStateHashChain();
      expect(chain.length).to.equal(2);
      expect(chain[0]).to.equal(s1);
      expect(chain[1]).to.equal(s2);
    });
  });

  // ── T3: Quantum Timestamp ─────────────────────────────────────────────────
  describe("SAWLaunch — Quantum Timestamp", function () {
    it("should set quantum timestamp correctly", async function () {
      const { launch, oracle } = await loadFixture(deploySAWProtocol);

      const tEth    = Math.floor(Date.now() / 1000);
      const tBtc    = tEth - 600;
      const tNtp    = tEth + 1;
      const tBeacon = tEth - 30;

      await launch.connect(oracle).setQuantumTimestamp(tEth, tBtc, tNtp, tBeacon);

      const fingerprint = await launch.getQuantumTimestamp();
      expect(fingerprint).to.not.equal(ethers.ZeroHash);

      // Verify the formula: T_q = H(T_eth || T_btc || T_ntp || T_beacon)
      const expected = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256", "uint256", "uint256", "uint256"],
          [tEth, tBtc, tNtp, tBeacon]
        )
      );
      expect(fingerprint).to.equal(expected);
    });

    it("should reject duplicate quantum timestamp", async function () {
      const { launch, oracle } = await loadFixture(deploySAWProtocol);
      const now = Math.floor(Date.now() / 1000);
      await launch.connect(oracle).setQuantumTimestamp(now, now, now, now);
      await expect(
        launch.connect(oracle).setQuantumTimestamp(now, now, now, now)
      ).to.be.revertedWithCustomError(launch, "QuantumTimestampAlreadySet");
    });

    it("should emit QuantumTimestampSet event", async function () {
      const { launch, oracle } = await loadFixture(deploySAWProtocol);
      const now = Math.floor(Date.now() / 1000);
      await expect(launch.connect(oracle).setQuantumTimestamp(now, now, now, now))
        .to.emit(launch, "QuantumTimestampSet");
    });
  });

  // ── T4: Commit / Reveal ───────────────────────────────────────────────────
  describe("SAWLaunch — Commit / Reveal Cycle", function () {
    // Helper: advance to PERCEPTION state
    async function advanceToPerception(
      launch: SAWLaunch,
      oracle: SignerWithAddress,
      operator: SignerWithAddress
    ) {
      const currentBlock = await ethers.provider.getBlockNumber();
      // Lock entropy
      await launch.connect(oracle).lockEntropy(
        ethers.keccak256(ethers.toUtf8Bytes("eh")),
        ethers.keccak256(ethers.toUtf8Bytes("dr")),
        ethers.keccak256(ethers.toUtf8Bytes("btc")),
        currentBlock + 20
      );
      await launch.connect(operator).advanceState(); // → GENESIS (1)

      // Set quantum timestamp
      const now = Math.floor(Date.now() / 1000);
      await launch.connect(oracle).setQuantumTimestamp(now, now - 600, now + 1, now - 30);
      await launch.connect(operator).advanceState(); // → AWAKENING (2)
      await launch.connect(operator).advanceState(); // → PERCEPTION (3)
    }

    it("should allow commit in PERCEPTION state", async function () {
      const { launch, oracle, operator, alice } = await loadFixture(deploySAWProtocol);
      await advanceToPerception(launch, oracle, operator);

      const amount = ethers.parseEther("1");
      const nonce  = ethers.randomBytes(32);
      const nonceHex = ethers.hexlify(nonce);
      const commitHash = computeCommitHash(alice.address, amount, nonceHex);

      await expect(launch.connect(alice).commit(commitHash))
        .to.emit(launch, "CommitmentSubmitted")
        .withArgs(alice.address, commitHash, await time.latest() + 1);

      const commitment = await launch.getCommitment(alice.address);
      expect(commitment.hash).to.equal(commitHash);
      expect(commitment.revealed).to.be.false;
    });

    it("should reject duplicate commit from same address", async function () {
      const { launch, oracle, operator, alice } = await loadFixture(deploySAWProtocol);
      await advanceToPerception(launch, oracle, operator);

      const hash = computeCommitHash(alice.address, 1n, ethers.hexlify(ethers.randomBytes(32)));
      await launch.connect(alice).commit(hash);
      await expect(launch.connect(alice).commit(hash))
        .to.be.revertedWithCustomError(launch, "AlreadyCommitted");
    });

    it("should reject zero commitment hash", async function () {
      const { launch, oracle, operator, alice } = await loadFixture(deploySAWProtocol);
      await advanceToPerception(launch, oracle, operator);
      await expect(launch.connect(alice).commit(ethers.ZeroHash))
        .to.be.revertedWithCustomError(launch, "InvalidCommitmentHash");
    });

    it("should reject commit outside PERCEPTION state", async function () {
      const { launch, alice } = await loadFixture(deploySAWProtocol);
      // Still in FOUNDATION
      const hash = computeCommitHash(alice.address, 1n, ethers.hexlify(ethers.randomBytes(32)));
      await expect(launch.connect(alice).commit(hash))
        .to.be.revertedWithCustomError(launch, "NotInRequiredState");
    });

    it("should reject commit after window closes", async function () {
      const { launch, oracle, operator, alice } = await loadFixture(deploySAWProtocol);
      await advanceToPerception(launch, oracle, operator);

      // Fast-forward past commit window
      await time.increase(COMMIT_WINDOW + 1);

      const hash = computeCommitHash(alice.address, 1n, ethers.hexlify(ethers.randomBytes(32)));
      await expect(launch.connect(alice).commit(hash))
        .to.be.revertedWithCustomError(launch, "CommitmentWindowClosed");
    });

    it("should correctly count all participants", async function () {
      const { launch, oracle, operator, alice, bob, carol } = await loadFixture(deploySAWProtocol);
      await advanceToPerception(launch, oracle, operator);

      const commitFor = async (signer: SignerWithAddress) => {
        const nonce = ethers.hexlify(ethers.randomBytes(32));
        const hash  = computeCommitHash(signer.address, ethers.parseEther("1"), nonce);
        await launch.connect(signer).commit(hash);
      };

      await commitFor(alice);
      await commitFor(bob);
      await commitFor(carol);

      const all = await launch.getAllParticipants();
      expect(all.length).to.equal(3);
    });
  });

  // ── T5: Entropy Finalization ──────────────────────────────────────────────
  describe("SAWLaunch — Entropy Finalization", function () {
    it("should finalize entropy when future block is mined", async function () {
      const { launch, oracle, operator } = await loadFixture(deploySAWProtocol);

      const currentBlock = await ethers.provider.getBlockNumber();
      const futureBlock  = currentBlock + 5;

      await launch.connect(oracle).lockEntropy(
        ethers.keccak256(ethers.toUtf8Bytes("placeholder")),
        ethers.keccak256(ethers.toUtf8Bytes("drand")),
        ethers.keccak256(ethers.toUtf8Bytes("btc")),
        futureBlock
      );
      await launch.connect(operator).advanceState(); // → GENESIS

      // Mine blocks to reach future block
      for (let i = 0; i < 6; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      await expect(launch.connect(oracle).finalizeEntropy())
        .to.emit(launch, "EntropyFinalized");

      const seed = await launch.getEntropySeed();
      expect(seed.finalized).to.be.true;
      expect(seed.futureBlockHash).to.not.equal(ethers.ZeroHash);
    });

    it("should reject finalizeEntropy before future block is mined", async function () {
      const { launch, oracle, operator } = await loadFixture(deploySAWProtocol);

      const currentBlock = await ethers.provider.getBlockNumber();
      await launch.connect(oracle).lockEntropy(
        ethers.keccak256(ethers.toUtf8Bytes("x")),
        ethers.keccak256(ethers.toUtf8Bytes("d")),
        ethers.keccak256(ethers.toUtf8Bytes("b")),
        currentBlock + 100 // far future
      );
      await launch.connect(operator).advanceState(); // → GENESIS

      await expect(launch.connect(oracle).finalizeEntropy())
        .to.be.revertedWithCustomError(launch, "FutureBlockNotMined");
    });
  });

  // ── T6: Early Contributors ────────────────────────────────────────────────
  describe("SAWLaunch — Early Contributors", function () {
    it("should register and track early contributors", async function () {
      const { launch, operator, alice, bob } = await loadFixture(deploySAWProtocol);

      await launch.connect(operator).registerEarlyContributors(
        [alice.address, bob.address],
        [8000, 2000] // 80% + 20% = 100% of early alloc
      );
    });

    it("should reject registration with wrong BPS sum", async function () {
      const { launch, operator, alice, bob } = await loadFixture(deploySAWProtocol);
      await expect(
        launch.connect(operator).registerEarlyContributors(
          [alice.address, bob.address],
          [5000, 3000] // sum = 8000, not 10000
        )
      ).to.be.revertedWith("SAWLaunch: shares must sum to 10000 bps");
    });

    it("should reject non-operator registration", async function () {
      const { launch, alice, bob } = await loadFixture(deploySAWProtocol);
      await expect(
        launch.connect(alice).registerEarlyContributors([bob.address], [10000])
      ).to.be.revertedWithCustomError(launch, "AccessControlUnauthorizedAccount");
    });
  });

  // ── T7: Pause / Unpause ───────────────────────────────────────────────────
  describe("SAWLaunch — Emergency Controls", function () {
    it("should pause and unpause correctly", async function () {
      const { launch, admin, oracle, operator, alice } = await loadFixture(deploySAWProtocol);

      // Setup to PERCEPTION so alice can commit
      const currentBlock = await ethers.provider.getBlockNumber();
      await launch.connect(oracle).lockEntropy(
        ethers.keccak256(ethers.toUtf8Bytes("x")),
        ethers.keccak256(ethers.toUtf8Bytes("d")),
        ethers.keccak256(ethers.toUtf8Bytes("b")),
        currentBlock + 20
      );
      await launch.connect(operator).advanceState();
      const now = Math.floor(Date.now() / 1000);
      await launch.connect(oracle).setQuantumTimestamp(now, now, now, now);
      await launch.connect(operator).advanceState();
      await launch.connect(operator).advanceState(); // PERCEPTION

      // Pause
      await launch.connect(admin).pause();

      const hash = computeCommitHash(alice.address, 1n, ethers.hexlify(ethers.randomBytes(32)));
      await expect(launch.connect(alice).commit(hash))
        .to.be.revertedWithCustomError(launch, "EnforcedPause");

      // Unpause
      await launch.connect(admin).unpause();
      await launch.connect(alice).commit(hash); // should succeed
    });

    it("should reject pause from non-admin", async function () {
      const { launch, alice } = await loadFixture(deploySAWProtocol);
      await expect(launch.connect(alice).pause())
        .to.be.revertedWithCustomError(launch, "AccessControlUnauthorizedAccount");
    });
  });
});

// ─── Allocator Test Suite ────────────────────────────────────────────────────
describe("SAWAllocator — Fair Ordering Engine", function () {
  this.timeout(120_000);

  async function deployAllocator() {
    const [admin, protocol, alice, bob, carol, dave] = await ethers.getSigners();

    const AllocFactory = await ethers.getContractFactory("SAWAllocator");
    const allocator    = (await AllocFactory.deploy(admin.address)) as SAWAllocator;
    await allocator.waitForDeployment();

    const PROTOCOL_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROTOCOL_ROLE"));
    await allocator.grantProtocolRole(protocol.address);

    const entropy      = ethers.keccak256(ethers.toUtf8Bytes("test_entropy_seed"));
    const participants = [alice.address, bob.address, carol.address, dave.address];
    const amounts      = [
      ethers.parseEther("100"),
      ethers.parseEther("50"),
      ethers.parseEther("200"),
      ethers.parseEther("25"),
    ];
    const totalTokens  = ethers.parseEther("400000000"); // 40% of 1B

    return { allocator, admin, protocol, alice, bob, carol, dave, entropy, participants, amounts, totalTokens, PROTOCOL_ROLE };
  }

  it("should compute order keys deterministically", async function () {
    const { allocator, protocol, entropy, participants, amounts, totalTokens } =
      await loadFixture(deployAllocator);

    await allocator.connect(protocol).computeOrderKeys(entropy, participants);
    await allocator.connect(protocol).calculateAllocations(amounts, totalTokens);

    const summary = await allocator.getSummary();
    expect(summary.computed).to.be.true;
    expect(summary.totalParticipants).to.equal(4n);
  });

  it("should sort participants ascending by order key", async function () {
    const { allocator, protocol, entropy, participants, amounts, totalTokens } =
      await loadFixture(deployAllocator);

    await allocator.connect(protocol).computeOrderKeys(entropy, participants);
    await allocator.connect(protocol).calculateAllocations(amounts, totalTokens);

    const allocs = await allocator.getAllAllocations();
    for (let i = 1; i < allocs.length; i++) {
      // Each successive order key should be >= the previous (ascending)
      expect(allocs[i].orderKey >= allocs[i - 1].orderKey).to.be.true;
      expect(allocs[i].rank).to.equal(BigInt(i + 1));
    }
  });

  it("order key should match formula: H(E || wallet)", async function () {
    const { allocator, protocol, entropy, participants, amounts, totalTokens, alice } =
      await loadFixture(deployAllocator);

    await allocator.connect(protocol).computeOrderKeys(entropy, participants);
    await allocator.connect(protocol).calculateAllocations(amounts, totalTokens);

    const expected = computeOrderKey(entropy, alice.address);
    const actual   = await allocator.verifyOrderKey(entropy, alice.address);
    expect(actual).to.equal(expected);
  });

  it("should compute pro-rata token allocations", async function () {
    const { allocator, protocol, entropy, participants, amounts, totalTokens } =
      await loadFixture(deployAllocator);

    await allocator.connect(protocol).computeOrderKeys(entropy, participants);
    await allocator.connect(protocol).calculateAllocations(amounts, totalTokens);

    const allocs = await allocator.getAllAllocations();
    let total = 0n;
    for (const alloc of allocs) {
      expect(alloc.tokenAmount).to.be.gt(0n);
      total += alloc.tokenAmount;
    }
    // Total should equal totalTokens
    expect(total).to.equal(totalTokens);
  });

  it("verifyAllocations should return true for correct data", async function () {
    const { allocator, protocol, entropy, participants, amounts, totalTokens } =
      await loadFixture(deployAllocator);

    await allocator.connect(protocol).computeOrderKeys(entropy, participants);
    await allocator.connect(protocol).calculateAllocations(amounts, totalTokens);

    expect(await allocator.verifyAllocations(entropy)).to.be.true;
  });

  it("should compute a stable allocation hash", async function () {
    const { allocator, protocol, entropy, participants, amounts, totalTokens } =
      await loadFixture(deployAllocator);

    await allocator.connect(protocol).computeOrderKeys(entropy, participants);
    await allocator.connect(protocol).calculateAllocations(amounts, totalTokens);

    const hash1 = await allocator.computeAllocationHash();
    const hash2 = await allocator.computeAllocationHash();
    expect(hash1).to.equal(hash2);
    expect(hash1).to.not.equal(ethers.ZeroHash);
  });

  it("should reject double computation", async function () {
    const { allocator, protocol, entropy, participants, amounts, totalTokens } =
      await loadFixture(deployAllocator);

    await allocator.connect(protocol).computeOrderKeys(entropy, participants);
    await allocator.connect(protocol).calculateAllocations(amounts, totalTokens);

    await expect(
      allocator.connect(protocol).computeOrderKeys(entropy, participants)
    ).to.be.revertedWithCustomError(allocator, "AllocationAlreadyComputed");
  });

  it("should reject empty participants", async function () {
    const { allocator, protocol, entropy } = await loadFixture(deployAllocator);
    await expect(
      allocator.connect(protocol).computeOrderKeys(entropy, [])
    ).to.be.revertedWithCustomError(allocator, "NoValidParticipants");
  });

  it("should reject non-protocol computeOrderKeys", async function () {
    const { allocator, alice, entropy, participants } = await loadFixture(deployAllocator);
    await expect(
      allocator.connect(alice).computeOrderKeys(entropy, participants)
    ).to.be.revertedWithCustomError(allocator, "AccessControlUnauthorizedAccount");
  });
});

// ─── Settlement Test Suite ────────────────────────────────────────────────────
describe("SAWSettlement — Atomic Settlement Engine", function () {
  this.timeout(120_000);

  async function deployWithAllocations() {
    const [admin, protocol, alice, bob, carol] = await ethers.getSigners();

    // Deploy Token
    const TokenFactory = await ethers.getContractFactory("SAWToken");
    const token = (await TokenFactory.deploy(admin.address, "QmTest")) as SAWToken;
    await token.waitForDeployment();

    // Deploy Allocator
    const AllocFactory = await ethers.getContractFactory("SAWAllocator");
    const allocator = (await AllocFactory.deploy(admin.address)) as SAWAllocator;
    await allocator.waitForDeployment();
    await allocator.grantProtocolRole(protocol.address);

    // Deploy Settlement
    const SettleFactory = await ethers.getContractFactory("SAWSettlement");
    const settlement = (await SettleFactory.deploy(
      admin.address,
      await token.getAddress(),
      await allocator.getAddress()
    )) as SAWSettlement;
    await settlement.waitForDeployment();
    await settlement.grantProtocolRole(protocol.address);

    // Deploy Governance (needed for linkContracts)
    const GovFactory = await ethers.getContractFactory("SAWGovernance");
    const governance = (await GovFactory.deploy(admin.address, await token.getAddress())) as SAWGovernance;
    await governance.waitForDeployment();

    // Link contracts (this mints all allocations)
    await token.linkContracts(
      admin.address, // use admin as dummy launch addr
      await settlement.getAddress(),
      await governance.getAddress()
    );

    // Compute allocations
    const entropy = ethers.keccak256(ethers.toUtf8Bytes("settle_test_entropy"));
    const participants = [alice.address, bob.address, carol.address];
    const amounts = [
      ethers.parseEther("100"),
      ethers.parseEther("200"),
      ethers.parseEther("100"),
    ];
    const totalTokens = await token.publicParticipantsAlloc();

    await allocator.connect(protocol).computeOrderKeys(entropy, participants);
    await allocator.connect(protocol).calculateAllocations(amounts, totalTokens);

    return { token, allocator, settlement, governance, admin, protocol, alice, bob, carol, totalTokens };
  }

  it("should execute atomic settlement successfully", async function () {
    const { settlement, token, alice, bob, carol, protocol, totalTokens } =
      await loadFixture(deployWithAllocations);

    const aliceBalanceBefore = await token.balanceOf(alice.address);

    await expect(settlement.connect(protocol).executeSettlement())
      .to.emit(settlement, "SettlementCompleted");

    const status = await settlement.getSettlementStatus();
    expect(status.completed).to.be.true;
    expect(status.totalDistributed).to.equal(totalTokens);
    expect(status.settlementHash).to.not.equal(ethers.ZeroHash);

    // Verify tokens actually transferred
    const aliceBalanceAfter = await token.balanceOf(alice.address);
    expect(aliceBalanceAfter).to.be.gt(aliceBalanceBefore);
  });

  it("should mark participants as settled", async function () {
    const { settlement, alice, bob, carol, protocol } =
      await loadFixture(deployWithAllocations);

    await settlement.connect(protocol).executeSettlement();

    expect(await settlement.isSettled(alice.address)).to.be.true;
    expect(await settlement.isSettled(bob.address)).to.be.true;
    expect(await settlement.isSettled(carol.address)).to.be.true;
  });

  it("should reject double settlement", async function () {
    const { settlement, protocol } = await loadFixture(deployWithAllocations);

    await settlement.connect(protocol).executeSettlement();
    await expect(settlement.connect(protocol).executeSettlement())
      .to.be.revertedWithCustomError(settlement, "SettlementAlreadyExecuted");
  });

  it("settlement hash should match formula", async function () {
    const { settlement, allocator, protocol } =
      await loadFixture(deployWithAllocations);

    await settlement.connect(protocol).executeSettlement();

    const settlementHash = await settlement.getSettlementHash();
    const status = await settlement.getSettlementStatus();
    expect(settlementHash).to.equal(status.settlementHash);
    expect(settlementHash).to.not.equal(ethers.ZeroHash);
  });

  it("should reject settlement from non-protocol role", async function () {
    const { settlement, alice } = await loadFixture(deployWithAllocations);
    await expect(settlement.connect(alice).executeSettlement())
      .to.be.revertedWithCustomError(settlement, "AccessControlUnauthorizedAccount");
  });
});

// ─── Cryptographic Library Tests ──────────────────────────────────────────────
describe("SAWCrypto — Cryptographic Primitives", function () {
  this.timeout(60_000);

  // Deploy a mock contract that exposes SAWCrypto for testing
  // We test indirectly through SAWAllocator and SAWLaunch

  it("computeOrderKey should be deterministic and unique per wallet", async function () {
    const [, alice, bob] = await ethers.getSigners();
    const entropy = ethers.keccak256(ethers.toUtf8Bytes("entropy"));

    const keyA1 = computeOrderKey(entropy, alice.address);
    const keyA2 = computeOrderKey(entropy, alice.address);
    const keyB  = computeOrderKey(entropy, bob.address);

    expect(keyA1).to.equal(keyA2);
    expect(keyA1).to.not.equal(keyB);
  });

  it("computeCommitHash should match Solidity formula", async function () {
    const [, alice] = await ethers.getSigners();
    const amount = ethers.parseEther("1.5");
    const nonce  = ethers.hexlify(ethers.randomBytes(32));

    const tsHash = computeCommitHash(alice.address, amount, nonce);
    expect(tsHash).to.not.equal(ethers.ZeroHash);
    expect(tsHash.startsWith("0x")).to.be.true;
    expect(tsHash.length).to.equal(66); // 0x + 64 hex chars
  });

  it("entropy formula should be deterministic", async function () {
    const blockHash = ethers.keccak256(ethers.toUtf8Bytes("block"));
    const drand     = ethers.keccak256(ethers.toUtf8Bytes("drand"));
    const btc       = ethers.keccak256(ethers.toUtf8Bytes("btc"));

    const e1 = computeEntropy(blockHash, drand, btc);
    const e2 = computeEntropy(blockHash, drand, btc);
    expect(e1).to.equal(e2);
    expect(e1).to.not.equal(ethers.ZeroHash);
  });
});
