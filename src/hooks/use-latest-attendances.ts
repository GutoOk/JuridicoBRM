"use client";

import { useMemo } from "react";
import { useCollection } from "@/hooks/use-collection";
import { dateMillis } from "@/lib/normalize";
import type { Update } from "@/lib/types";

/** Mantém o atendimento ativo mais recente de cada cliente em tempo real. */
export function useLatestAttendances() {
  const { data, error } = useCollection<Update>(
    "updates",
    { where: [["type", "==", "Atendimento"]] }
  );

  const byClientId = useMemo(() => {
    const latest = new Map<string, Update>();
    for (const attendance of data ?? []) {
      if (attendance.deleted || !attendance.clientId) continue;
      const current = latest.get(attendance.clientId);
      if (
        !current ||
        dateMillis(attendance.createdAt ?? attendance.updateDate) >
          dateMillis(current.createdAt ?? current.updateDate)
      ) {
        latest.set(attendance.clientId, attendance);
      }
    }
    return latest;
  }, [data]);

  return { byClientId, loading: data === null, error };
}
