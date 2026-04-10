// ─── SAW Protocol Backend Types ───────────────────────────────────────────────

export interface EntropySources {
  futureBlockHash: string;   // ETH future block hash (hex)
  drandRound: string;        // drand beacon round hash (hex)
  btcAnchor: string;         // BTC block height hash (hex)
  lockedAtBlock: number;     // ETH block number for future hash
}

export interface FinalizedEntropy {
  seed: string;              // E = H(futureBlockHash || drandRound || btcAnchor)
  sources: EntropySources;
  finalizedAt: number;       // Unix timestamp
  blockNumber: number;
}

export interface QuantumTimestampData {
  tEth: number;              // Ethereum block timestamp
  tBtc: number;              // Bitcoin block timestamp
  tNtp: number;              // NTP consensus timestamp
  tBeacon: number;           // drand beacon timestamp
  fingerprint: string;       // T_q = H(T_eth || T_btc || T_ntp || T_beacon)
  sources: {
    ethBlockNumber: number;
    btcBlockHeight: number;
    ntpServers: string[];
    drandRound: number;
  };
}

export interface DrandResponse {
  round: number;
  randomness: string;        // hex string
  signature: string;
  previous_signature: string;
}

export interface BtcBlockInfo {
  height: number;
  hash: string;
  timestamp: number;
}

export interface NtpConsensus {
  timestamp: number;
  servers: string[];
  offset: number;            // ms offset
}

export interface ParticipantAllocation {
  address: string;
  rank: number;
  orderKey: string;          // H(E || wallet)
  committedAmount: string;   // in wei
  tokenAmount: string;       // in token units (18 decimals)
  weight: string;            // scaled by 1e18
  settled: boolean;
}

export interface AuditReport {
  finalStateHash: string;    // S_final
  entropyVerified: boolean;
  orderingVerified: boolean;
  allocationVerified: boolean;
  timestampVerified: boolean;
  totalParticipants: number;
  totalTokensDistributed: string;
  generatedAt: number;
}

export interface ProtocolState {
  stateIndex: number;        // 0-11
  stateName: string;
  stateHash: string;
  timestamp: number;
  blockNumber: number;
}

export interface CommitmentData {
  participantAddress: string;
  commitHash: string;
  timestamp: number;
  revealed: boolean;
  valid: boolean;
}
