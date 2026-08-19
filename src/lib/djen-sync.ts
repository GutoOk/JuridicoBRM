"use client";

import {
  addDoc,
  collection,
  doc,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  djenCertidaoUrl,
  fetchDjenComunicacoes,
  publicationPlainText,
  type DjenItem,
} from "./djen";
import { fetchProcessRules, linkFieldsFromRule } from "./publication-links";
import { digitsOnly, searchable, toDate } from "./normalize";
import type { Lawyer, MonitoredParty, PublicationSync, UserProfile } from "./types";

/** Janela consultada a cada execução, em dias corridos para trás. */
export const SYNC_WINDOW_DAYS = 7;

/**
 * A janela é propositalmente sobreposta: além de cobrir os dias em que ninguém
 * abriu o sistema, ela reprocessa o passado recente e captura a comunicação que
 * o tribunal cancelou depois de divulgada — coisa que uma janela sem
 * sobreposição perderia para sempre.
 */
export function syncWindow(hoje: Date = new Date()): { start: string; end: string } {
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - SYNC_WINDOW_DAYS);
  return { start: isoDate(inicio), end: isoDate(hoje) };
}

export function isoDate(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** Data de N dias atrás em `YYYY-MM-DD`, para as janelas de consulta da tela. */
export function isoDaysAgo(dias: number, hoje: Date = new Date()): string {
  const data = new Date(hoje);
  data.setDate(data.getDate() - dias);
  return isoDate(data);
}

/** ID determinístico: reprocessar a mesma janela nunca duplica publicação. */
export function publicationDocId(externalId: string | number): string {
  return `djen_${externalId}`;
}

export type SyncResult = {
  found: number;
  created: number;
  updated: number;
  lawyerCount: number;
  partyCount: number;
};

/** Tudo que o escritório monitora no DJEN: inscrições da OAB e nomes de parte. */
export type MonitorSet = {
  lawyers: Lawyer[];
  parties: MonitoredParty[];
};

/** Mantém só o que está ativo e monitorado, que é o que vai virar consulta. */
export function activeMonitors(lawyers: Lawyer[], parties: MonitoredParty[]): MonitorSet {
  return {
    lawyers: lawyers.filter(
      (lawyer) => !lawyer.deleted && lawyer.monitored && lawyer.oabNumber && lawyer.oabUf
    ),
    parties: parties.filter(
      (party) => !party.deleted && party.monitored && party.searchTerm.trim().length >= 5
    ),
  };
}

/** Quantas consultas a janela vai disparar — usado nas estimativas de tempo. */
export function monitorCount(monitores: MonitorSet): number {
  return monitores.lawyers.length + monitores.parties.length;
}

type PreparedPublication = {
  docId: string;
  data: Record<string, unknown>;
};

/**
 * Parte monitorada citada entre os destinatários da comunicação.
 *
 * A conferência é feita aqui, e não pela origem da consulta, para o resultado
 * não depender de qual busca encontrou a publicação: a mesma comunicação achada
 * pela OAB ou pelo nome da parte é gravada exatamente igual.
 */
export function partesCitadas(item: DjenItem, parties: MonitoredParty[]): MonitoredParty[] {
  const destinatarios = (item.destinatarios ?? []).map((destinatario) =>
    searchable(destinatario.nome).replace(/\s+/g, " ").trim()
  );
  return parties.filter((party) => {
    const termo = searchable(party.searchTerm).replace(/\s+/g, " ").trim();
    return !!termo && destinatarios.some((nome) => nome.includes(termo));
  });
}

/** Converte o item bruto do DJEN nos campos gravados na coleção. */
function prepararPublicacao(
  item: DjenItem,
  lawyers: Lawyer[],
  parties: MonitoredParty[]
): PreparedPublication {
  // Casa os advogados da comunicação com o cadastro do escritório pela OAB.
  const daComunicacao = (item.destinatarioadvogados ?? [])
    .map((vinculo) => vinculo.advogado)
    .filter((advogado): advogado is NonNullable<typeof advogado> => !!advogado);

  const encontrados = lawyers.filter((lawyer) =>
    daComunicacao.some(
      (advogado) =>
        digitsOnly(advogado.numero_oab) === lawyer.oabNumber &&
        (advogado.uf_oab ?? "").trim().toUpperCase() === lawyer.oabUf
    )
  );

  const partes = partesCitadas(item, parties);
  const textoHtml = item.texto ?? "";

  return {
    docId: publicationDocId(item.id),
    data: {
      source: "DJEN",
      externalId: String(item.id),
      hash: item.hash ?? "",
      tribunal: item.siglaTribunal ?? "",
      orgao: item.nomeOrgao ?? "",
      tipoComunicacao: item.tipoComunicacao ?? "",
      tipoDocumento: item.tipoDocumento ?? "",
      nomeClasse: item.nomeClasse ?? "",
      disponibilizacaoDate: item.data_disponibilizacao ?? "",
      numeroProcessoDigits: digitsOnly(item.numero_processo),
      numeroProcessoMascara: item.numeroprocessocommascara ?? "",
      lawyerIds: encontrados.map((lawyer) => lawyer.id),
      lawyerNames: encontrados.map((lawyer) => lawyer.name),
      partyIds: partes.map((party) => party.id),
      partyNames: partes.map((party) => party.name),
      destinatarios: (item.destinatarios ?? [])
        .map((destinatario) => (destinatario.nome ?? "").trim())
        .filter(Boolean),
      textoHtml,
      textoPlain: publicationPlainText(textoHtml).slice(0, 20000),
      linkInteiroTeor: item.link ?? null,
      certidaoUrl: djenCertidaoUrl(item.hash),
      cancelada: item.ativo === false || !!item.data_cancelamento,
      motivoCancelamento: item.motivo_cancelamento ?? null,
      dataCancelamento: item.data_cancelamento ?? null,
      raw: JSON.stringify(item).slice(0, 200000),
      syncedAt: serverTimestamp(),
    },
  };
}

/** Descobre quais dessas publicações já existem, em lotes de 30 (limite do `in`). */
async function idsJaGravados(docIds: string[]): Promise<Set<string>> {
  const existentes = new Set<string>();
  for (let inicio = 0; inicio < docIds.length; inicio += 30) {
    const lote = docIds.slice(inicio, inicio + 30);
    const snap = await getDocs(
      query(collection(db, "publications"), where(documentId(), "in", lote))
    );
    snap.forEach((documento) => existentes.add(documento.id));
  }
  return existentes;
}

/**
 * Consulta uma janela de datas para cada OAB e grava o resultado.
 *
 * Gravação idempotente: o que já existe recebe só os campos vindos do tribunal,
 * preservando triagem, vínculo, observação e exclusão feitas pela equipe.
 */
async function coletarJanela(
  monitores: MonitorSet,
  start: string,
  end: string
): Promise<Omit<SyncResult, "lawyerCount" | "partyCount">> {
  // A mesma comunicação pode aparecer na busca de dois advogados e ainda na
  // busca por parte. A chave do mapa é o ID do documento, então ela é preparada
  // uma única vez — e o conteúdo não depende de qual consulta a encontrou.
  const porDocumento = new Map<string, PreparedPublication>();
  let encontrados = 0;

  const consultas = [
    ...monitores.lawyers.map((lawyer) => ({
      numeroOab: lawyer.oabNumber,
      ufOab: lawyer.oabUf,
    })),
    ...monitores.parties.map((party) => ({ nomeParte: party.searchTerm.trim() })),
  ];

  for (const consulta of consultas) {
    const itens = await fetchDjenComunicacoes({
      ...consulta,
      dataDisponibilizacaoInicio: start,
      dataDisponibilizacaoFim: end,
    });
    encontrados += itens.length;
    for (const item of itens) {
      const preparada = prepararPublicacao(item, monitores.lawyers, monitores.parties);
      porDocumento.set(preparada.docId, preparada);
    }
  }

  const preparadas = Array.from(porDocumento.values());
  const existentes = await idsJaGravados(preparadas.map((p) => p.docId));

  // Publicação nova de processo já decidido nasce vinculada (ou particular):
  // a equipe marca o processo uma vez, não uma vez por intimação.
  const novas = preparadas.filter((preparada) => !existentes.has(preparada.docId));
  const regras = await fetchProcessRules(
    novas.map((preparada) => String(preparada.data.numeroProcessoDigits ?? ""))
  );

  let criadas = 0;
  let atualizadas = 0;
  for (let inicio = 0; inicio < preparadas.length; inicio += 400) {
    const lote = writeBatch(db);
    for (const preparada of preparadas.slice(inicio, inicio + 400)) {
      const referencia = doc(db, "publications", preparada.docId);
      if (existentes.has(preparada.docId)) {
        lote.set(referencia, preparada.data, { merge: true });
        atualizadas++;
      } else {
        lote.set(referencia, {
          ...preparada.data,
          ...linkFieldsFromRule(regras.get(String(preparada.data.numeroProcessoDigits ?? ""))),
          triageStatus: "nova",
          triageNote: "",
          triagedAt: null,
          triagedBy: null,
          createdAt: serverTimestamp(),
          deleted: false,
          deletedAt: null,
          deletedBy: null,
        });
        criadas++;
      }
    }
    await lote.commit();
  }

  return { found: encontrados, created: criadas, updated: atualizadas };
}

/**
 * Busca as publicações das OABs monitoradas na janela sobreposta e grava o que veio.
 */
export async function syncDjenPublications(
  monitores: MonitorSet,
  user: UserProfile,
  options: { automatic?: boolean; hoje?: Date } = {}
): Promise<SyncResult> {
  const { start, end } = syncWindow(options.hoje ?? new Date());
  const startedAt = new Date();
  const totais = { lawyerCount: monitores.lawyers.length, partyCount: monitores.parties.length };

  if (monitorCount(monitores) === 0) {
    return { found: 0, created: 0, updated: 0, ...totais };
  }

  try {
    const parcial = await coletarJanela(monitores, start, end);
    const { found: encontrados, created: criadas, updated: atualizadas } = parcial;

    await registrarSync({
      status: "ok",
      windowStart: start,
      windowEnd: end,
      ...totais,
      found: encontrados,
      created: criadas,
      updated: atualizadas,
      startedAt,
      user,
      automatic: options.automatic ?? false,
    });

    return { found: encontrados, created: criadas, updated: atualizadas, ...totais };
  } catch (erro) {
    await registrarSync({
      status: "erro",
      windowStart: start,
      windowEnd: end,
      ...totais,
      found: 0,
      created: 0,
      updated: 0,
      startedAt,
      user,
      automatic: options.automatic ?? false,
      error: erro instanceof Error ? erro.message : String(erro),
    });
    throw erro;
  }
}

async function registrarSync(dados: {
  status: "ok" | "erro";
  windowStart: string;
  windowEnd: string;
  lawyerCount: number;
  partyCount: number;
  found: number;
  created: number;
  updated: number;
  startedAt: Date;
  user: UserProfile;
  automatic: boolean;
  error?: string;
}): Promise<void> {
  try {
    await addDoc(collection(db, "publicationSyncs"), {
      source: "DJEN",
      windowStart: dados.windowStart,
      windowEnd: dados.windowEnd,
      status: dados.status,
      lawyerCount: dados.lawyerCount,
      partyCount: dados.partyCount,
      found: dados.found,
      created: dados.created,
      updated: dados.updated,
      error: dados.error ?? null,
      startedAt: dados.startedAt,
      finishedAt: serverTimestamp(),
      runBy: dados.user.name,
      runById: dados.user.id,
      automatic: dados.automatic,
    });
  } catch (erro) {
    // O log não pode derrubar a sincronização que já gravou as publicações.
    console.error("Não foi possível registrar a sincronização do DJEN:", erro);
  }
}

/** Intervalo mínimo entre duas execuções automáticas, em horas. */
const INTERVALO_AUTOMATICO_HORAS = 4;

/** Última execução registrada, para a tela e para decidir se roda de novo. */
export async function lastPublicationSync(): Promise<PublicationSync | null> {
  const snap = await getDocs(
    query(collection(db, "publicationSyncs"), orderBy("finishedAt", "desc"), limit(1))
  );
  const documento = snap.docs[0];
  return documento ? ({ id: documento.id, ...documento.data() } as PublicationSync) : null;
}

/**
 * Só dispara a busca automática se ninguém já tiver buscado há pouco — vários
 * usuários abrem o sistema de manhã e não faz sentido cada um repetir a coleta.
 */
export function shouldRunAutomaticSync(ultima: PublicationSync | null): boolean {
  if (!ultima || ultima.status !== "ok") return true;
  const quando = toDate(ultima.finishedAt);
  if (!quando) return true;
  return Date.now() - quando.getTime() > INTERVALO_AUTOMATICO_HORAS * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Carga histórica
// ---------------------------------------------------------------------------

/** Início do acervo: o escritório foi criado em setembro de 2025. */
export const HISTORY_START_DATE = "2025-09-01";

export type BackfillProgress = {
  /** Rótulo do mês em processamento, como "09/2025". */
  monthLabel: string;
  monthIndex: number;
  monthCount: number;
  found: number;
  created: number;
};

/** Fatia o período em meses civis, do mais antigo para o mais recente. */
export function monthWindows(start: string, end: string): { start: string; end: string }[] {
  const [anoInicio, mesInicio] = start.slice(0, 7).split("-").map(Number);
  const [anoFim, mesFim] = end.slice(0, 7).split("-").map(Number);
  if (!anoInicio || !mesInicio || !anoFim || !mesFim) return [];

  const janelas: { start: string; end: string }[] = [];
  let cursor = new Date(anoInicio, mesInicio - 1, 1);
  const limite = new Date(anoFim, mesFim - 1, 1);
  while (cursor <= limite) {
    const primeiro = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const ultimo = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    janelas.push({ start: isoDate(primeiro), end: isoDate(ultimo) });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return janelas;
}

/**
 * Traz todo o histórico do DJEN desde a criação do escritório, mês a mês.
 *
 * Vai mês a mês em vez de pedir o período inteiro de uma vez por dois motivos:
 * a paginação de uma OAB movimentada estouraria o teto de páginas, e assim a
 * tela mostra progresso de verdade numa operação que leva minutos. Como a
 * gravação é idempotente, interromper e recomeçar não duplica nem apaga nada.
 */
export async function backfillDjenPublications(
  monitores: MonitorSet,
  user: UserProfile,
  options: {
    start?: string;
    hoje?: Date;
    onProgress?: (progresso: BackfillProgress) => void;
    shouldStop?: () => boolean;
  } = {}
): Promise<SyncResult> {
  const totais = { lawyerCount: monitores.lawyers.length, partyCount: monitores.parties.length };
  if (monitorCount(monitores) === 0) {
    return { found: 0, created: 0, updated: 0, ...totais };
  }

  const inicio = options.start ?? HISTORY_START_DATE;
  const fim = isoDate(options.hoje ?? new Date());
  const janelas = monthWindows(inicio, fim);
  const startedAt = new Date();

  let encontrados = 0;
  let criadas = 0;
  let atualizadas = 0;

  try {
    for (let indice = 0; indice < janelas.length; indice++) {
      if (options.shouldStop?.()) break;
      const janela = janelas[indice];
      const parcial = await coletarJanela(monitores, janela.start, janela.end);
      encontrados += parcial.found;
      criadas += parcial.created;
      atualizadas += parcial.updated;
      options.onProgress?.({
        monthLabel: `${janela.start.slice(5, 7)}/${janela.start.slice(0, 4)}`,
        monthIndex: indice + 1,
        monthCount: janelas.length,
        found: encontrados,
        created: criadas,
      });
    }

    await registrarSync({
      status: "ok",
      windowStart: inicio,
      windowEnd: fim,
      ...totais,
      found: encontrados,
      created: criadas,
      updated: atualizadas,
      startedAt,
      user,
      automatic: false,
    });
    return { found: encontrados, created: criadas, updated: atualizadas, ...totais };
  } catch (erro) {
    await registrarSync({
      status: "erro",
      windowStart: inicio,
      windowEnd: fim,
      ...totais,
      found: encontrados,
      created: criadas,
      updated: atualizadas,
      startedAt,
      user,
      automatic: false,
      error: erro instanceof Error ? erro.message : String(erro),
    });
    throw erro;
  }
}
