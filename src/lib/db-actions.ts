"use client";

import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
  type WriteBatch,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Client, ContactChannel, ItemStatus, Priority, UserProfile } from "./types";

export function caseFileId(clientId: string, typeId: string): string {
  return `${clientId}_${typeId}`;
}

type ClientHistorySource = Pick<Client, "id" | "name" | "code" | "nextAction" | "notes">;

function nextActionTaskData(
  client: Pick<Client, "id" | "name" | "code">,
  description: string,
  user: UserProfile
): Record<string, unknown> {
  return {
    type: "Tarefa",
    description,
    clientId: client.id,
    clientName: client.name,
    clientCode: client.code ?? "",
    clientIds: [client.id],
    clientNames: [client.name],
    clientCodes: [client.code ?? ""],
    processId: null,
    processNumber: null,
    processIds: [],
    processNumbers: [],
    status: "Pendente",
    responsible: "Todos",
    responsibleId: "",
    responsibleNames: [],
    responsibleIds: [],
    priority: "Média",
    dueDate: null,
    author: user.name,
    authorId: user.id,
    createdAt: serverTimestamp(),
    deleted: false,
  };
}

/**
 * Acrescenta ao lote a tarefa histórica correspondente a uma Próxima ação.
 * Exportada apenas para fluxos de importação que já controlam seu próprio lote.
 */
export function addNextActionTaskToBatch(
  batch: WriteBatch,
  client: Pick<Client, "id" | "name" | "code">,
  nextAction: string,
  user: UserProfile
): void {
  const description = nextAction.trim();
  if (!description) return;
  batch.set(doc(collection(db, "updates")), nextActionTaskData(client, description, user));
}

function addClientFieldHistoryToBatch(
  batch: WriteBatch,
  client: ClientHistorySource,
  data: Record<string, unknown>,
  user: UserProfile
): void {
  if (typeof data.nextAction === "string") {
    const nextAction = data.nextAction.trim();
    if (nextAction && nextAction !== (client.nextAction ?? "").trim()) {
      addNextActionTaskToBatch(batch, client, nextAction, user);
    }
  }

  if (typeof data.notes === "string") {
    const generalInfo = data.notes.trim();
    if (generalInfo && generalInfo !== (client.notes ?? "").trim()) {
      batch.set(doc(collection(db, "updates")), {
        type: "Anotação",
        clientId: client.id,
        clientName: client.name,
        clientCode: client.code ?? "",
        description: `Informações gerais:\n${generalInfo}`,
        author: user.name,
        authorId: user.id,
        createdAt: serverTimestamp(),
        deleted: false,
      });
    }
  }
}

/**
 * Atualiza campos do cliente com carimbo de auditoria. Quando recebe os dados
 * do cliente, também registra alterações de Próxima ação e Informações gerais.
 */
export async function updateClient(
  clientOrId: string | ClientHistorySource,
  data: Record<string, unknown>,
  user: UserProfile
): Promise<void> {
  const clientId = typeof clientOrId === "string" ? clientOrId : clientOrId.id;
  const batch = writeBatch(db);
  batch.update(doc(db, "clients", clientId), {
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  });
  if (typeof clientOrId !== "string") {
    addClientFieldHistoryToBatch(batch, clientOrId, data, user);
  }
  await batch.commit();
}

/** Cria um cliente e os registros iniciais de Próxima ação/Informações gerais. */
export async function createClient(
  data: Record<string, unknown> & { name: string; code?: string; nextAction?: string; notes?: string },
  user: UserProfile
): Promise<string> {
  const ref = doc(collection(db, "clients"));
  const batch = writeBatch(db);
  batch.set(ref, {
    ...data,
    processIds: [],
    createdAt: serverTimestamp(),
    createdBy: user.name,
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
    deleted: false,
    deletedAt: null,
    deletedBy: null,
  });
  addClientFieldHistoryToBatch(
    batch,
    { id: ref.id, name: data.name, code: data.code, nextAction: "", notes: "" },
    data,
    user
  );
  await batch.commit();
  return ref.id;
}

/** Cria um vínculo de aninhamento sem sobrescrever vínculos concorrentes. */
export async function addNestedClient(
  parentClientId: string,
  nestedClientId: string,
  user: UserProfile,
  relationship?: string
): Promise<void> {
  const patch: Record<string, unknown> = {
    nestedClientIds: arrayUnion(nestedClientId),
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  };
  if (relationship?.trim()) patch[`nestedClientRelationships.${nestedClientId}`] = relationship.trim();
  await updateDoc(doc(db, "clients", parentClientId), patch as Record<string, any>);
}

