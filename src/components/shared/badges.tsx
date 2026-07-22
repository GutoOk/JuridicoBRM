"use client";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GRADES, GRADE_META, type Grade } from "@/lib/readiness";
import type { ClientType, Priority } from "@/lib/types";
import { cn } from "@/lib/utils";
import { clientTypeSelectedStyle, clientTypeVisual } from "@/lib/client-type-style";

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
      style={clientTypeSelectedStyle(type)}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: clientTypeVisual(type).dotColor }} />
      {type.name}
    </span>
  );
}

/** Selo simples de prontidão (somente exibição). */
export function GradeBadge({ grade, className }: { grade: Grade | null; className?: string }) {
  if (!grade) {
    return (
      <span className={cn("text-xs text-muted-foreground/60", className)} title="Prontidão ainda não classificada">
        —
      </span>
    );
  }
  const meta = GRADE_META[grade];
  return (
    <span
      title={`${meta.short}. ${meta.description}`}
      className={cn(
        "inline-flex h-6 cursor-default items-center justify-center rounded-md px-2 text-[11px] font-medium whitespace-nowrap",
        meta.className,
        className
      )}
    >
      {meta.short}
    </span>
  );
}

/**
 * Seletor da prontidão MANUAL (A/B/C/D/P) — a equipe classifica o cliente na
 * operação; nada é calculado automaticamente.
 */
export function GradeSelect({
  grade,
  onChange,
  className,
}: {
  grade: Grade | null;
  onChange: (grade: Grade | null) => void;
  className?: string;
}) {
  return (
    <Select
      value={grade ?? "none"}
      onValueChange={(v) => onChange(v === "none" ? null : (v as Grade))}
    >
      <SelectTrigger
        title="Classificação definida pela equipe: Redondo, Protocolável, Alto risco, Não protocolar ou Protocolado"
        className={cn(
          "h-7 w-auto justify-center gap-1 border-0 bg-transparent px-1 shadow-none hover:bg-muted [&>svg]:hidden",
          className
        )}
      >
        <GradeBadge grade={grade} />
      </SelectTrigger>
      <SelectContent align="center" className="min-w-[230px]">
        <SelectItem value="none" className="text-xs text-muted-foreground">
          Sem classificação
        </SelectItem>
        {GRADES.map((g) => (
          <SelectItem key={g} value={g} className="text-xs">
            {GRADE_META[g].label.replace(/^[A-Z] — /, "")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
