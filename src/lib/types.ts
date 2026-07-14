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
  processId?: string;
  processNumber?: string;
  createdAt?: Dateish;
  updateDate?: Dateish;
  description: string;
  type: "Atendimento" | "Tarefa" | "Anotação" | "Andamento Processual";
  author: string;
  authorId?: string;
  // Contato (type === "Atendimento")
  channel?: ContactChannel;
  result?: string;
  // Tarefa (type === "Tarefa")
  status?: "Pendente" | "Concluída" | "Vencida";
  responsible?: string;
  responsibleId?: string;
  completedAt?: Dateish;
  completedBy?: string | null;
  priority?: Priority;
  dueDate?: Dateish;
  // Soft delete
  deleted?: boolean;
  deletedAt?: Dateish;
  deletedBy?: string | null;
};

export type Task = Update;

// ---------------------------------------------------------------------------
// Processos (legado, mantido)
// ---------------------------------------------------------------------------

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