/** Atualiza somente a descrição livre do vínculo de aninhamento. */
export async function updateNestedClientRelationship(
  parentClientId: string,
  nestedClientId: string,
  relationship: string,
  user: UserProfile
): Promise<void> {
  await updateDoc(doc(db, "clients", parentClientId), {
    [`nestedClientRelationships.${nestedClientId}`]: relationship.trim() || deleteField(),
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  } as Record<string, any>);
}

/** Remove somente o vínculo; nenhum dos dois cadastros é apagado. */
export async function removeNestedClient(
  parentClientId: string,
  nestedClientId: string,
  user: UserProfile
): Promise<void> {
  await updateDoc(doc(db, "clients", parentClientId), {
    nestedClientIds: arrayRemove(nestedClientId),
    [`nestedClientRelationships.${nestedClientId}`]: deleteField(),
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  });
}

/** Marca o status de um item do checklist de um cliente em um tipo. */
export async function setChecklistItem(
  clientId: string,
  typeId: string,
  itemId: string,
  status: ItemStatus,
  user: UserProfile,
  note?: string
): Promise<void> {
  const ref = doc(db, "caseFiles", caseFileId(clientId, typeId));
  const itemState: Record<string, unknown> = {
    status,
    updatedAt: new Date().toISOString(),
    updatedBy: user.name,
  };
  if (note !== undefined) itemState.note = note;
  await setDoc(
    ref,
    {
      clientId,
      typeId,
      items: { [itemId]: itemState },
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    },
    { merge: true }
  );
}

/**
 * Salva a observação do checklist e cria seu registro histórico na ficha do
 * cliente. As duas gravações são atômicas para que nenhuma fique sem a outra.
 */
export async function saveChecklistNote(
  client: { id: string; name: string; code?: string },
  typeId: string,
  typeName: string,
  itemId: string,
  itemName: string,
  status: ItemStatus,
  statusLabel: string,
  note: string,
  user: UserProfile
): Promise<void> {
  const batch = writeBatch(db);
  const now = new Date().toISOString();

  batch.set(
    doc(db, "caseFiles", caseFileId(client.id, typeId)),
    {
      clientId: client.id,
      typeId,
      items: {
        [itemId]: {
          status,
          note,
          updatedAt: now,
          updatedBy: user.name,
        },
      },
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    },
    { merge: true }
  );

  batch.set(doc(collection(db, "updates")), {
    type: "Anotação",
    clientId: client.id,
    clientName: client.name,
    clientCode: client.code ?? "",
    description: [
      `Checklist da operação: ${typeName}`,
      `Pendência: ${itemName}`,
      `Status: ${statusLabel}`,
      `Observação: ${note || "(observação removida)"}`,
    ].join("\n"),
    author: user.name,
    authorId: user.id,
    createdAt: serverTimestamp(),
    deleted: false,
  });

  await batch.commit();
}

/** Salva um campo operacional do caso (ex.: bloco/lote do Barão de Mauá). */
/** Grava a prontidão MANUAL (A/B/C/D/P ou nenhuma) da ficha cliente×operação. */
export async function setCaseGrade(
  clientId: string,
  typeId: string,
  grade: "A" | "B" | "C" | "D" | "P" | null,
  user: UserProfile
): Promise<void> {
  const ref = doc(db, "caseFiles", caseFileId(clientId, typeId));
  await setDoc(
    ref,
    {
      clientId,
      typeId,
      grade: grade ?? deleteField(),
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    },
    { merge: true }
  );
}

export async function setCaseField(
  clientId: string,
  typeId: string,
  fieldId: string,
  value: string,
  user: UserProfile
): Promise<void> {
  const ref = doc(db, "caseFiles", caseFileId(clientId, typeId));
  await setDoc(
    ref,
    {
      clientId,
      typeId,
      fields: value === "" ? { [fieldId]: deleteField() } : { [fieldId]: value },
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    },
    { merge: true }
  );
}

/**
 * Oculta ou restaura apenas a exibição de uma definição antiga na ficha.
 * O estado do item e a definição aposentada continuam armazenados.
 */
