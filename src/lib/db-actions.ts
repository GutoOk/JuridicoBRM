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
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Client, ContactChannel, ItemStatus, Priority, UserProfile } from "./types";

export function caseFileId(clientId: string, typeId: string): string {
  return `${clientId}_${typeId}`;
}

/** Atualiza campos do cliente com carimbo de auditoria. */
export async function updateClient(
  clientId: string,
  data: Record<string, unknown>,
  user: UserProfile
): Promise<void> {
  await updateDoc(doc(db, "clients", clientId), {
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  });
}

/** Cria um vínculo de aninhamento sem sobrescrever vínculos concorrentes. */
export async function addNestedClient(
  parentClientId: string,
  nestedClientId: string,
  user: UserProfile
): Promise<void> {
  await updateDoc(doc(db, "clients", parentClientId), {
    nestedClientIds: arrayUnion(nestedClientId),
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  });
}

/** Remove somente o vínculo; nenhum dos dois cadastros é apagado. */
export async function removeNestedClient(
  parentClientId: string,
  nestedClientId: string,
  user: UserProfile
): Promise<void> {
  await updateDoc(doc(db, "clients", parentClientId), {
    nestedClientIds: arrayRemove(nestedClientId),
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

/** Registra um contato (ligação/WhatsApp/etc.) e atualiza o resumo no cliente. */
export async function registerContact(
  client: Client,
  data: {
    channel: ContactChannel;
    result: string;
    note?: string;
    nextAction?: string;
  },
  user: UserProfile
): Promise<void> {
  await addDoc(collection(db, "updates"), {
    type: "Atendimento",
    clientId: client.id,
    clientName: client.name,
    clientCode: client.code ?? "",
    channel: data.channel,
    result: data.result,
    description: data.note || `${data.channel}: ${data.result}`,
    author: user.name,
    authorId: user.id,
    createdAt: serverTimestamp(),
    deleted: false,
  });
  const clientPatch: Record<string, unknown> = {
    lastContactAt: serverTimestamp(),
    lastContactResult: data.result,
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  };
  if (data.nextAction !== undefined) clientPatch.nextAction = data.nextAction;
  await updateDoc(doc(db, "clients", client.id), clientPatch as Record<string, any>);
}

/** Cria uma tarefa vinculada (ou não) a um cliente. */
export async function createTask(
  data: {
    description: string;
    clientId?: string;
    clientName?: string;
    clientCode?: string;
    processId?: string;
    processNumber?: string;
    responsible?: string;
    responsibleId?: string;
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
    processId: data.processId ?? null,
    processNumber: data.processNumber ?? null,
    status: "Pendente",
    responsible: data.responsible ?? user.name,
    responsibleId: data.responsibleId ?? user.id,
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
