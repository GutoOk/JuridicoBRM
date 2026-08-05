"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  EMPTY_LEGAL_CONTENT,
  DEFAULT_LEGAL_PAGE_SETTINGS,
  DEFAULT_LEGAL_STYLES,
  legalPlainText,
  normalizeLegalName,
  stringifyLegalContent,
  stringifyLegalPageSettings,
  stringifyLegalStyles,
  type JSONContent,
} from "./legal-documents";
import type {
  LegalDocument,
  LegalEntityKind,
  LegalPageSettings,
  LegalQuickPart,
  LegalStyleMap,
  LegalTemplate,
  LegalTemplateFolder,
  LegalVersion,
  UserProfile,
} from "./types";

export type LegalDraftPayload = {
  name: string;
  content: JSONContent;
  styles: LegalStyleMap;
  pageSettings: LegalPageSettings;
};

type LegalEntity = LegalTemplate | LegalDocument | LegalQuickPart;

const ENTITY_COLLECTION: Record<LegalEntityKind, string> = {
  template: "legalTemplates",
  document: "legalDocuments",
  quickPart: "legalQuickParts",
};

const VERSION_COLLECTION: Record<LegalEntityKind, string> = {
  template: "legalTemplateVersions",
  document: "legalDocumentVersions",
  quickPart: "legalQuickPartVersions",
};

function versionId(entityId: string, version: number): string {
  return `${entityId}_${version}`;
}

function entityName(entity: LegalEntity): string {
  return "title" in entity ? entity.title : entity.name;
}

function assertLegalPayload(payload: LegalDraftPayload): void {
  const name = payload.name.trim();
  const contentJson = stringifyLegalContent(payload.content);
  const stylesJson = stringifyLegalStyles(payload.styles);
  const pageSettingsJson = stringifyLegalPageSettings(payload.pageSettings);
  if (!name) throw new Error("Informe o nome.");
  if (name.length > 200) throw new Error("O nome deve ter no máximo 200 caracteres.");
  if (contentJson.length > 550_000) throw new Error("O documento ficou grande demais para ser salvo.");
  if (stylesJson.length > 25_000) throw new Error("A configuração de estilos ficou grande demais.");
  if (pageSettingsJson.length > 6_000) throw new Error("A configuração da página ficou grande demais.");
}

function serializedDraft(payload: LegalDraftPayload) {
  assertLegalPayload(payload);
  return {
    contentJson: stringifyLegalContent(payload.content),
    plainText: legalPlainText(payload.content).slice(0, 80_000),
    stylesJson: stringifyLegalStyles(payload.styles),
    pageSettingsJson: stringifyLegalPageSettings(payload.pageSettings),
  };
}

function draftEntityPatch(kind: LegalEntityKind, payload: LegalDraftPayload) {
  const serialized = serializedDraft(payload);
  if (kind === "quickPart") {
    return {
      title: payload.name.trim(),
      titleLower: normalizeLegalName(payload.name),
      searchText: normalizeLegalName(`${payload.name} ${serialized.plainText}`).slice(0, 80_000),
      ...serialized,
    };
  }
  return {
    name: payload.name.trim(),
    nameLower: normalizeLegalName(payload.name),
    ...serialized,
  };
}

function versionSnapshot(
  kind: LegalEntityKind,
  entityId: string,
  version: number,
  payload: LegalDraftPayload,
  reason: "initial" | "explicit" | "before_restore" | "restored",
  user: UserProfile
) {
  const serialized = serializedDraft(payload);
  return {
    entityId,
    entityType: kind,
    version,
    name: payload.name.trim(),
    ...serialized,
    reason,
    createdAt: serverTimestamp(),
    createdById: user.id,
    createdBy: user.name,
  };
}

function entityPayload(entity: LegalEntity): LegalDraftPayload {
  return {
    name: entityName(entity),
    content: JSON.parse(entity.contentJson) as JSONContent,
    styles: JSON.parse(entity.stylesJson) as LegalStyleMap,
    pageSettings: JSON.parse(entity.pageSettingsJson) as LegalPageSettings,
  };
}

