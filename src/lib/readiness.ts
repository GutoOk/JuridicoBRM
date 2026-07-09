import type { CaseFile, ChecklistItemDef, Client, ClientType, ItemStatus } from "./types";
import { isOk } from "./checklist";

/**
 * PRONTIDÃO AUTOMÁTICA
 * =====================
 * As regras abaixo classificam cada cliente dentro de um tipo (ex.: Barão de Mauá)
 * a partir do status dos itens do checklist. Os itens são referenciados pela
 * "chave" (campo `key` no editor de checklist), então o administrador pode
 * remapear qualquer regra para outro item sem mexer em código — basta editar a
 * chave do item em Configurações → Tipos & Checklists.
 *
 * Para ajustar as regras em si, edite as constantes RULES_* abaixo.
 */

export type Grade = "A" | "B" | "C" | "D" | "P";

export const GRADE_META: Record<
  Grade,
  { label: string; description: string; className: string; order: number }
> = {
  A: {
    label: "A — Redondo",
    description: "Pronto para protocolo, sem pendências relevantes.",
    className: "bg-emerald-600 text-white",
    order: 1,
  },
  B: {
    label: "B — Protocolável c/ pendência",
    description: "Dá para protocolar, mas há pendências a resolver.",
    className: "bg-sky-600 text-white",
    order: 2,
  },
  C: {
    label: "C — Alto risco",
    description: "Falta item essencial (contrato, termo, enquadramento ou pagamentos).",
    className: "bg-amber-500 text-white",
    order: 3,
  },
  D: {
    label: "D — Não protocolar",
    description: "Bloqueado: não protocolar sem decisão (procuração/enquadramento).",
    className: "bg-red-600 text-white",
    order: 4,
  },
  P: {
    label: "Protocolado",
    description: "Já protocolado — acompanhamento pós-protocolo.",
    className: "bg-violet-600 text-white",
    order: 5,
  },
};

// Chaves semânticas usadas pelas regras (edite a chave do item no editor de checklist).
const KEY = {
  protocolado: "protocolado",
  procuracao: "procuracao",
  contrato: "contrato",
  termoResp: "termo_resp",
  ultimoAdq: "ultimo_adq",
  ultimoAdqProva: "ultimo_adq_prova",
  extrato: "extrato",
  boletos: "boletos",
  pagamentosSuficientes: "pagamentos_suficientes",
  planilha: "planilha",
  minutaRevisada: "minuta_revisada",
  jgPedir: "jg_pedir",
  jgCompleta: "jg_completa",
} as const;

/** Itens que derrubam para D quando NÃO ok. */
const RULES_D_IF_NOT_OK = [KEY.procuracao];
/** Itens que derrubam para D quando marcados como "problema". */
const RULES_D_IF_PROBLEM = [KEY.ultimoAdq, KEY.ultimoAdqProva];
/** Itens que derrubam para C quando NÃO ok. */
const RULES_C_IF_NOT_OK = [KEY.contrato, KEY.termoResp, KEY.ultimoAdq];

export type Pendency = {
  itemId: string;
  name: string;
  category: string;
  status: ItemStatus;
  requirement: string;
  blocking: boolean;
  /** pendência de dado cadastral (fora do checklist) */
  fromClient?: boolean;
};

export type ReadinessResult = {
  grade: Grade;
  reasons: string[];
  pendencies: Pendency[];
  /** progresso: itens obrigatórios ok / total de obrigatórios ativos */
  requiredDone: number;
  requiredTotal: number;
};

function statusByKey(
  items: ChecklistItemDef[],
  states: CaseFile["items"],
  key: string
): { status: ItemStatus; def: ChecklistItemDef } | null {
  const def = items.find((i) => i.active && i.key === key);
  if (!def) return null;
  return { status: states?.[def.id]?.status ?? "nao_verificado", def };
}

