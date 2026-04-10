import React from "react";
import { motion } from "framer-motion";
import { Check, Clock, Zap } from "lucide-react";
import { STATES, PHASES } from "../lib/constants";

interface StateCardProps {
  stateIndex: number;
  currentIndex: number;
  stateHash?: string;
  timestamp?: number;
  compact?: boolean;
}

export default function StateCard({ stateIndex, currentIndex, stateHash, timestamp, compact }: StateCardProps) {
  const state    = STATES[stateIndex];
  const isActive = stateIndex === currentIndex;
  const isDone   = stateIndex < currentIndex;
  const isPending= stateIndex > currentIndex;

  const phaseEntry = Object.entries(PHASES).find(([, v]) => v.states.includes(stateIndex));
  const [phaseName, phaseData] = phaseEntry ?? ["", { color: "" }];

  if (compact) {
    return (
      <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-300
        ${isActive  ? "bg-saw-900/40 border-saw-500/40 shadow-state"  :
          isDone    ? "bg-emerald-900/20 border-emerald-500/20"        :
                      "bg-dark-700/30 border-white/5 opacity-60"}`}
      >
        {/* Index */}
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
          ${isActive  ? "bg-saw-600 text-white animate-pulse-slow" :
            isDone    ? "bg-emerald-600 text-white"                 :
                        "bg-dark-600 text-slate-500"}`}
        >
          {isDone ? <Check className="w-3.5 h-3.5" /> : stateIndex + 1}
        </div>
        {/* Name */}
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium truncate
            ${isActive ? "text-saw-300" : isDone ? "text-emerald-300" : "text-slate-500"}`}>
            {state.name}
          </div>
          <div className="text-[10px] text-slate-600 font-mono">{state.symbol}</div>
        </div>
        {/* Sigil */}
        <span className={`text-lg ${isActive ? "text-saw-400" : isDone ? "text-emerald-400" : "text-slate-700"}`}>
          {state.sigil}
        </span>
      </div>
    );
  }

  return (
    <motion.div
      layout
      className={`rounded-2xl p-5 border transition-all duration-400
        ${isActive  ? "bg-gradient-to-br from-saw-900/60 to-violet-900/30 border-saw-500/40 shadow-state" :
          isDone    ? "bg-gradient-to-br from-emerald-900/20 to-emerald-900/10 border-emerald-500/20"    :
                      "bg-dark-700/40 border-white/5 opacity-50"}`}
      animate={isActive ? { scale: [1, 1.01, 1] } : {}}
      transition={{ duration: 2, repeat: Infinity, repeatType: "mirror" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Status icon */}
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0
            ${isActive ? "bg-saw-600 shadow-state" : isDone ? "bg-emerald-600" : "bg-dark-600"}`}>
            {isActive  ? <Zap className="w-4 h-4 text-white" />     :
             isDone    ? <Check className="w-4 h-4 text-white" />   :
                         <Clock className="w-4 h-4 text-slate-500" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-600">S{stateIndex + 1}</span>
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${(phaseData as any).color} bg-white/5`}>
                {phaseName}
              </span>
            </div>
            <h3 className={`font-semibold font-ritual ${isActive ? "text-saw-200" : isDone ? "text-emerald-300" : "text-slate-500"}`}>
              {state.name}
            </h3>
          </div>
        </div>
        {/* Allocation % */}
        {state.pct > 0 && (
          <div className={`text-right ${isActive ? "text-saw-300" : isDone ? "text-emerald-400" : "text-slate-600"}`}>
            <div className="text-lg font-bold">{state.pct}%</div>
            <div className="text-[10px] text-slate-600">allocated</div>
          </div>
        )}
      </div>

      {/* Sigil + symbol */}
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-3xl ${isActive ? "text-saw-400" : isDone ? "text-emerald-500" : "text-slate-700"}`}>
          {state.sigil}
        </span>
        <span className="text-xs text-slate-600 italic">{state.symbol}</span>
      </div>

      {/* Description */}
      <p className="text-xs text-slate-500 leading-relaxed mb-3">{state.desc}</p>

      {/* State hash */}
      {stateHash && stateHash !== "0x" + "0".repeat(64) && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="label mb-1">State Hash</div>
          <div className="hash-display-sm">{stateHash}</div>
        </div>
      )}

      {/* Timestamp */}
      {timestamp && timestamp > 0 && (
        <div className="mt-2 text-[10px] text-slate-600 font-mono">
          {new Date(timestamp * 1000).toLocaleString()}
        </div>
      )}
    </motion.div>
  );
}
