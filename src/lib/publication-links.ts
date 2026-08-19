"use client";

import {
  collection,
  doc,
  documentId,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type FieldValue,
} from "firebase/firestore";
import { db } from "./firebase";
import { digitsOnly, searchable } from "./normalize";
import { namesAreSimilar } from "./client-deduplication";
import type {
  Client,
  Process,
  Publication,
  PublicationLinkStatus,
  PublicationProcessRule,
  UserProfile,
} from "./types";
export { publicationLinkStatus } from "./types";
import { publicationLinkStatus } from "./types";

/** Campos de vínculo gravados na publicação — sempre todos, nunca pela metade. */
export type PublicationLinkFields = {
  linkStatus: PublicationLinkStatus;
  processId: string | null;
  processNumber: string | null;
  clientIds: string[];
  clientNames: string[];
  privateOwnerId: string | null;
  privateOwnerName: string | null;
  linkedAt?: FieldValue;
  linkedBy?: string;
};

/**
 * Vínculo entre a publicação do DJEN e o acervo do escritório.
 *
 * A decisão é tomada por **número de processo**, não por publicação: marcar uma
 * vez resolve as intimações que já chegaram e as que ainda vão chegar. Por isso
 * cada decisão vira um documento em `publicationProcessRules` com ID igual ao
 * número só com dígitos, que o coletor consulta ao gravar comunicação nova.
 */

/** Índices que a tela precisa para saber a titularidade de cada publicação. */
export type Contexto = { processoPorId: Map<string, Process> };

/**
 * Estado de vínculo já considerando o processo cadastrado.
 *
 * Publicação vinculada a um processo **particular** conta como particular em
 * todo lugar — filtro, contagem e cor da linha. Sem isso, o advogado que traz o
 * caso pessoal para o sistema veria a publicação dele misturada às da sociedade.
 */
export function estadoVinculo(publicacao: Publication, contexto: Contexto): PublicationLinkStatus {
  const estado = publicationLinkStatus(publicacao);
  if (estado === "particular") return "particular";
  const processo = publicacao.processId
    ? contexto.processoPorId.get(publicacao.processId)
    : undefined;
  if (processo?.ownership === "particular") return "particular";
  return estado;
}

/** Advogado dono, venha ele da marcação da publicação ou do processo cadastrado. */
export function donoParticular(
  publicacao: Publication,
  contexto: Contexto
): { id: string; name: string } | null {
  const processo = publicacao.processId
    ? contexto.processoPorId.get(publicacao.processId)
    : undefined;
  if (processo?.ownership === "particular" && processo.ownerUserId) {
    return { id: processo.ownerUserId, name: processo.ownerUserName ?? "" };
  }
  if (publicacao.privateOwnerId) {
    return { id: publicacao.privateOwnerId, name: publicacao.privateOwnerName ?? "" };
  }
  return null;
}

/** Processo do acervo cujo número bate com o da publicação. */
export function findProcessByNumber(
  numeroProcessoDigits: string | undefined | null,
  processes: Process[]
): Process | null {
  const alvo = digitsOnly(numeroProcessoDigits);
  if (!alvo) return null;
  return (
    processes.find(
      (processo) => !processo.deleted && digitsOnly(processo.processNumber) === alvo
    ) ?? null
  );
}

export type ClientSuggestion = {
  client: Client;
  /** `exato` quando o nome é idêntico; `parecido` quando só se assemelha. */
  match: "exato" | "parecido";
  /** Nome da parte, como veio do tribunal. */
  destinatario: string;
};

/**
 * Clientes que podem ser a parte da publicação.
 *
 * O nome do tribunal costuma vir abreviado ou com o meio faltando, então além do
 * nome idêntico o sistema oferece os semelhantes — mas quem decide é a pessoa,
 * nunca o vínculo automático.
 */
export function suggestClientsForPublication(
  publication: Publication,
  clients: Client[]
): ClientSuggestion[] {
  const ativos = clients.filter((client) => !client.deleted);
  const sugestoes: ClientSuggestion[] = [];
  const jaIncluidos = new Set<string>();

  for (const destinatario of publication.destinatarios ?? []) {
    const alvo = searchable(destinatario).replace(/\s+/g, " ").trim();
    if (!alvo) continue;
    for (const client of ativos) {
      if (jaIncluidos.has(client.id)) continue;
      const nome = searchable(client.name).replace(/\s+/g, " ").trim();
      const match = nome === alvo ? "exato" : namesAreSimilar(client.name, destinatario) ? "parecido" : null;
      if (!match) continue;
      jaIncluidos.add(client.id);
      sugestoes.push({ client, match, destinatario });
    }
  }

  // Nome idêntico primeiro: é o caso que a equipe só precisa confirmar.
  return sugestoes.sort((a, b) => (a.match === b.match ? 0 : a.match === "exato" ? -1 : 1));
}

