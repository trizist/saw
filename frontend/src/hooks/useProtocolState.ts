import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchProtocolState, fetchEntropyStatus, fetchQuantumTimestamp, fetchAuditReport, fetchAllocations, fetchParticipants, fetchTokenomics } from "../lib/api";

export function useProtocolState() {
  return useQuery({
    queryKey: ["protocol-state"],
    queryFn: fetchProtocolState,
    refetchInterval: 8_000,
    retry: 2,
    staleTime: 4_000,
  });
}

export function useEntropyStatus() {
  return useQuery({
    queryKey: ["entropy-status"],
    queryFn: fetchEntropyStatus,
    refetchInterval: 15_000,
    retry: 2,
  });
}

export function useQuantumTimestamp() {
  return useQuery({
    queryKey: ["quantum-timestamp"],
    queryFn: fetchQuantumTimestamp,
    staleTime: 60_000,
    retry: 2,
  });
}

export function useAuditReport() {
  return useQuery({
    queryKey: ["audit-report"],
    queryFn: fetchAuditReport,
    refetchInterval: 30_000,
    retry: 2,
  });
}

export function useAllocations() {
  return useQuery({
    queryKey: ["allocations"],
    queryFn: fetchAllocations,
    refetchInterval: 15_000,
    retry: 2,
  });
}

export function useParticipants() {
  return useQuery({
    queryKey: ["participants"],
    queryFn: fetchParticipants,
    refetchInterval: 10_000,
    retry: 2,
  });
}

export function useTokenomics() {
  return useQuery({
    queryKey: ["tokenomics"],
    queryFn: fetchTokenomics,
    staleTime: Infinity,
    retry: 2,
  });
}

// Auto-refresh all queries when the window regains focus
export function useAutoRefresh() {
  const qc = useQueryClient();
  useEffect(() => {
    const handler = () => qc.invalidateQueries();
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, [qc]);
}
