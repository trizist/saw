import React from "react";
import { motion } from "framer-motion";
import { Cpu, Globe, Bitcoin, Clock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useEntropyStatus, useQuantumTimestamp } from "../hooks/useProtocolState";
import { FORMULAS } from "../lib/constants";

function HashChip({ label, value, icon: Icon, color }: {
  label: string; value: string | number | null; icon: React.ElementType; color: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 bg-dark-800 rounded-xl border border-white/5">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="label mb-1">{label}</div>
        {value ? (
          <div className="hash-display-sm">{String(value)}</div>
        ) : (
          <div className="text-xs text-slate-600 italic">Pending...</div>
        )}
      </div>
    </div>
  );
}

export default function EntropyDisplay() {
  const { data: entropyStatus, isLoading: eLoading } = useEntropyStatus();
  const { data: tsData,        isLoading: tLoading  } = useQuantumTimestamp();

  return (
    <div className="space-y-5">
      {/* ── Entropy Engine ─────────────────────────────────── */}
      <div className="panel">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="section-title">Entropy Engine</h3>
            <p className="section-subtitle">E = H(futureBlockHash ∥ drandRound ∥ btcAnchor)</p>
          </div>
          <div className="flex items-center gap-2">
            {eLoading ? (
              <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
            ) : entropyStatus?.finalized ? (
              <span className="badge-complete flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Finalized</span>
            ) : entropyStatus?.locked ? (
              <span className="badge-warning flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Locked</span>
            ) : (
              <span className="badge-pending">Pending</span>
            )}
          </div>
        </div>

        <div className="formula mb-4">{FORMULAS.entropy}</div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <HashChip
            label="Future Block Hash (ETH)"
            value={entropyStatus?.sources?.futureBlockHash ?? null}
            icon={Cpu}
            color="bg-blue-600"
          />
          <HashChip
            label="drand Beacon Round"
            value={entropyStatus?.sources?.drandRound ?? null}
            icon={Globe}
            color="bg-violet-600"
          />
          <HashChip
            label="BTC Anchor"
            value={entropyStatus?.sources?.btcAnchor ?? null}
            icon={Bitcoin}
            color="bg-amber-600"
          />
        </div>

        {entropyStatus?.entropy && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <div className="label mb-2">Finalized Entropy Seed (E)</div>
            <div className="hash-display text-saw-300">{entropyStatus.entropy}</div>
            {entropyStatus.finalizedAt && (
              <div className="mt-2 text-xs text-slate-600 font-mono">
                Finalized at block {entropyStatus.sources?.lockedAtBlock} · {new Date(entropyStatus.finalizedAt * 1000).toLocaleString()}
              </div>
            )}
          </div>
        )}

        {!entropyStatus?.locked && !eLoading && (
          <div className="mt-4 p-3 bg-slate-800/50 rounded-xl border border-white/5 text-xs text-slate-500">
            <strong className="text-slate-400">How it works:</strong> Entropy is locked at State 2 (Genesis) 
            using three ungameable sources. The final seed is only computed after the future block is mined — 
            preventing any actor from predicting participant ordering before the commit window opens.
          </div>
        )}
      </div>

      {/* ── Quantum Timestamp ──────────────────────────────── */}
      <div className="panel">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="section-title">Quantum Timestamp</h3>
            <p className="section-subtitle">T_q = H(T_eth ∥ T_btc ∥ T_ntp ∥ T_beacon)</p>
          </div>
          {tLoading ? (
            <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
          ) : tsData ? (
            <span className="badge-complete flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Active</span>
          ) : (
            <span className="badge-pending">Pending</span>
          )}
        </div>

        <div className="formula mb-4">{FORMULAS.quantumTimestamp}</div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <HashChip label="T_eth (Ethereum)" value={tsData?.quantumTimestamp?.tEth ?? null}   icon={Cpu}     color="bg-blue-600"   />
          <HashChip label="T_btc (Bitcoin)"  value={tsData?.quantumTimestamp?.tBtc ?? null}   icon={Bitcoin} color="bg-amber-600"  />
          <HashChip label="T_ntp (Servers)"  value={tsData?.quantumTimestamp?.tNtp ?? null}   icon={Globe}   color="bg-cyan-600"   />
          <HashChip label="T_beacon (drand)" value={tsData?.quantumTimestamp?.tBeacon ?? null}icon={Clock}   color="bg-violet-600" />
        </div>

        {tsData?.quantumTimestamp?.fingerprint && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 pt-4 border-t border-white/5"
          >
            <div className="label mb-2">Fingerprint T_q</div>
            <div className="hash-display text-cyan-300">{tsData.quantumTimestamp.fingerprint}</div>
            <p className="mt-2 text-xs text-slate-600">
              Consensus of {tsData.quantumTimestamp.sources?.ntpServers?.length ?? 3} NTP servers + 
              ETH block #{tsData.quantumTimestamp.sources?.ethBlockNumber} + 
              BTC block #{tsData.quantumTimestamp.sources?.btcBlockHeight} + 
              drand round #{tsData.quantumTimestamp.sources?.drandRound}
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