/**
 * Procura um cliente já cadastrado por nome, código ou CPF/CNPJ.
 *
 * O nome casa por **todos os termos digitados, em qualquer ordem**, porque a
 * publicação abrevia e a pessoa lembra o nome pelo meio. O documento só entra na
 * comparação quando há dígitos suficientes: comparar com string vazia faria
 * `includes("")` valer para todo mundo e devolver a base inteira.
 */
export function searchClientsByTerm(clients: Client[], term: string, limit = 8): Client[] {
  const alvo = searchable(term).replace(/\s+/g, " ").trim();
  const digitos = term.replace(/\D/g, "");
  if (alvo.length < 2 && digitos.length < 4) return [];
  const termos = alvo.split(" ").filter(Boolean);

  const pontuados: { client: Client; score: number; nome: string }[] = [];
  for (const client of clients) {
    if (client.deleted) continue;
    const nome = searchable(client.name).replace(/\s+/g, " ").trim();
    const codigo = searchable(client.code);
    const documento = client.cpfCnpjDigits ?? "";

    // Menor pontuação aparece primeiro: do mais específico ao mais frouxo.
    let score = -1;
    if (digitos.length >= 4 && documento.includes(digitos)) score = 0;
    else if (codigo && codigo === alvo) score = 1;
    else if (nome === alvo) score = 2;
    else if (nome.startsWith(alvo)) score = 3;
    else if (termos.length > 0 && termos.every((termo) => nome.includes(termo))) score = 4;
    else if (codigo && codigo.startsWith(alvo)) score = 5;
    if (score < 0) continue;
    pontuados.push({ client, score, nome });
  }

  return pontuados
    .sort((a, b) => a.score - b.score || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, limit)
    .map((pontuado) => pontuado.client);
}

/** Dados do processo que dá para aproveitar da publicação num cadastro novo. */
export function processDraftFromPublication(publication: Publication): {
  processNumber: string;
  actionType: string;
  classe: string;
  vara: string;
  foro: string;
} {
  return {
    processNumber: publication.numeroProcessoMascara ?? "",
    actionType: publication.nomeClasse ?? "",
    classe: publication.nomeClasse ?? "",
    vara: publication.orgao ?? "",
    foro: publication.tribunal ?? "",
  };
}

// ---------------------------------------------------------------------------
// Gravação da decisão
// ---------------------------------------------------------------------------

export type LinkDecision =
  | {
      kind: "escritorio";
      processId: string;
      processNumber: string;
      clientIds: string[];
      clientNames: string[];
    }
  | {
      kind: "particular";
      ownerUserId: string;
      ownerUserName: string;
    };

/** Campos que a decisão grava em cada publicação do mesmo processo. */
function publicationPatch(decision: LinkDecision, user: UserProfile): PublicationLinkFields {
  const comum = { linkedAt: serverTimestamp(), linkedBy: user.name };
  if (decision.kind === "particular") {
    return {
      ...comum,
      linkStatus: "particular",
      privateOwnerId: decision.ownerUserId,
      privateOwnerName: decision.ownerUserName,
      processId: null,
      processNumber: null,
      clientIds: [],
      clientNames: [],
    };
  }
  return {
    ...comum,
    linkStatus: "vinculada",
    processId: decision.processId,
    processNumber: decision.processNumber,
    clientIds: decision.clientIds,
    clientNames: decision.clientNames,
    privateOwnerId: null,
    privateOwnerName: null,
  };
}

/**
 * Grava a decisão para o número do processo e a espalha nas publicações que já
 * estão na base. As futuras recebem o mesmo tratamento no coletor.
 */
