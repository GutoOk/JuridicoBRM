import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type QuerySnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { digitsOnly, normalizePhone, searchable } from "@/lib/normalize";
import type { Address, Client, Email, Phone, UserProfile } from "@/lib/types";

export type DuplicateReason = "cpf" | "code" | "exact_name" | "similar_name";

export type DuplicateCandidate = {
  id: string;
  clients: [Client, Client];
  reasons: DuplicateReason[];
  score: number;
};

export type DuplicateResolution = {
  id: string;
  clientIds: string[];
  status: "not_duplicate" | "merged";
};

export function duplicatePairId(firstId: string, secondId: string): string {
  return [firstId, secondId].sort().join("__");
}

function directlyLinked(first: Client, second: Client): boolean {
  return (first.nestedClientIds ?? []).includes(second.id) || (second.nestedClientIds ?? []).includes(first.id);
}

function levenshtein(first: string, second: string): number {
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let row = 1; row <= first.length; row++) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= second.length; column++) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (first[row - 1] === second[column - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[second.length];
}

export function namesAreSimilar(firstName: string, secondName: string): boolean {
  const first = searchable(firstName).replace(/\s+/g, " ").trim();
  const second = searchable(secondName).replace(/\s+/g, " ").trim();
  if (first.length < 5 || second.length < 5 || first === second) return false;

  const firstTokens = first.split(" ");
  const secondTokens = second.split(" ");
  const sameEnds = firstTokens[0] === secondTokens[0] && firstTokens.at(-1) === secondTokens.at(-1);
  const shorter = firstTokens.length <= secondTokens.length ? firstTokens : secondTokens;
  const longer = firstTokens.length <= secondTokens.length ? secondTokens : firstTokens;
  if (sameEnds && shorter.every((token) => longer.includes(token))) return true;

  const similarity = 1 - levenshtein(first, second) / Math.max(first.length, second.length);
  return similarity >= 0.86;
}

export function findDuplicateCandidates(
  clients: Client[],
  resolutions: DuplicateResolution[] = []
): DuplicateCandidate[] {
  const ignored = new Set(resolutions.map((resolution) => resolution.id));
  const active = clients.filter((client) => !client.deleted);
  const candidates: DuplicateCandidate[] = [];

  for (let firstIndex = 0; firstIndex < active.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < active.length; secondIndex++) {
      const first = active[firstIndex];
      const second = active[secondIndex];
      const id = duplicatePairId(first.id, second.id);
      if (ignored.has(id)) continue;

      const reasons: DuplicateReason[] = [];
      const firstCpf = digitsOnly(first.cpfCnpjDigits || first.cpfCnpj);
      const secondCpf = digitsOnly(second.cpfCnpjDigits || second.cpfCnpj);
      if (firstCpf.length >= 11 && firstCpf === secondCpf) reasons.push("cpf");

      const firstCode = (first.code ?? "").trim().toUpperCase();
      const secondCode = (second.code ?? "").trim().toUpperCase();
      if (firstCode && firstCode === secondCode && !directlyLinked(first, second)) reasons.push("code");

      const firstName = searchable(first.name).replace(/\s+/g, " ").trim();
      const secondName = searchable(second.name).replace(/\s+/g, " ").trim();
      if (firstName && firstName === secondName) reasons.push("exact_name");
      else if (namesAreSimilar(first.name, second.name)) reasons.push("similar_name");

      if (reasons.length > 0) {
        const score = Math.max(
          reasons.includes("cpf") ? 100 : 0,
          reasons.includes("code") ? 95 : 0,
          reasons.includes("exact_name") ? 85 : 0,
          reasons.includes("similar_name") ? 70 : 0
        );
        candidates.push({ id, clients: [first, second], reasons, score });
      }
    }
  }

  return candidates.sort((first, second) => second.score - first.score || first.clients[0].name.localeCompare(second.clients[0].name, "pt-BR"));
}

function present(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== "";
}

function uniqueStrings(...lists: Array<string[] | undefined>): string[] {
  return [...new Set(lists.flatMap((list) => list ?? []).filter(Boolean))];
}

