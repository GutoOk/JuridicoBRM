"use client";

import { collection, doc, getDocs, serverTimestamp, writeBatch, type DocumentData, type DocumentReference } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { searchable } from "@/lib/normalize";
import type { Client, ClientGroup, Process, Update, UserProfile } from "@/lib/types";

type WriteOperation = { ref: DocumentReference<DocumentData>; data: DocumentData };

async function commitInChunks(operations: WriteOperation[]): Promise<void> {
  for (let start = 0; start < operations.length; start += 450) {
    const batch = writeBatch(db);
    for (const operation of operations.slice(start, start + 450)) batch.update(operation.ref, operation.data);
    await batch.commit();
  }
}

/** Atualiza o nome canônico e todas as cópias denormalizadas que identificam o cliente. */
export async function uppercaseClientNames(clients: Client[], user: UserProfile): Promise<void> {
  const replacements = new Map(
    clients.map((client) => [client.id, client.name.toLocaleUpperCase("pt-BR")])
  );
  if (!replacements.size) return;

  const [processSnapshot, groupSnapshot, updateSnapshot] = await Promise.all([
    getDocs(collection(db, "processes")),
    getDocs(collection(db, "clientGroups")),
    getDocs(collection(db, "updates")),
  ]);
  const audit = { updatedAt: serverTimestamp(), updatedBy: user.name };
  const operations: WriteOperation[] = clients.map((client) => ({
    ref: doc(db, "clients", client.id),
    data: { name: replacements.get(client.id), nameLower: searchable(replacements.get(client.id)), ...audit },
  }));

  for (const snapshot of processSnapshot.docs) {
    const process = { id: snapshot.id, ...snapshot.data() } as Process;
    let changed = false;
    const clientNames = (process.clientNames ?? []).map((name, index) => {
      const replacement = replacements.get(process.clientIds?.[index]);
      if (replacement && replacement !== name) changed = true;
      return replacement ?? name;
    });
    if (changed) operations.push({ ref: snapshot.ref, data: { clientNames, ...audit } });
  }

  for (const snapshot of groupSnapshot.docs) {
    const group = { id: snapshot.id, ...snapshot.data() } as ClientGroup;
    let changed = false;
    const clientNames = (group.clientNames ?? []).map((name, index) => {
      const replacement = replacements.get(group.clientIds?.[index]);
      if (replacement && replacement !== name) changed = true;
      return replacement ?? name;
    });
    if (changed) operations.push({ ref: snapshot.ref, data: { clientNames, ...audit } });
  }

  for (const snapshot of updateSnapshot.docs) {
    const update = { id: snapshot.id, ...snapshot.data() } as Update;
    const data: Record<string, unknown> = {};
    const directName = update.clientId ? replacements.get(update.clientId) : undefined;
    if (directName && directName !== update.clientName) data.clientName = directName;
    if (update.clientIds?.length) {
      let changed = false;
      const clientNames = update.clientIds.map((clientId, index) => {
        const replacement = replacements.get(clientId);
        if (replacement && replacement !== update.clientNames?.[index]) changed = true;
        return replacement ?? update.clientNames?.[index] ?? "";
      });
      if (changed) data.clientNames = clientNames;
    }
    if (Object.keys(data).length) operations.push({ ref: snapshot.ref, data: { ...data, ...audit } });
  }

  await commitInChunks(operations);
}
