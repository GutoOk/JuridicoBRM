import type { CaseFile, ChecklistItemDef, ClientType } from "./types";
import { activeChecklistItems, displayStatus } from "./checklist";

/**
 * PRONTIDÃO MANUAL
 * =================
 * A prontidão (A/B/C/D/P) é definida PELA EQUIPE, cliente a cliente, dentro de
 * cada operação — não existe cálculo automático. O valor fica gravado em
 * `caseFiles.{clientId}_{typeId}.grade` e é alterado na tela de Operação ou na
 * ficha do cliente.
 *
 * Pendências também são simples: todo item de checklist ativo que ainda não
 * está marcado como OK é uma pendência (nada bloqueia nada).
 */

export type Grade = "A" | "B" | "C" | "D" | "P";

export const GRADES: Grade[] = ["A", "B", "C", "D", "P"];

export const GRADE_META: Record<
  Grade,
  { label: string; short: string; description: string; className: string }
> = {
  A: {
    label: "A — Redondo",
    short: "Redondo",
    description: "Avaliado pela equipe como pronto, sem pendências relevantes.",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  },
  B: {
    label: "B — Protocolável c/ pendência",
    short: "Protocolável",
    description: "Dá para protocolar, mas há pendências a resolver.",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  },
  C: {
    label: "C — Alto risco",
    short: "Alto risco",
    description: "Caso com problema relevante — tratar antes de avançar.",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  },
  D: {
    label: "D — Não protocolar",
    short: "Não protocolar",
    description: "Não protocolar sem decisão da equipe.",
    className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  },
  P: {
    label: "P — Protocolado",
    short: "Protocolado",
    description: "Já protocolado — acompanhamento pós-protocolo.",
    className: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  },
};

/** Prontidão registrada na ficha (null = ainda não classificada). */
export function caseGrade(caseFile: CaseFile | null | undefined): Grade | null {
  return (caseFile?.grade as Grade | undefined) ?? null;
}

export type PendingItem = {
  id: string;
  name: string;
  status: "pendente";
  def: ChecklistItemDef;
};

/**
 * Pendências do cliente na operação: itens ativos do checklist marcados como
 * Pendente (ou ainda sem preencher). OK e Não se aplica não são pendência.
 */
export function pendingItems(
  type: ClientType | null | undefined,
  caseFile: CaseFile | null | undefined
): PendingItem[] {
  const states = caseFile?.items ?? {};
  const out: PendingItem[] = [];
  for (const def of activeChecklistItems(type)) {
    const s = displayStatus(states[def.id]?.status);
    if (s !== "pendente") continue;
    out.push({ id: def.id, name: def.name, status: s, def });
  }
  return out;
}
