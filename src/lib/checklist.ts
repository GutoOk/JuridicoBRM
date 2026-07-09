import type { ChecklistItemDef, ItemStatus, Requirement } from "./types";

/** Status que contam como "resolvido" para prontidão e pendências. */
export const OK_STATUSES: ItemStatus[] = ["recebido", "conferido", "nao_se_aplica"];

export function isOk(status: ItemStatus | undefined): boolean {
  return !!status && OK_STATUSES.includes(status);
}

export const ITEM_STATUS_META: Record<
  ItemStatus,
  { label: string; short: string; className: string; dot: string }
> = {
  nao_verificado: {
    label: "Não verificado",
    short: "—",
    className: "bg-muted text-muted-foreground",
    dot: "bg-gray-400",
  },
  pendente: {
    label: "Pendente",
    short: "Pend.",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
    dot: "bg-amber-500",
  },
  solicitado: {
    label: "Solicitado ao cliente",
    short: "Solic.",
    className: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
    dot: "bg-sky-500",
  },
  recebido: {
    label: "Recebido/informado",
    short: "Receb.",
    className: "bg-teal-100 text-teal-900 dark:bg-teal-900/40 dark:text-teal-200",
    dot: "bg-teal-500",
  },
  conferido: {
    label: "Conferido",
    short: "OK",
    className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
    dot: "bg-emerald-500",
  },
  nao_se_aplica: {
    label: "Não se aplica",
    short: "N/A",
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    dot: "bg-slate-400",
  },
  problema: {
    label: "Problema",
    short: "Probl.",
    className: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
    dot: "bg-red-500",
  },
};

export const REQUIREMENT_META: Record<Requirement, { label: string; short: string }> = {
  obrigatorio: { label: "Obrigatório", short: "Obrig." },
  recomendado: { label: "Recomendado", short: "Recom." },
  opcional: { label: "Opcional", short: "Opc." },
};

/** Itens ativos ordenados, agrupados por categoria (mantém a ordem do array). */
export function groupByCategory(items: ChecklistItemDef[]): { category: string; items: ChecklistItemDef[] }[] {
  const groups: { category: string; items: ChecklistItemDef[] }[] = [];
  for (const item of items) {
    if (!item.active) continue;
    const last = groups[groups.length - 1];
    if (last && last.category === item.category) {
      last.items.push(item);
    } else {
      const existing = groups.find((g) => g.category === item.category);
      if (existing) existing.items.push(item);
      else groups.push({ category: item.category, items: [item] });
    }
  }
  return groups;
}

export function newItemId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}
