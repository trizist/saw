import React, { useState } from "react";
import { motion } from "framer-motion";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  Lock, Unlock, Eye, CheckCircle2, AlertTriangle,
  Copy, RefreshCw, Info, Loader2, ArrowRight
} from "lucide-react";
import { useCommitReveal } from "../hooks/useCommitReveal";
import { useProtocolState } from "../hooks/useProtocolState";
import { FORMULAS } from "../lib/constants";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="btn-icon flex-shrink-0" title="Copy">
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function CommitReveal() {
  const { address, isConnected } = useAccount();
  const { data: ps } = useProtocolState();
  const {
    state, isComputing, error,
    commitPending, revealPending,
    commitTxHash, revealTxHash,
    prepareCommitment, submitCommit, submitReveal, reset,
  } = useCommitReveal();

  const [amount, setAmount]   = useState("");
  const [showNonce, setShowNonce] = useState(false);

  const currentStateIdx = ps?.current?.index ?? 0;
  const inCommitPhase   = currentStateIdx === 3; // PERCEPTION
  const inRevealPhase   = currentStateIdx === 5; // HARMONY

  const handlePrepare = async () => {
    if (!amount || isNaN(Number(amount))) return;
    await prepareCommitment(amount);
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-2xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-bold font-ritual text-gradient">Participate in the Ceremony</h1>
        <p className="text-slate-400 mt-1">
          The Commit/Reveal cycle hides your intent from bots until the reveal phase.
          Your position is determined by math, not gas.
        </p>
      </div>

      {/* ── Connect wallet gate ────────────────────────────────────── */}
      {!isConnected ? (
        <div className="panel text-center py-12">
          <div className="w-16 h-16 rounded-full bg-saw-900/40 border border-saw-800/30 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-saw-400" />
          </div>
          <h2 className="text-xl font-semibold font-ritual text-slate-200 mb-2">Connect Your Wallet</h2>
          <p className="text-slate-500 text-sm mb-6 max-w-xs mx-auto">
            You need to connect your wallet to participate in the SAW ceremony.
          </p>
          <ConnectButton />
        </div>
      ) : (
        <>
          {/* ── Phase Status ─────────────────────────────────────────── */}
          <div className={`panel-sm flex items-center gap-3 ${
            inCommitPhase ? "border-saw-500/30 bg-saw-900/20" :
            inRevealPhase ? "border-violet-500/30 bg-violet-900/20" :
            "border-white/5"
          }`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              inCommitPhase ? "bg-saw-600" : inRevealPhase ? "bg-violet-600" : "bg-dark-600"
            }`}>
              {inCommitPhase ? <Lock className="w-4 h-4 text-white" /> :
               inRevealPhase ? <Unlock className="w-4 h-4 text-white" /> :
                               <Info className="w-4 h-4 text-slate-400" />}
            </div>
            <div>
              <div className="text-sm font-medium text-slate-200">
                {inCommitPhase ? "State 4: Perception — Commit Window Open" :
                 inRevealPhase ? "State 6: Harmony — Reveal Window Open" :
                 `State ${currentStateIdx + 1}: Waiting for Participation Phase`}
              </div>
              <div className="text-xs text-slate-500">
                {inCommitPhase ? "Submit your hashed commitment. Keep your nonce safe!" :
                 inRevealPhase ? "Reveal your amount and nonce to validate your commitment." :
                 "Participation is active during States 4 (Commit) and 6 (Reveal)."}
              </div>
            </div>
          </div>

          {/* ── UX Flow Steps ────────────────────────────────────────── */}
          <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
            {["Connect Wallet", "Commit (Hash)", "Reveal (Plaintext)", "View Allocation", "Verify Fairness"].map((step, i) => (
              <React.Fragment key={step}>
                <span className={`font-medium ${i <= (state.revealed ? 3 : state.committed ? 2 : state.commitHash ? 1 : 0) ? "text-saw-400" : ""}`}>
                  {i + 1}. {step}
                </span>
                {i < 4 && <ArrowRight className="w-3 h-3" />}
              </React.Fragment>
            ))}
          </div>

          {/* ── Step 1: Prepare Commitment ─────────────────────────── */}
          {!state.commitHash && (
            <motion.div className="panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <h2 className="section-title mb-1">Step 1: Prepare Commitment</h2>
              <p className="sublabel mb-4">
                Compute <span className="formula text-[11px]">{FORMULAS.commitment}</span>
              </p>
              <div className="space-y-4">
                <div>
                  <label className="label mb-2 block">Your Wallet</label>
                  <div className="input-field text-slate-500 cursor-not-allowed">{address}</div>
                </div>
                <div>
                  <label className="label mb-2 block">Amount to Commit (wei)</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 1000000000000000000 (1 ETH)"
                    className="input-field"
                  />
                  <p className="text-xs text-slate-600 mt-1">
                    Enter in wei. 1 ETH = 10¹⁸ wei
                  </p>
                </div>
                <div className="p-3 bg-amber-950/20 border border-amber-800/30 rounded-xl flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300">
                    A random nonce will be generated and stored locally. <strong>Do not clear your browser data</strong> before revealing — the nonce is required to prove your commitment.
                  </p>
                </div>
                <button
                  onClick={handlePrepare}
                  disabled={!amount || isComputing || !inCommitPhase}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {isComputing ? <><Loader2 className="w-4 h-4 animate-spin" /> Computing...</> : <><Lock className="w-4 h-4" /> Generate Commitment Hash</>}
                </button>
                {!inCommitPhase && (
                  <p className="text-xs text-slate-600 text-center">
                    Commit window is only open during State 4 (Perception)
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Submit Commitment ──────────────────────────── */}
          {state.commitHash && !state.committed && (
            <motion.div className="panel border-saw-500/30 bg-saw-900/10" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <h2 className="section-title mb-1">Step 2: Submit On-Chain</h2>
              <p className="sublabel mb-4">Send your commitment hash to the SAWLaunch contract.</p>

              <div className="space-y-4">
                {/* Commitment hash */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="label">Commitment Hash (C_i)</span>
                    <CopyButton text={state.commitHash} />
                  </div>
                  <div className="hash-display text-saw-300">{state.commitHash}</div>
                </div>

                {/* Nonce — keep safe! */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="label">Your Secret Nonce</span>
                    <div className="flex items-center gap-2">
                      <button className="btn-icon" onClick={() => setShowNonce(!showNonce)}>
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <CopyButton text={state.nonce} />
                    </div>
                  </div>
                  {showNonce
                    ? <div className="hash-display text-amber-300">{state.nonce}</div>
                    : <div className="hash-display text-amber-300">{"•".repeat(64)}</div>
                  }
                  <p className="text-xs text-amber-400 mt-1">⚠️ Save this nonce securely. Required for reveal.</p>
                </div>

                {/* Amount reminder */}
                <div>
                  <span className="label">Committed Amount (wei)</span>
                  <div className="hash-display mt-1">{state.amount}</div>
                </div>

                <button
                  onClick={submitCommit}
                  disabled={commitPending || !inCommitPhase}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {commitPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
                    : <><Lock className="w-4 h-4" /> Submit Commitment</>}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Committed ─────────────────────────────────────────── */}
          {state.committed && !state.revealed && (
            <motion.div className="panel border-emerald-500/20 bg-emerald-900/10" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="section-title text-emerald-300">Commitment Submitted!</h2>
                  <p className="text-xs text-slate-500">Your intent is hidden. Wait for the Reveal phase (State 6).</p>
                </div>
              </div>

              {commitTxHash && (
                <div className="mb-4">
                  <span className="label">Transaction Hash</span>
                  <div className="hash-display mt-1">{commitTxHash}</div>
                </div>
              )}

              {inRevealPhase ? (
                <div className="space-y-3">
                  <p className="text-sm text-violet-300 font-medium">🔓 Reveal window is now open!</p>
                  <button
                    onClick={submitReveal}
                    disabled={revealPending}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {revealPending
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Revealing...</>
                      : <><Unlock className="w-4 h-4" /> Reveal Commitment</>}
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-dark-600 rounded-xl text-xs text-slate-400">
                  <Info className="w-3.5 h-3.5 inline mr-1" />
                  Wait for State 6 (Harmony) reveal window to open.
                  Protocol is currently at State {currentStateIdx + 1}.
                </div>
              )}
            </motion.div>
          )}

          {/* ── Revealed! ─────────────────────────────────────────── */}
          {state.revealed && (
            <motion.div className="panel border-saw-500/30 bg-saw-900/10 text-center py-8"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <div className="text-5xl mb-4">✴</div>
              <h2 className="section-title text-saw-300 mb-2">Reveal Complete!</h2>
              <p className="text-slate-400 text-sm mb-4">
                Your participation is validated. Allocation will be computed in State 7 (Flow).
              </p>
              {revealTxHash && (
                <div className="mb-4">
                  <span className="label">Reveal TX Hash</span>
                  <div className="hash-display mt-1">{revealTxHash}</div>
                </div>
              )}
              <button onClick={reset} className="btn-secondary flex items-center gap-2 mx-auto">
                <RefreshCw className="w-4 h-4" /> Reset (new ceremony)
              </button>
            </motion.div>
          )}

          {/* ── Error ─────────────────────────────────────────────── */}
          {error && (
            <div className="panel-sm border-red-500/30 bg-red-900/10 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-sm text-red-300">{error}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