export async function setLegacyItemHidden(
  clientId: string,
  typeId: string,
  itemId: string,
  hidden: boolean,
  user: UserProfile
): Promise<void> {
  await setDoc(
    doc(db, "caseFiles", caseFileId(clientId, typeId)),
    {
      clientId,
      typeId,
      hiddenLegacyItemIds: hidden ? arrayUnion(itemId) : arrayRemove(itemId),
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    },
    { merge: true }
  );
}

/** Mesma regra de ocultação reversível para campos antigos do caso. */
export async function setLegacyFieldHidden(
  clientId: string,
  typeId: string,
  fieldId: string,
  hidden: boolean,
  user: UserProfile
): Promise<void> {
  await setDoc(
    doc(db, "caseFiles", caseFileId(clientId, typeId)),
    {
      clientId,
      typeId,
      hiddenLegacyFieldIds: hidden ? arrayUnion(fieldId) : arrayRemove(fieldId),
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    },
    { merge: true }
  );
}

/** Registra um atendimento e atualiza seu resumo no cliente. */
export async function registerContact(
  client: Client,
  data: {
    channel?: ContactChannel;
    record: string;
    nextAction?: string;
  },
  user: UserProfile
): Promise<void> {
  const batch = writeBatch(db);
  const attendance: Record<string, unknown> = {
    type: "Atendimento",
    clientId: client.id,
    clientName: client.name,
    clientCode: client.code ?? "",
    description: data.record,
    author: user.name,
    authorId: user.id,
    createdAt: serverTimestamp(),
    deleted: false,
  };
  if (data.channel) attendance.channel = data.channel;
  batch.set(doc(collection(db, "updates")), attendance);
  const clientPatch: Record<string, unknown> = {
    lastContactAt: serverTimestamp(),
    lastContactResult: data.record.slice(0, 160),
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  };
  if (data.nextAction !== undefined) {
    clientPatch.nextAction = data.nextAction;
    if (data.nextAction.trim()) {
      addNextActionTaskToBatch(batch, client, data.nextAction, user);
    }
  }
  batch.update(doc(db, "clients", client.id), clientPatch as Record<string, any>);
  await batch.commit();
}

/** Cria uma tarefa vinculada (ou não) a um cliente. */
export async function createTask(
  data: {
    description: string;
    clientId?: string;
    clientName?: string;
    clientCode?: string;
    clientIds?: string[];
    clientNames?: string[];
    clientCodes?: string[];
    processId?: string;
    processNumber?: string;
    processIds?: string[];
    processNumbers?: string[];
    responsible?: string;
    responsibleId?: string;
    responsibleNames?: string[];
    responsibleIds?: string[];
    priority?: Priority;
    dueDate?: Date | null;
  },
  user: UserProfile
): Promise<void> {
  await addDoc(collection(db, "updates"), {
    type: "Tarefa",
    description: data.description,
    clientId: data.clientId ?? null,
    clientName: data.clientName ?? null,
    clientCode: data.clientCode ?? "",
    clientIds: data.clientIds ?? (data.clientId ? [data.clientId] : []),
    clientNames: data.clientNames ?? (data.clientName ? [data.clientName] : []),
    clientCodes: data.clientCodes ?? (data.clientCode ? [data.clientCode] : []),
    processId: data.processId ?? null,
    processNumber: data.processNumber ?? null,
    processIds: data.processIds ?? (data.processId ? [data.processId] : []),
    processNumbers: data.processNumbers ?? (data.processNumber ? [data.processNumber] : []),
    status: "Pendente",
    responsible: data.responsible ?? user.name,
    responsibleId: data.responsibleId ?? user.id,
    responsibleNames: data.responsibleNames ?? [data.responsible ?? user.name],
    responsibleIds: data.responsibleIds ?? [data.responsibleId ?? user.id],
    priority: data.priority ?? "Média",
    dueDate: data.dueDate ? data.dueDate.toISOString() : null,
    author: user.name,
    authorId: user.id,
    createdAt: serverTimestamp(),
    deleted: false,
  });
}

/** Adiciona uma anotação/andamento ao cliente. */
export async function addNote(
  client: { id: string; name: string; code?: string },
  description: string,
  user: UserProfile
): Promise<void> {
  await addDoc(collection(db, "updates"), {
    type: "Anotação",
    clientId: client.id,
    clientName: client.name,
    clientCode: client.code ?? "",
    description,
    author: user.name,
    authorId: user.id,
    createdAt: serverTimestamp(),
    deleted: false,
  });
}