function mergePhones(primary: Phone[] = [], duplicate: Phone[] = []): Phone[] {
  const result = [...primary];
  const keys = new Set(primary.map((item) => normalizePhone(item.number)));
  duplicate.forEach((item) => {
    const key = normalizePhone(item.number);
    if (key && !keys.has(key)) {
      result.push({ ...item, isPrimary: result.length === 0 ? true : item.isPrimary && !result.some((phone) => phone.isPrimary) });
      keys.add(key);
    }
  });
  return result;
}

function mergeEmails(primary: Email[] = [], duplicate: Email[] = []): Email[] {
  const result = [...primary];
  const keys = new Set(primary.map((item) => (item.address ?? "").trim().toLowerCase()));
  duplicate.forEach((item) => {
    const key = (item.address ?? "").trim().toLowerCase();
    if (key && !keys.has(key)) {
      result.push({ ...item, isPrimary: result.length === 0 ? true : item.isPrimary && !result.some((email) => email.isPrimary) });
      keys.add(key);
    }
  });
  return result;
}

function addressKey(address: Address): string {
  return searchable([address.street, address.number, address.complement, address.district, address.city, address.state, address.zipCode].filter(Boolean).join(" "));
}

function mergeAddresses(primary: Address[] = [], duplicate: Address[] = []): Address[] {
  const result = [...primary];
  const keys = new Set(primary.map(addressKey));
  duplicate.forEach((item) => {
    const key = addressKey(item);
    if (key && !keys.has(key)) {
      result.push({ ...item, isPrimary: result.length === 0 ? true : item.isPrimary && !result.some((address) => address.isPrimary) });
      keys.add(key);
    }
  });
  return result;
}

function mergedClientPatch(primary: Client, duplicate: Client, user: UserProfile): Record<string, unknown> {
  const nestedClientRelationships = {
    ...(duplicate.nestedClientRelationships ?? {}),
    ...(primary.nestedClientRelationships ?? {}),
  };
  delete nestedClientRelationships[primary.id];
  delete nestedClientRelationships[duplicate.id];
  const patch: Record<string, unknown> = {
    typeIds: uniqueStrings(primary.typeIds, duplicate.typeIds),
    processIds: uniqueStrings(primary.processIds, duplicate.processIds),
    phones: mergePhones(primary.phones, duplicate.phones),
    emails: mergeEmails(primary.emails, duplicate.emails),
    addresses: mergeAddresses(primary.addresses, duplicate.addresses),
    nestedClientIds: uniqueStrings(primary.nestedClientIds, duplicate.nestedClientIds)
      .filter((id) => id !== primary.id && id !== duplicate.id),
    nestedClientRelationships,
    mergedFromClientIds: uniqueStrings((primary as Client & { mergedFromClientIds?: string[] }).mergedFromClientIds, [duplicate.id]),
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  };

  const scalarFields: Array<keyof Client> = [
    "code", "cpfCnpj", "cpfCnpjDigits", "phone", "phoneDigits", "whatsapp", "whatsappDigits",
    "email", "addressLine", "city", "state", "zipCode", "priority", "origin", "nextAction", "notes",
    "motherName", "nationality", "maritalStatus", "profession", "rg", "rgIssuer", "lastContactAt", "lastContactResult",
  ];
  scalarFields.forEach((field) => {
    if (!present(primary[field]) && present(duplicate[field])) patch[field] = duplicate[field];
  });
  return patch;
}

function replaceAlignedClient(
  ids: string[] = [],
  names: string[] = [],
  codes: string[] = [],
  sourceId: string,
  target: Client
): { ids: string[]; names: string[]; codes: string[] } {
  const result: { ids: string[]; names: string[]; codes: string[] } = { ids: [], names: [], codes: [] };
  const seen = new Set<string>();
  ids.forEach((originalId, index) => {
    const id = originalId === sourceId ? target.id : originalId;
    if (seen.has(id)) return;
    seen.add(id);
    result.ids.push(id);
    result.names.push(originalId === sourceId ? target.name : (names[index] ?? ""));
    result.codes.push(originalId === sourceId ? (target.code ?? "") : (codes[index] ?? ""));
  });
  return result;
}

type BatchOperation = (batch: ReturnType<typeof writeBatch>) => void;

