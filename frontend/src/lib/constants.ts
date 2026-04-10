// ─── SAW Protocol 12 States ───────────────────────────────────────────────────
export const STATES = [
  { index: 0,  name: "Foundation",      sigil: "⬡", symbol: "Golden Seal",        pct: 0,   desc: "Define supply & contract logic. Bytecode hash sealed.",          phase: "Preparation" },
  { index: 1,  name: "Genesis",         sigil: "◎", symbol: "The Source",          pct: 10,  desc: "Entropy locked. Protocol-owned liquidity reserved.",              phase: "Preparation" },
  { index: 2,  name: "Awakening",       sigil: "✿", symbol: "The Lotus",           pct: 2,   desc: "Public activation. Early contributors recognized.",               phase: "Preparation" },
  { index: 3,  name: "Perception",      sigil: "◉", symbol: "The Eye",             pct: 0,   desc: "Commitment window opens. Submit hashed intent.",                  phase: "Participation" },
  { index: 4,  name: "Transformation",  sigil: "⊛", symbol: "The Vortex",          pct: 40,  desc: "Commitments sealed. 40% reserved for participants.",              phase: "Participation" },
  { index: 5,  name: "Harmony",         sigil: "✶", symbol: "Flower of Life",      pct: 0,   desc: "Reveal phase. Bots purged. Only honest actors remain.",          phase: "Participation" },
  { index: 6,  name: "Flow",            sigil: "◈", symbol: "The Water Drop",      pct: 0,   desc: "Deterministic allocation weights computed.",                      phase: "Distribution" },
  { index: 7,  name: "Power",           sigil: "☀", symbol: "Solar Burst",         pct: 40,  desc: "Atomic Settlement. 40% distributed in single transaction.",       phase: "Distribution" },
  { index: 8,  name: "Reflection",      sigil: "◐", symbol: "The Moon",            pct: 10,  desc: "Liquidity deployed. Market stabilized with slippage buffers.",   phase: "Distribution" },
  { index: 9,  name: "Growth",          sigil: "⎈", symbol: "The Tree",            pct: 8,   desc: "Ecosystem treasury unlocked for builders.",                       phase: "Governance" },
  { index: 10, name: "Purity",          sigil: "⬗", symbol: "The Lattice",         pct: 0,   desc: "Final state hash published. Permanent audit seal.",              phase: "Governance" },
  { index: 11, name: "Transcendence",   sigil: "✴", symbol: "Eight-Point Star",    pct: 30,  desc: "DAO governance activated. Protocol becomes autonomous.",          phase: "Governance" },
] as const;

export type StateName = typeof STATES[number]["name"];
export type PhaseName = "Preparation" | "Participation" | "Distribution" | "Governance";

export const PHASES: Record<PhaseName, { states: number[]; color: string; description: string }> = {
  Preparation:   { states: [0, 1, 2],   color: "text-cyan-400",    description: "Architectural blueprints locked into blockchain" },
  Participation: { states: [3, 4, 5],   color: "text-violet-400",  description: "Commit/Reveal cycle eliminates bot advantage" },
  Distribution:  { states: [6, 7, 8],   color: "text-amber-400",   description: "Atomic settlement — one heartbeat, all or nothing" },
  Governance:    { states: [9, 10, 11], color: "text-emerald-400", description: "Community sovereignty with cryptographic guardrails" },
};

export const TOKENOMICS = [
  { label: "Public Participants",  pct: 40, color: "#6366f1", state: "State 8" },
  { label: "Governance Emissions", pct: 30, color: "#8b5cf6", state: "State 12" },
  { label: "Liquidity",           pct: 20, color: "#06b6d4", state: "State 2+9" },
  { label: "Ecosystem Treasury",   pct: 8,  color: "#10b981", state: "State 10" },
  { label: "Early Contributors",   pct: 2,  color: "#f59e0b", state: "State 3" },
] as const;

export const FORMULAS = {
  commitment:        "C_i = H(wallet || amount || nonce)",
  entropy:           "E = H(futureBlockHash || drandRound || btcAnchor)",
  quantumTimestamp:  "T_q = H(T_eth || T_btc || T_ntp || T_beacon)",
  orderKey:          "Order_i = H(E || wallet_i)",
  finalState:        "S_final = H(allAllocations || T_q || E)",
  stateChain:        "S_n = H(S_{n-1} || stateData)",
};
