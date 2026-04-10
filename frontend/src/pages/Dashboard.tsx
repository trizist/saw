import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Waves, ArrowRight, Shield, Zap, Eye, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { useProtocolState, useParticipants, useAllocations } from "../hooks/useProtocolState";
import { STATES, FORMULAS, PHASES } from "../lib/constants";
import StateCard from "../components/StateCard";
import TokenomicsChart from "../components/TokenomicsChart";
import EntropyDisplay from "../components/EntropyDisplay";

function StatPill({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="panel-sm text-center">
      <div className="text-2xl font-bold font-ritual text-gradient">{value}</div>
      <div className="text-xs font-medium text-slate-300 mt-1">{label}</div>
      {sub && <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { data: ps, isLoading: psLoading, isError: psError } = useProtocolState();
  const { data: participants } = useParticipants();
  const { data: allocations  } = useAllocations();

  const currentIdx = ps?.current?.index ?? 0;
  const currentState = STATES[currentIdx];
  const stateHistory = ps?.history ?? [];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-saw-950 via-dark-800 to-violet-950 border border-saw-800/30 p-8 md:p-12">
        <div className="absolute inset-0 bg-entropy-pulse opacity-20 pointer-events-none" />
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded bg-saw-600 flex items-center justify-center">
              <Waves className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-xs font-mono text-saw-400 uppercase tracking-widest">
              Secure Atomic Wave Protocol
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold font-ritual leading-tight mb-4">
            <span className="text-gradient">Twelve States.</span><br />
            <span className="text-slate-100">One Truth.</span>
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed mb-6 max-w-2xl">
            A cryptographic ceremony replacing chaotic token launches with a deterministic,
            12-state sequence for absolute fairness and auditability.
            Not a race — a <em className="text-slate-300">ritual with receipts</em>.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/ceremony" className="btn-primary flex items-center gap-2">
              View Ceremony <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/commit" className="btn-secondary flex items-center gap-2">
              <Eye className="w-4 h-4" /> Participate
            </Link>
            <Link to="/audit" className="btn-secondary flex items-center gap-2">
              <Shield className="w-4 h-4" /> Verify Fairness
            </Link>
          </div>
        </div>

        {/* Floating formula */}
        <div className="hidden lg:block absolute right-8 top-1/2 -translate-y-1/2 space-y-2 opacity-60">
          {Object.values(FORMULAS).map((f) => (
            <div key={f} className="formula text-[11px]">{f}</div>
          ))}
        </div>
      </section>

      {/* ── Stats Row ─────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatPill label="Current State"  value={`S${currentIdx + 1}`}   sub={currentState?.name} />
        <StatPill label="Participants"   value={participants?.total ?? 0}  sub={`${participants?.valid ?? 0} valid`} />
        <StatPill label="Settled"        value={allocations?.total ?? 0}   sub="allocations" />
        <StatPill label="Protocol"       value="v1.0"                      sub="SAW 2026" />
      </section>

      {/* ── Current State Highlight ───────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="section-title">Current Ceremony State</h2>
            <p className="section-subtitle">Live status of the 12-state cryptographic sequence</p>
          </div>
          {psLoading && <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />}
          {psError   && <span className="badge-error flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Offline</span>}
        </div>

        {ps?.entropy && (
          <div className="panel-sm mb-4">
            <div className="label mb-1">Finalized Entropy (E)</div>
            <div className="hash-display text-saw-300">{ps.entropy}</div>
          </div>
        )}
        {ps?.finalHash && (
          <div className="panel-sm mb-4">
            <div className="label mb-1">Final State Seal (S_final)</div>
            <div className="hash-display text-emerald-300">{ps.finalHash}</div>
          </div>
        )}

        {/* Phase progress */}
        {Object.entries(PHASES).map(([phaseName, phase]) => (
          <div key={phaseName} className="mb-6">
            <div className={`label mb-3 ${phase.color}`}>
              Phase: {phaseName} — {phase.description}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {phase.states.map((si) => (
                <StateCard
                  key={si}
                  stateIndex={si}
                  currentIndex={currentIdx}
                  stateHash={stateHistory[si]?.stateHash}
                  timestamp={stateHistory[si]?.timestamp}
                  compact
                />
              ))}
            </div>
          </div>
        ))}

        <div className="text-center mt-4">
          <Link to="/ceremony" className="btn-secondary inline-flex items-center gap-2">
            Full Ceremony View <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── Core Mechanics ────────────────────────────────────────── */}
      <section>
        <h2 className="section-title mb-2">Core Mechanics</h2>
        <p className="section-subtitle mb-5">The three pillars of cryptographic fairness</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: Shield, color: "bg-blue-600", title: "Anti-MEV Shielding",
              desc: "Batch Execution settles all allocations in a single block. No bot can front-run individual users in the mempool.",
              formula: FORMULAS.commitment,
            },
            {
              icon: Zap, color: "bg-violet-600", title: "Deterministic Ordering",
              desc: "Your position in line is a math formula. No gas, no speed — only cryptographic truth determines priority.",
              formula: FORMULAS.orderKey,
            },
            {
              icon: CheckCircle2, color: "bg-emerald-600", title: "Verifiable Integrity",
              desc: "Any observer can recompute the full launch — entropy, ordering, allocations, and timestamp — to prove fairness.",
              formula: FORMULAS.finalState,
            },
          ].map(({ icon: Icon, color, title, desc, formula }) => (
            <motion.div
              key={title}
              className="panel hover:border-saw-800/40 transition-all cursor-default"
              whileHover={{ y: -2 }}
            >
              <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-4`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-semibold font-ritual text-slate-100 mb-2">{title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed mb-4">{desc}</p>
              <div className="formula text-[11px]">{formula}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Entropy + Tokenomics Row ──────────────────────────────── */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <EntropyDisplay />
        <TokenomicsChart />
      </section>

      {/* ── State Chain Visualization ─────────────────────────────── */}
      {stateHistory.length > 0 && (
        <section className="panel">
          <h2 className="section-title mb-1">Cryptographic State Chain</h2>
          <p className="section-subtitle mb-4">S₁ → S₂ → ... → S₁₂ — tamper-evident, irreversible</p>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {stateHistory.map((sh: any, i: number) => (
              <React.Fragment key={i}>
                <div className="flex-shrink-0 text-center">
                  <div className="bg-dark-600 border border-saw-800/30 rounded-lg px-2 py-1.5 min-w-[80px]">
                    <div className="text-[10px] text-saw-400 font-mono">S{i + 1}</div>
                    <div className="text-[9px] text-slate-600 font-mono truncate">{sh.stateHash?.slice(0, 8)}...</div>
                  </div>
                </div>
                {i < stateHistory.length - 1 && (
                  <div className="flex-shrink-0 text-saw-700 font-bold text-lg">→</div>
                )}
              </React.Fragment>
            ))}
          </div>
          <p className="text-xs text-slate-600 mt-3">
            Each state hash H(S_{"{n-1}"} ∥ stateData) is chained to the next — editing any state breaks all subsequent hashes, making malfeasance immediately visible.
          </p>
        </section>
      )}
    </div>
  );
}
