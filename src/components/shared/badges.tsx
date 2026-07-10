"use client";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { GRADE_META, type ReadinessResult } from "@/lib/readiness";
import type { ClientType, Priority } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Código do cliente em destaque (monoespaçado). */
export function CodeBadge({ code, className }: { code?: string; className?: string }) {
  if (!code) {
    return (
      <span
        className={cn(
          "whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground",
          className
        )}
      >
        s/&nbsp;cód.
      </span>
    );
  }
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded bg-primary/10 px-1.5 py-0.5 font-code text-xs font-semibold text-primary",
        className
      )}
    >
      {code}
    </span>
  );
}

/** Chip de tipo de cliente com a cor configurada. */
export function TypeChip({ type, small }: { type: ClientType; small?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
        small ? "text-[10px]" : "text-xs"
      )}
      style={{ borderColor: type.color, color: type.color }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: type.color }} />
      {type.name}
    </span>
  );
}

/** Selo de prontidão A/B/C/D/P com motivos no tooltip. */
export function ReadinessBadge({
  readiness,
  compact,
}: {
  readiness: ReadinessResult;
  compact?: boolean;
}) {
  const meta = GRADE_META[readiness.grade];
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex cursor-default items-center justify-center rounded-md font-semibold",
              meta.className,
              compact ? "size-6 text-xs" : "px-2 py-0.5 text-xs"
            )}
          >
            {compact ? readiness.grade : meta.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <p className="font-semibold">{meta.label}</p>
          <p className="mb-1 text-xs opacity-80">{meta.description}</p>
          <ul className="list-disc space-y-0.5 pl-4 text-xs">
            {readiness.reasons.slice(0, 6).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function PriorityBadge({ priority }: { priority?: Priority }) {
  if (!priority) return <span className="text-xs text-muted-foreground">—</span>;
  const styles: Record<Priority, string> = {
    Alta: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    Média: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    Baixa: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  };
  return <Badge className={cn("border-transparent", styles[priority])}>{priority}</Badge>;
}
