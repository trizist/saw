import React, { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useProtocolState } from "../hooks/useProtocolState";
import { STATES, PHASES, FORMULAS } from "../lib/constants";
import StateCard from "../components/StateCard";
import EntropyDisplay from "../components/EntropyDisplay";

export default function Ceremony() {
  const { data: ps, isLoading } = useProtocolState();
  const [expandedPhase, setExpandedPhase] = useState<string | null>("Preparation");

  const currentIdx  = ps?.current?.index ?? 0;
  const stateHistory= ps?.history ?? [];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-ritual text-gradient">The 12-State Ceremony</h1>
          <p className="text-slate-400 mt-1">
            A disciplined, ritualized sequence of irreversible states.
            Each transition produces a cryptographic hash chained to the next.
          </p>
        </div>
        {isLoading && <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />}
      </div>

      {/* ── State chain formula ───────────────────────────────────── */}
      <div className="panel-sm flex items-center gap-4 flex-wrap">
        <span className="label">State Chain:</span>
        <div className="formula">{FORMULAS.stateChain}</div>
        <span className="text-xs text-slate-600">→ tamper-evident, irreversible history</span>
      </div>

      {/* ── Progress bar ─────────────────────────────────────────── */}
      <div className="panel">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-300">
            State {currentIdx + 1} / 12 — {STATES[currentIdx].name}
          </span>
          <span className="text-xs font-mono text-slate-500">
            {Math.round((currentIdx / 11) * 100)}% complete
          </span>
        </div>
        <div className="h-2 bg-dark-600 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-saw-600 to-violet-500 rounded-full"
            initial={{ width: "0%" }}
            animate={{ width: `${((currentIdx) / 11) * 100}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
        {/* State markers */}
        <div className="flex justify-between mt-2">
          {STATES.map((s, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i < currentIdx  ? "bg-emerald-500" :
                i === currentIdx ? "bg-saw-400 scale-150 animate-pulse-slow" :
                                   "bg-dark-500"
              }`}
              title={`S${i+1}: ${s.name}`}
            />
          ))}
        </div>
      </div>

      {/* ── Phases ───────────────────────────────────────────────── */}
      {Object.entries(PHASES).map(([phaseName, phase]) => (
        <div key={phaseName} className="panel">
          <button
            className="w-full flex items-center justify-between text-left"
            onClick={() => setExpandedPhase(expandedPhase === phaseName ? null : phaseName)}
          >
            <div>
              <div className="flex items-center gap-3">
                <span className={`text-lg font-bold font-ritual ${phase.color}`}>{phaseName}</span>
                <div className="flex gap-1">
                  {phase.states.map((si) => (
                    <span key={si} className={`w-2 h-2 rounded-full ${
                      si < currentIdx  ? "bg-emerald-500" :
                      si === currentIdx ? "bg-saw-400 animate-pulse-slow" :
                                          "bg-dark-500"
                    }`} />
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{phase.description}</p>
            </div>
            {expandedPhase === phaseName
              ? <ChevronDown className="w-5 h-5 text-slate-500 flex-shrink-0" />
              : <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0" />
            }
          </button>

          {expandedPhase === phaseName && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4"
            >
              {phase.states.map((si) => (
                <StateCard
                  key={si}
                  stateIndex={si}
                  currentIndex={currentIdx}
                  stateHash={stateHistory[si]?.stateHash}
                  timestamp={stateHistory[si]?.timestamp}
                  compact={false}
                />
              ))}
            </motion.div>
          )}
        </div>
      ))}

      {/* ── Entropy & Timestamp ───────────────────────────────────── */}
      <EntropyDisplay />

      {/* ── Traditional vs SAW comparison ────────────────────────── */}
      <div className="panel">
        <h2 className="section-title mb-4">Traditional Launches vs SAW Protocol</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Old way */}
          <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-4 space-y-2">
            <h3 className="text-red-400 font-semibold font-ritual text-sm">❌ Traditional (FCFS)</h3>
            {[
              ["MEV/Bot Sniping",      "Bots front-run users, snatching allocations"],
              ["Gas Wars",             "Wealth determines priority, not interest"],
              ["Centralized Clock",    "Single server timestamp — exploitable"],
              ["Information Asymmetry","Insiders see mempool, jump queue with impunity"],
            ].map(([k, v]) => (
              <div key={k} className="text-xs">
                <span className="text-red-300 font-medium">{k}: </span>
                <span className="text-slate-500">{v}</span>
              </div>
            ))}
          </div>
          {/* SAW way */}
          <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-4 space-y-2">
            <h3 className="text-emerald-400 font-semibold font-ritual text-sm">✅ SAW Protocol</h3>
            {[
              ["Commit/Reveal",         "Intent hidden until reveal — bots can't snipe"],
              ["Entropy-Based Ordering","Math, not gas, determines position"],
              ["Quantum Timestamp",     "Multi-source consensus — unfakeable"],
              ["Atomic Settlement",     "All participants settle simultaneously in one TX"],
            ].map(([k, v]) => (
              <div key={k} className="text-xs">
                <span className="text-emerald-300 font-medium">{k}: </span>
                <span className="text-slate-500">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
