"use client";

/**
 * IA (Firebase AI Logic / Gemini) — substitui os antigos flows Genkit.
 *
 * Roda direto no navegador via SDK do Firebase (`firebase/ai`), sem backend
 * próprio. Requer o Firebase AI Logic habilitado no projeto UMA vez:
 *   npx -y firebase-tools@latest init ailogic
 * (ou Console Firebase → AI Logic → Começar, com a Gemini Developer API).
 *
 * Funções:
 *  - extractClientText: texto solto → campos do cadastro de cliente
 *  - extractProcessText: texto solto (capa de processo) → campos do processo
 *  - summarizeTimeline: lista de andamentos → resumo curto
 */

import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from "firebase/ai";
import { app } from "./firebase";

/** Modelo usado em todo o sistema. Atualize aqui quando trocar de versão. */
const MODEL = "gemini-3.5-flash";

function makeModel(responseSchema?: Schema) {
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  return getGenerativeModel(ai, {
    model: MODEL,
    generationConfig: responseSchema
      ? { responseMimeType: "application/json", responseSchema, temperature: 0.1 }
      : { temperature: 0.3 },
  });
}

export type ExtractedClient = {
  name?: string;
  motherName?: string;
  nationality?: string;
  profession?: string;
  maritalStatus?: string;
  rg?: string;
  rgIssuer?: string;
  cpfCnpj?: string;
  personType?: "Pessoa Física" | "Pessoa Jurídica";
  email?: string;
  phone?: string;
  whatsapp?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  notes?: string;
};

/** Propriedades de cliente compartilhadas entre extração individual e em lote. */
function clientProperties() {
  return {
    name: Schema.string({ description: "Nome completo do cliente, capitalizado (João da Silva)." }),
    motherName: Schema.string({ description: "Nome da mãe (procure Filiação/Nome da Mãe)." }),
    nationality: Schema.string({ description: "Nacionalidade, ortografia corrigida." }),
    profession: Schema.string({ description: "Profissão, ortografia corrigida." }),
    maritalStatus: Schema.string({ description: "Estado civil." }),
    rg: Schema.string({ description: "Número do RG." }),
    rgIssuer: Schema.string({ description: "Órgão emissor do RG." }),
    cpfCnpj: Schema.string({ description: "CPF ou CNPJ." }),
    personType: Schema.enumString({
      enum: ["Pessoa Física", "Pessoa Jurídica"],
      description: "Inferido: CPF = Pessoa Física, CNPJ = Pessoa Jurídica.",
    }),
    email: Schema.string({ description: "E-mail." }),
    phone: Schema.string({ description: "Telefone principal (o primeiro, se houver vários)." }),
    whatsapp: Schema.string({ description: "Telefone com WhatsApp ou segundo telefone." }),
    addressLine: Schema.string({
      description: "Endereço em linha única: logradouro, número, complemento e bairro.",
    }),
    city: Schema.string({ description: "Cidade." }),
    state: Schema.string({ description: "UF com 2 letras." }),
    zipCode: Schema.string({ description: "CEP." }),
    notes: Schema.string({ description: "Observações gerais relevantes contidas no texto." }),
  };
}

const CLIENT_OPTIONAL = [
  "name", "motherName", "nationality", "profession", "maritalStatus", "rg", "rgIssuer",
  "cpfCnpj", "personType", "email", "phone", "whatsapp", "addressLine", "city", "state",
  "zipCode", "notes",
];

const clientSchema = Schema.object({
  properties: clientProperties(),
  optionalProperties: [...CLIENT_OPTIONAL],
});

export async function extractClientText(text: string): Promise<ExtractedClient> {
  const model = makeModel(clientSchema);
  const prompt = `Você é assistente de um escritório de advocacia. Extraia do texto abaixo os dados cadastrais do cliente e devolva no formato JSON pedido.
Regras: deixe ausente o que não estiver no texto; NÃO invente dados; não inclua rótulos ("CPF:", "Rua:") nos valores; nomes em maiúsculas devem virar capitalização normal.

Texto:
${text}`;
  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text()) as ExtractedClient;
}

// ---------------------------------------------------------------------------
// Importação em lote: texto/planilha colada → vários clientes
// ---------------------------------------------------------------------------

export type ExtractedClientRow = ExtractedClient & {
  /** Código interno (letra + 4 números, ex.: X9999), se presente no texto. */
  code?: string;
};

const clientsBatchSchema = Schema.array({
  items: Schema.object({
    properties: {
      code: Schema.string({
        description: "Código interno do cliente no padrão letra + 4 números (ex.: X9999), se houver.",
      }),
      ...clientProperties(),
    },
    optionalProperties: ["code", ...CLIENT_OPTIONAL],
  }),
});

/**
 * Recebe texto solto (linhas coladas de planilha, lista, texto corrido) que
 * pode conter dados de VÁRIOS clientes e devolve um array organizado —
 * um objeto por cliente identificado.
 */
