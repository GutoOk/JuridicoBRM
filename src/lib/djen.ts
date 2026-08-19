/**
 * Cliente do DJEN (Diário de Justiça Eletrônico Nacional), a API nacional de
 * comunicações processuais do CNJ.
 *
 * A API é pública, não exige chave e responde com `Access-Control-Allow-Origin: *`,
 * então é consultada direto do navegador — sem backend próprio, como o resto do
 * sistema. Em compensação ela limita 20 requisições por minuto por IP, e por isso
 * o coletor espaça as chamadas e respeita o 429.
 */

const DJEN_ENDPOINT = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";

/** Teto de itens por página aceito com folga pela API. */
export const DJEN_PAGE_SIZE = 100;

/** Intervalo mínimo entre chamadas: 20/min é o limite publicado no header. */
const MIN_INTERVAL_MS = 3200;

/** Guarda contra laço infinito caso a paginação da API se comporte mal. */
const MAX_PAGES = 40;

/** Advogado devolvido dentro de `destinatarioadvogados`. */
type DjenAdvogado = {
  id?: number;
  nome?: string;
  numero_oab?: string;
  uf_oab?: string;
};

/** Item bruto da API, com os nomes de campo originais. */
export type DjenItem = {
  id: number;
  hash?: string;
  data_disponibilizacao?: string;
  siglaTribunal?: string;
  tipoComunicacao?: string;
  nomeOrgao?: string;
  texto?: string;
  numero_processo?: string;
  numeroprocessocommascara?: string;
  link?: string | null;
  tipoDocumento?: string;
  nomeClasse?: string;
  ativo?: boolean;
  status?: string;
  motivo_cancelamento?: string | null;
  data_cancelamento?: string | null;
  destinatarios?: { nome?: string; polo?: string }[];
  destinatarioadvogados?: { advogado?: DjenAdvogado }[];
};

type DjenResponse = {
  status?: string;
  message?: string;
  count?: number;
  items?: DjenItem[] | null;
};

export type DjenQuery = {
  numeroOab: string;
  ufOab: string;
  /** Datas em `YYYY-MM-DD`. */
  dataDisponibilizacaoInicio: string;
  dataDisponibilizacaoFim: string;
};

let lastCallAt = 0;

/** Segura a próxima chamada até fechar o intervalo mínimo entre requisições. */
async function respeitarLimite(): Promise<void> {
  const espera = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (espera > 0) await new Promise((resolve) => setTimeout(resolve, espera));
  lastCallAt = Date.now();
}

function buildUrl(query: DjenQuery, pagina: number): string {
  const params = new URLSearchParams({
    numeroOab: query.numeroOab,
    ufOab: query.ufOab,
    dataDisponibilizacaoInicio: query.dataDisponibilizacaoInicio,
    dataDisponibilizacaoFim: query.dataDisponibilizacaoFim,
    pagina: String(pagina),
    itensPorPagina: String(DJEN_PAGE_SIZE),
  });
  return `${DJEN_ENDPOINT}?${params.toString()}`;
}

/** Busca uma página, aguardando e repetindo uma vez quando a API responde 429. */
async function fetchPage(query: DjenQuery, pagina: number): Promise<DjenItem[]> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    await respeitarLimite();
    const response = await fetch(buildUrl(query, pagina), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (response.status === 429) {
      // Estourou a cota do minuto: espera a janela virar e tenta de novo.
      await new Promise((resolve) => setTimeout(resolve, 61_000));
      continue;
    }
    if (!response.ok) {
      throw new Error(`DJEN respondeu ${response.status} para a OAB ${query.numeroOab}/${query.ufOab}.`);
    }

    const data = (await response.json()) as DjenResponse;
    return data.items ?? [];
  }
  throw new Error("DJEN recusou as consultas por excesso de requisições. Tente novamente em alguns minutos.");
}

/**
 * Percorre todas as páginas da janela consultada para uma OAB.
 * Para quando a página vem incompleta, que é o fim natural do resultado.
 */
export async function fetchDjenComunicacoes(query: DjenQuery): Promise<DjenItem[]> {
  const itens: DjenItem[] = [];
  for (let pagina = 1; pagina <= MAX_PAGES; pagina++) {
    const pagina_itens = await fetchPage(query, pagina);
    itens.push(...pagina_itens);
    if (pagina_itens.length < DJEN_PAGE_SIZE) break;
  }
  return itens;
}

/** Endereço da certidão oficial da publicação, em PDF, gerada pelo próprio CNJ. */
export function djenCertidaoUrl(hash: string | undefined | null): string | null {
  const limpo = (hash ?? "").trim();
  return limpo ? `${DJEN_ENDPOINT}/${encodeURIComponent(limpo)}/certidao` : null;
}

