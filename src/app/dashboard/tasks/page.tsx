

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
} from "@/components/ui/alert-dialog";
import { PlusCircle, CheckCircle2, CircleDot, Eye, EyeOff, CalendarIcon, Pin, User, Trash2, Loader2, Edit, Users, Calendar, AlertTriangle, Flag, BadgeInfo, ArrowUpDown, Gavel, Link as LinkIcon, ArchiveRestore, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from '@/hooks/use-auth';
import { getAllTasks, softDeleteTasks, restoreTask, permanentlyDeleteTask } from './actions';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import type { Task } from '@/lib/types';
import { cn } from '@/lib/utils';
import { format, isPast, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { BulkTaskEditDialog } from '@/components/bulk-task-edit-dialog';
import { Separator } from '@/components/ui/separator';


type SortableKeys = keyof Task | 'clientName';

export default function TasksPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' } | null>({ key: 'createdAt', direction: 'descending' });
  const [isBulkEditDialogOpen, setIsBulkEditDialogOpen] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<Task[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [taskToAction, setTaskToAction] = useState<Task | null>(null);


  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const fetchedTasks = await getAllTasks();
      setTasks(fetchedTasks);
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

  const handleAction = async (action: 'soft-delete' | 'restore' | 'permanent-delete') => {
    if (!taskToAction || !user) return;
    
    setIsActionLoading(true);
    try {
        let successMessage = "";
        switch(action) {
            case 'soft-delete':
                await softDeleteTasks([taskToAction], user.name);
                successMessage = "Tarefa enviada para a lixeira.";
                break;
            case 'restore':
                await restoreTask(taskToAction.id);
                successMessage = "Tarefa restaurada com sucesso!";
                break;
            case 'permanent-delete':
                await permanentlyDeleteTask(taskToAction.id);
                successMessage = "Tarefa excluída permanentemente.";
                break;
        }
        toast({ title: successMessage });
        await fetchAllData();

    } catch(error) {
        const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
        toast({ title: "Erro ao executar ação", description: errorMessage, variant: "destructive" });
    } finally {
        setIsActionLoading(false);
        setTaskToAction(null);
    }
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
    
    if(showDeleted) {
        if(user?.isAdmin) {
            filteredTasks = filteredTasks.filter(t => t.deleted);
        } else {
            filteredTasks = filteredTasks.filter(t => t.deleted && t.deletedBy === user.name);
        }
    } else {
        filteredTasks = filteredTasks.filter(t => !t.deleted);
    }


    if (!showAllTasks) {
        filteredTasks = filteredTasks.filter(task => task.responsible === 'Todos' || task.responsible === user.name);
    }
    
    if (!showCompleted && !showDeleted) {
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
  }, [tasks, user, showAllTasks, showCompleted, sortConfig, showDeleted]);


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
  
  const completedTasksCount = tasks.filter(task => !task.deleted && getTaskWithStatus(task).status === 'Concluída' && (showAllTasks || task.responsible === 'Todos' || task.responsible === user?.name)).length;
  const deletedCount = useMemo(() => {
    if (!user) return 0;
    if (user.isAdmin) {
        return tasks.filter(t => t.deleted).length;
    }
    return tasks.filter(t => t.deleted && t.deletedBy === user.name).length;
  }, [tasks, user]);


  const sortOptions: {key: SortableKeys, label: string, icon: React.ElementType}[] = [
    { key: 'clientName', label: 'Cliente', icon: Users },
    { key: 'responsible', label: 'Responsável', icon: User },
    { key: 'priority', label: 'Prioridade', icon: Flag },
    { key: 'dueDate', label: 'Prazo', icon: Calendar },
    { key: 'status', label: 'Status', icon: BadgeInfo },
  ];

  return (
    <>
    <AlertDialog>
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
                {completedTasksCount > 0 && !showDeleted && (
                    <Button variant="ghost" onClick={() => setShowCompleted(!showCompleted)}>
                        {showCompleted ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                        {showCompleted ? 'Ocultar concluídas' : `Mostrar concluídas (${completedTasksCount})`}
                    </Button>
                )}
                 {deletedCount > 0 && (
                    <Button variant="ghost" onClick={() => setShowDeleted(!showDeleted)}>
                        {showDeleted ? <Eye className="mr-2 h-4 w-4" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        {showDeleted ? 'Ver Ativas' : `Lixeira (${deletedCount})`}
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
                    {showCompleted || showDeleted ? "Nenhuma tarefa encontrada." : "Você não tem tarefas pendentes."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedTasks.map((task) => (
                  <TableRow key={task.id} data-state={selectedTasks.some(t => t.id === task.id) && "selected"} className={cn(task.deleted && "bg-muted/50 text-muted-foreground")}>
                     <TableCell className="w-[40px] pr-0 align-top">
                      <Checkbox
                        checked={selectedTasks.some(t => t.id === task.id)}
                        onCheckedChange={() => handleSelectTask(task)}
                        aria-label={`Selecionar tarefa ${task.title}`}
                      />
                    </TableCell>
                    <TableCell className="p-4 align-top">
                      <div className="flex items-center gap-2 flex-wrap">
                        {task.clientName ? (
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
                       <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{task.title}</p>
                      <div className="text-xs text-muted-foreground/80 flex items-center flex-wrap gap-x-3 gap-y-1 mt-2">
                            <div className="flex items-center gap-1.5">
                                <User className="h-3 w-3" />
                                <span>Por: {task.author} &bull; {format(new Date(task.createdAt as string), 'dd/MM/yy')}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Users className="h-3 w-3" />
                                <span>Responsável: <strong className="text-foreground/90">{task.responsible}</strong></span>
                            </div>
                            <div className="flex items-center gap-1.5">{getPriorityBadge(task.priority)}</div>
                             <div className="flex items-center gap-1.5">
                                <Calendar className="h-3 w-3" />
                                <span>Prazo: {task.dueDate ? format(new Date(task.dueDate as string), 'dd/MM/yyyy') : 'N/A'}</span>
                            </div>
                             <div className="flex items-center gap-1.5">{getStatusBadge(task.status)}</div>
                      </div>
                        {task.deleted && (
                            <div className="text-xs text-destructive mt-2">
                                Excluído por {task.deletedBy} em {format(parseISO(task.deletedAt as string), 'dd/MM/yy')}
                            </div>
                        )}
                    </TableCell>
                    <TableCell className="w-[80px] text-right align-top">
                        {showDeleted ? (
                            <div className="flex flex-col gap-1 items-end">
                                <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="sm" onClick={() => setTaskToAction(task)} disabled={isActionLoading}>
                                        <ArchiveRestore className="mr-2 h-4 w-4" /> Restaurar
                                    </Button>
                                </AlertDialogTrigger>
                                {user?.isAdmin && (
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" size="sm" onClick={() => setTaskToAction(task)} disabled={isActionLoading}>
                                            Excluir Perm.
                                        </Button>
                                    </AlertDialogTrigger>
                                )}
                            </div>
                        ) : (
                             <div className="flex flex-col gap-1 items-end">
                                <Button variant="outline" size="sm" asChild>
                                    <Link href={`/dashboard/tasks/${task.id}/edit`}>
                                        <Edit className="mr-2 h-4 w-4" />
                                        Editar
                                    </Link>
                                </Button>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={isActionLoading} onClick={() => setTaskToAction(task)}>
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Excluir
                                    </Button>
                                </AlertDialogTrigger>
                             </div>
                        )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
           {taskToAction && (
             <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                         <ShieldAlert className="h-6 w-6 text-amber-500" />
                          {showDeleted
                            ? user?.isAdmin
                                ? "Escolha a Ação"
                                : "Confirmar Restauração"
                            : "Confirmar Exclusão"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                         {showDeleted
                            ? user?.isAdmin
                                ? `O que deseja fazer com a tarefa "${taskToAction.title}"?`
                                : `Tem certeza que deseja restaurar a tarefa "${taskToAction.title}"?`
                            : `Tem certeza que deseja enviar a tarefa "${taskToAction.title}" para a lixeira?`}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    {showDeleted && user?.isAdmin ? (
                        <>
                           <AlertDialogAction onClick={() => handleAction('restore')} disabled={isActionLoading}>
                                {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Restaurar
                            </AlertDialogAction>
                            <AlertDialogAction onClick={() => handleAction('permanent-delete')} className="bg-destructive hover:bg-destructive/90" disabled={isActionLoading}>
                                {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Excluir Permanentemente
                            </AlertDialogAction>
                        </>
                    ) : (
                        <AlertDialogAction 
                            onClick={() => handleAction(showDeleted ? 'restore' : 'soft-delete')} 
                            className={cn(!showDeleted && "bg-destructive hover:bg-destructive/90")}
                            disabled={isActionLoading}
                        >
                            {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {showDeleted ? 'Sim, Restaurar' : 'Sim, Enviar para Lixeira'}
                        </AlertDialogAction>
                    )}
                </AlertDialogFooter>
            </AlertDialogContent>
           )}
        </CardContent>
      </Card>
    </div>
    </AlertDialog>
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



