

import type { Timestamp } from "firebase/firestore";

export type Client = {
  id: string;
  // Identificação Pessoal
  name: string;
  nationality?: string;
  maritalStatus?: string;
  profession?: string;
  // Documentos
  rg?: string;
  rgIssuer?: string;
  cpfCnpj?: string;
  type: 'Pessoa Física' | 'Pessoa Jurídica';
  // Contato
  email?: string;
  phone?: string;
  phone2?: string;
  // Endereço
  addressStreet?: string;
  addressNumber?: string;
  addressComplement?: string;
  addressDistrict?: string;
  addressCity?: string;
  addressState?: string;
  addressZipCode?: string;
  // Informações Jurídicas e Controle
  notes?: string;
  processIds?: string[];
  createdAt: string | Timestamp;
  createdBy: string;
  updatedAt: string | Timestamp;
  updatedBy: string;
};

export type Process = {
  id: string;
  processNumber: string;
  clientName: string;
  court: string;
  status: 'Ativo' | 'Arquivado' | 'Suspenso';
  lastUpdate: string;
};

export type Task = {
    id: string; // ID do andamento ou da tarefa
    clientId?: string;
    clientName?: string;
    title: string;
    description: string;
    responsible: string;
    status: 'Pendente' | 'Concluída' | 'Vencida';
    priority: 'Alta' | 'Média' | 'Baixa';
    dueDate?: string | Timestamp | null;
    createdAt: string | Timestamp;
    author: string;
    completedAt?: string | Timestamp | null;
    completedBy?: string | null;
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

export type ClientUpdate = {
    id: string;
    clientId?: string; // FK to Client
    clientName?: string; // Denormalized for easy display
    createdAt: string | Timestamp;
    description: string;
    type: 'Atendimento' | 'Tarefa' | 'Anotação';
    author: string;
    // Campos específicos para tarefas
    status?: 'Pendente' | 'Concluída';
    responsible?: string; // Nome do usuário ou 'Todos'
    completedAt?: string | Timestamp | null;
    completedBy?: string | null; // Nome do usuário que concluiu
    priority?: 'Alta' | 'Média' | 'Baixa';
    dueDate?: string | Timestamp | null;
}

export type User = {
    id: string;
    name: string;
    password?: string;
    createdAt: string | Timestamp;
}

    