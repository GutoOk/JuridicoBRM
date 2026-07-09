import { collection, doc, getDocs, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { ChecklistItemDef, CaseFieldDef } from "./types";

/**
 * Dados-padrão instalados uma única vez (tipos de cliente, checklist do
 * Barão de Mauá e mensagens padrão). Depois de instalados, tudo é editável
 * pelo administrador em Configurações.
 */

type ItemSeed = [
  id: string,
  name: string,
  requirement: "obrigatorio" | "recomendado" | "opcional",
  flags?: { blocking?: boolean; pend?: boolean; pinned?: boolean; key?: string; description?: string }
];

function buildItems(category: string, seeds: ItemSeed[]): ChecklistItemDef[] {
  return seeds.map(([id, name, requirement, flags]) => ({
    id,
    name,
    category,
    requirement,
    blocking: flags?.blocking ?? false,
    generatesPendency: flags?.pend ?? false,
    pinned: flags?.pinned ?? false,
    active: true,
    ...(flags?.key ? { key: flags.key } : {}),
    ...(flags?.description ? { description: flags.description } : {}),
  }));
}

const BM_CHECKLIST: ChecklistItemDef[] = [
  ...buildItems("Cadastro e contratação", [
    ["codigo", "Código interno do cliente", "obrigatorio", { pend: true }],
    ["nome_completo", "Nome completo", "obrigatorio", {}],
    ["cpf", "CPF/CNPJ", "obrigatorio", { pend: true }],
    ["telefone", "Telefone/WhatsApp", "obrigatorio", { pend: true, key: "telefone" }],
    ["email", "E-mail", "recomendado", {}],
    ["endereco", "Endereço", "recomendado", { pend: true }],
    ["cliente_confirmado", "Cliente confirmado", "obrigatorio", { blocking: true, pend: true, pinned: true }],
    ["contrato", "Contrato assinado", "obrigatorio", { pend: true, pinned: true, key: "contrato" }],
    ["procuracao", "Procuração assinada", "obrigatorio", { blocking: true, pend: true, pinned: true, key: "procuracao" }],
    ["termo_resp", "Termo de responsabilidade assinado", "obrigatorio", { pend: true, pinned: true, key: "termo_resp" }],
  ]),
  ...buildItems("Enquadramento / legitimidade", [
    ["ultimo_adq", "É último adquirente/proprietário?", "obrigatorio", { pend: true, pinned: true, key: "ultimo_adq" }],
    ["ultimo_adq_prova", "Prova da condição de último adquirente", "obrigatorio", { pend: true, key: "ultimo_adq_prova" }],
    ["termo_adesao", "Termo de adesão e compromisso", "recomendado", { pend: true }],
    ["termo_ocupacao", "Termo de ocupação antecipada", "opcional", {}],
    ["contrato_compra", "Contrato de compra/venda/cessão (se houver)", "opcional", {}],
    ["heranca", "Herança/inventário (se houver)", "opcional", {}],
    ["divorcio", "Divórcio/partilha (se houver)", "opcional", {}],
    ["doacao", "Doação (se houver)", "opcional", {}],
    ["obs_cadeia", "Observação sobre cadeia de aquisição", "recomendado", {}],
  ]),
  ...buildItems("Pagamentos e cálculo", [
    ["extrato", "Extrato resumo de pagamentos", "obrigatorio", { pend: true, pinned: true, key: "extrato" }],
    ["boletos_judiciais", "Boletos judiciais", "recomendado", { key: "boletos" }],
    ["boletos_construtora", "Boletos pagos à construtora/Policop ou equivalente", "recomendado", {}],
    ["depositos_judiciais", "Depósitos judiciais", "recomendado", {}],
    ["pagamentos_suficientes", "Pagamentos suficientes para cálculo", "obrigatorio", { pend: true, key: "pagamentos_suficientes" }],
    ["planilha", "Planilha de cálculo pronta", "obrigatorio", { pend: true, pinned: true, key: "planilha" }],
    ["estrategia_sem_extrato", "Caso sem extrato: estratégia de exibição/liquidação", "opcional", {}],
  ]),
  ...buildItems("Benfeitorias", [
    ["benf_houve", "Houve benfeitorias?", "recomendado", {}],
    ["benf_valor", "Valor aproximado informado", "opcional", {}],
    ["benf_provas", "Existem notas/recibos/comprovantes?", "opcional", {}],
    ["benf_incluir", "Incluir benfeitorias no pedido?", "opcional", {}],
    ["benf_pend_prova", "Benfeitorias pendentes de prova", "opcional", {}],
  ]),
  ...buildItems("Justiça gratuita", [
    ["jg_pedir", "Vai pedir justiça gratuita?", "recomendado", { key: "jg_pedir" }],
    ["jg_hipossuficiencia", "Declaração de hipossuficiência", "recomendado", { pend: true }],
    ["jg_renda", "Comprovante de renda", "recomendado", { pend: true }],
    ["jg_irpf", "IRPF ou justificativa de ausência", "recomendado", { pend: true }],
    ["jg_completa", "Justiça gratuita completa", "recomendado", { pend: true, pinned: true, key: "jg_completa" }],
    ["jg_pos_protocolo", "Justiça gratuita ficará para complemento pós-protocolo", "opcional", {}],
  ]),
  ...buildItems("Petição e protocolo", [
    ["dados_conferidos", "Dados conferidos", "obrigatorio", { pend: true }],
    ["docs_prontos", "Documentos prontos", "obrigatorio", { pend: true }],
    ["minuta_gerada", "Minuta inicial gerada", "obrigatorio", { pend: true, key: "minuta_gerada" }],
    ["minuta_revisada", "Minuta inicial revisada", "obrigatorio", { pend: true, pinned: true, key: "minuta_revisada" }],
    ["pronto_protocolo", "Pronto para protocolo", "obrigatorio", { key: "pronto_protocolo" }],
    ["protocolado", "Protocolado", "obrigatorio", { pinned: true, key: "protocolado" }],
  ]),
];

const BM_CASE_FIELDS: CaseFieldDef[] = [
  { id: "bloco", label: "Bloco", type: "text" },
  { id: "lote", label: "Lote", type: "text" },
  { id: "unidade", label: "Unidade/Apartamento", type: "text" },
  {
    id: "condicao_ultimo_adq",
    label: "Condição de último adquirente",
    type: "select",
    options: ["Comprador original", "Cessionário", "Herdeiro", "Ocupante", "Em dúvida", "Outro"],
  },
  { id: "fundamento", label: "Fundamento do enquadramento", type: "textarea" },
  { id: "numero_processo", label: "Número do processo", type: "text" },
  { id: "data_protocolo", label: "Data do protocolo", type: "date" },
  { id: "pendencias_pos", label: "Pendências pós-protocolo", type: "textarea" },
  { id: "obs_estrategicas", label: "Observações estratégicas", type: "textarea" },
];

const GSI_CHECKLIST: ChecklistItemDef[] = [
  ...buildItems("Cadastro e contratação", [
    ["codigo", "Código interno do cliente", "obrigatorio", { pend: true }],
    ["telefone", "Telefone/WhatsApp", "obrigatorio", { pend: true, key: "telefone" }],
    ["cliente_confirmado", "Cliente confirmado", "obrigatorio", { blocking: true, pend: true, pinned: true }],
    ["contrato", "Contrato assinado", "obrigatorio", { pend: true, pinned: true, key: "contrato" }],
    ["procuracao", "Procuração assinada", "obrigatorio", { blocking: true, pend: true, pinned: true, key: "procuracao" }],
  ]),
  ...buildItems("Contestação", [
    ["citacao", "Citação/intimação recebida", "obrigatorio", { pend: true }],
    ["prazo", "Prazo da contestação anotado", "obrigatorio", { blocking: true, pend: true, pinned: true }],
    ["docs_defesa", "Documentos de defesa reunidos", "obrigatorio", { pend: true }],
    ["minuta_gerada", "Minuta da contestação gerada", "obrigatorio", { pend: true, key: "minuta_gerada" }],
    ["minuta_revisada", "Minuta revisada", "obrigatorio", { pend: true, key: "minuta_revisada" }],
    ["protocolado", "Contestação protocolada", "obrigatorio", { pinned: true, key: "protocolado" }],
  ]),
];

const DEFAULT_TYPES = [
  {
    id: "pre-cliente",
    name: "Pré-cliente",
    color: "#64748b",
    description: "Contato inicial, ainda não fechou.",
    order: 1,
    checklist: [] as ChecklistItemDef[],
    caseFields: [] as CaseFieldDef[],
  },
  {
    id: "barao-de-maua",
    name: "Barão de Mauá",
    color: "#0d9488",
    description: "Ação do conjunto Barão de Mauá.",
    order: 2,
    checklist: BM_CHECKLIST,
    caseFields: BM_CASE_FIELDS,
  },
  {
    id: "contestacao-gsi",
    name: "Contestação GSI",
    color: "#7c3aed",
    description: "Defesas nas ações GSI.",
    order: 3,
    checklist: GSI_CHECKLIST,
    caseFields: [] as CaseFieldDef[],
  },
  {
    id: "cliente-antigo",
    name: "Cliente antigo (Aurélio)",
    color: "#b45309",
    description: "Base antiga do escritório.",
    order: 4,
    checklist: [] as ChecklistItemDef[],
    caseFields: [] as CaseFieldDef[],
  },
  {
    id: "arquivado",
    name: "Arquivado",
    color: "#9ca3af",
    description: "Casos encerrados ou desistentes.",
    order: 5,
    checklist: [] as ChecklistItemDef[],
    caseFields: [] as CaseFieldDef[],
  },
];

const DEFAULT_TEMPLATES = [
  {
    id: "docs-faltantes",
    title: "Pedir documentos faltantes",
    order: 1,
    body: "Olá, {{primeiro_nome}}! Aqui é do escritório. Para darmos andamento ao seu caso ({{codigo}}), ainda precisamos de:\n\n{{pendencias}}\n\nVocê consegue nos enviar por aqui mesmo? Qualquer dúvida, estamos à disposição.",
  },
  {
    id: "ultimo-adquirente",
    title: "Confirmar último adquirente",
    order: 2,
    body: "Olá, {{primeiro_nome}}! Para o seu processo do Barão de Mauá, precisamos confirmar: o imóvel está em seu nome como último comprador/adquirente? Houve venda, cessão, herança ou divórcio envolvendo o imóvel? Essa informação é essencial para o processo.",
  },
  {
    id: "extrato-pagamentos",
    title: "Pedir extrato de pagamentos",
    order: 3,
    body: "Olá, {{primeiro_nome}}! Precisamos do extrato/resumo de pagamentos do seu imóvel (parcelas pagas à construtora e/ou boletos judiciais) para preparar o cálculo do seu processo ({{codigo}}). Você tem esses comprovantes?",
  },
  {
    id: "assinatura-termo",
    title: "Pedir assinatura do termo",
    order: 4,
    body: "Olá, {{primeiro_nome}}! Falta apenas a assinatura do termo de responsabilidade para concluirmos sua contratação. Podemos combinar a assinatura? É rápido e pode ser feito no escritório ou por meio digital.",
  },
  {
    id: "justica-gratuita",
    title: "Pedir documentos para justiça gratuita",
    order: 5,
    body: "Olá, {{primeiro_nome}}! Para pedirmos a justiça gratuita no seu processo, precisamos de: comprovante de renda (holerite ou extrato), declaração de imposto de renda (ou informar que não declara). Consegue nos enviar?",
  },
];

/** Instala tipos e mensagens padrão. Não sobrescreve documentos existentes. */
export async function installDefaults(userName: string): Promise<{ types: number; templates: number }> {
  const batch = writeBatch(db);
  let types = 0;
  let templates = 0;

  const existingTypes = await getDocs(collection(db, "clientTypes"));
  const existingTypeIds = new Set(existingTypes.docs.map((d) => d.id));
  for (const t of DEFAULT_TYPES) {
    if (existingTypeIds.has(t.id)) continue;
    batch.set(doc(db, "clientTypes", t.id), {
      ...t,
      archived: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: userName,
    });
    types++;
  }

  const existingTpl = await getDocs(collection(db, "messageTemplates"));
  const existingTplIds = new Set(existingTpl.docs.map((d) => d.id));
  for (const t of DEFAULT_TEMPLATES) {
    if (existingTplIds.has(t.id)) continue;
    batch.set(doc(db, "messageTemplates", t.id), { ...t, updatedAt: serverTimestamp(), updatedBy: userName });
    templates++;
  }

  if (types || templates) await batch.commit();
  return { types, templates };
}
