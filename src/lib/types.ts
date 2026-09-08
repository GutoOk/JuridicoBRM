import type { Timestamp } from "firebase/firestore";

/** Datas podem vir como Timestamp (Firestore), string ISO (dados antigos) ou Date. */
export type Dateish = Timestamp | string | Date | null | undefined;

// ---------------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------------

export type Role = "admin" | "operator";

export type UserProfile = {
  id: string; // uid do Firebase Auth
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt?: Dateish;
  /** Itens de pendência exibidos na Operação, separados por tipo/operação. */
  operationPendingItemIds?: Record<string, string[]>;
  /** Textos pessoais que aceleram o preenchimento de um atendimento. */
  attendanceQuickTexts?: string[];
};

/** Documento antigo da coleção users (senha em texto puro) — apenas para limpeza. */
export type LegacyUser = {
  id: string;
  name?: string;
  password?: string;
  isAdmin?: boolean;
  email?: string;
  deleted?: boolean;
  deletedAt?: Dateish;
  deletedBy?: string | null;
  deletedById?: string | null;
};

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export type Phone = { number: string; description: string; isPrimary: boolean };
export type Email = { address?: string; description: string; isPrimary: boolean };
export type Address = {
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  description: string;
  isPrimary: boolean;
};

export const GENERAL_STATUSES = [
  "Pré-cliente",
  "Em contratação",
  "Ativo",
  "Concluído",
  "Arquivado",
] as const;
export type GeneralStatus = (typeof GENERAL_STATUSES)[number];

export const PRIORITIES = ["Alta", "Média", "Baixa"] as const;
export type Priority = (typeof PRIORITIES)[number];

export type Client = {
  id: string;
  name: string;
  nameLower?: string;
  /** Código interno do escritório: 1 letra + 4 números (ex.: X9999). */
  code?: string;
  cpfCnpj?: string;
  /** CPF/CNPJ só dígitos, para busca e deduplicação. */
  cpfCnpjDigits?: string;
  type: "Pessoa Física" | "Pessoa Jurídica";
  // Contato principal (canônico, novo)
  phone?: string;
  phoneDigits?: string;
  whatsapp?: string;
  whatsappDigits?: string;
  email?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  // Gestão operacional
  typeIds?: string[];
  /** Clientes exibidos como linhas aninhadas deste cliente principal. */
  nestedClientIds?: string[];
  /** Descrição livre do vínculo por cliente aninhado (ex.: filho, cônjuge). */
  nestedClientRelationships?: Record<string, string>;
  generalStatus?: string;
  responsibleId?: string;
  responsibleName?: string;
  priority?: Priority;
  origin?: string;
  nextAction?: string;
  lastContactAt?: Dateish;
  lastContactResult?: string;
  notes?: string;
  // Campos pessoais complementares
  motherName?: string;
  nationality?: string;
  maritalStatus?: string;
  profession?: string;
  rg?: string;
  rgIssuer?: string;
  // Legado (estruturas antigas preservadas)
  emails?: Email[];
  phones?: Phone[];
  addresses?: Address[];
  processIds?: string[];
  // Auditoria
  createdAt?: Dateish;
  createdBy?: string;
  updatedAt?: Dateish;
  updatedBy?: string;
  // Soft delete
  deleted?: boolean;
  deletedAt?: Dateish;
  deletedBy?: string | null;
  /** Auditoria de unificação; o documento permanece integralmente preservado. */
  mergedIntoClientId?: string;
  mergedIntoClientName?: string;
  mergedAt?: Dateish;
  mergedBy?: string;
  mergedFromClientIds?: string[];
};

// ---------------------------------------------------------------------------
// Tipos de cliente (operações) + checklist configurável
// ---------------------------------------------------------------------------

export const REQUIREMENTS = ["obrigatorio", "recomendado", "opcional"] as const;
export type Requirement = (typeof REQUIREMENTS)[number];

