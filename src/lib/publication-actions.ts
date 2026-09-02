"use client";

import { addDoc, collection, doc, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { digitsOnly, formatCpfCnpj, isValidCpfCnpj } from "./normalize";
import { addTaskToBatch, createClient, type TaskCreateData } from "./db-actions";
import { processDraftFromPublication } from "./publication-links";
import type {
  Client,
  Lawyer,
  MonitoredParty,
  ProcessOwnership,
  Publication,
  PublicationClassification,
  PublicationTriageStatus,
  UserProfile,
} from "./types";

/**
 * Triagem das publicações e cadastro das OABs monitoradas.
 *
 * A publicação em si é gravada pelo coletor (`djen-sync.ts`) a partir do que o
 * tribunal divulgou; aqui ficam apenas as decisões da equipe sobre ela, que o
 * coletor nunca sobrescreve ao reprocessar a janela.
 */

export const UF_LIST = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

export type LawyerInput = {
  name: string;
  oabNumber: string;
  oabUf: string;
  monitored: boolean;
  notes: string;
};

function normalizarLawyer(input: LawyerInput): LawyerInput {
  const name = input.name.trim();
  const oabNumber = digitsOnly(input.oabNumber);
  const oabUf = input.oabUf.trim().toUpperCase();

  if (!name) throw new Error("Informe o nome do advogado.");
  if (name.length > 120) throw new Error("O nome deve ter no máximo 120 caracteres.");
  if (!oabNumber) throw new Error("Informe o número da OAB.");
  if (oabNumber.length > 10) throw new Error("O número da OAB deve ter no máximo 10 dígitos.");
  if (!(UF_LIST as readonly string[]).includes(oabUf)) throw new Error("Escolha a UF da seccional.");
  if (input.notes.trim().length > 500) throw new Error("A observação deve ter no máximo 500 caracteres.");

  return { name, oabNumber, oabUf, monitored: input.monitored, notes: input.notes.trim() };
}

/** Impede cadastrar a mesma inscrição duas vezes entre os advogados ativos. */
function assertOabInedita(
  input: LawyerInput,
  lawyers: Lawyer[],
  ignorarId?: string
): void {
  const repetida = lawyers.some(
    (lawyer) =>
      !lawyer.deleted &&
      lawyer.id !== ignorarId &&
      lawyer.oabNumber === input.oabNumber &&
      lawyer.oabUf === input.oabUf
  );
  if (repetida) {
    throw new Error(`A OAB ${input.oabUf} ${input.oabNumber} já está cadastrada.`);
  }
}

export async function createLawyer(
  input: LawyerInput,
  lawyers: Lawyer[],
  user: UserProfile
): Promise<void> {
  const dados = normalizarLawyer(input);
  assertOabInedita(dados, lawyers);
  await addDoc(collection(db, "lawyers"), {
    ...dados,
    createdAt: serverTimestamp(),
    createdBy: user.name,
    createdById: user.id,
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
    deleted: false,
    deletedAt: null,
    deletedBy: null,
  });
}

export async function updateLawyer(
  id: string,
  input: LawyerInput,
  lawyers: Lawyer[],
  user: UserProfile
): Promise<void> {
  const dados = normalizarLawyer(input);
  assertOabInedita(dados, lawyers, id);
  await updateDoc(doc(db, "lawyers", id), {
    ...dados,
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  });
}

export async function setLawyerDeleted(
  id: string,
  deleted: boolean,
  user: UserProfile
): Promise<void> {
  await updateDoc(doc(db, "lawyers", id), {
    deleted,
    deletedAt: deleted ? serverTimestamp() : null,
    deletedBy: deleted ? user.name : null,
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  });
}

export async function setPublicationTriage(
  id: string,
  status: PublicationTriageStatus,
  user: UserProfile,
  note?: string
): Promise<void> {
  await updateDoc(doc(db, "publications", id), {
    triageStatus: status,
    ...(note === undefined ? {} : { triageNote: note.trim().slice(0, 1000) }),
    triagedAt: serverTimestamp(),
    triagedBy: user.name,
  });
}

export async function setPublicationClassification(
  id: string,
  classification: PublicationClassification,
  user: UserProfile
): Promise<void> {
  await updateDoc(doc(db, "publications", id), {
    classification,
    triagedAt: serverTimestamp(),
    triagedBy: user.name,
  });
}

/**
 * Cria a tarefa e marca a publicação como tratada na mesma gravação.
 * Assim nunca existe uma publicação tratada sem a tarefa que motivou o estado.
 */
export async function createTaskFromPublication(
  publication: Pick<Publication, "id" | "processId">,
  data: TaskCreateData,
  user: UserProfile
): Promise<void> {
  if (!publication.processId) {
    throw new Error("Vincule a publicação a um processo antes de criar a tarefa.");
  }

  const batch = writeBatch(db);
  const taskId = addTaskToBatch(
    batch,
    {
      ...data,
      processId: publication.processId,
      processIds: [publication.processId],
      publicationId: publication.id,
    },
    user
  );
  batch.update(doc(db, "publications", publication.id), {
    triageStatus: "tratada",
    taskId,
    triagedAt: serverTimestamp(),
    triagedBy: user.name,
  });
  await batch.commit();
}

export async function setPublicationDeleted(
  id: string,
  deleted: boolean,
  user: UserProfile
): Promise<void> {
  await updateDoc(doc(db, "publications", id), {
    deleted,
    deletedAt: deleted ? serverTimestamp() : null,
    deletedBy: deleted ? user.name : null,
  });
}

// ---------------------------------------------------------------------------
// Cadastro a partir da publicação
// ---------------------------------------------------------------------------

/**
 * Cria o cliente com os dados que a publicação permite conhecer.
 *
 * O tribunal só informa o nome da parte, e nome de publicação vem abreviado ou
 * truncado. Por isso o CPF/CNPJ é **obrigatório** neste caminho: é ele que
 * garante que a pressa de despachar uma intimação não gere cadastro duplicado.
 */
export async function createClientFromPublication(
  input: { name: string; cpfCnpj: string; type: Client["type"]; typeIds?: string[] },
  clients: Client[],
  user: UserProfile
): Promise<{ id: string; name: string }> {
  const name = input.name.trim();
  const cpfCnpjDigits = digitsOnly(input.cpfCnpj);

  if (!name) throw new Error("Informe o nome do cliente.");
  if (!cpfCnpjDigits) throw new Error("Informe o CPF/CNPJ para criar o cliente pela publicação.");
  if (!isValidCpfCnpj(cpfCnpjDigits)) throw new Error("CPF/CNPJ inválido — confira os dígitos.");

  const jaExiste = clients.find(
    (client) => !client.deleted && client.cpfCnpjDigits === cpfCnpjDigits
  );
  if (jaExiste) {
    throw new Error(`Este CPF/CNPJ já é do cliente ${jaExiste.name}. Vincule a publicação a ele.`);
  }

  const id = await createClient(
    {
      name,
      nameLower: name.toLowerCase(),
      cpfCnpj: formatCpfCnpj(cpfCnpjDigits),
      cpfCnpjDigits,
      type: input.type,
      typeIds: input.typeIds ?? [],
      origin: "Publicação DJEN",
    },
    user
  );
  return { id, name };
}

/**
 * Cria o processo com a capa que veio da publicação.
 *
 * `clientIds` e `clientNames` são gravados juntos e na mesma ordem, como manda o
 * contrato; o primeiro cliente entra como principal.
 */
export async function createProcessFromPublication(
  publication: Publication,
  clients: { id: string; name: string }[],
  user: UserProfile,
  titularidade: { ownership: ProcessOwnership; owner?: { id: string; name: string } } = {
    ownership: "sociedade",
  }
): Promise<{ id: string; processNumber: string }> {
  if (clients.length === 0) throw new Error("Escolha ao menos um cliente para o processo.");
  if (titularidade.ownership === "particular" && !titularidade.owner) {
    throw new Error("Escolha o advogado dono do processo particular.");
  }
  const processNumber = (publication.numeroProcessoMascara ?? "").trim();
  if (!processNumber) throw new Error("A publicação não traz número de processo.");

  const draft = processDraftFromPublication(publication);
  const referencia = await addDoc(collection(db, "processes"), {
    processNumber,
    status: "Ativo",
    polo: "Ativo",
    parteContraria: "",
    actionType: draft.actionType,
    classe: draft.classe,
    assunto: "",
    foro: draft.foro,
    vara: draft.vara,
    juiz: "",
    instancia: "1ª Instância",
    ownership: titularidade.ownership,
    ownerUserId: titularidade.owner?.id ?? null,
    ownerUserName: titularidade.owner?.name ?? null,
    notes: `Cadastrado a partir de publicação do DJEN em ${publication.disponibilizacaoDate}.`,
    clientIds: clients.map((client) => client.id),
    clientNames: clients.map((client) => client.name),
    mainClientId: clients[0].id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastUpdate: serverTimestamp(),
    updatedBy: user.name,
    deleted: false,
    deletedAt: null,
    deletedBy: null,
  });
  return { id: referencia.id, processNumber };
}

// ---------------------------------------------------------------------------
// Partes monitoradas
// ---------------------------------------------------------------------------

/**
 * Termo curto demais é recusado pelo próprio DJEN e, se passasse, traria
 * publicação de gente sem relação nenhuma com o escritório.
 */
export const MIN_PARTY_TERM_LENGTH = 5;

export type MonitoredPartyInput = {
  name: string;
  searchTerm: string;
  clientId: string;
  monitored: boolean;
  notes: string;
};

function normalizarParte(input: MonitoredPartyInput): MonitoredPartyInput {
  const name = input.name.trim();
  const searchTerm = input.searchTerm.trim().replace(/\s+/g, " ");

  if (!name) throw new Error("Informe o nome da parte.");
  if (name.length > 120) throw new Error("O nome deve ter no máximo 120 caracteres.");
  if (searchTerm.length < MIN_PARTY_TERM_LENGTH) {
    throw new Error(
      `O termo de busca precisa de pelo menos ${MIN_PARTY_TERM_LENGTH} caracteres — termos curtos trazem publicações de terceiros.`
    );
  }
  if (searchTerm.length > 120) throw new Error("O termo deve ter no máximo 120 caracteres.");
  if (input.notes.trim().length > 500) throw new Error("A observação deve ter no máximo 500 caracteres.");

  return { name, searchTerm, clientId: input.clientId, monitored: input.monitored, notes: input.notes.trim() };
}

export async function createMonitoredParty(
  input: MonitoredPartyInput,
  parties: MonitoredParty[],
  clients: Client[],
  user: UserProfile
): Promise<void> {
  const dados = normalizarParte(input);
  const repetido = parties.some(
    (party) =>
      !party.deleted && party.searchTerm.toLowerCase() === dados.searchTerm.toLowerCase()
  );
  if (repetido) throw new Error(`O termo "${dados.searchTerm}" já é monitorado.`);

  const cliente = clients.find((client) => client.id === dados.clientId);
  await addDoc(collection(db, "monitoredParties"), {
    name: dados.name,
    searchTerm: dados.searchTerm,
    clientId: cliente?.id ?? null,
    clientName: cliente?.name ?? null,
    monitored: dados.monitored,
    notes: dados.notes,
    createdAt: serverTimestamp(),
    createdBy: user.name,
    createdById: user.id,
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
    deleted: false,
    deletedAt: null,
    deletedBy: null,
  });
}

export async function updateMonitoredParty(
  id: string,
  input: MonitoredPartyInput,
  parties: MonitoredParty[],
  clients: Client[],
  user: UserProfile
): Promise<void> {
  const dados = normalizarParte(input);
  const repetido = parties.some(
    (party) =>
      !party.deleted &&
      party.id !== id &&
      party.searchTerm.toLowerCase() === dados.searchTerm.toLowerCase()
  );
  if (repetido) throw new Error(`O termo "${dados.searchTerm}" já é monitorado.`);

  const cliente = clients.find((client) => client.id === dados.clientId);
  await updateDoc(doc(db, "monitoredParties", id), {
    name: dados.name,
    searchTerm: dados.searchTerm,
    clientId: cliente?.id ?? null,
    clientName: cliente?.name ?? null,
    monitored: dados.monitored,
    notes: dados.notes,
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  });
}

export async function setMonitoredPartyDeleted(
  id: string,
  deleted: boolean,
  user: UserProfile
): Promise<void> {
  await updateDoc(doc(db, "monitoredParties", id), {
    deleted,
    deletedAt: deleted ? serverTimestamp() : null,
    deletedBy: deleted ? user.name : null,
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  });
}