export async function applyLinkDecision(
  numeroProcessoDigits: string,
  decision: LinkDecision,
  user: UserProfile
): Promise<number> {
  const digits = digitsOnly(numeroProcessoDigits);
  if (!digits) throw new Error("A publicação não traz número de processo para vincular.");

  await setDoc(
    doc(db, "publicationProcessRules", digits),
    {
      numeroProcessoDigits: digits,
      kind: decision.kind,
      processId: decision.kind === "escritorio" ? decision.processId : null,
      processNumber: decision.kind === "escritorio" ? decision.processNumber : null,
      clientIds: decision.kind === "escritorio" ? decision.clientIds : [],
      clientNames: decision.kind === "escritorio" ? decision.clientNames : [],
      ownerUserId: decision.kind === "particular" ? decision.ownerUserId : null,
      ownerUserName: decision.kind === "particular" ? decision.ownerUserName : null,
      createdAt: serverTimestamp(),
      createdBy: user.name,
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    },
    { merge: true }
  );

  return aplicarNasPublicacoesDoProcesso(digits, publicationPatch(decision, user));
}

/**
 * Aplica os campos de vínculo a **todas** as publicações daquele processo.
 *
 * A lista da tela mostra só as mais recentes, então o alvo é buscado no banco:
 * depois da carga histórica um mesmo processo pode ter publicações antigas que
 * ficariam eternamente pendentes se dependessem do que está carregado.
 */
async function aplicarNasPublicacoesDoProcesso(
  digits: string,
  patch: PublicationLinkFields
): Promise<number> {
  const snap = await getDocs(
    query(collection(db, "publications"), where("numeroProcessoDigits", "==", digits))
  );
  const alvo = snap.docs.filter((documento) => documento.data().deleted !== true);
  for (let inicio = 0; inicio < alvo.length; inicio += 400) {
    const lote = writeBatch(db);
    for (const documento of alvo.slice(inicio, inicio + 400)) {
      lote.update(doc(db, "publications", documento.id), patch);
    }
    await lote.commit();
  }
  return alvo.length;
}

/** Desfaz a decisão: o processo volta para a fila de pendentes. */
export async function clearLinkDecision(
  numeroProcessoDigits: string,
  user: UserProfile
): Promise<number> {
  const digits = digitsOnly(numeroProcessoDigits);
  if (!digits) return 0;

  await setDoc(
    doc(db, "publicationProcessRules", digits),
    {
      numeroProcessoDigits: digits,
      kind: "escritorio",
      processId: null,
      processNumber: null,
      clientIds: [],
      clientNames: [],
      ownerUserId: null,
      ownerUserName: null,
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    },
    { merge: true }
  );

  return aplicarNasPublicacoesDoProcesso(digits, {
    linkStatus: "pendente",
    processId: null,
    processNumber: null,
    clientIds: [],
    clientNames: [],
    privateOwnerId: null,
    privateOwnerName: null,
    linkedAt: serverTimestamp(),
    linkedBy: user.name,
  });
}

/** Regras já decididas para os números informados, em lotes de 30 (limite do `in`). */
export async function fetchProcessRules(
  digitsList: string[]
): Promise<Map<string, PublicationProcessRule>> {
  const regras = new Map<string, PublicationProcessRule>();
  const unicos = Array.from(new Set(digitsList.filter(Boolean)));
  for (let inicio = 0; inicio < unicos.length; inicio += 30) {
    const lote = unicos.slice(inicio, inicio + 30);
    const snap = await getDocs(
      query(collection(db, "publicationProcessRules"), where(documentId(), "in", lote))
    );
    snap.forEach((documento) => {
      regras.set(documento.id, { id: documento.id, ...documento.data() } as PublicationProcessRule);
    });
  }
  return regras;
}

/** Campos de vínculo que uma publicação nova herda da regra já decidida. */
export function linkFieldsFromRule(
  rule: PublicationProcessRule | undefined
): PublicationLinkFields {
  if (!rule) {
    return {
      linkStatus: "pendente",
      processId: null,
      processNumber: null,
      clientIds: [],
      clientNames: [],
      privateOwnerId: null,
      privateOwnerName: null,
    };
  }
  if (rule.kind === "particular" && rule.ownerUserId) {
    return {
      linkStatus: "particular",
      processId: null,
      processNumber: null,
      clientIds: [],
      clientNames: [],
      privateOwnerId: rule.ownerUserId,
      privateOwnerName: rule.ownerUserName ?? null,
    };
  }
  if (rule.processId) {
    return {
      linkStatus: "vinculada",
      processId: rule.processId,
      processNumber: rule.processNumber ?? null,
      clientIds: rule.clientIds ?? [],
      clientNames: rule.clientNames ?? [],
      privateOwnerId: null,
      privateOwnerName: null,
    };
  }
  return {
    linkStatus: "pendente",
    processId: null,
    processNumber: null,
    clientIds: [],
    clientNames: [],
    privateOwnerId: null,
    privateOwnerName: null,
  };
}