export type ChecklistItemDef = {
  id: string;
  name: string;
  description?: string;
  category: string;
  requirement: Requirement;
  /** Bloqueia avanço (protocolo) enquanto não estiver ok. */
  blocking: boolean;
  /** Gera pendência automática enquanto não estiver ok. */
  generatesPendency: boolean;
  /** Aparece como botão de filtro rápido na tela de Operação. */
  pinned?: boolean;
  active: boolean;
  /** Chave semântica usada pelas regras de prontidão (ex.: "procuracao"). */
  key?: string;
  /** Grupo visual configurável. `category` continua preservado como fallback legado. */
  groupId?: string;
  /** Respostas que podem ser escolhidas neste item. Ausente = todas as respostas. */
  allowedStatuses?: ItemStatus[];
  /** Soft delete da definição. A definição permanece para exibir fichas antigas. */
  deleted?: boolean;
  deletedAt?: Dateish;
  deletedBy?: string;
};

export type ChecklistGroupDef = {
  id: string;
  name: string;
  description?: string;
  order: number;
  deleted?: boolean;
  deletedAt?: Dateish;
  deletedBy?: string;
};

export type CaseFieldDef = {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "date";
  options?: string[];
  description?: string;
  placeholder?: string;
  required?: boolean;
  width?: "half" | "full";
  groupId?: string;
  /** Soft delete da definição; valores antigos continuam no `caseFile`. */
  deleted?: boolean;
  deletedAt?: Dateish;
  deletedBy?: string;
};

export type ClientType = {
  id: string;
  name: string;
  color: string; // hex
  description?: string;
  order: number;
  archived?: boolean;
  archivedAt?: Dateish;
  archivedBy?: string | null;
  /**
   * Quando preenchido, a operação é a pasta particular de um advogado: os
   * clientes dele ficam separados das filas da sociedade na Operação, sem
   * precisar de nenhuma regra nova de visibilidade.
   */
  privateOwnerUserId?: string | null;
  privateOwnerUserName?: string | null;
  checklist?: ChecklistItemDef[];
  checklistGroups?: ChecklistGroupDef[];
  caseFields?: CaseFieldDef[];
  createdAt?: Dateish;
  updatedAt?: Dateish;
};

// ---------------------------------------------------------------------------
// Ficha operacional por cliente × tipo (checklist preenchido + dados do caso)
// ---------------------------------------------------------------------------

