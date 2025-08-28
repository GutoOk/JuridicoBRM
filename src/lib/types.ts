export type Client = {
  id: string;
  name: string;
  cpfCnpj: string;
  type: 'Pessoa Física' | 'Pessoa Jurídica';
  email: string;
  phone: string;
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
