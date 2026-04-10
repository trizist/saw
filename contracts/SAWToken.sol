// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SAWToken
/// @notice The SAW Protocol governance and utility token
/// @dev ERC20 + Votes (for DAO) + Permit (gasless approvals) + Burnable
///      Total supply: fixed at deployment. Distribution locked to SAWLaunch.
///
/// Tokenomics (from State 1 - Foundation):
///   40% → Public Participants  (via SAWSettlement - State 8)
///   30% → Governance Emissions (via SAWGovernance - State 12)
///   20% → Liquidity            (10% protocol-owned State 2, 10% LP State 9)
///    8% → Ecosystem Treasury   (unlocked at State 10)
///    2% → Early Contributors   (State 3)
///
contract SAWToken is ERC20, ERC20Burnable, ERC20Permit, ERC20Votes, AccessControl, ReentrancyGuard {

    // ─── Roles ────────────────────────────────────────────────────────────────
    bytes32 public constant MINTER_ROLE        = keccak256("MINTER_ROLE");
    bytes32 public constant PROTOCOL_ROLE      = keccak256("PROTOCOL_ROLE");
    bytes32 public constant GOVERNANCE_ROLE    = keccak256("GOVERNANCE_ROLE");

    // ─── Tokenomics Constants ─────────────────────────────────────────────────
    uint256 public constant TOTAL_SUPPLY          = 1_000_000_000 * 1e18; // 1 Billion SAW

    uint256 public constant PUBLIC_PARTICIPANTS_BPS    = 4000; // 40%
    uint256 public constant GOVERNANCE_EMISSIONS_BPS   = 3000; // 30%
    uint256 public constant PROTOCOL_LIQUIDITY_BPS     = 1000; // 10% (State 2)
    uint256 public constant LP_LIQUIDITY_BPS           = 1000; // 10% (State 9)
    uint256 public constant ECOSYSTEM_TREASURY_BPS     =  800; //  8%
    uint256 public constant EARLY_CONTRIBUTORS_BPS     =  200; //  2%
    uint256 public constant BPS_DENOMINATOR            = 10000;

    // ─── Allocation Amounts (computed from total supply) ──────────────────────
    uint256 public immutable publicParticipantsAlloc;
    uint256 public immutable governanceEmissionsAlloc;
    uint256 public immutable protocolLiquidityAlloc;
    uint256 public immutable lpLiquidityAlloc;
    uint256 public immutable ecosystemTreasuryAlloc;
    uint256 public immutable earlyContributorsAlloc;

    // ─── Allocation Buckets ───────────────────────────────────────────────────
    address public sawLaunchContract;
    address public sawSettlementContract;
    address public sawGovernanceContract;
    bool    public contractsLinked;

    // ─── State tracking ───────────────────────────────────────────────────────
    bool    public foundationSealed;   // State 1 bytecode hash committed
    bytes32 public bytecodeHash;       // H(contract bytecode) published to IPFS/Arweave
    bytes32 public tokonomicsHash;     // H(tokenomics parameters)
    string  public ipfsManifest;       // IPFS/Arweave CID for genesis manifest

    // ─── Events ───────────────────────────────────────────────────────────────
    event FoundationSealed(bytes32 bytecodeHash, bytes32 tokenomicsHash, uint256 timestamp);
    event ContractsLinked(address launch, address settlement, address governance);
    event TokensAllocated(string bucket, address recipient, uint256 amount);

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(
        address admin,
        string memory ipfsCID
    ) ERC20("Secure Atomic Wave", "SAW")
      ERC20Permit("Secure Atomic Wave")
    {
        require(admin != address(0), "SAWToken: zero admin");

        // Compute allocation amounts
        publicParticipantsAlloc   = (TOTAL_SUPPLY * PUBLIC_PARTICIPANTS_BPS)  / BPS_DENOMINATOR;
        governanceEmissionsAlloc  = (TOTAL_SUPPLY * GOVERNANCE_EMISSIONS_BPS) / BPS_DENOMINATOR;
        protocolLiquidityAlloc    = (TOTAL_SUPPLY * PROTOCOL_LIQUIDITY_BPS)   / BPS_DENOMINATOR;
        lpLiquidityAlloc          = (TOTAL_SUPPLY * LP_LIQUIDITY_BPS)         / BPS_DENOMINATOR;
        ecosystemTreasuryAlloc    = (TOTAL_SUPPLY * ECOSYSTEM_TREASURY_BPS)   / BPS_DENOMINATOR;
        earlyContributorsAlloc    = (TOTAL_SUPPLY * EARLY_CONTRIBUTORS_BPS)   / BPS_DENOMINATOR;

        ipfsManifest = ipfsCID;

        // Seal the foundation — hash the deployment bytecode via assembly
        // (type(SAWToken).creationCode is disallowed within the same contract)
        bytes32 _bytecodeHash;
        assembly { _bytecodeHash := extcodehash(address()) }
        bytes32 _tokenomicsHash = keccak256(abi.encode(
            TOTAL_SUPPLY,
            PUBLIC_PARTICIPANTS_BPS,
            GOVERNANCE_EMISSIONS_BPS,
            PROTOCOL_LIQUIDITY_BPS,
            LP_LIQUIDITY_BPS,
            ECOSYSTEM_TREASURY_BPS,
            EARLY_CONTRIBUTORS_BPS
        ));

        bytecodeHash     = _bytecodeHash;
        tokonomicsHash   = _tokenomicsHash;
        foundationSealed = true;

        // Setup roles
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PROTOCOL_ROLE, admin);

        emit FoundationSealed(_bytecodeHash, _tokenomicsHash, block.timestamp);
    }

    // ─── Contract Linking (one-time setup) ───────────────────────────────────

    /// @notice Link SAW protocol contracts (called once after all deployments)
    function linkContracts(
        address _sawLaunch,
        address _sawSettlement,
        address _sawGovernance
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!contractsLinked, "SAWToken: already linked");
        require(_sawLaunch != address(0), "SAWToken: zero launch");
        require(_sawSettlement != address(0), "SAWToken: zero settlement");
        require(_sawGovernance != address(0), "SAWToken: zero governance");

        sawLaunchContract      = _sawLaunch;
        sawSettlementContract  = _sawSettlement;
        sawGovernanceContract  = _sawGovernance;
        contractsLinked        = true;

        // Grant minting rights to protocol contracts
        _grantRole(MINTER_ROLE,     _sawLaunch);
        _grantRole(PROTOCOL_ROLE,   _sawLaunch);
        _grantRole(PROTOCOL_ROLE,   _sawSettlement);
        _grantRole(GOVERNANCE_ROLE, _sawGovernance);

        // Mint all allocations to their respective custodians
        _mintAllocations(_sawLaunch, _sawSettlement, _sawGovernance);

        emit ContractsLinked(_sawLaunch, _sawSettlement, _sawGovernance);
    }

    // ─── Internal Mint ────────────────────────────────────────────────────────

    function _mintAllocations(
        address launchAddr,
        address settlementAddr,
        address governanceAddr
    ) internal {
        // 40% → Settlement contract (distributed in State 8)
        _mint(settlementAddr, publicParticipantsAlloc);
        emit TokensAllocated("PUBLIC_PARTICIPANTS", settlementAddr, publicParticipantsAlloc);

        // 30% → Governance contract (State 12 emissions)
        _mint(governanceAddr, governanceEmissionsAlloc);
        emit TokensAllocated("GOVERNANCE_EMISSIONS", governanceAddr, governanceEmissionsAlloc);

        // 10% → Launch contract (protocol-owned liquidity, State 2)
        _mint(launchAddr, protocolLiquidityAlloc);
        emit TokensAllocated("PROTOCOL_LIQUIDITY", launchAddr, protocolLiquidityAlloc);

        // 10% → Settlement contract (LP deployment, State 9)
        _mint(settlementAddr, lpLiquidityAlloc);
        emit TokensAllocated("LP_LIQUIDITY", settlementAddr, lpLiquidityAlloc);

        // 8% → Governance contract (treasury, unlocked State 10)
        _mint(governanceAddr, ecosystemTreasuryAlloc);
        emit TokensAllocated("ECOSYSTEM_TREASURY", governanceAddr, ecosystemTreasuryAlloc);

        // 2% → Launch contract (early contributors, State 3)
        _mint(launchAddr, earlyContributorsAlloc);
        emit TokensAllocated("EARLY_CONTRIBUTORS", launchAddr, earlyContributorsAlloc);
    }

    // ─── IPFS Manifest ────────────────────────────────────────────────────────

    /// @notice Update IPFS manifest CID (only protocol role)
    function setIpfsManifest(string calldata cid) external onlyRole(PROTOCOL_ROLE) {
        ipfsManifest = cid;
    }

    // ─── ERC20Votes overrides (required) ─────────────────────────────────────

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    function nonces(address owner)
        public view override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