export const ITEM_STATUSES = [
  "nao_verificado",
  "pendente",
  "solicitado",
  "recebido",
  "conferido",
  "nao_se_aplica",
  "problema",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export type ItemState = {
  status: ItemStatus;
  note?: string;
  updatedAt?: Dateish;
  updatedBy?: string;
};

export type CaseFile = {
  id: string; // `${clientId}_{typeId}`
  clientId: string;
  typeId: string;
  /**
   * Prontidão definida MANUALMENTE pela equipe (não é calculada):
   * A Redondo · B Protocolável c/ pendência · C Alto risco · D Não protocolar · P Protocolado.
   */
  grade?: "A" | "B" | "C" | "D" | "P" | null;
  items?: Record<string, ItemState>;
  fields?: Record<string, string>;
  /** Definições aposentadas que pertenciam a esta ficha antes de uma edição administrativa. */
  legacyItemIds?: string[];
  legacyFieldIds?: string[];
  /** Ocultação reversível por ficha; os estados/valores continuam armazenados. */
  hiddenLegacyItemIds?: string[];
  hiddenLegacyFieldIds?: string[];
  createdAt?: Dateish;
  updatedAt?: Dateish;
  updatedBy?: string;
};

// ---------------------------------------------------------------------------
// Andamentos / tarefas / contatos (coleção `updates`, compatível com o legado)
// ---------------------------------------------------------------------------

export const CONTACT_CHANNELS = ["Ligação", "WhatsApp", "E-mail", "Presencial", "Outro"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const CONTACT_RESULTS = [
  "Não atendeu",
  "Pediu prazo",
  "Vai enviar",
  "Enviou/informou",
  "Número inválido",
  "Desistiu",
  "Precisa retorno",
  "Outro",
] as const;
export type ContactResult = (typeof CONTACT_RESULTS)[number];

export type Update = {
  id: string;
  clientId?: string;
  clientName?: string;
  clientCode?: string;
  clientIds?: string[];
  clientNames?: string[];
  clientCodes?: string[];
  processId?: string;
  processNumber?: string;
  processIds?: string[];
  processNumbers?: string[];
  createdAt?: Dateish;
  updatedAt?: Dateish;
  updatedBy?: string;
  updateDate?: Dateish;
  description: string;
  type: "Atendimento" | "Tarefa" | "Anotação" | "Andamento Processual" | "Financeiro";
  author: string;
  authorId?: string;
  // Contato (type === "Atendimento")
  channel?: ContactChannel;
  result?: string;
  // Tarefa (type === "Tarefa")
  status?: "Pendente" | "Concluída" | "Vencida";
  responsible?: string;
  responsibleId?: string;
  responsibleNames?: string[];
  responsibleIds?: string[];
  completedAt?: Dateish;
  completedBy?: string | null;
  priority?: Priority;
  dueDate?: Dateish;
  /** Origem operacional especial da tarefa. Ausente significa tarefa comum. */
  taskKind?: "prazo";
  // Andamento específico vinculado a uma tarefa (type === "Anotação")
  taskId?: string;
  taskDescription?: string;
  /** Publicação do DJEN que originou a tarefa, quando houver. */
  publicationId?: string;
  // Pagamento financeiro (type === "Financeiro")
  financialAgreementId?: string;
  financialInstallmentId?: string;
  amountCents?: number;
  paidAt?: Dateish;
  receiptMethod?: ReceiptMethod;
  receiptMethodOther?: string;
  receiptAccountId?: string;
  receiptAccountName?: string;
  financialNote?: string;
  paymentKind?: "full" | "partial";
  settlesInstallment?: boolean;
  closesAgreement?: boolean;
  minimumWageRateIdAtPayment?: string;
  minimumWageCentsAtPayment?: number | null;
  requiredInstallmentAmountCents?: number;
  agreementTargetCentsAtPayment?: number;
  previousAgreementPaymentId?: string | null;
  // Soft delete
  deleted?: boolean;
  deletedAt?: Dateish;
  deletedBy?: string | null;
};

export type Task = Update;

// ---------------------------------------------------------------------------
// Financeiro
// ---------------------------------------------------------------------------

export const FINANCIAL_VALUE_BASES = [
  "half_minimum_wage",
  "minimum_wage",
  "one_and_half_minimum_wage",
  "custom",
] as const;
export type FinancialValueBasis = (typeof FINANCIAL_VALUE_BASES)[number];

export const FINANCIAL_PAYMENT_PLANS = ["upfront", "installments", "at_end", "custom"] as const;
export type FinancialPaymentPlan = (typeof FINANCIAL_PAYMENT_PLANS)[number];

export const RECEIPT_METHODS = [
  "cash",
  "pix",
  "bank_deposit",
  "card_machine",
  "other",
] as const;
export type ReceiptMethod = (typeof RECEIPT_METHODS)[number];

export type MinimumWage = {
  id: string;
  amountCents: number;
  effectiveFrom: Dateish;
  note?: string;
  createdAt?: Dateish;
  createdById: string;
  createdBy: string;
  updatedAt?: Dateish;
  updatedById?: string;
  updatedBy?: string;
  deleted?: boolean;
  deletedAt?: Dateish;
  deletedById?: string | null;
  deletedBy?: string | null;
};

export type ReceivingAccount = {
  id: string;
  name: string;
  note?: string;
  createdAt?: Dateish;
  createdById: string;
  createdBy: string;
  updatedAt?: Dateish;
  updatedById?: string;
  updatedBy?: string;
  deleted?: boolean;
  deletedAt?: Dateish;
  deletedById?: string | null;
  deletedBy?: string | null;
};

export type FinancialAgreement = {
  id: string;
  clientId: string;
  description?: string;
  agreementDate: Dateish;
  valueBasis: FinancialValueBasis;
  minimumWageMultiplier?: 0.5 | 1 | 1.5;
  baseMinimumWageRateId?: string;
  baseMinimumWageCents?: number;
  originalAmountCents: number;
  paymentPlan: FinancialPaymentPlan;
  installmentCount: number;
  installmentIds: string[];
  regularInstallmentAmountCents: number;
  finalInstallmentAmountCents: number;
  receivedAmountCents: number;
  activePaymentCount: number;
  settledInstallmentCount: number;
  /** Cursor legado mantido para compatibilidade; não autoriza a ordem de recebimento. */
  nextOpenSequence: number;
  lastPaymentId: string | null;
  customPaymentTerms?: string;
  correctionPolicy: "none" | "minimum_wage_at_closing_payment";
  note?: string;
  settled?: boolean;
  settledAt?: Dateish;
  settledByPaymentId?: string | null;
  settledTargetCents?: number | null;
  settledMinimumWageRateId?: string | null;
  settledMinimumWageCents?: number | null;
  createdAt?: Dateish;
  createdById: string;
  createdBy: string;
  updatedAt?: Dateish;
  updatedById?: string;
  updatedBy?: string;
  deleted?: boolean;
  deletedAt?: Dateish;
  deletedById?: string | null;
  deletedBy?: string | null;
};

export type FinancialInstallment = {
  id: string;
  agreementId: string;
  clientId: string;
  sequence: number;
  installmentCount: number;
  dueDate?: Dateish;
  baseAmountCents: number;
  paidAmountCents: number;
  paymentIds: string[];
  settled: boolean;
  settledAt?: Dateish;
  settledByPaymentId?: string | null;
  settlementKind?: "full" | "partial_rolled" | null;
  createdAt?: Dateish;
  createdById: string;
  createdBy: string;
  updatedAt?: Dateish;
  updatedById?: string;
  updatedBy?: string;
  deleted?: boolean;
  deletedAt?: Dateish;
  deletedById?: string | null;
  deletedBy?: string | null;
};

// ---------------------------------------------------------------------------
// Processos (legado, mantido)
// ---------------------------------------------------------------------------

export const PROCESS_OWNERSHIPS = ["sociedade", "particular"] as const;
export type ProcessOwnership = (typeof PROCESS_OWNERSHIPS)[number];

/** Titularidade do processo, tolerando o cadastro antigo sem o campo. */
export function processOwnership(process: {
  ownership?: ProcessOwnership;
}): ProcessOwnership {
  return process.ownership ?? "sociedade";
}

export type Process = {
  id: string;
  processNumber: string;
  clientIds: string[];
  mainClientId?: string;
  clientNames: string[];
  actionType: string;
  classe?: string;
  assunto?: string;
  vara?: string;
  foro?: string;
  juiz?: string;
  instancia?: string;
  status: "Ativo" | "Arquivado" | "Suspenso" | "Extinto";
  /**
   * De quem é o processo: da sociedade ou particular de um advogado.
   *
   * Fica em campo próprio, e não como valor de `status`, porque titularidade e
   * andamento são coisas diferentes — um processo particular também pode ser
   * arquivado, suspenso ou extinto. Ausente equivale a `sociedade`.
   */
  ownership?: ProcessOwnership;
  /** Advogado dono, quando `ownership` é `particular`. */
  ownerUserId?: string | null;
  ownerUserName?: string | null;
  polo: "Ativo" | "Passivo";
  parteContraria?: string;
  notes?: string;
  lastUpdate?: Dateish;
  createdAt?: Dateish;
  updatedAt?: Dateish;
  deleted?: boolean;
  deletedAt?: Dateish;
  deletedBy?: string | null;
};

/** Natureza do gasto lançado no processo. */
export type ProcessCostKind = "Custas" | "Despesa" | "Honorários" | "Outro";

/**
 * Gasto vinculado a um processo: custas recolhidas, despesas e demais desembolsos.
 * Fica separado do módulo financeiro, que trata do que o cliente deve ao escritório.
 */
export type ProcessCost = {
  id: string;
  processId: string;
  processNumber: string;
  kind: ProcessCostKind;
  description: string;
  amountCents: number;
  costDate: Dateish;
  /** Quem desembolsou, para saber o que é reembolsável. */
  paidBy?: string;
  reimbursed?: boolean;
  notes?: string;
  createdAt?: Dateish;
  createdById: string;
  createdBy: string;
  updatedAt?: Dateish;
  updatedById?: string;
  updatedBy?: string;
  deleted: boolean;
  deletedAt?: Dateish;
  deletedById?: string | null;
  deletedBy?: string | null;
};

export type ClientGroup = {
  id: string;
  name: string;
  notes?: string;
  clientIds: string[];
  clientNames: string[];
  createdAt?: Dateish;
  updatedAt?: Dateish;
  author?: string;
  deleted?: boolean;
  deletedAt?: Dateish;
  deletedBy?: string | null;
};

// ---------------------------------------------------------------------------
// Modelos de mensagem
// ---------------------------------------------------------------------------

export type MessageTemplate = {
  id: string;
  title: string;
  body: string;
  order: number;
  updatedAt?: Dateish;
  updatedBy?: string;
  deleted?: boolean;
  deletedAt?: Dateish;
  deletedBy?: string | null;
};

// ---------------------------------------------------------------------------
// Modelos e documentos juridicos
// ---------------------------------------------------------------------------

export type LegalEntityKind = "template" | "document" | "quickPart";
export type LegalAlignment = "left" | "center" | "right" | "justify";
export type LegalPaperSize = "A4" | "LETTER";

export type LegalParagraphStyle = {
  id: string;
  name: string;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  alignment: LegalAlignment;
  spaceBefore: number;
  spaceAfter: number;
  lineHeight: number;
  leftIndent: number;
  rightIndent: number;
  firstLineIndent: number;
  custom?: boolean;
};

export type LegalStyleMap = Record<string, LegalParagraphStyle>;

export type LegalPageSettings = {
  paperSize: LegalPaperSize;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  /** Texto simples legado do cabeçalho, preservado como origem de migração e fallback. */
  headerText: string;
  /** Texto simples legado do rodapé, preservado como origem de migração e fallback. */
  footerText: string;
  showPageNumbers: boolean;
  /** Cabeçalho formatado editado na própria folha. Null enquanto o documento usa só o texto legado. */
  headerContent: LegalChromeContent | null;
  /** Rodapé formatado editado na própria folha. Null enquanto o documento usa só o texto legado. */
  footerContent: LegalChromeContent | null;
};

/** Documento reduzido usado no cabeçalho e no rodapé: parágrafos, texto formatado e campos de numeração. */
export type LegalChromeContent = {
  type: "doc";
  content: LegalChromeParagraph[];
};

export type LegalChromeParagraph = {
  type: "paragraph";
  attrs: { textAlign: LegalAlignment };
  content?: LegalChromeInline[];
};

export type LegalChromeInline =
  | { type: "text"; text: string; marks?: LegalChromeMark[] }
  | { type: "hardBreak" }
  | { type: "pageNumberField"; attrs: { fieldKind: LegalPageFieldKind } };

export type LegalChromeMark =
  | { type: "bold" | "italic" | "underline" }
  | { type: "textStyle"; attrs: { fontFamily?: string; fontSize?: string } };

export type LegalPageFieldKind = "current" | "total";

export type LegalTemplateFolder = {
  id: string;
  name: string;
  nameLower: string;
  createdAt?: Dateish;
  createdById: string;
  createdBy: string;
  updatedAt?: Dateish;
  updatedById: string;
  updatedBy: string;
  deleted: boolean;
  deletedAt?: Dateish;
  deletedById?: string | null;
  deletedBy?: string | null;
};

type LegalEditableEntityBase = {
  id: string;
  contentJson: string;
  plainText: string;
  stylesJson: string;
  pageSettingsJson: string;
  version: number;
  createdAt?: Dateish;
  createdById: string;
  createdBy: string;
  updatedAt?: Dateish;
  updatedById: string;
  updatedBy: string;
  deleted: boolean;
  deletedAt?: Dateish;
  deletedById?: string | null;
  deletedBy?: string | null;
};

export type LegalTemplate = LegalEditableEntityBase & {
  name: string;
  nameLower: string;
  folderId: string | null;
  duplicatedFromTemplateId: string | null;
};

export type LegalDocument = LegalEditableEntityBase & {
  name: string;
  nameLower: string;
  clientId: string;
  clientName: string;
  sourceTemplateId: string | null;
  sourceTemplateName: string;
  sourceTemplateVersion: number | null;
};

export type LegalQuickPart = LegalEditableEntityBase & {
  title: string;
  titleLower: string;
  searchText: string;
  duplicatedFromQuickPartId: string | null;
};

export type LegalVersion = {
  id: string;
  entityId: string;
  entityType: LegalEntityKind;
  version: number;
  name: string;
  contentJson: string;
  plainText: string;
  stylesJson: string;
  pageSettingsJson: string;
  reason: "initial" | "explicit" | "before_restore" | "restored";
  /** Rótulo livre que o usuário dá ao marco ("antes de enviar ao cliente"). */
  label?: string;
  /** Versão de origem quando `reason` é `restored`; null nos demais casos. */
  restoredFromVersion?: number | null;
  createdAt?: Dateish;
  createdById: string;
  createdBy: string;
  /** Exclusão lógica do marco. Ausente nos marcos criados antes do recurso. */
  deleted?: boolean;
  deletedAt?: Dateish;
  deletedById?: string | null;
  deletedBy?: string | null;
};

// ---------------------------------------------------------------------------
// Publicações judiciais (DJEN — Diário de Justiça Eletrônico Nacional)
// ---------------------------------------------------------------------------

/**
 * Advogado do escritório cuja OAB é monitorada no DJEN.
 *
 * Fica separado de `users` de propósito: advogado nem sempre é usuário do
 * sistema e usuário nem sempre tem inscrição na OAB.
 */
export type Lawyer = {
  id: string;
  name: string;
  /** Número da inscrição, somente dígitos — é assim que o DJEN consulta. */
  oabNumber: string;
  /** UF da seccional, em maiúsculas. */
  oabUf: string;
  /** Quando falso, a OAB continua cadastrada mas sai da busca diária. */
  monitored: boolean;
  notes?: string;
  createdAt?: Dateish;
  createdBy?: string;
  createdById?: string;
  updatedAt?: Dateish;
  updatedBy?: string;
  deleted: boolean;
  deletedAt?: Dateish;
  deletedBy?: string | null;
};

/**
 * Parte monitorada no DJEN pelo nome.
 *
 * Existe para capturar publicação de processo em que **nenhum advogado do
 * escritório está cadastrado** — caso comum quando a empresa é intimada
 * diretamente ou o processo ainda não tem procuração juntada.
 */
export type MonitoredParty = {
  id: string;
  /** Rótulo exibido nas telas. */
  name: string;
  /** Termo enviado ao DJEN; aceita nome parcial e ignora acento. */
  searchTerm: string;
  /** Cliente correspondente no sistema, quando já cadastrado. */
  clientId?: string | null;
  clientName?: string | null;
  monitored: boolean;
  notes?: string;
  createdAt?: Dateish;
  createdBy?: string;
  createdById?: string;
  updatedAt?: Dateish;
  updatedBy?: string;
  deleted: boolean;
  deletedAt?: Dateish;
  deletedBy?: string | null;
};

export const PUBLICATION_TRIAGE_STATUSES = [
  "nova",
  "em_analise",
  "tratada",
  "sem_providencia",
] as const;
export type PublicationTriageStatus = (typeof PUBLICATION_TRIAGE_STATUSES)[number];

export const PUBLICATION_TRIAGE_LABELS: Record<PublicationTriageStatus, string> = {
  nova: "Nova",
  em_analise: "Em análise",
  tratada: "Tratada",
  sem_providencia: "Sem providência",
};

export const PUBLICATION_CLASSIFICATIONS = [
  "fatal",
  "prazinho",
  "audiencia",
  "decisao_interlocutoria",
  "sentencas_acordaos",
  "diligencia",
  "mero_expediente",
] as const;
export type PublicationClassification = (typeof PUBLICATION_CLASSIFICATIONS)[number];

export const PUBLICATION_CLASSIFICATION_LABELS: Record<PublicationClassification, string> = {
  fatal: "Fatal",
  prazinho: "Prazinho",
  audiencia: "Audiência",
  decisao_interlocutoria: "Decisão interlocutória",
  sentencas_acordaos: "Sentenças e acórdãos",
  diligencia: "Diligência",
  mero_expediente: "Mero expediente",
};

export const PUBLICATION_LINK_STATUSES = ["pendente", "vinculada", "particular"] as const;
export type PublicationLinkStatus = (typeof PUBLICATION_LINK_STATUSES)[number];

export const PUBLICATION_LINK_LABELS: Record<PublicationLinkStatus, string> = {
  pendente: "Sem vínculo",
  vinculada: "Vinculada",
  particular: "Particular",
};

/**
 * Estado de vínculo da publicação, tolerando o formato antigo.
 *
 * As publicações capturadas antes do vínculo existir não têm o campo. Ler
 * `linkStatus` cru fazia `undefined !== "pendente"` valer verdadeiro e a tela
 * concluir que a publicação já estava resolvida, escondendo o cadastro do
 * processo. Toda leitura passa por aqui para as telas nunca discordarem.
 */
export function publicationLinkStatus(publication: Publication): PublicationLinkStatus {
  return publication.linkStatus ?? "pendente";
}

/**
 * Comunicação capturada no DJEN.
 *
 * O ID do documento é determinístico (`djen_{externalId}`), então reprocessar a
 * mesma janela de datas é idempotente e ainda atualiza a publicação que o
 * tribunal cancelou depois de divulgada.
 */
export type Publication = {
  id: string;
  source: "DJEN";
  /** `id` numérico da comunicação no DJEN, como string. */
  externalId: string;
  /** Hash usado para montar a certidão oficial em PDF. */
  hash?: string;
  tribunal?: string;
  orgao?: string;
  tipoComunicacao?: string;
  tipoDocumento?: string;
  nomeClasse?: string;
  /** Data de disponibilização no diário, em `YYYY-MM-DD` (ordenável). */
  disponibilizacaoDate: string;
  /** Número do processo somente com dígitos, para casar com `processes`. */
  numeroProcessoDigits?: string;
  numeroProcessoMascara?: string;
  /** Advogados monitorados do escritório encontrados nesta comunicação. */
  lawyerIds: string[];
  lawyerNames: string[];
  /** Partes monitoradas encontradas entre os destinatários da comunicação. */
  partyIds?: string[];
  partyNames?: string[];
  /** Partes destinatárias informadas pelo tribunal. */
  destinatarios?: string[];
  textoHtml?: string;
  /** Texto sem marcação, usado na busca da tela. */
  textoPlain?: string;
  linkInteiroTeor?: string | null;
  certidaoUrl?: string | null;
  /** O tribunal pode cancelar uma comunicação já divulgada. */
  cancelada?: boolean;
  motivoCancelamento?: string | null;
  dataCancelamento?: string | null;
  /**
   * Situação do vínculo com o acervo do escritório. `particular` marca processo
   * pessoal de um advogado, que não é da sociedade.
   */
  linkStatus: PublicationLinkStatus;
  processId?: string | null;
  /** Número do processo já cadastrado, com máscara. */
  processNumber?: string | null;
  clientIds?: string[];
  clientNames?: string[];
  /** Advogado responsável quando o processo é particular. */
  privateOwnerId?: string | null;
  privateOwnerName?: string | null;
  linkedAt?: Dateish;
  linkedBy?: string | null;
  triageStatus: PublicationTriageStatus;
  /** Natureza jurídica definida manualmente pela equipe durante a triagem. */
  classification?: PublicationClassification;
  triageNote?: string;
  triagedAt?: Dateish;
  triagedBy?: string | null;
  /** Tarefa cuja criação marcou esta publicação como tratada. */
  taskId?: string | null;
  /** JSON original devolvido pela API, preservado para auditoria. */
  raw?: string;
  createdAt?: Dateish;
  syncedAt?: Dateish;
  deleted: boolean;
  deletedAt?: Dateish;
  deletedBy?: string | null;
};

/** Registro de cada execução do coletor, para saber o que já foi buscado. */
export type PublicationSync = {
  id: string;
  source: "DJEN";
  /** Janela consultada, em `YYYY-MM-DD`. */
  windowStart: string;
  windowEnd: string;
  status: "ok" | "erro";
  /** Quantas OABs entraram nesta execução. */
  lawyerCount: number;
  /** Quantas partes monitoradas entraram nesta execução. */
  partyCount?: number;
  found: number;
  created: number;
  updated: number;
  error?: string | null;
  startedAt?: Dateish;
  finishedAt?: Dateish;
  runBy?: string;
  runById?: string;
  /** Falso quando a execução foi disparada pelo botão da tela. */
  automatic: boolean;
};

/**
 * Decisão de vínculo tomada uma vez por número de processo e reaproveitada.
 *
 * O ID do documento é o número do processo só com dígitos, então a decisão vale
 * para as publicações que já estão na lista e para as que o DJEN divulgar
 * depois — a equipe não remarca o mesmo processo a cada intimação.
 */
export type PublicationProcessRule = {
  id: string;
  numeroProcessoDigits: string;
  /** `escritorio`: processo da sociedade. `particular`: processo pessoal do advogado. */
  kind: "escritorio" | "particular";
  processId?: string | null;
  processNumber?: string | null;
  clientIds: string[];
  clientNames: string[];
  /** Administrador (advogado) dono do processo particular. */
  ownerUserId?: string | null;
  ownerUserName?: string | null;
  createdAt?: Dateish;
  createdBy?: string;
  updatedAt?: Dateish;
  updatedBy?: string;
};
