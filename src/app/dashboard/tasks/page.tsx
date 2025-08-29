

"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
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
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { PlusCircle, CheckCircle2, CircleDot, Eye, EyeOff, CalendarIcon, Pin, User, Trash2, Loader2, Edit, Users, Calendar, AlertTriangle, Flag, BadgeInfo, ArrowUpDown, Gavel, Link as LinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from '@/hooks/use-auth';
import { getAllTasks } from './actions';
import { getClients } from '../clients/actions';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import type { Task, Client } from '@/lib/types';
import { cn } from '@/lib/utils';
import { format, isPast, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { EditTaskDialog } from '@/components/edit-task-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { BulkTaskEditDialog } from '@/components/bulk-task-edit-dialog';
import { Separator } from '@/components/ui/separator';


type SortableKeys = keyof Task | 'clientName';

export default function TasksPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' } | null>({ key: 'createdAt', direction: 'descending' });
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isBulkEditDialogOpen, setIsBulkEditDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);


  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const [fetchedTasks, fetchedClients] = await Promise.all([
        getAllTasks(),
        getClients()
      ]);
      setTasks(fetchedTasks);
      setClients(fetchedClients);
      setSelectedTasks([]); // Reset selection on refresh
    } catch (error) {
      console.error("Failed to fetch data:", error);
       toast({ title: "Erro ao buscar dados", description: "Não foi possível carregar as tarefas e clientes.", variant: "destructive" });
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

    if (!showAllTasks) {
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
            if(dateA === 0) return 1; // Put tasks without due date at the end
            if(dateB === 0) return -1;
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
  }, [tasks, user, showAllTasks, showCompleted, sortConfig]);


  const requestSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };


  const getPriorityBadge = (priority?: 'Alta' | 'Média' | 'Baixa') => {
    switch (priority) {
      case 'Alta': return <Badge className={'bg-red-500 text-white hover:bg-red-600'}><Flag className="mr-1 h-3 w-3" />Alta</Badge>;
      case 'Média': return <Badge className={'bg-yellow-500 text-white hover:bg-yellow-600'}><AlertTriangle className="mr-1 h-3 w-3" />Média</Badge>;
      case 'Baixa': return <Badge className={'bg-blue-500 text-white hover:bg-blue-600'}><CircleDot className="mr-1 h-3 w-3" />Baixa</Badge>;
      default: return <Badge variant="secondary">Sem prioridade</Badge>;
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

  const handleSelectTask = (task: Task) => {
    setSelectedTasks(prev =>
      prev.some(t => t.id === task.id)
        ? prev.filter(t => t.id !== task.id)
        : [...prev, task]
    );
  };
  
  const completedTasksCount = tasks.filter(task => getTaskWithStatus(task).status === 'Concluída' && (showAllTasks || task.responsible === 'Todos' || task.responsible === user?.name)).length;

  const sortOptions: {key: SortableKeys, label: string, icon: React.ElementType}[] = [
    { key: 'clientName', label: 'Cliente', icon: Users },
    { key: 'responsible', label: 'Responsável', icon: User },
    { key: 'priority', label: 'Prioridade', icon: Flag },
    { key: 'dueDate', label: 'Prazo', icon: Calendar },
    { key: 'status', label: 'Status', icon: BadgeInfo },
  ];

  return (
    <>
    <div className="mx-auto w-full max-w-7xl">
      <Card>
        <CardHeader className="space-y-4">
           <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <CardTitle>Gerenciador de Tarefas</CardTitle>
                <Button asChild className="bg-accent hover:bg-accent/90">
                    <Link href="/dashboard/tasks/new">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Novo
                    </Link>
                </Button>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2">
                 <Button variant="ghost" onClick={() => setShowAllTasks(!showAllTasks)}>
                    {showAllTasks ? <User className="mr-2 h-4 w-4" /> : <Users className="mr-2 h-4 w-4" />}
                    {showAllTasks ? 'Apenas minhas tarefas' : 'Mostrar todas as tarefas'}
                </Button>
                {completedTasksCount > 0 && (
                    <Button variant="ghost" onClick={() => setShowCompleted(!showCompleted)}>
                        {showCompleted ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                        {showCompleted ? 'Ocultar concluídas' : `Mostrar concluídas (${completedTasksCount})`}
                    </Button>
                )}
                 <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost">
                            <ArrowUpDown className="mr-2 h-4 w-4" />
                            Ordenar
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuLabel>Campo de Ordenação</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuRadioGroup value={sortConfig?.key} onValueChange={(value) => requestSort(value as SortableKeys)}>
                        {sortOptions.map(option => (
                            <DropdownMenuRadioItem key={option.key} value={option.key}>
                                <option.icon className="mr-2 h-4 w-4" />
                                {option.label}
                            </DropdownMenuRadioItem>
                        ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
                {selectedTasks.length > 0 && (
                    <Button variant="ghost" onClick={() => setIsBulkEditDialogOpen(true)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Ações em Lote ({selectedTasks.length})
                    </Button>
                )}
            </div>
            <Separator className="w-[750px] mx-auto" />
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={3}><Skeleton className="h-20 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : filteredAndSortedTasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center">
                    {showCompleted ? "Nenhuma tarefa encontrada." : "Você não tem tarefas pendentes."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedTasks.map((task) => (
                  <TableRow key={task.id} data-state={selectedTasks.some(t => t.id === task.id) && "selected"}>
                     <TableCell className="w-[40px] pr-0 align-top">
                      <Checkbox
                        checked={selectedTasks.some(t => t.id === task.id)}
                        onCheckedChange={() => handleSelectTask(task)}
                        aria-label={`Selecionar tarefa ${task.title}`}
                      />
                    </TableCell>
                    <TableCell className="p-4 align-top">
                      <div className="flex items-center gap-2 flex-wrap">
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
                        {task.processId && task.processNumber && (
                           <Button variant="secondary" size="xs" className="h-6 px-2 text-xs" asChild>
                              <Link href={`/dashboard/processes/${task.processId}`}>
                                  <LinkIcon className="mr-1.5 h-3 w-3" />
                                  {task.processNumber}
                              </Link>
                           </Button>
                        )}
                      </div>
                       <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1 hover:text-foreground cursor-pointer" onClick={() => handleEditClick(task)}>{task.title}</p>
                      <div className="text-xs text-muted-foreground/80 flex items-center flex-wrap gap-x-3 gap-y-1 mt-2">
                            <div className="flex items-center gap-1.5">
                                <User className="h-3 w-3" />
                                <span>Por: {task.author} &bull; {format(new Date(task.createdAt as string), 'dd/MM/yy')}</span>
                            </div>
                            <Button variant="link" className="h-auto p-0 text-xs text-muted-foreground/80 hover:text-primary" onClick={() => handleEditClick(task)}>
                                <div className="flex items-center gap-1.5">
                                    <Users className="h-3 w-3" />
                                    <span>Responsável: <strong className="text-foreground/90">{task.responsible}</strong></span>
                                </div>
                            </Button>
                            <Button variant="link" className="h-auto p-0 text-xs" onClick={() => handleEditClick(task)}>
                                <div className="flex items-center gap-1.5">{getPriorityBadge(task.priority)}</div>
                            </Button>
                            <Button variant="link" className="h-auto p-0 text-xs text-muted-foreground/80 hover:text-primary" onClick={() => handleEditClick(task)}>
                                <div className="flex items-center gap-1.5">
                                    <Calendar className="h-3 w-3" />
                                    <span>Prazo: {task.dueDate ? format(new Date(task.dueDate as string), 'dd/MM/yyyy') : 'N/A'}</span>
                                </div>
                            </Button>
                            <Button variant="link" className="h-auto p-0 text-xs" onClick={() => handleEditClick(task)}>
                                <div className="flex items-center gap-1.5">{getStatusBadge(task.status)}</div>
                            </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
    {editingTask && (
        <EditTaskDialog
            key={editingTask.id}
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            task={editingTask}
            onTaskUpdated={fetchAllData}
        />
    )}
     {selectedTasks.length > 0 && user && (
        <BulkTaskEditDialog
            key={selectedTasks.map(t => t.id).join('-')}
            open={isBulkEditDialogOpen}
            onOpenChange={setIsBulkEditDialogOpen}
            tasks={selectedTasks}
            onTasksUpdated={fetchAllData}
            currentUser={user}
        />
    )}
    </>
  );
}

    