export function computeReadiness(
  type: ClientType | null | undefined,
  caseFile: CaseFile | null | undefined,
  client: Client | null | undefined
): ReadinessResult {
  const items = (type?.checklist ?? []).filter((i) => i.active);
  const states = caseFile?.items ?? {};

  const get = (key: string) => statusByKey(items, states, key);
  const notOk = (key: string) => {
    const s = get(key);
    return s ? !isOk(s.status) : false;
  };
  const okKey = (key: string) => {
    const s = get(key);
    return s ? isOk(s.status) : false;
  };
  const isProblem = (key: string) => get(key)?.status === "problema";

  const reasons: string[] = [];

  // --- Pendências (checklist) ---
  const pendencies: Pendency[] = [];
  for (const def of items) {
    if (!def.generatesPendency || def.requirement === "opcional") continue;
    const status = states[def.id]?.status ?? "nao_verificado";
    if (!isOk(status)) {
      pendencies.push({
        itemId: def.id,
        name: def.name,
        category: def.category,
        status,
        requirement: def.requirement,
        blocking: def.blocking,
      });
    }
  }
  // --- Pendências de dado cadastral ---
  if (client && !client.phoneDigits && !client.whatsappDigits && !(client.phones?.length)) {
    pendencies.push({
      itemId: "_sem_telefone",
      name: "Sem telefone cadastrado",
      category: "Cadastro",
      status: "problema",
      requirement: "obrigatorio",
      blocking: false,
      fromClient: true,
    });
    reasons.push("Sem telefone cadastrado (pendência operacional grave).");
  }
  if (client && !client.code) {
    pendencies.push({
      itemId: "_sem_codigo",
      name: "Sem código interno",
      category: "Cadastro",
      status: "pendente",
      requirement: "obrigatorio",
      blocking: false,
      fromClient: true,
    });
  }

  // ordena: problema > bloqueante > obrigatório
  const weight = (p: Pendency) =>
    (p.status === "problema" ? 0 : 4) + (p.blocking ? 0 : 2) + (p.requirement === "obrigatorio" ? 0 : 1);
  pendencies.sort((a, b) => weight(a) - weight(b));

  // --- Progresso de obrigatórios ---
  const required = items.filter((i) => i.requirement === "obrigatorio" && i.key !== KEY.protocolado);
  const requiredDone = required.filter((i) => isOk(states[i.id]?.status)).length;

  // --- Protocolado: sai da fila ---
  if (okKey(KEY.protocolado)) {
    return {
      grade: "P",
      reasons: ["Protocolado — em acompanhamento pós-protocolo."],
      pendencies: pendencies.filter((p) => p.status === "problema"),
      requiredDone,
      requiredTotal: required.length,
    };
  }

  // --- Grau D ---
  let grade: Grade | null = null;
  for (const key of RULES_D_IF_NOT_OK) {
    if (notOk(key)) {
      reasons.push(`${get(key)?.def.name ?? key}: não resolvido — não protocolar.`);
      grade = "D";
    }
  }
  for (const key of RULES_D_IF_PROBLEM) {
    if (isProblem(key)) {
      reasons.push(`${get(key)?.def.name ?? key}: marcado como problema — não protocolar sem decisão.`);
      grade = "D";
    }
  }
  const blockingProblem = items.filter((i) => i.blocking && states[i.id]?.status === "problema");
  for (const i of blockingProblem) {
    reasons.push(`${i.name}: problema em item bloqueante.`);
    grade = "D";
  }
  if (grade === "D") {
    return { grade, reasons, pendencies, requiredDone, requiredTotal: required.length };
  }

  // --- Grau C ---
  for (const key of RULES_C_IF_NOT_OK) {
    if (notOk(key)) {
      reasons.push(`${get(key)?.def.name ?? key}: pendente.`);
      grade = "C";
    }
  }
  // Sem prova de pagamentos por nenhuma via
  const hasExtrato = get(KEY.extrato);
  const hasBoletos = get(KEY.boletos);
  const hasPagSuf = get(KEY.pagamentosSuficientes);
  if (
    (hasExtrato || hasBoletos || hasPagSuf) &&
    !(hasExtrato && isOk(hasExtrato.status)) &&
    !(hasBoletos && isOk(hasBoletos.status)) &&
    !(hasPagSuf && isOk(hasPagSuf.status))
  ) {
    reasons.push("Sem extrato e sem boletos suficientes para cálculo.");
    grade = "C";
  }
  const blockingNotOk = items.filter((i) => i.blocking && !isOk(states[i.id]?.status));
  for (const i of blockingNotOk) {
    if (!reasons.some((r) => r.startsWith(i.name))) reasons.push(`${i.name}: item bloqueante pendente.`);
    grade = "C";
  }
  if (grade === "C") {
    return { grade, reasons, pendencies, requiredDone, requiredTotal: required.length };
  }

  // --- Grau A: todos os obrigatórios ok ---
  const missingRequired = required.filter((i) => !isOk(states[i.id]?.status));
  if (missingRequired.length === 0) {
    return {
      grade: "A",
      reasons: ["Todos os itens obrigatórios resolvidos. Pronto para protocolo."],
      pendencies,
      requiredDone,
      requiredTotal: required.length,
    };
  }

  // --- Grau B ---
  for (const i of missingRequired.slice(0, 4)) {
    reasons.push(`${i.name}: pendente.`);
  }
  // Justiça gratuita não bloqueia, mas registra motivo
  if (okKey(KEY.jgPedir) && notOk(KEY.jgCompleta)) {
    reasons.push("Justiça gratuita incompleta (não bloqueia protocolo).");
  }
  return { grade: "B", reasons, pendencies, requiredDone, requiredTotal: required.length };
}
