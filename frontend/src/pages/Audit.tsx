import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck, CheckCircle2, XCircle, Loader2,
  RefreshCw, ExternalLink, Info, AlertTriangle
} from "lucide-react";
import { useAuditReport } from "../hooks/useProtocolState";
import { verifyOrderKey } from "../lib/api";
import { FORMULAS } from "../lib/constants";

function VerificationRow({ label, passed, detail }: { label: string; passed?: boolean; detail?: string }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-dark-800 rounded-xl border border-white/5">
      <div className={`flex-shrink-0 mt-0.5 ${passed === undefined ? "text-slate-600" : passed ? "text-emerald-400" : "text-red-400"}`}>
        {passed === undefined
          ? <Info className="w-4 h-4" />
          : passed
            ? <CheckCircle2 className="w-4 h-4" />
            : <XCircle className="w-4 h-4" />}
      </div>
      <div>
        <div className={`text-sm font-medium ${passed === undefined ? "text-slate-500" : passed ? "text-emerald-300" : "text-red-300"}`}>
          {label}
        </div>
        {detail && <div className="text-xs text-slate-600 mt-0.5 font-mono">{detail}</div>}
      </div>
    </div>
  );
}

export default function Audit() {
  const { data: report, isLoading, refetch, isRefetching } = useAuditReport();

  // Order key verifier tool
  const [entropy, setEntropy]       = useState("");
  const [wallet, setWallet]         = useState("");
  const [orderResult, setOrderResult] = useState<any>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState("");

  const verifyOrder = async () => {
    if (!entropy || !wallet) return;
    setOrderLoading(true);
    setOrderError("");
    try {
      const result = await verifyOrderKey(entropy, wallet);
      setOrderResult(result);
    } catch (err: any) {
      setOrderError(err.response?.data?.error || err.message);
    } finally {
      setOrderLoading(false);
    }
  };

  const steps = [
    {
      num: 1, label: "Entropy Verification",
      desc: "Re-verify E = H(futureBlockHash ∥ drandRound ∥ btcAnchor) against public explorers",
      passed: report?.entropyVerified,
      formula: FORMULAS.entropy,
    },
    {
      num: 2, label: "Ordering Recomputation",
      desc: "Apply Order_i = H(E ∥ wallet_i) to participant list and confirm ascending sort matches on-chain",
      passed: report?.orderingVerified,
      formula: FORMULAS.orderKey,
    },
    {
      num: 3, label: "Allocation Audit",
      desc: "Verify pro-rata distribution weights were applied correctly to sorted list",
      passed: report?.allocationVerified,
      formula: "tokens_i = (amount_i / totalAmount) × totalTokens",
    },
    {
      num: 4, label: "Timestamp Integrity",
      desc: "Validate T_q = H(T_eth ∥ T_btc ∥ T_ntp ∥ T_beacon) against historical source data",
      passed: report?.timestampVerified,
      formula: FORMULAS.quantumTimestamp,
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold font-ritual text-gradient">Audit & Verification</h1>
          <p className="text-slate-400 mt-1">
            Any observer can recompute the entire launch to prove that the process was followed exactly.
            This is the "glass engine" — no black boxes.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading || isRefetching}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* ── Final State Seal ─────────────────────────────────────────── */}
      <div className={`panel ${report?.finalStateHash ? "border-emerald-500/20 bg-emerald-900/10" : "border-white/5"}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${report?.finalStateHash ? "bg-emerald-600" : "bg-dark-600"}`}>
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="section-title">Final State Seal</h2>
            <p className="section-subtitle">S_final = H(allAllocations ∥ T_q ∥ E)</p>
          </div>
        </div>

        <div className="formula mb-4">{FORMULAS.finalState}</div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading audit data...
          </div>
        ) : report?.finalStateHash ? (
          <div>
            <span className="label">S_final</span>
            <div className="hash-display mt-1 text-emerald-300">{report.finalStateHash}</div>
            <p className="text-xs text-slate-600 mt-2">
              This hash is the permanent, tamper-evident fingerprint of the entire launch.
              Published in State 11 (Purity). Immutable artifact of cryptographic history.
            </p>
          </div>
        ) : (
          <div className="p-3 bg-dark-600 rounded-xl text-xs text-slate-500 flex items-center gap-2">
            <Info className="w-3.5 h-3.5" />
            Final state hash will be published when the ceremony reaches State 11 (Purity).
          </div>
        )}
      </div>

      {/* ── Verification Checklist ───────────────────────────────────── */}
      <div className="panel">
        <h2 className="section-title mb-1">4-Step Verification</h2>
        <p className="section-subtitle mb-5">
          As documented in the whitepaper — any third party can verify these steps independently.
        </p>

        <div className="space-y-4">
          {steps.map((step) => (
            <motion.div
              key={step.num}
              className={`p-4 rounded-xl border transition-all ${
                step.passed === true  ? "border-emerald-500/20 bg-emerald-900/10" :
                step.passed === false ? "border-red-500/20 bg-red-900/10" :
                                        "border-white/5 bg-dark-700/50"
              }`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: step.num * 0.1 }}
            >
              <div className="flex items-start gap-3">
                {/* Step number + check */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5
                  ${step.passed === true  ? "bg-emerald-600 text-white" :
                    step.passed === false ? "bg-red-600 text-white"     :
                                            "bg-dark-500 text-slate-400"}`}>
                  {step.passed === true  ? <CheckCircle2 className="w-4 h-4" /> :
                   step.passed === false ? <XCircle      className="w-4 h-4" /> :
                   step.num}
                </div>
                <div className="flex-1">
                  <div className={`font-semibold font-ritual text-sm mb-1
                    ${step.passed === true ? "text-emerald-300" : step.passed === false ? "text-red-300" : "text-slate-300"}`}>
                    Step {step.num}: {step.label}
                  </div>
                  <p className="text-xs text-slate-500 mb-2">{step.desc}</p>
                  <div className="formula text-[10px]">{step.formula}</div>
                </div>
                <div>
                  {step.passed === true  ? <span className="badge-complete">Verified</span> :
                   step.passed === false ? <span className="badge-error">Failed</span>    :
                   isLoading             ? <Loader2 className="w-4 h-4 text-slate-600 animate-spin" /> :
                                           <span className="badge-pending">Pending</span>}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Live Audit Figures ───────────────────────────────────────── */}
      {report && (
        <div className="panel">
          <h2 className="section-title mb-4">Audit Figures</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "Total Participants",    value: report.totalParticipants },
              { label: "Valid Participants",    value: report.validParticipants },
              { label: "Total Tokens Distributed", value: report.totalTokensDistributed || "—" },
              { label: "Generated At",          value: report.generatedAt ? new Date(report.generatedAt).toLocaleString() : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="panel-sm">
                <span className="label">{label}</span>
                <div className="text-sm text-slate-200 mt-1 font-mono">{String(value)}</div>
              </div>
            ))}
          </div>

          {/* Hashes */}
          {report.entropy && (
            <div className="mt-4 space-y-2">
              <div>
                <span className="label">Entropy Seed (E)</span>
                <div className="hash-display mt-1">{report.entropy}</div>
              </div>
              {report.quantumTs && (
                <div>
                  <span className="label">Quantum Timestamp (T_q)</span>
                  <div className="hash-display mt-1">{report.quantumTs}</div>
                </div>
              )}
              {report.settlementHash && (
                <div>
                  <span className="label">Settlement Hash</span>
                  <div className="hash-display mt-1 text-emerald-300">{report.settlementHash}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Interactive: Verify Order Key ────────────────────────────── */}
      <div className="panel">
        <h2 className="section-title mb-1">Verify Participant Order Key</h2>
        <p className="section-subtitle mb-4">
          Compute Order_i = H(E ∥ wallet_i) yourself to verify any participant's position.
        </p>

        <div className="space-y-3">
          <div>
            <label className="label mb-2 block">Entropy Seed (E)</label>
            <input
              value={entropy}
              onChange={(e) => setEntropy(e.target.value)}
              placeholder="0x..."
              className="input-field font-mono text-xs"
            />
          </div>
          <div>
            <label className="label mb-2 block">Wallet Address</label>
            <input
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="0x..."
              className="input-field font-mono text-xs"
            />
          </div>
          <button
            onClick={verifyOrder}
            disabled={!entropy || !wallet || orderLoading}
            className="btn-primary flex items-center gap-2"
          >
            {orderLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Computing...</> : <><ShieldCheck className="w-4 h-4" /> Compute Order Key</>}
          </button>

          {orderError && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4" /> {orderError}
            </div>
          )}

          {orderResult && (
            <motion.div
              className="p-4 bg-dark-700 rounded-xl border border-saw-500/20"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="label mb-2">Order Key (Order_i)</div>
              <div className="hash-display text-saw-300">{orderResult.orderKey}</div>
              <p className="text-xs text-slate-600 mt-2">
                Formula: {orderResult.formula}<br />
                Inputs: wallet={orderResult.inputs?.participant?.slice(0,10)}... | entropy={orderResult.inputs?.entropy?.slice(0,10)}...
              </p>
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Instructions ─────────────────────────────────────────────── */}
      <div className="panel">
        <h2 className="section-title mb-4">Manual Verification Instructions</h2>
        <div className="space-y-3">
          {(report?.instructions ? Object.values(report.instructions) : [
            "Entropy: verify E = H(futureBlockHash ∥ drandRound ∥ btcAnchor) via public block explorers",
            "Ordering: apply Order_i = H(E ∥ wallet_i) and confirm ascending sort matches on-chain records",
            "Allocations: verify pro-rata distribution weights were applied correctly",
            "Timestamp: validate T_q = H(T_eth ∥ T_btc ∥ T_ntp ∥ T_beacon) against historical data",
          ]).map((instr: any, i) => (
            <div key={i} className="flex items-start gap-3 text-sm text-slate-400">
              <div className="w-5 h-5 rounded-full bg-saw-800/40 text-saw-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">
                {i + 1}
              </div>
              <span>{String(instr)}</span>
            </div>
          ))}
        </div>
        <div className="divider" />
        <p className="text-xs text-slate-600 italic">
          "Because the inputs (Entropy + Wallets) are public, any user can re-calculate
          the entire launch after the fact to prove that the process was followed exactly."
          — SAW Protocol Whitepaper
        </p>
      </div>
    </div>
  );
}