export async function extractClientsBatchText(text: string): Promise<ExtractedClientRow[]> {
  const model = makeModel(clientsBatchSchema);
  const prompt = `Você é assistente de um escritório de advocacia. O texto abaixo veio de uma planilha ou lista e contém dados cadastrais de UM OU VÁRIOS clientes (uma linha por cliente, ou blocos de texto).
Organize e devolva um array JSON com um objeto por cliente identificado.

Regras:
1. NÃO invente dados: só inclua o que estiver no texto; deixe ausente o que faltar.
2. Não inclua rótulos ("CPF:", "Tel:") nos valores.
3. Nomes em maiúsculas viram capitalização normal (JOÃO DA SILVA → João da Silva).
4. Código interno: padrão de uma letra e quatro números (X9999). Colunas chamadas "código"/"cod" costumam trazer esse valor.
5. Se a primeira linha for cabeçalho de planilha, use-a para entender as colunas e não a devolva como cliente.
6. Telefones: primeiro em phone; segundo (ou o marcado como WhatsApp/zap) em whatsapp.
7. Não crie entradas para linhas vazias ou totalmente sem dados.

Texto:
${text}`;
  const result = await model.generateContent(prompt);
  const parsed = JSON.parse(result.response.text());
  return Array.isArray(parsed) ? (parsed as ExtractedClientRow[]) : [];
}

export type ExtractedProcess = {
  processNumber?: string;
  actionType?: string;
  classe?: string;
  assunto?: string;
  vara?: string;
  foro?: string;
  juiz?: string;
  instancia?: string;
  polo?: "Ativo" | "Passivo";
  parteContraria?: string;
};

const processSchema = Schema.object({
  properties: {
    processNumber: Schema.string({ description: 'Número do processo no formato "0000000-00.0000.0.00.0000".' }),
    actionType: Schema.string({ description: 'Tipo de ação. Se o texto tiver "Classe", use o valor dela aqui também.' }),
    classe: Schema.string({ description: "Classe processual." }),
    assunto: Schema.string({ description: "Assunto principal." }),
    vara: Schema.string({ description: "Vara (ex.: 4ª Vara Cível)." }),
    foro: Schema.string({ description: 'Foro ou comarca (campos "Foro" ou "Comarca").' }),
    juiz: Schema.string({ description: "Nome do juiz." }),
    instancia: Schema.string({ description: "Instância, se mencionada (1ª Instância / 2ª Instância)." }),
    polo: Schema.enumString({
      enum: ["Ativo", "Passivo"],
      description: "Polo do NOSSO cliente: Requerente/Autor/Exequente = Ativo; Requerido/Réu/Executado = Passivo.",
    }),
    parteContraria: Schema.string({
      description: 'Nome da parte contrária (procure Requerido(a), Executado(a), Réu/Ré).',
    }),
  },
  optionalProperties: [
    "processNumber", "actionType", "classe", "assunto", "vara", "foro", "juiz",
    "instancia", "polo", "parteContraria",
  ],
});

export async function extractProcessText(text: string): Promise<ExtractedProcess> {
  const model = makeModel(processSchema);
  const prompt = `Você é assistente jurídico especialista em capas de processo. Extraia do texto abaixo os dados do processo e devolva no formato JSON pedido.
Regras: deixe ausente o que não estiver no texto; NÃO invente dados; não inclua rótulos nos valores extraídos.

Texto:
${text}`;
  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text()) as ExtractedProcess;
}

/** Resume uma linha do tempo (contatos, anotações, andamentos) em poucos parágrafos. */
export async function summarizeTimeline(context: string, lines: string[]): Promise<string> {
  const model = makeModel();
  const prompt = `Você é assistente de um escritório de advocacia. Resuma o histórico abaixo (${context}) em português, em no máximo 3 parágrafos curtos: situação atual, o que ficou pendente e a próxima ação sugerida. Seja direto e factual.

Histórico (do mais recente para o mais antigo):
${lines.join("\n")}`;
  const result = await model.generateContent(prompt);
  return result.response.text();
}

/** Traduz erros da IA para mensagem útil em português. */
export function aiErrorMessage(err: unknown): string {
  const msg = String((err as Error)?.message ?? err ?? "");
  if (/permission|denied|not.*enabled|403|api.*key/i.test(msg)) {
    return "O Firebase AI Logic ainda não está habilitado neste projeto. Rode uma vez: npx firebase-tools init ailogic (ou habilite no Console do Firebase → AI Logic).";
  }
  if (/quota|429|resource.*exhausted|rate/i.test(msg)) {
    return "Limite de uso da IA atingido no momento. Aguarde alguns minutos e tente de novo.";
  }
  if (/network|fetch|failed to fetch/i.test(msg)) {
    return "Falha de conexão ao chamar a IA. Verifique a internet e tente novamente.";
  }
  return "A IA não conseguiu processar o texto. Tente novamente ou preencha manualmente.";
}