// ---------------------------------------------------------------------------
// Limpeza do texto recebido do tribunal
// ---------------------------------------------------------------------------

/**
 * Marcação preservada na exibição. Tudo que não estiver aqui é desmontado e
 * substituído pelo próprio conteúdo, então nenhum script, iframe ou handler do
 * tribunal chega ao DOM da aplicação.
 */
const TAGS_PERMITIDAS = new Set([
  "P", "BR", "B", "STRONG", "I", "EM", "U", "SPAN", "DIV", "SECTION", "ARTICLE",
  "HEADER", "FOOTER", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "UL", "OL",
  "LI", "H1", "H2", "H3", "H4", "H5", "H6", "A", "SMALL", "SUP", "SUB", "HR",
]);

/** Elementos removidos junto com o conteúdo, por não serem texto de publicação. */
const TAGS_DESCARTADAS = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "FORM",
  "INPUT", "BUTTON", "SELECT", "TEXTAREA", "NOSCRIPT", "SVG", "BASE",
]);

const ATRIBUTOS_PERMITIDOS = new Set(["colspan", "rowspan", "align"]);

function limparElemento(el: Element): void {
  // Copia a lista porque a árvore muda enquanto os filhos são processados.
  for (const filho of Array.from(el.children)) {
    const tag = filho.tagName.toUpperCase();
    if (TAGS_DESCARTADAS.has(tag)) {
      filho.remove();
      continue;
    }
    limparElemento(filho);
    if (!TAGS_PERMITIDAS.has(tag)) {
      // Mantém o texto, joga fora a marcação desconhecida.
      filho.replaceWith(...Array.from(filho.childNodes));
      continue;
    }
    for (const atributo of Array.from(filho.attributes)) {
      const nome = atributo.name.toLowerCase();
      if (nome === "href" && tag === "A") {
        const valor = atributo.value.trim();
        if (/^https?:\/\//i.test(valor)) {
          filho.setAttribute("target", "_blank");
          filho.setAttribute("rel", "noopener noreferrer");
        } else {
          filho.removeAttribute("href");
        }
        continue;
      }
      if (!ATRIBUTOS_PERMITIDOS.has(nome)) filho.removeAttribute(atributo.name);
    }
  }
}

/**
 * Devolve o texto da publicação pronto para ser exibido, sem script, sem
 * handler `on*` e sem link que não seja http(s). O conteúdo vem de fora do
 * sistema, então nada dele é tratado como confiável.
 */
export function sanitizePublicationHtml(texto: string | undefined | null): string {
  const bruto = (texto ?? "").trim();
  if (!bruto) return "";
  if (typeof window === "undefined" || !("DOMParser" in window)) return "";
  const doc = new DOMParser().parseFromString(bruto, "text/html");
  limparElemento(doc.body);
  return doc.body.innerHTML;
}

/** Versão sem marcação do texto, usada na busca e no resumo da lista. */
export function publicationPlainText(texto: string | undefined | null): string {
  const bruto = (texto ?? "").trim();
  if (!bruto) return "";
  if (!bruto.includes("<")) return bruto.replace(/\s+/g, " ").trim();
  if (typeof window === "undefined" || !("DOMParser" in window)) {
    return bruto.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  const doc = new DOMParser().parseFromString(bruto, "text/html");
  // Sem isso, o conteúdo de um <script> ou <style> entraria no texto de busca.
  doc.body.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Formata a data de disponibilização (`YYYY-MM-DD`) sem passar por `Date`:
 * a conversão trataria a string como UTC e, no fuso do Brasil, exibiria o dia
 * anterior.
 */
export function formatDisponibilizacao(iso: string | undefined | null): string {
  // O cancelamento vem com hora ("2026-08-07T16:13:47"); só a data interessa.
  const partes = (iso ?? "").trim().slice(0, 10).split("-");
  if (partes.length !== 3) return "—";
  const [ano, mes, dia] = partes;
  if (ano.length !== 4 || mes.length !== 2 || dia.length !== 2) return "—";
  return `${dia}/${mes}/${ano}`;
}

/** Data de disponibilização em milissegundos, para ordenar junto dos andamentos. */
export function disponibilizacaoMillis(iso: string | undefined | null): number {
  const partes = (iso ?? "").trim().slice(0, 10).split("-").map(Number);
  if (partes.length !== 3 || partes.some((parte) => !parte)) return 0;
  const [ano, mes, dia] = partes;
  return new Date(ano, mes - 1, dia).getTime();
}
