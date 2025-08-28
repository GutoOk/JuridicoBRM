import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, PlusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Task } from "@/lib/types";

const mockTasks: Task[] = [
  { id: "1", title: "Elaborar contestação", processNumber: "0012345-67.2023.8.26.0001", dueDate: "2024-08-15", assignee: "Dr. Carlos", priority: "Alta", status: "Em Andamento" },
  { id: "2", title: "Agendar audiência de conciliação", processNumber: "0765432-10.2022.8.19.0001", dueDate: "2024-08-10", assignee: "Assistente Ana", priority: "Alta", status: "Pendente" },
  { id: "3", title: "Revisar petição inicial", processNumber: "9988776-65.2024.8.21.0001", dueDate: "2024-08-05", assignee: "Dr. Carlos", priority: "Média", status: "Pendente" },
  { id: "4", title: "Juntar documentos", processNumber: "0012345-67.2023.8.26.0001", dueDate: "2024-07-30", assignee: "Estagiário Bruno", priority: "Baixa", status: "Concluída" },
  { id: "5", title: "Preparar alegações finais", processNumber: "0765432-10.2022.8.19.0001", dueDate: "2024-09-01", assignee: "Dr. Carlos", priority: "Média", status: "Pendente" },
];

export default function TasksPage() {
  const getPriorityBadgeClass = (priority: 'Alta' | 'Média' | 'Baixa') => {
    switch (priority) {
      case 'Alta': return 'bg-red-500 text-white hover:bg-red-600';
      case 'Média': return 'bg-yellow-500 text-white hover:bg-yellow-600';
      case 'Baixa': return 'bg-blue-500 text-white hover:bg-blue-600';
      default: return 'bg-gray-500 text-white';
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Tarefas</h1>
        <Button className="bg-accent hover:bg-accent/90">
          <PlusCircle className="mr-2 h-4 w-4" />
          Nova Tarefa
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Gerenciador de Tarefas</CardTitle>
          <CardDescription>Organize e priorize suas atividades e prazos.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarefa</TableHead>
                <TableHead>Processo</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockTasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium">{task.title}</TableCell>
                  <TableCell>{task.processNumber}</TableCell>
                  <TableCell>{new Date(task.dueDate).toLocaleDateString()}</TableCell>
                  <TableCell>{task.assignee}</TableCell>
                  <TableCell>
                    <Badge className={getPriorityBadgeClass(task.priority)}>{task.priority}</Badge>
                  </TableCell>
                  <TableCell>
                     <Badge variant={task.status === 'Concluída' ? 'default' : 'secondary'}
                      className={task.status === 'Concluída' ? 'bg-green-600 text-white hover:bg-green-700' : task.status === 'Em Andamento' ? 'bg-primary text-primary-foreground' : ''}
                     >
                      {task.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button aria-haspopup="true" size="icon" variant="ghost">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Toggle menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Ações</DropdownMenuLabel>
                        <DropdownMenuItem>Ver Detalhes</DropdownMenuItem>
                        <DropdownMenuItem>Marcar como Concluída</DropdownMenuItem>
                        <DropdownMenuItem>Editar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