async function commitOperations(operations: BatchOperation[]): Promise<void> {
  for (let index = 0; index < operations.length; index += 400) {
    const batch = writeBatch(db);
    operations.slice(index, index + 400).forEach((operation) => operation(batch));
    await batch.commit();
  }
}

function uniqueDocuments(...snapshots: QuerySnapshot<DocumentData>[]): Map<string, { ref: DocumentReference<DocumentData>; data: DocumentData }> {
  const documents = new Map<string, { ref: DocumentReference<DocumentData>; data: DocumentData }>();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((item) => documents.set(item.ref.path, { ref: item.ref, data: item.data() })));
  return documents;
}

export async function markNotDuplicate(first: Client, second: Client, user: UserProfile): Promise<void> {
  const id = duplicatePairId(first.id, second.id);
  const batch = writeBatch(db);
  batch.set(doc(db, "duplicateResolutions", id), {
    clientIds: [first.id, second.id].sort(),
    clientNames: [first.name, second.name],
    status: "not_duplicate",
    resolvedAt: serverTimestamp(),
    resolvedBy: user.name,
    resolvedById: user.id,
  });
  await batch.commit();
}

export async function mergeDuplicateClients(targetId: string, sourceId: string, user: UserProfile): Promise<void> {
  if (targetId === sourceId) throw new Error("Escolha clientes diferentes para a unificação.");
  const [targetSnapshot, sourceSnapshot] = await Promise.all([
    getDoc(doc(db, "clients", targetId)),
    getDoc(doc(db, "clients", sourceId)),
  ]);
  if (!targetSnapshot.exists() || !sourceSnapshot.exists()) throw new Error("Um dos clientes não existe mais.");

  const target = { id: targetSnapshot.id, ...targetSnapshot.data() } as Client;
  const source = { id: sourceSnapshot.id, ...sourceSnapshot.data() } as Client;
  if (target.deleted || source.deleted) throw new Error("Restaure os clientes antes de unificá-los.");

  const [
    updatesDirect,
    updatesArray,
    processesSnapshot,
    groupsSnapshot,
    parentClientsSnapshot,
    sourceCaseFiles,
    financialAgreementsSnapshot,
    financialInstallmentsSnapshot,
  ] = await Promise.all([
    getDocs(query(collection(db, "updates"), where("clientId", "==", sourceId))),
    getDocs(query(collection(db, "updates"), where("clientIds", "array-contains", sourceId))),
    getDocs(query(collection(db, "processes"), where("clientIds", "array-contains", sourceId))),
    getDocs(query(collection(db, "clientGroups"), where("clientIds", "array-contains", sourceId))),
    getDocs(query(collection(db, "clients"), where("nestedClientIds", "array-contains", sourceId))),
    getDocs(query(collection(db, "caseFiles"), where("clientId", "==", sourceId))),
    getDocs(query(collection(db, "financialAgreements"), where("clientId", "==", sourceId))),
    getDocs(query(collection(db, "financialInstallments"), where("clientId", "==", sourceId))),
  ]);

  const operations: BatchOperation[] = [];
  const affected = {
    updates: 0,
    processes: 0,
    groups: 0,
    caseFiles: 0,
    nesting: 0,
    financialAgreements: 0,
    financialInstallments: 0,
  };

  uniqueDocuments(updatesDirect, updatesArray).forEach(({ ref, data }) => {
    const aligned = replaceAlignedClient(data.clientIds ?? (data.clientId ? [data.clientId] : []), data.clientNames ?? (data.clientName ? [data.clientName] : []), data.clientCodes ?? (data.clientCode ? [data.clientCode] : []), sourceId, target);
    const patch: DocumentData = {
      clientId: data.clientId === sourceId ? target.id : data.clientId,
      clientName: data.clientId === sourceId ? target.name : data.clientName,
      clientCode: data.clientId === sourceId ? (target.code ?? "") : data.clientCode,
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    };
    if (data.type !== "Financeiro") {
      patch.clientIds = aligned.ids;
      patch.clientNames = aligned.names;
      patch.clientCodes = aligned.codes;
    }
    operations.push((batch) => batch.update(ref, patch));
    affected.updates++;
  });

  processesSnapshot.docs.forEach((item) => {
    const data = item.data();
    const aligned = replaceAlignedClient(data.clientIds ?? [], data.clientNames ?? [], [], sourceId, target);
    operations.push((batch) => batch.update(item.ref, {
      clientIds: aligned.ids,
      clientNames: aligned.names,
      mainClientId: data.mainClientId === sourceId ? target.id : data.mainClientId,
      updatedAt: serverTimestamp(),
    }));
    affected.processes++;
  });

  groupsSnapshot.docs.forEach((item) => {
    const data = item.data();
    const aligned = replaceAlignedClient(data.clientIds ?? [], data.clientNames ?? [], [], sourceId, target);
    operations.push((batch) => batch.update(item.ref, {
      clientIds: aligned.ids,
      clientNames: aligned.names,
      updatedAt: serverTimestamp(),
    }));
    affected.groups++;
  });

  parentClientsSnapshot.docs.forEach((item) => {
    if (item.id === target.id) return;
    const data = item.data() as Client;
    const nestedIds = uniqueStrings((data.nestedClientIds ?? []).map((id) => id === sourceId ? target.id : id));
    const relationships = { ...(data.nestedClientRelationships ?? {}) };
    if (!relationships[target.id] && relationships[sourceId]) relationships[target.id] = relationships[sourceId];
    delete relationships[sourceId];
    operations.push((batch) => batch.update(item.ref, {
      nestedClientIds: nestedIds,
      nestedClientRelationships: relationships,
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    }));
    affected.nesting++;
  });

  for (const sourceCaseFile of sourceCaseFiles.docs) {
    const sourceData = sourceCaseFile.data();
    const targetRef = doc(db, "caseFiles", `${target.id}_${sourceData.typeId}`);
    const targetCaseFile = await getDoc(targetRef);
    const targetData = targetCaseFile.data() ?? {};
    operations.push((batch) => batch.set(targetRef, {
      ...sourceData,
      ...targetData,
      clientId: target.id,
      items: { ...(sourceData.items ?? {}), ...(targetData.items ?? {}) },
      fields: { ...(sourceData.fields ?? {}), ...(targetData.fields ?? {}) },
      legacyItemIds: uniqueStrings(sourceData.legacyItemIds, targetData.legacyItemIds),
      legacyFieldIds: uniqueStrings(sourceData.legacyFieldIds, targetData.legacyFieldIds),
      hiddenLegacyItemIds: uniqueStrings(sourceData.hiddenLegacyItemIds, targetData.hiddenLegacyItemIds),
      hiddenLegacyFieldIds: uniqueStrings(sourceData.hiddenLegacyFieldIds, targetData.hiddenLegacyFieldIds),
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    }, { merge: true }));
    affected.caseFiles++;
  }

  financialAgreementsSnapshot.docs.forEach((item) => {
    operations.push((batch) =>
      batch.update(item.ref, {
        clientId: target.id,
        updatedAt: serverTimestamp(),
        updatedById: user.id,
        updatedBy: user.name,
      })
    );
    affected.financialAgreements++;
  });

  financialInstallmentsSnapshot.docs.forEach((item) => {
    operations.push((batch) =>
      batch.update(item.ref, {
        clientId: target.id,
        updatedAt: serverTimestamp(),
        updatedById: user.id,
        updatedBy: user.name,
      })
    );
    affected.financialInstallments++;
  });

  operations.push((batch) => batch.update(targetSnapshot.ref, mergedClientPatch(target, source, user) as DocumentData));
  await commitOperations(operations);

  const finalBatch = writeBatch(db);
  finalBatch.update(sourceSnapshot.ref, {
    deleted: true,
    deletedAt: serverTimestamp(),
    deletedBy: user.name,
    mergedIntoClientId: target.id,
    mergedIntoClientName: target.name,
    mergedAt: serverTimestamp(),
    mergedBy: user.name,
  });
  finalBatch.set(doc(db, "duplicateResolutions", duplicatePairId(target.id, source.id)), {
    clientIds: [target.id, source.id].sort(),
    clientNames: [target.name, source.name],
    status: "merged",
    targetClientId: target.id,
    sourceClientId: source.id,
    affected,
    resolvedAt: serverTimestamp(),
    resolvedBy: user.name,
    resolvedById: user.id,
  });
  await finalBatch.commit();
}