function baseAudit(user: UserProfile) {
  return {
    createdAt: serverTimestamp(),
    createdById: user.id,
    createdBy: user.name,
    updatedAt: serverTimestamp(),
    updatedById: user.id,
    updatedBy: user.name,
    deleted: false,
    deletedAt: null,
    deletedById: null,
    deletedBy: null,
  };
}

export async function createLegalTemplateFolder(name: string, user: UserProfile): Promise<string> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Informe o nome da pasta.");
  if (cleanName.length > 200) throw new Error("O nome da pasta deve ter no máximo 200 caracteres.");
  if (cleanName.length > 200) throw new Error("O nome da pasta deve ter no máximo 200 caracteres.");
  const ref = doc(collection(db, "legalTemplateFolders"));
  await runTransaction(db, async (transaction) => {
    transaction.set(ref, {
      name: cleanName,
      nameLower: normalizeLegalName(cleanName),
      ...baseAudit(user),
    });
  });
  return ref.id;
}

export async function renameLegalTemplateFolder(
  folderId: string,
  name: string,
  user: UserProfile
): Promise<void> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Informe o nome da pasta.");
  await updateDoc(doc(db, "legalTemplateFolders", folderId), {
    name: cleanName,
    nameLower: normalizeLegalName(cleanName),
    updatedAt: serverTimestamp(),
    updatedById: user.id,
    updatedBy: user.name,
  });
}

export async function setLegalTemplateFolderDeleted(
  folder: LegalTemplateFolder,
  deleted: boolean,
  user: UserProfile
): Promise<void> {
  if (deleted) {
    const models = await getDocs(
      query(collection(db, "legalTemplates"), where("folderId", "==", folder.id))
    );
    if (models.docs.some((model) => model.data().deleted !== true)) {
      throw new Error("Mova os modelos desta pasta antes de excluí-la.");
    }
  }
  await updateDoc(doc(db, "legalTemplateFolders", folder.id), {
    deleted,
    deletedAt: deleted ? serverTimestamp() : null,
    deletedById: deleted ? user.id : null,
    deletedBy: deleted ? user.name : null,
    updatedAt: serverTimestamp(),
    updatedById: user.id,
    updatedBy: user.name,
  });
}

async function createOwnedEntity(
  kind: "template" | "quickPart",
  name: string,
  user: UserProfile,
  options?: {
    folderId?: string | null;
    content?: JSONContent;
    styles?: LegalStyleMap;
    pageSettings?: LegalPageSettings;
    duplicatedFromId?: string | null;
  }
): Promise<string> {
  const payload: LegalDraftPayload = {
    name,
    content: options?.content ?? EMPTY_LEGAL_CONTENT,
    styles: options?.styles ?? DEFAULT_LEGAL_STYLES,
    pageSettings: options?.pageSettings ?? DEFAULT_LEGAL_PAGE_SETTINGS,
  };
  const entityRef = doc(collection(db, ENTITY_COLLECTION[kind]));
  const versionRef = doc(db, VERSION_COLLECTION[kind], versionId(entityRef.id, 1));
  const patch = draftEntityPatch(kind, payload);
  await runTransaction(db, async (transaction) => {
    transaction.set(entityRef, {
      ...patch,
      ...(kind === "template"
        ? {
            folderId: options?.folderId ?? null,
            duplicatedFromTemplateId: options?.duplicatedFromId ?? null,
          }
        : { duplicatedFromQuickPartId: options?.duplicatedFromId ?? null }),
      version: 1,
      ...baseAudit(user),
    });
    transaction.set(versionRef, versionSnapshot(kind, entityRef.id, 1, payload, "initial", user));
  });
  return entityRef.id;
}

export function createLegalTemplate(
  name: string,
  user: UserProfile,
  folderId: string | null = null
): Promise<string> {
  return createOwnedEntity("template", name, user, { folderId });
}

