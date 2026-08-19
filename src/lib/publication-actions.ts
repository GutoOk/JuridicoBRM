"use client";

import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { digitsOnly, formatCpfCnpj, isValidCpfCnpj } from "./normalize";
import { createClient } from "./db-actions";
import { processDraftFromPublication } from "./publication-links";
import type {
  Client,
  Lawyer,
  Publication,
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
  input: { name: string; cpfCnpj: string; type: Client["type"] },
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
  user: UserProfile
): Promise<{ id: string; processNumber: string }> {
  if (clients.length === 0) throw new Error("Escolha ao menos um cliente para o processo.");
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
