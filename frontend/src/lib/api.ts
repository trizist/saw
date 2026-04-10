import axios from "axios";
import { BACKEND_URL } from "./wagmi";

const api = axios.create({
  baseURL: BACKEND_URL + "/api",
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

// ─── Protocol State ───────────────────────────────────────────────────────────
export const fetchProtocolState = () =>
  api.get("/state").then((r) => r.data);

// ─── Entropy ──────────────────────────────────────────────────────────────────
export const fetchEntropyStatus = () =>
  api.get("/entropy/status").then((r) => r.data);

export const fetchEntropyFinalize = () =>
  api.get("/entropy/finalize").then((r) => r.data);

// ─── Quantum Timestamp ────────────────────────────────────────────────────────
export const fetchQuantumTimestamp = () =>
  api.get("/timestamp").then((r) => r.data);

// ─── Commitment ───────────────────────────────────────────────────────────────
export const computeCommitmentHash = (wallet: string, amount: string, nonce: string) =>
  api.post("/commitment/compute", { wallet, amount, nonce }).then((r) => r.data);

// ─── Order Key ────────────────────────────────────────────────────────────────
export const verifyOrderKey = (entropy: string, participant: string) =>
  api.post("/order/verify", { entropy, participant }).then((r) => r.data);

export const sortParticipants = (entropy: string, participants: string[]) =>
  api.post("/order/sort", { entropy, participants }).then((r) => r.data);

// ─── Participants ─────────────────────────────────────────────────────────────
export const fetchParticipants = () =>
  api.get("/participants").then((r) => r.data);

export const fetchParticipant = (address: string) =>
  api.get(`/participants/${address}`).then((r) => r.data);

// ─── Allocations ─────────────────────────────────────────────────────────────
export const fetchAllocations = () =>
  api.get("/allocations").then((r) => r.data);

export const fetchAllocation = (address: string) =>
  api.get(`/allocations/${address}`).then((r) => r.data);

// ─── Audit ────────────────────────────────────────────────────────────────────
export const fetchAuditReport = () =>
  api.get("/audit/report").then((r) => r.data);

export const verifyAudit = (payload: unknown) =>
  api.post("/audit/verify", payload).then((r) => r.data);

// ─── Tokenomics ───────────────────────────────────────────────────────────────
export const fetchTokenomics = () =>
  api.get("/tokenomics").then((r) => r.data);

// ─── Health ───────────────────────────────────────────────────────────────────
export const healthCheck = () =>
  api.get("/health").then((r) => r.data);
