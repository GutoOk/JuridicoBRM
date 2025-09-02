

import type { Timestamp } from "firebase/firestore";

export type Phone = {
  number: string;
  description: string;
  isPrimary: boolean;
};

export type Email = {
    address: string;
    description: string;
    isPrimary: boolean;
};

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

export type Client = {
  id: string;
  // Identificação Pessoal
  name: string;
  motherName?: string;
  nationality?: string;
  maritalStatus?: string;
  profession?: string;
  // Documentos
  rg?: string;
  rgIssuer?: string;
  cpfCnpj?: string;
  type: 'Pessoa Física' | 'Pessoa Jurídica';
  // Contato
  emails?: Email[];
  phones?: Phone[];
  addresses?: Address[];
  // Informações Jurídicas e Controle
  notes?: string;
  processIds?: string[];
  createdAt: string | Timestamp;
  createdBy: string;
  updatedAt: string | Timestamp;
  updatedBy: string;
  // Soft delete fields
  deleted?: boolean;
  deletedAt?: string | Timestamp | null;
  deletedBy?: string | null;
};

export type ClientGroup = {
    id: string;
    name: string;
    notes?: string;
    clientIds: string[];
    clientNames: string[]; // Denormalized for easy display
    createdAt: string | Timestamp;
    updatedAt: string | Timestamp;
    author: string;
    // Soft delete fields
    deleted?: boolean;
    deletedAt?: string | Timestamp | null;
    deletedBy?: string | null;
};

export type Process = {
  id: string;
  processNumber: string;
  clientIds: string[];
  mainClientId?: string; // FK to Client
  clientNames: string[]; // Denormalized for easy display
  actionType: string;
  classe?: string;
  assunto?: string;
  vara?: string;
  foro?: string;
  juiz?: string;
  instancia?: '1ª Instância' | '2ª Instância' | string;
  status: 'Ativo' | 'Arquivado' | 'Suspenso' | 'Extinto';
  polo: 'Ativo' | 'Passivo';
  parteContraria?: string;
  notes?: string;
  lastUpdate: string | Timestamp;
  createdAt: string | Timestamp;
  updatedAt: string | Timestamp;
  // Soft delete fields
  deleted?: boolean;
  deletedAt?: string | Timestamp | null;
  deletedBy?: string | null;
};

export type Task = Update & {
    title: string; // description from Update will be mapped to title
};


export type Communication = {
  id: string;
  type: 'Chamada' | 'Reunião' | 'Mensagem';
  date: string;
  responsible: string;
  clientName: string;
  processNumber: string;
  summary: string;
};

export type Update = {
    id: string;
    clientId?: string; // FK to Client
    clientName?: string; // Denormalized for easy display
    processId?: string; // FK to Process
    processNumber?: string; // Denormalized for easy display
    createdAt: string | Timestamp;
    description: string;
    type: 'Atendimento' | 'Tarefa' | 'Anotação' | 'Andamento Processual';
    author: string;
    // Campos específicos para tarefas
    status?: 'Pendente' | 'Concluída' | 'Vencida';
    responsible?: string; // Nome do usuário ou 'Todos'
    completedAt?: string | Timestamp | null;
    completedBy?: string | null; // Nome do usuário que concluiu
    priority?: 'Alta' | 'Média' | 'Baixa';
    dueDate?: string | Timestamp | null;
    // Soft delete fields
    deleted?: boolean;
    deletedAt?: string | Timestamp | null;
    deletedBy?: string | null;
}

export type User = {
    id: string;
    name: string;
    password?: string;
    imageUrl?: string;
    isAdmin?: boolean;
    createdAt: string | Timestamp;
}
