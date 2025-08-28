
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
import { MoreHorizontal, PlusCircle, CheckCircle2, CircleDot, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from '@/hooks/use-auth';
import { getAllTasks } from './actions';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import type { Task } from '@/lib/types';


export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showOthersTasks, setShowOthersTasks] = useState(false);

  useEffect(() => {
    const fetchTasks = async () => {
      setIsLoading(true);
      try {
        const fetchedTasks = await getAllTasks();
        setTasks(fetchedTasks);
      } catch (error) {
        console.error("Failed to fetch tasks:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTasks();
  }, []);

  const filteredTasks = useMemo(() => {
    if (!user) return [];
    if (showOthersTasks) return tasks;
    return tasks.filter(task => task.responsible === 'Todos' || task.responsible === user.name);
  }, [tasks, user, showOthersTasks]);

  const getPriorityBadgeClass = (priority?: 'Alta' | 'Média' | 'Baixa') => {
    switch (priority) {
      case 'Alta': return 'bg-red-500 text-white hover:bg-red-600';
      case 'Média': return 'bg-yellow-500 text-white hover:bg-yellow-600';
      case 'Baixa': return 'bg-blue-500 text-white hover:bg-blue-600';
      default: return 'bg-gray-500 text-white';
    }
  }

  const otherTasksCount = tasks.filter(task => task.responsible !== 'Todos' && task.responsible !== user?.name).length;

  return (
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
            <Button className="bg-accent hover:bg-accent/90">
                <PlusCircle className="mr-2 h-4 w-4" />
                Nova Tarefa
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
                <TableHead>Tarefa</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead><span className="sr-only">Ações</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : filteredTasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    {showOthersTasks ? "Nenhuma tarefa encontrada." : "Você não tem tarefas pendentes."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium max-w-sm truncate">{task.title}</TableCell>
                    <TableCell>
                        <Button variant="link" className="p-0 h-auto" asChild>
                             <Link href={`/dashboard/clients/${task.clientId}`}>{task.clientName}</Link>
                        </Button>
                    </TableCell>
                    <TableCell>{task.responsible}</TableCell>
                    <TableCell>
                      <Badge className={getPriorityBadgeClass(task.priority)}>{task.priority || 'Média'}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={task.status === 'Concluída' ? 'default' : 'secondary'}
                        className={task.status === 'Concluída' ? 'bg-green-600 text-white hover:bg-green-700' : ''}
                      >
                        {task.status === 'Concluída' ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <CircleDot className="mr-1 h-3 w-3" />}
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
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/clients/${task.clientId}`}>Ir para Cliente</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem>Ver Detalhes</DropdownMenuItem>
                          <DropdownMenuItem>Marcar como Concluída</DropdownMenuItem>
                          <DropdownMenuItem>Editar</DropdownMenuItem>
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
  );
}
