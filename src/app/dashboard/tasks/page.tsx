

"use client";

import React, { useState, useEffect, useMemo } from 'react';
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
import { MoreHorizontal, PlusCircle, CheckCircle2, CircleDot, Eye, EyeOff, CalendarIcon, ArrowUpDown, Pin, User, Trash2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from '@/hooks/use-auth';
import { getAllTasks, deleteTasks } from './actions';
import { getClients } from '../clients/actions';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import type { Task, Client } from '@/lib/types';
import { cn } from '@/lib/utils';
import { format, isPast, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AddTaskDialog } from '@/components/add-task-dialog';
import { EditTaskDialog } from '@/components/edit-task-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

type SortableKeys = keyof Task | 'clientName';

export default function TasksPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showOthersTasks, setShowOthersTasks] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' } | null>({ key: 'createdAt', direction: 'descending' });
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);


  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const [fetchedTasks, fetchedClients] = await Promise.all([
        getAllTasks(),
        getClients()
      ]);
      setTasks(fetchedTasks);
      setClients(fetchedClients);
      setSelectedTaskIds([]); // Reset selection on refresh
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) { // Only fetch if user is loaded
        fetchAllData();
    }
  }, [user]);

  const handleEditClick = (task: Task) => {
    setEditingTask(task);
    setIsEditDialogOpen(true);
  };


  const getTaskWithStatus = (task: Task): Task => {
    if (task.status !== 'Concluída' && task.dueDate && isPast(new Date(task.dueDate as string))) {
      return { ...task, status: 'Vencida' };
    }
    return task;
  };
  
  const filteredAndSortedTasks = useMemo(() => {
    if (!user) return [];

    let filteredTasks = tasks.map(getTaskWithStatus);

    if (!showOthersTasks) {
        filteredTasks = filteredTasks.filter(task => task.responsible === 'Todos' || task.responsible === user.name);
    }
    
    if (!showCompleted) {
        filteredTasks = filteredTasks.filter(task => task.status !== 'Concluída');
    }
    
    if (sortConfig !== null) {
      filteredTasks.sort((a, b) => {
        const aValue = a[sortConfig.key as keyof Task];
        const bValue = b[sortConfig.key as keyof Task];

        // Handle date sorting for dueDate and createdAt
        if (sortConfig.key === 'dueDate' || sortConfig.key === 'createdAt') {
            const dateA = aValue ? parseISO(aValue as string).getTime() : 0;
            const dateB = bValue ? parseISO(bValue as string).getTime() : 0;
            if (dateA < dateB) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (dateA > dateB) return sortConfig.direction === 'ascending' ? 1 : -1;
            return 0;
        }
        
        // Handle undefined or null values
        if (aValue == null) return 1;
        if (bValue == null) return -1;

        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }

    return filteredTasks;
  }, [tasks, user, showOthersTasks, showCompleted, sortConfig]);


  const requestSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };


  const getPriorityBadgeClass = (priority?: 'Alta' | 'Média' | 'Baixa') => {
    switch (priority) {
      case 'Alta': return 'bg-red-500 text-white hover:bg-red-600';
      case 'Média': return 'bg-yellow-500 text-white hover:bg-yellow-600';
      case 'Baixa': return 'bg-blue-500 text-white hover:bg-blue-600';
      default: return 'bg-gray-500 text-white';
    }
  }

  const getStatusBadge = (status?: Task['status']) => {
    switch (status) {
        case 'Concluída':
            return (
                <Badge variant="default" className="bg-green-600 text-white hover:bg-green-700">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Concluída
                </Badge>
            );
        case 'Vencida':
            return (
                 <Badge variant="destructive">
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    Vencida
                </Badge>
            );
        case 'Pendente':
        default:
            return (
                <Badge variant="secondary">
                    <CircleDot className="mr-1 h-3 w-3" />
                    Pendente
                </Badge>
            );
    }
  }
  
  const renderSortIcon = (key: SortableKeys) => {
    if (sortConfig?.key !== key) {
        return <ArrowUpDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-50" />;
    }
    return sortConfig.direction === 'ascending' ? 
        <ArrowUpDown className="ml-2 h-4 w-4" /> : 
        <ArrowUpDown className="ml-2 h-4 w-4" />;
  };

  const handleSelectTask = (taskId: string) => {
    setSelectedTaskIds(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const handleSelectAllTasks = () => {
    if (selectedTaskIds.length === filteredAndSortedTasks.length) {
      setSelectedTaskIds([]);
    } else {
      setSelectedTaskIds(filteredAndSortedTasks.map(task => task.id));
    }
  };

  const handleDeleteSelectedTasks = async () => {
    setIsDeleting(true);
    try {
        const tasksToDelete = tasks.filter(task => selectedTaskIds.includes(task.id));
        await deleteTasks(tasksToDelete);
        toast({ title: "Tarefas Excluídas!", description: `${selectedTaskIds.length} tarefa(s) foram excluídas com sucesso.`});
        await fetchAllData(); // Refreshes the list and clears selection
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
        toast({ title: "Erro ao excluir", description: errorMessage, variant: "destructive" });
    } finally {
        setIsDeleting(false);
    }
  }


  const otherTasksCount = tasks.filter(task => task.responsible !== 'Todos' && task.responsible !== user?.name).length;
  const completedTasksCount = tasks.filter(task => getTaskWithStatus(task).status === 'Concluída' && (task.responsible === 'Todos' || task.responsible === user?.name)).length;

  return (
    <>
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Tarefas</h1>
            {selectedTaskIds.length > 0 && (
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                         <Button variant="destructive" size="sm" disabled={isDeleting}>
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Excluir ({selectedTaskIds.length})
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                        <AlertDialogDescription>
                            Você tem certeza que deseja excluir {selectedTaskIds.length} tarefa(s) selecionada(s)? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteSelectedTasks} className="bg-destructive hover:bg-destructive/90">
                            Excluir
                        </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </div>
        <div className="flex items-center gap-2">
            {otherTasksCount > 0 && (
                 <Button variant="outline" onClick={() => setShowOthersTasks(!showOthersTasks)}>
                    {showOthersTasks ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                    {showOthersTasks ? 'Ocultar' : 'Mostrar'} tarefas de outros ({otherTasksCount})
                </Button>
            )}
             {completedTasksCount > 0 && (
                <Button variant="outline" onClick={() => setShowCompleted(!showCompleted)}>
                    {showCompleted ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                    {showCompleted ? 'Ocultar' : 'Mostrar'} Concluídas ({completedTasksCount})
                </Button>
            )}
             <Button onClick={() => setIsAddDialogOpen(true)} className="bg-accent hover:bg-accent/90">
                <PlusCircle className="mr-2 h-4 w-4" />
                Adicionar Tarefa
            </Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Gerenciador de Tarefas</CardTitle>
          <CardDescription>Organize e priorize suas atividades e prazos de todos os clientes.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead padding="checkbox" className="w-[40px]">
                  <Checkbox
                    checked={selectedTaskIds.length > 0 && selectedTaskIds.length === filteredAndSortedTasks.length}
                    onCheckedChange={handleSelectAllTasks}
                    aria-label="Selecionar todas as tarefas"
                  />
                </TableHead>
                <TableHead className="w-[40%]">
                    <Button variant="ghost" onClick={() => requestSort('clientName')} className="p-0 h-auto group">
                        Cliente / Tarefa
                        {renderSortIcon('clientName')}
                    </Button>
                </TableHead>
                <TableHead>
                     <Button variant="ghost" onClick={() => requestSort('responsible')} className="p-0 h-auto group">
                        Responsável
                        {renderSortIcon('responsible')}
                    </Button>
                </TableHead>
                <TableHead>
                    <Button variant="ghost" onClick={() => requestSort('priority')} className="p-0 h-auto group">
                        Prioridade
                        {renderSortIcon('priority')}
                    </Button>
                </TableHead>
                <TableHead>
                     <Button variant="ghost" onClick={() => requestSort('dueDate')} className="p-0 h-auto group">
                        Prazo
                        {renderSortIcon('dueDate')}
                    </Button>
                </TableHead>
                <TableHead>
                     <Button variant="ghost" onClick={() => requestSort('status')} className="p-0 h-auto group">
                        Status
                        {renderSortIcon('status')}
                    </Button>
                </TableHead>
                <TableHead><span className="sr-only">Ações</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}><Skeleton className="h-10 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : filteredAndSortedTasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    {showCompleted ? "Nenhuma tarefa encontrada." : "Você não tem tarefas pendentes."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedTasks.map((task) => (
                  <TableRow key={task.id} data-state={selectedTaskIds.includes(task.id) && "selected"}>
                     <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedTaskIds.includes(task.id)}
                        onCheckedChange={() => handleSelectTask(task.id)}
                        aria-label={`Selecionar tarefa ${task.title}`}
                      />
                    </TableCell>
                    <TableCell>
                      {task.clientId ? (
                          <Button variant="link" className="p-0 h-auto font-medium text-base" asChild>
                            <Link href={`/dashboard/clients/${task.clientId}`}>{task.clientName}</Link>
                          </Button>
                      ) : (
                        <div className="flex items-center">
                            <Pin className="mr-2 h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-base text-muted-foreground">Tarefa Geral</span>
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{task.title}</p>
                      {task.author && task.createdAt && (
                        <div className="text-xs text-muted-foreground/80 flex items-center gap-1.5 mt-2">
                           <User className="h-3 w-3" />
                           <span>{task.author}</span>
                           <span>&bull;</span>
                           <span>{format(new Date(task.createdAt as string), 'dd/MM/yy \'às\' HH:mm')}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {task.responsible}
                    </TableCell>
                    <TableCell>
                      <Badge className={getPriorityBadgeClass(task.priority)}>{task.priority || 'Média'}</Badge>
                    </TableCell>
                    <TableCell>
                      {task.dueDate ? format(new Date(task.dueDate as string), 'dd/MM/yyyy') : 'N/A'}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(task.status)}
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
                          {task.clientId && (
                              <DropdownMenuItem asChild>
                              <Link href={`/dashboard/clients/${task.clientId}`}>Ir para Cliente</Link>
                              </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => handleEditClick(task)}>Editar</DropdownMenuItem>
                          <DropdownMenuItem>Marcar como Concluída</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
    <AddTaskDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        clients={clients}
        onTaskCreated={fetchAllData}
    />
    {editingTask && (
        <EditTaskDialog
            key={editingTask.id}
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            task={editingTask}
            onTaskUpdated={fetchAllData}
        />
    )}
    </>
  );
}
