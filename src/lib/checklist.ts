import type {
  CaseFieldDef,
  ChecklistGroupDef,
  ChecklistItemDef,
  ClientType,
  ItemStatus,
  Requirement,
} from "./types";

/** Status que contam como "resolvido" (OK): o item deixa de ser pendência. */
export const OK_STATUSES: ItemStatus[] = ["recebido", "conferido", "nao_se_aplica"];

export function isOk(status: ItemStatus | undefined): boolean {
  return !!status && OK_STATUSES.includes(status);
}

/**
 * O checklist trabalha com 3 estados simples: Pendente, Não se aplica e OK.
 * Tudo que não foi preenchido (ou está marcado como não verificado/solicitado/
 * problema) conta como Pendente — não existe um quarto estado "vazio" visível.
 * `conferido` é o valor gravado para OK; `nao_se_aplica` é gravado como tal;
 * valores antigos do banco (solicitado/recebido/problema) são só convertidos
 * na exibição para Pendente ou OK.
 */
export const SIMPLE_STATUSES = ["pendente", "nao_se_aplica", "conferido"] as const;
export type SimpleStatus = (typeof SIMPLE_STATUSES)[number];

export function displayStatus(status: ItemStatus | undefined): SimpleStatus {
  if (status === "nao_se_aplica") return "nao_se_aplica";
  if (isOk(status)) return "conferido";
  return "pendente"; // nao_verificado, pendente, solicitado, problema (tudo sem preencher = pendente)
}

export const ITEM_STATUS_META: Record<
  ItemStatus,
  { label: string; short: string; className: string; dot: string }
> = {
  nao_verificado: {
    label: "Pendente",
    short: "Pend.",
    className: "bg-red-100 text-red-900",
    dot: "bg-red-500",
  },
  pendente: {
    label: "Pendente",
    short: "Pend.",
    className: "bg-red-100 text-red-900",
    dot: "bg-red-500",
  },
  solicitado: {
    label: "Pendente",
    short: "Pend.",
    className: "bg-red-100 text-red-900",
    dot: "bg-red-500",
  },
  recebido: {
    label: "OK",
    short: "OK",
    className: "bg-emerald-100 text-emerald-900",
    dot: "bg-emerald-500",
  },
  conferido: {
    label: "OK",
    short: "OK",
    className: "bg-emerald-100 text-emerald-900",
    dot: "bg-emerald-500",
  },
  nao_se_aplica: {
    label: "Não se aplica",
    short: "N/A",
    className: "bg-slate-200 text-slate-900",
    dot: "bg-slate-500",
  },
  problema: {
    label: "Pendente",
    short: "Pend.",
    className: "bg-red-100 text-red-900",
    dot: "bg-red-500",
  },
};

/**
 * Cores discretas dos 3 botões do checklist (fundo bem suave quando
 * selecionado; texto sempre na cor normal, sem mudar de cor).
 */
export const SIMPLE_STATUS_META: Record<
  SimpleStatus,
  { label: string; selectedClassName: string }
> = {
  pendente: {
    label: "Pendente",
    selectedClassName: "bg-red-200 font-semibold text-red-950 ring-1 ring-inset ring-red-300 dark:bg-red-900/60 dark:text-red-50 dark:ring-red-700",
  },
  nao_se_aplica: {
    label: "Não se aplica",
    selectedClassName: "bg-slate-300 font-semibold text-slate-950 ring-1 ring-inset ring-slate-400 dark:bg-slate-700 dark:text-slate-50 dark:ring-slate-500",
  },
  conferido: {
    label: "OK",
    selectedClassName: "bg-emerald-200 font-semibold text-emerald-950 ring-1 ring-inset ring-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-50 dark:ring-emerald-700",
  },
};

export const REQUIREMENT_META: Record<Requirement, { label: string; short: string }> = {
  obrigatorio: { label: "Obrigatório", short: "Obrig." },
  recomendado: { label: "Recomendado", short: "Recom." },
  opcional: { label: "Opcional", short: "Opc." },
};

/** Itens ativos ordenados, agrupados por categoria (mantém a ordem do array). */
export function groupByCategory(
  items: ChecklistItemDef[],
  definitions: ChecklistGroupDef[] = []
): { category: string; description?: string; items: ChecklistItemDef[] }[] {
  const visibleGroups = definitions
    .filter((group) => !group.deleted)
    .sort((a, b) => a.order - b.order);
  const groupMeta = new Map(visibleGroups.map((group) => [group.id, group]));
  const orderedItems = [...items].sort((a, b) => {
    const aOrder = a.groupId ? visibleGroups.findIndex((group) => group.id === a.groupId) : -1;
    const bOrder = b.groupId ? visibleGroups.findIndex((group) => group.id === b.groupId) : -1;
    return (aOrder < 0 ? Number.MAX_SAFE_INTEGER : aOrder) -
      (bOrder < 0 ? Number.MAX_SAFE_INTEGER : bOrder);
  });
  const groups: { category: string; description?: string; items: ChecklistItemDef[] }[] = [];
  for (const item of orderedItems) {
    if (!item.active || item.deleted) continue;
    const configured = item.groupId ? groupMeta.get(item.groupId) : undefined;
    const category = configured?.name || item.category || "Geral";
    const last = groups[groups.length - 1];
    if (last && last.category === category) {
      last.items.push(item);
    } else {
      const existing = groups.find((g) => g.category === category);
      if (existing) existing.items.push(item);
      else groups.push({ category, description: configured?.description, items: [item] });
    }
  }
  return groups;
}

export function activeChecklistItems(type: ClientType | null | undefined): ChecklistItemDef[] {
  return (type?.checklist ?? []).filter((item) => item.active && !item.deleted);
}

export function activeCaseFields(type: ClientType | null | undefined): CaseFieldDef[] {
  return (type?.caseFields ?? []).filter((field) => !field.deleted);
}

export function newItemId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}
