import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { computeCommitmentHash } from "../lib/api";
import { SAW_LAUNCH_ADDRESS } from "../lib/wagmi";

// Minimal SAWLaunch ABI for commit/reveal
const LAUNCH_ABI = [
  {
    name: "commit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "commitHash", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "reveal",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "nonce",  type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

export interface CommitRevealState {
  nonce: string;
  amount: string;
  commitHash: string;
  committed: boolean;
  revealed: boolean;
}

const STORAGE_KEY = "saw_commitment";

export function useCommitReveal() {
  const { address } = useAccount();
  const [state, setState] = useState<CommitRevealState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : { nonce: "", amount: "", commitHash: "", committed: false, revealed: false };
  });
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { writeContract: writeCommit, data: commitTxHash, isPending: commitPending } = useWriteContract();
  const { writeContract: writeReveal, data: revealTxHash, isPending: revealPending } = useWriteContract();

  const { isLoading: commitConfirming } = useWaitForTransactionReceipt({ hash: commitTxHash });
  const { isLoading: revealConfirming } = useWaitForTransactionReceipt({ hash: revealTxHash });

  // Generate a cryptographically secure nonce
  const generateNonce = useCallback((): string => {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return "0x" + Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  }, []);

  // Step 1: Compute C_i = H(wallet || amount || nonce)
  const prepareCommitment = useCallback(async (amount: string) => {
    if (!address) { setError("Wallet not connected"); return null; }
    setIsComputing(true);
    setError(null);
    try {
      const nonce = generateNonce();
      const result = await computeCommitmentHash(address, amount, nonce);
      const newState: CommitRevealState = {
        nonce, amount,
        commitHash: result.commitHash,
        committed: false,
        revealed: false,
      };
      setState(newState);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
      return result.commitHash;
    } catch (err: any) {
      setError(err.message || "Failed to compute commitment");
      return null;
    } finally {
      setIsComputing(false);
    }
  }, [address, generateNonce]);

  // Step 2: Submit commitment on-chain
  const submitCommit = useCallback(async () => {
    if (!state.commitHash) { setError("No commitment prepared"); return; }
    setError(null);
    try {
      writeCommit({
        address: SAW_LAUNCH_ADDRESS as `0x${string}`,
        abi: LAUNCH_ABI,
        functionName: "commit",
        args: [state.commitHash as `0x${string}`],
      });
      const updated = { ...state, committed: true };
      setState(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (err: any) {
      setError(err.message || "Commit transaction failed");
    }
  }, [state, writeCommit]);

  // Step 3: Reveal plaintext during HARMONY state
  const submitReveal = useCallback(async () => {
    if (!state.nonce || !state.amount) { setError("No commitment to reveal"); return; }
    setError(null);
    try {
      writeReveal({
        address: SAW_LAUNCH_ADDRESS as `0x${string}`,
        abi: LAUNCH_ABI,
        functionName: "reveal",
        args: [BigInt(state.amount), state.nonce as `0x${string}`],
      });
      const updated = { ...state, revealed: true };
      setState(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (err: any) {
      setError(err.message || "Reveal transaction failed");
    }
  }, [state, writeReveal]);

  const reset = useCallback(() => {
    const clean: CommitRevealState = { nonce: "", amount: "", commitHash: "", committed: false, revealed: false };
    setState(clean);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    state,
    isComputing,
    error,
    commitPending: commitPending || commitConfirming,
    revealPending: revealPending || revealConfirming,
    commitTxHash,
    revealTxHash,
    prepareCommitment,
    submitCommit,
    submitReveal,
    reset,
  };
}
