"use client";

import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { Client, ClientType, Process, UserProfile } from "./types";

/**
 * Processos e clientes particulares dos advogados.
 *
 * São casos pessoais, fora da sociedade, que o advogado pode escolher trazer
 * para o sistema e aproveitar a estrutura — processos, tarefas, prazos,
 * andamentos. Duas decisões sustentam isso:
 *
 * 1. **Titularidade é campo próprio** (`processes.ownership`), não um valor de
 *    `status`. Um processo particular também pode ser arquivado ou suspenso, e
 *    misturar as duas coisas no mesmo campo obrigaria a escolher uma delas.
 * 2. **O cliente particular entra por uma operação dedicada ao dono**, marcada
 *    em `clientTypes.privateOwnerUserId`. Assim ele já nasce separado das filas
 *    da sociedade na Operação, sem inventar nenhuma regra nova de visibilidade.
 */

/** Cor discreta, coerente com o cinza que marca o particular nas listas. */
const PRIVATE_TYPE_COLOR = "#64748b";

export function privateClientTypeName(ownerName: string): string {
  return `Particular — ${ownerName}`;
}

/** Operação particular já existente para este advogado, se houver. */
export function findPrivateClientType(
  clientTypes: ClientType[],
  ownerUserId: string
): ClientType | null {
  return (
    clientTypes.find(
      (type) => !type.archived && type.privateOwnerUserId === ownerUserId
    ) ?? null
  );
}

export function isPrivateClientType(type: ClientType): boolean {
  return !!type.privateOwnerUserId;
}

/**
 * Devolve a operação particular do advogado, criando-a na primeira vez.
 *
 * A operação nasce sem checklist e sem campos de caso: ela existe para separar
 * a carteira pessoal, não para impor o roteiro operacional do escritório.
 */
export async function ensurePrivateClientType(
  owner: { id: string; name: string },
  clientTypes: ClientType[],
  user: UserProfile
): Promise<string> {
  const existente = findPrivateClientType(clientTypes, owner.id);
  if (existente) {
    // O nome acompanha o advogado caso ele tenha sido renomeado no cadastro.
    const nome = privateClientTypeName(owner.name);
    if (existente.name !== nome || existente.privateOwnerUserName !== owner.name) {
      await updateDoc(doc(db, "clientTypes", existente.id), {
        name: nome,
        privateOwnerUserName: owner.name,
        updatedAt: serverTimestamp(),
        updatedBy: user.name,
      });
    }
    return existente.id;
  }

  const maiorOrdem = Math.max(0, ...clientTypes.map((type) => type.order ?? 0));
  const referencia = await addDoc(collection(db, "clientTypes"), {
    name: privateClientTypeName(owner.name),
    color: PRIVATE_TYPE_COLOR,
    description: `Carteira particular de ${owner.name}, fora da sociedade.`,
    order: maiorOrdem + 1,
    archived: false,
    privateOwnerUserId: owner.id,
    privateOwnerUserName: owner.name,
    checklist: [],
    checklistGroups: [],
    caseFields: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  });
  return referencia.id;
}

// ---------------------------------------------------------------------------
// Exibição
// ---------------------------------------------------------------------------

/** Fundo cinza claro que marca o processo particular em qualquer lista. */
export const PRIVATE_ROW_CLASS = "bg-slate-100/70 hover:bg-slate-100";

/** Classe de linha conforme a titularidade — vazia para processo da sociedade. */
export function processRowClass(process: Pick<Process, "ownership">): string {
  return process.ownership === "particular" ? PRIVATE_ROW_CLASS : "";
}

/** Rótulo curto do dono, para o chip ao lado do status. */
export function privateOwnerLabel(process: Pick<Process, "ownerUserName">): string {
  const nome = (process.ownerUserName ?? "").trim();
  return nome ? `Particular · ${nome}` : "Particular";
}

// ---------------------------------------------------------------------------
// Tarefas e andamentos de casos particulares
// ---------------------------------------------------------------------------

/**
 * Índices para descobrir se um registro pertence a um caso particular.
 *
 * A titularidade é sempre **derivada** do processo ou da operação particular do
 * cliente, nunca copiada para dentro da tarefa: marcar um processo como
 * particular depois passa a valer imediatamente para o que já existe, sem
 * migração e sem registro que envelhece.
 */
export type PrivateLookup = {
  /** Processos por id e por número, como o resto do sistema já indexa. */
  processes: Map<string, Process>;
  /** Operação particular -> nome do advogado dono. */
  privateTypeOwners: Map<string, string>;
  clients: Map<string, Client>;
};

export function buildPrivateLookup(
  processes: Process[],
  clientTypes: ClientType[],
  clients: Client[]
): PrivateLookup {
  const porProcesso = new Map<string, Process>();
  for (const processo of processes) {
    porProcesso.set(processo.id, processo);
    if (processo.processNumber) porProcesso.set(processo.processNumber, processo);
  }
  const donosPorTipo = new Map<string, string>();
  for (const tipo of clientTypes) {
    if (tipo.privateOwnerUserId) {
      donosPorTipo.set(tipo.id, tipo.privateOwnerUserName ?? tipo.name);
    }
  }
  return {
    processes: porProcesso,
    privateTypeOwners: donosPorTipo,
    clients: new Map(clients.map((client) => [client.id, client])),
  };
}

/** Chaves de processo de um registro, tolerando o formato antigo de campo único. */
function processKeys(update: {
  processId?: string;
  processIds?: string[];
  processNumber?: string;
  processNumbers?: string[];
}): string[] {
  return [
    ...(update.processIds ?? []),
    ...(update.processNumbers ?? []),
    ...(update.processId ? [update.processId] : []),
    ...(update.processNumber ? [update.processNumber] : []),
  ];
}

function clientKeys(update: { clientId?: string; clientIds?: string[] }): string[] {
  return [...(update.clientIds ?? []), ...(update.clientId ? [update.clientId] : [])];
}

/**
 * Nome do advogado dono quando o registro é de um caso particular; `null` quando
 * é da sociedade. Vale para tarefas, atendimentos, anotações e andamentos.
 */
export function privateOwnerOfUpdate(
  update: {
    processId?: string;
    processIds?: string[];
    processNumber?: string;
    processNumbers?: string[];
    clientId?: string;
    clientIds?: string[];
  },
  lookup: PrivateLookup
): string | null {
  for (const chave of processKeys(update)) {
    const processo = lookup.processes.get(chave);
    if (processo && processo.ownership === "particular") {
      return (processo.ownerUserName ?? "").trim() || "Particular";
    }
  }
  for (const chave of clientKeys(update)) {
    const client = lookup.clients.get(chave);
    for (const typeId of client?.typeIds ?? []) {
      const dono = lookup.privateTypeOwners.get(typeId);
      if (dono) return dono;
    }
  }
  return null;
}

/**
 * Advogado que deve responder pela tarefa quando ela é de um caso particular.
 *
 * Tarefa particular fica sempre com o dono do caso: é o que impede a carteira
 * pessoal de um advogado de aparecer na fila da equipe.
 */
export function privateResponsibleFor(
  update: {
    processId?: string;
    processIds?: string[];
    processNumber?: string;
    processNumbers?: string[];
    clientId?: string;
    clientIds?: string[];
  },
  lookup: PrivateLookup
): { id: string; name: string } | null {
  for (const chave of processKeys(update)) {
    const processo = lookup.processes.get(chave);
    if (processo?.ownership === "particular" && processo.ownerUserId) {
      return { id: processo.ownerUserId, name: processo.ownerUserName ?? "" };
    }
  }
  return null;
}
