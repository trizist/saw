import React, { useState } from "react";
import { useAccount } from "wagmi";
import { Search, Loader2, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { useAllocations, useParticipants } from "../hooks/useProtocolState";
import { FORMULAS } from "../lib/constants";

function truncateAddress(addr: string) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "—";
}
function truncateHash(hash: string) {
  return hash ? `${hash.slice(0, 10)}...${hash.slice(-6)}` : "—";
}

export default function Allocations() {
  const { address } = useAccount();
  const { data: allocData, isLoading: aLoading } = useAllocations();
  const { data: partData, isLoading: pLoading  } = useParticipants();
  const [search, setSearch] = useState("");

  const allocations = allocData?.allocations ?? [];
  const participants= partData?.participants ?? [];

  const filtered = allocations.filter((a: any) =>
    !search || a.address?.toLowerCase().includes(search.toLowerCase())
  );

  const myAlloc = address ? allocations.find(
    (a: any) => a.address?.toLowerCase() === address.toLowerCase()
  ) : null;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-bold font-ritual text-gradient">Allocations</h1>
        <p className="text-slate-400 mt-1">
          Deterministic, pro-rata token distribution based on entropy-ordered participants.
        </p>
      </div>

      {/* ── Formula ─────────────────────────────────────────────────── */}
      <div className="panel-sm flex flex-wrap gap-4 items-center">
        <div>
          <span className="label mr-2">Ordering:</span>
          <span className="formula">{FORMULAS.orderKey}</span>
        </div>
        <div>
          <span className="label mr-2">Allocation:</span>
          <span className="formula text-[11px]">tokens_i = (amount_i / totalAmount) × totalTokens</span>
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Participants", value: partData?.total ?? 0 },
          { label: "Valid Revealed",     value: partData?.valid ?? 0 },
          { label: "Settled",            value: allocations.filter((a: any) => a.settled).length },
          { label: "Settlement Hash",    value: allocData?.settlementHash ? truncateHash(allocData.settlementHash) : "Pending" },
        ].map(({ label, value }) => (
          <div key={label} className="panel-sm text-center">
            <div className="text-xl font-bold font-ritual text-gradient">{value}</div>
            <div className="text-xs text-slate-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* ── My Allocation ────────────────────────────────────────────── */}
      {myAlloc && (
        <div className="panel border-saw-500/30 bg-saw-900/10">
          <h2 className="section-title mb-3">Your Allocation</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Rank",     value: `#${myAlloc.rank}` },
              { label: "Tokens",   value: myAlloc.tokenAmount },
              { label: "Status",   value: myAlloc.settled ? "Settled ✅" : "Pending" },
              { label: "Order Key",value: truncateHash(myAlloc.orderKey || "") },
            ].map(({ label, value }) => (
              <div key={label}>
                <span className="label">{label}</span>
                <div className={`text-sm font-mono mt-1 ${label === "Status" && myAlloc.settled ? "text-emerald-400" : "text-slate-300"}`}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Participants Table ────────────────────────────────────────── */}
      <div className="panel">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="section-title">Participant Commitments</h2>
            <p className="section-subtitle">{participants.length} total commitments</p>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search address..."
              className="input-field pl-9 w-64 text-xs"
            />
          </div>
        </div>

        {pLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
          </div>
        ) : participants.length === 0 ? (
          <div className="text-center py-12 text-slate-600">
            <Clock className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p>No commitments yet. Waiting for State 4 (Perception) to open.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {["Address", "Commit Hash", "Revealed", "Valid", "Timestamp"].map((h) => (
                    <th key={h} className="text-left label py-2 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {participants.map((p: any, i: number) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                    <td className="py-2.5 pr-4 font-mono text-xs text-slate-300">
                      {truncateAddress(p.participantAddress)}
                      {p.participantAddress?.toLowerCase() === address?.toLowerCase() && (
                        <span className="ml-2 badge-active">You</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="hash-display-sm">{truncateHash(p.commitHash)}</div>
                    </td>
                    <td className="py-2.5 pr-4">
                      {p.revealed
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        : <Clock className="w-4 h-4 text-slate-600" />}
                    </td>
                    <td className="py-2.5 pr-4">
                      {p.valid === true  ? <span className="badge-complete">Valid</span> :
                       p.valid === false && p.revealed ? <span className="badge-error">Purged</span> :
                       <span className="badge-pending">Pending</span>}
                    </td>
                    <td className="py-2.5 text-xs text-slate-600 font-mono">
                      {p.timestamp ? new Date(p.timestamp * 1000).toLocaleTimeString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Allocation Results Table ──────────────────────────────────── */}
      {allocations.length > 0 && (
        <div className="panel">
          <h2 className="section-title mb-1">Allocation Results</h2>
          <p className="section-subtitle mb-4">Sorted ascending by Order_i = H(E ∥ wallet_i)</p>
          {aLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    {["Rank", "Address", "Order Key", "Token Amount", "Weight", "Status"].map((h) => (
                      <th key={h} className="text-left label py-2 pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a: any) => (
                    <tr key={a.address} className={`border-b border-white/5 hover:bg-white/2 transition-colors ${
                      a.address?.toLowerCase() === address?.toLowerCase() ? "bg-saw-900/10" : ""
                    }`}>
                      <td className="py-2.5 pr-4">
                        <span className="text-saw-400 font-bold">#{a.rank}</span>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-slate-300">
                        {truncateAddress(a.address)}
                        {a.address?.toLowerCase() === address?.toLowerCase() && (
                          <span className="ml-2 badge-active">You</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="hash-display-sm">{truncateHash(a.orderKey || "")}</div>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-slate-300">
                        {a.tokenAmount}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-slate-500">
                        {a.weight ? (Number(a.weight) / 1e16).toFixed(2) + "%" : "—"}
                      </td>
                      <td className="py-2.5">
                        {a.settled
                          ? <span className="badge-complete flex items-center gap-1 w-fit"><CheckCircle2 className="w-3 h-3" /> Settled</span>
                          : <span className="badge-pending">Pending</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {allocData?.settlementHash && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <span className="label">Settlement Hash</span>
              <div className="hash-display mt-1 text-emerald-300">{allocData.settlementHash}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
