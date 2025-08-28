
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
  id: string;
  title: string;
  processNumber: string;
  dueDate: string;
  assignee: string;
  priority: 'Alta' | 'Média' | 'Baixa';
  status: 'Pendente' | 'Em Andamento' | 'Concluída';
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
    date: Date;
    description: string;
    type: 'Atendimento' | 'Tarefa' | 'Anotação';
    author: string;
}

export type User = {
    id: string;
    name: string;
    email: string;
    password?: string; // Password should not be sent to the client
    createdAt: string | Timestamp;
}