export function createLegalQuickPart(title: string, user: UserProfile): Promise<string> {
  return createOwnedEntity("quickPart", title, user);
}

export async function getLegalVersionSnapshot(
  kind: LegalEntityKind,
  entityId: string,
  version: number
): Promise<LegalVersion> {
  const snapshot = await getDoc(doc(db, VERSION_COLLECTION[kind], versionId(entityId, version)));
  if (!snapshot.exists()) throw new Error("A versão selecionada não está mais disponível.");
  const data = snapshot.data();
  if (data.entityId !== entityId || data.entityType !== kind || data.version !== version) {
    throw new Error("O histórico deste item está inconsistente.");
  }
  return { id: snapshot.id, ...data } as LegalVersion;
}

export async function createLegalDocument(
  input: {
    name: string;
    clientId: string;
    clientName: string;
    sourceTemplateId?: string | null;
    sourceTemplateName?: string;
    sourceTemplateVersion?: number | null;
    content?: JSONContent;
    styles?: LegalStyleMap;
    pageSettings?: LegalPageSettings;
  },
  user: UserProfile
): Promise<string> {
  const payload: LegalDraftPayload = {
    name: input.name,
    content: input.content ?? EMPTY_LEGAL_CONTENT,
    styles: input.styles ?? DEFAULT_LEGAL_STYLES,
    pageSettings: input.pageSettings ?? DEFAULT_LEGAL_PAGE_SETTINGS,
  };
  const entityRef = doc(collection(db, "legalDocuments"));
  const versionRef = doc(db, "legalDocumentVersions", versionId(entityRef.id, 1));
  await runTransaction(db, async (transaction) => {
    transaction.set(entityRef, {
      ...draftEntityPatch("document", payload),
      clientId: input.clientId,
      clientName: input.clientName,
      sourceTemplateId: input.sourceTemplateId ?? null,
      sourceTemplateName: input.sourceTemplateName ?? "",
      sourceTemplateVersion: input.sourceTemplateVersion ?? null,
      version: 1,
      ...baseAudit(user),
    });
    transaction.set(versionRef, versionSnapshot("document", entityRef.id, 1, payload, "initial", user));
  });
  return entityRef.id;
}

export async function saveLegalDraft(
  kind: LegalEntityKind,
  id: string,
  payload: LegalDraftPayload,
  user: UserProfile
): Promise<void> {
  await updateDoc(doc(db, ENTITY_COLLECTION[kind], id), {
    ...draftEntityPatch(kind, payload),
    updatedAt: serverTimestamp(),
    updatedById: user.id,
    updatedBy: user.name,
  });
}

export async function saveLegalVersion(
  kind: LegalEntityKind,
  id: string,
  payload: LegalDraftPayload,
  user: UserProfile
): Promise<number> {
  const entityRef = doc(db, ENTITY_COLLECTION[kind], id);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(entityRef);
    if (!snapshot.exists()) throw new Error("O item não existe mais.");
    const nextVersion = Number(snapshot.data().version ?? 0) + 1;
    transaction.set(
      doc(db, VERSION_COLLECTION[kind], versionId(id, nextVersion)),
      versionSnapshot(kind, id, nextVersion, payload, "explicit", user)
    );
    transaction.update(entityRef, {
      ...draftEntityPatch(kind, payload),
      version: nextVersion,
      updatedAt: serverTimestamp(),
      updatedById: user.id,
      updatedBy: user.name,
    });
    return nextVersion;
  });
}

