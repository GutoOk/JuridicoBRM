"use client";

import Link from "next/link";

import type { Process } from "@/lib/types";
import { cn } from "@/lib/utils";

export function getProcessParties(process?: Process): string {
  if (!process) return "";

  const clients = (process.clientNames ?? []).filter(Boolean).join(", ");
  const opposing = process.parteContraria?.trim() ?? "";

  if (clients && opposing) {
    return process.polo === "Passivo" ? `${opposing} x ${clients}` : `${clients} x ${opposing}`;
  }

  return clients || opposing;
}

export function ProcessReference({
  process,
  processNumber,
  className,
}: {
  process?: Process;
  processNumber?: string;
  className?: string;
}) {
  const number = process?.processNumber || processNumber;
  const parties = getProcessParties(process);

  if (!number) return null;

  return (
    <div className={cn("mt-1 space-y-0.5 text-[11px] leading-snug text-muted-foreground", className)}>
      <div className="flex min-w-0 flex-wrap items-baseline gap-1">
        <span>Processo:</span>
        {process?.id ? (
          <Link
            href={`/dashboard/processes/${process.id}`}
            className="font-code text-[11px] font-medium text-primary underline-offset-2 hover:underline"
          >
            {number}
          </Link>
        ) : (
          <span className="font-code text-[11px] font-medium text-primary/80">{number}</span>
        )}
      </div>
      {parties && <div className="text-muted-foreground/85">Partes: {parties}</div>}
    </div>
  );
}
