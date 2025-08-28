
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
import { MoreHorizontal, PlusCircle, CheckCircle2, CircleDot, Eye, EyeOff, CalendarIcon, ArrowUpDown, Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from '@/hooks/use-auth';
import { getAllTasks } from './actions';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import type { Task, Client } from '@/lib/types';
import { cn } from '@/lib/utils';
import { format, isPast, parseISO } from 'date-fns';

type SortableKeys = keyof Task | 'clientName';

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showOthersTasks, setShowOthersTasks] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' } | null>({ key: 'createdAt', direction: 'descending' });


  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const fetchedTasks = await getAllTasks();
      setTasks(fetchedTasks);
    } catch (error) => {
      console.error("Failed to fetch tasks:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) { // Only fetch if user is loaded
        fetchAllData();
    }
  }, [user]);

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
  }, [tasks, user, showOthersTasks, sortConfig]);


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


  const otherTasksCount = tasks.filter(task => task.responsible !== 'Todos' && task.responsible !== user?.name).length;

  return (
    <>
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Tarefas</h1>
        <div className="flex items-center gap-2">
            {otherTasksCount > 0 && (
                 <Button variant="outline" onClick={() => setShowOthersTasks(!showOthersTasks)}>
                    {showOthersTasks ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                    {showOthersTasks ? 'Ocultar' : 'Mostrar'} tarefas de outros ({otherTasksCount})
                </Button>
            )}
            <Button asChild className="bg-accent hover:bg-accent/90">
              <Link href="/dashboard/tasks/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                Nova Tarefa
              </Link>
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
                <TableHead className="w-[25%]">
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
                    <TableCell colSpan={6}><Skeleton className="h-10 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : filteredAndSortedTasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    {showOthersTasks ? "Nenhuma tarefa encontrada." : "Você não tem tarefas pendentes."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedTasks.map((task) => (
                  <React.Fragment key={task.id}>
                    <TableRow className="border-b-0">
                      <TableCell className="pb-1 pt-3">
                          {task.clientId ? (
                             <Button variant="link" className="p-0 h-auto font-medium" asChild>
                               <Link href={`/dashboard/clients/${task.clientId}`}>{task.clientName}</Link>
                            </Button>
                          ) : (
                            <div className="flex items-center">
                                <Pin className="mr-2 h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-muted-foreground">Tarefa Geral</span>
                            </div>
                          )}
                      </TableCell>
                      <TableCell className="pb-1 pt-3">{task.responsible}</TableCell>
                      <TableCell className="pb-1 pt-3">
                        <Badge className={getPriorityBadgeClass(task.priority)}>{task.priority || 'Média'}</Badge>
                      </TableCell>
                       <TableCell className="pb-1 pt-3">
                        {task.dueDate ? format(new Date(task.dueDate as string), 'dd/MM/yyyy') : 'N/A'}
                      </TableCell>
                      <TableCell className="pb-1 pt-3">
                        {getStatusBadge(task.status)}
                      </TableCell>
                      <TableCell className="pb-1 pt-3">
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
                            <DropdownMenuItem>Ver Detalhes</DropdownMenuItem>
                            <DropdownMenuItem>Marcar como Concluída</DropdownMenuItem>
                            <DropdownMenuItem>Editar</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell colSpan={6} className="pt-0 pb-3">
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.title}</p>
                        </TableCell>
                    </TableRow>
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
    </>
  );
}