export async function restoreLegalVersion(
  kind: LegalEntityKind,
  entity: LegalEntity,
  selectedVersion: number,
  user: UserProfile
): Promise<number> {
  const entityRef = doc(db, ENTITY_COLLECTION[kind], entity.id);
  const selectedRef = doc(db, VERSION_COLLECTION[kind], versionId(entity.id, selectedVersion));
  return runTransaction(db, async (transaction) => {
    const [currentSnapshot, selectedSnapshot] = await Promise.all([
      transaction.get(entityRef),
      transaction.get(selectedRef),
    ]);
    if (!currentSnapshot.exists() || !selectedSnapshot.exists()) {
      throw new Error("A versão selecionada não está mais disponível.");
    }
    const current = { id: currentSnapshot.id, ...currentSnapshot.data() } as LegalEntity;
    const selected = selectedSnapshot.data();
    const beforeVersion = Number(current.version ?? 0) + 1;
    const restoredVersion = beforeVersion + 1;
    const restoredPayload: LegalDraftPayload = {
      name: String(selected.name ?? entityName(current)),
      content: JSON.parse(String(selected.contentJson)) as JSONContent,
      styles: JSON.parse(String(selected.stylesJson)) as LegalStyleMap,
      pageSettings: JSON.parse(String(selected.pageSettingsJson)) as LegalPageSettings,
    };
    transaction.set(
      doc(db, VERSION_COLLECTION[kind], versionId(entity.id, beforeVersion)),
      versionSnapshot(kind, entity.id, beforeVersion, entityPayload(current), "before_restore", user)
    );
    transaction.set(
      doc(db, VERSION_COLLECTION[kind], versionId(entity.id, restoredVersion)),
      versionSnapshot(kind, entity.id, restoredVersion, restoredPayload, "restored", user)
    );
    transaction.update(entityRef, {
      ...draftEntityPatch(kind, restoredPayload),
      version: restoredVersion,
      updatedAt: serverTimestamp(),
      updatedById: user.id,
      updatedBy: user.name,
    });
    return restoredVersion;
  });
}

export async function moveLegalTemplate(
  templateId: string,
  folderId: string | null,
  user: UserProfile
): Promise<void> {
  await updateDoc(doc(db, "legalTemplates", templateId), {
    folderId,
    updatedAt: serverTimestamp(),
    updatedById: user.id,
    updatedBy: user.name,
  });
}

export async function setLegalEntityDeleted(
  kind: LegalEntityKind,
  id: string,
  deleted: boolean,
  user: UserProfile
): Promise<void> {
  await updateDoc(doc(db, ENTITY_COLLECTION[kind], id), {
    deleted,
    deletedAt: deleted ? serverTimestamp() : null,
    deletedById: deleted ? user.id : null,
    deletedBy: deleted ? user.name : null,
    updatedAt: serverTimestamp(),
    updatedById: user.id,
    updatedBy: user.name,
  });
}

export async function duplicateLegalTemplate(
  source: LegalTemplate,
  user: UserProfile
): Promise<string> {
  const payload = entityPayload(source);
  return createOwnedEntity("template", `${source.name} (cópia)`, user, {
    folderId: source.folderId,
    content: payload.content,
    styles: payload.styles,
    pageSettings: payload.pageSettings,
    duplicatedFromId: source.id,
  });
}

export async function duplicateLegalQuickPart(
  source: LegalQuickPart,
  user: UserProfile
): Promise<string> {
  const payload = entityPayload(source);
  return createOwnedEntity("quickPart", `${source.title} (cópia)`, user, {
    content: payload.content,
    styles: payload.styles,
    pageSettings: payload.pageSettings,
    duplicatedFromId: source.id,
  });
}

export function duplicateLegalDocument(
  source: LegalDocument,
  user: UserProfile
): Promise<string> {
  const payload = entityPayload(source);
  return createLegalDocument(
    {
      name: `${source.name} (cópia)`,
      clientId: source.clientId,
      clientName: source.clientName,
      sourceTemplateId: source.sourceTemplateId,
      sourceTemplateName: source.sourceTemplateName,
      sourceTemplateVersion: source.sourceTemplateVersion,
      content: payload.content,
      styles: payload.styles,
      pageSettings: payload.pageSettings,
    },
    user
  );
}

export function canManageOwnedLegalEntity(
  entity: Pick<LegalTemplate | LegalQuickPart | LegalTemplateFolder, "createdById">,
  user: UserProfile | null,
  isAdmin: boolean
): boolean {
  return !!user && (isAdmin || entity.createdById === user.id);
}
