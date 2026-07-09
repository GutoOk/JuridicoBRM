"use client";

import {
  addDoc,
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
