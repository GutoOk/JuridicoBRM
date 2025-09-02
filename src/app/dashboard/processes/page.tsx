

"use client";

import React, { useState, useMemo, useEffect } from 'react';
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
import { PlusCircle, Trash2, Loader2, Edit, Search, Eye, EyeOff, ArchiveRestore, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { getProcesses, softDeleteProcess, restoreProcess, permanentlyDeleteProcess } from "./actions";
import { format, parseISO } from "date-fns";
import { ptBR } from 'date-fns/locale';
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
} from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton';
import type { Process } from "@/lib/types";
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/use-auth';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';


export default function ProcessesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [processes, setProcesses] = useState<Process[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [processToAction, setProcessToAction] = useState<Process | null>(null);
  const [processNumberFilter, setProcessNumberFilter] = useState('');
  const [clientNameFilter, setClientNameFilter] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);

  const fetchProcesses = async () => {
    setIsLoading(true);
    try {
        const processList = await getProcesses();
        setProcesses(processList);
    } catch(error) {
         toast({ title: "Erro ao carregar processos", variant: "destructive" });
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProcesses();
  }, []);
  
  const filteredAndSortedProcesses = useMemo(() => {
    let filteredProcesses = showDeleted
      ? processes.filter(p => p.deleted)
      : processes.filter(p => !p.deleted);

    if (processNumberFilter) {
        filteredProcesses = filteredProcesses.filter(process => 
            process.processNumber.toLowerCase().includes(processNumberFilter.toLowerCase())
        );
    }
    
    if (clientNameFilter) {
        filteredProcesses = filteredProcesses.filter(process =>
            process.clientNames.join(', ').toLowerCase().includes(clientNameFilter.toLowerCase())
        );
    }
    
    filteredProcesses.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());

    return filteredProcesses;
  }, [processes, processNumberFilter, clientNameFilter, showDeleted]);


  const handleAction = async (action: 'soft-delete' | 'restore' | 'permanent-delete') => {
    if (!processToAction || !user) return;

    setIsActionLoading(true);
    try {
      let successMessage = "";
      switch (action) {
        case 'soft-delete':
          await softDeleteProcess(processToAction.id, user.name);
          successMessage = "Processo enviado para a lixeira.";
          break;
        case 'restore':
          await restoreProcess(processToAction.id);
          successMessage = "Processo restaurado com sucesso!";
          break;
        case 'permanent-delete':
          await permanentlyDeleteProcess(processToAction.id);
          successMessage = "Processo excluído permanentemente.";
          break;
      }
      toast({ title: successMessage });
      await fetchProcesses();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
      toast({ title: "Erro ao executar ação", description: errorMessage, variant: "destructive" });
    } finally {
      setIsActionLoading(false);
      setProcessToAction(null);
    }
  };

  const deletedCount = processes.filter(p => p.deleted).length;


  return (
    <AlertDialog>
      <div className="mx-auto w-full max-w-7xl">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <CardTitle>Lista de Processos</CardTitle>
                 <div className="flex items-center gap-2">
                    {user?.isAdmin && deletedCount > 0 && (
                        <Button variant="outline" onClick={() => setShowDeleted(!showDeleted)}>
                            {showDeleted ? <Eye className="mr-2 h-4 w-4" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            {showDeleted ? "Ver Ativos" : `Ver Lixeira (${deletedCount})`}
                        </Button>
                    )}
                    <Button asChild className="bg-accent hover:bg-accent/90">
                        <Link href="/dashboard/processes/new">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Novo
                        </Link>
                    </Button>
                </div>
            </div>
             <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative w-full sm:w-auto flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Filtrar por nº do processo..."
                        className="pl-8 w-full"
                        value={processNumberFilter}
                        onChange={(e) => setProcessNumberFilter(e.target.value)}
                    />
                </div>
                <div className="relative w-full sm:w-auto flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Filtrar por nome do cliente..."
                        className="pl-8 w-full"
                        value={clientNameFilter}
                        onChange={(e) => setClientNameFilter(e.target.value)}
                    />
                </div>
            </div>
            <Separator className="w-[750px] mx-auto" />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº do Processo</TableHead>
                  <TableHead>Cliente(s)</TableHead>
                  <TableHead>Vara</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Última Atualização</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                          <TableCell colSpan={6}><Skeleton className="h-10 w-full" /></TableCell>
                      </TableRow>
                  ))
                ) : filteredAndSortedProcesses.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                            Nenhum processo encontrado.
                        </TableCell>
                    </TableRow>
                ) : (
                    filteredAndSortedProcesses.map((process) => (
                    <TableRow key={process.id} className={cn(process.deleted && "bg-muted/50 text-muted-foreground")}>
                        <TableCell className="font-medium">
                            <Link href={`/dashboard/processes/${process.id}`} className="hover:underline">
                                {process.processNumber}
                            </Link>
                            {process.deleted && (
                                <div className="text-xs">
                                    Excluído por {process.deletedBy} em {format(parseISO(process.deletedAt as string), 'dd/MM/yy')}
                                </div>
                            )}
                        </TableCell>
                        <TableCell>
                            <div className="flex flex-col">
                                {process.clientIds.map((clientId, index) => (
                                    <Link key={clientId} href={`/dashboard/clients/${clientId}`} className="hover:underline">
                                        {process.clientNames[index]}
                                    </Link>
                                ))}
                            </div>
                        </TableCell>
                        <TableCell>{process.vara}</TableCell>
                        <TableCell>
                        <Badge variant={
                            process.status === 'Ativo' ? 'default' : 
                            process.status === 'Arquivado' ? 'secondary' :
                            process.status === 'Extinto' ? 'secondary' :
                             'destructive'
                            }
                            className={
                                process.status === 'Ativo' ? 'bg-green-600 text-white hover:bg-green-700' :
                                process.status === 'Arquivado' ? 'bg-gray-500 text-white hover:bg-gray-600' :
                                process.status === 'Extinto' ? 'bg-gray-500 text-white hover:bg-gray-600' : ''
                            }>
                            {process.status}
                        </Badge>
                        </TableCell>
                        <TableCell>{format(new Date(process.lastUpdate as string), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</TableCell>
                        <TableCell className="text-right">
                           <div className="flex justify-end items-center gap-2">
                               {showDeleted && user?.isAdmin ? (
                                   <>
                                        <Button variant="ghost" size="sm" onClick={() => handleAction('restore')} disabled={isActionLoading}>
                                            <ArchiveRestore className="mr-2 h-4 w-4" /> Restaurar
                                        </Button>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" size="sm" onClick={() => setProcessToAction(process)} disabled={isActionLoading}>
                                                Excluir Perm.
                                            </Button>
                                        </AlertDialogTrigger>
                                   </>
                               ) : (
                                   <>
                                        <Button variant="ghost" size="icon" asChild>
                                            <Link href={`/dashboard/processes/${process.id}/edit`}>
                                                <Edit className="h-4 w-4" />
                                                <span className="sr-only">Editar</span>
                                            </Link>
                                        </Button>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={isActionLoading} onClick={() => setProcessToAction(process)}>
                                                <Trash2 className="h-4 w-4" />
                                                <span className="sr-only">Excluir</span>
                                            </Button>
                                        </AlertDialogTrigger>
                                   </>
                               )}
                            </div>
                        </TableCell>
                    </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
             {processToAction && (
             <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                         <ShieldAlert className="h-6 w-6 text-amber-500" />
                         {showDeleted ? "Confirmar Exclusão Permanente" : "Confirmar Exclusão"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                         {showDeleted
                            ? `Tem certeza que deseja excluir permanentemente o processo "${processToAction.processNumber}"? Esta ação não pode ser desfeita e removerá todos os dados associados.`
                            : `Tem certeza que deseja enviar o processo "${processToAction.processNumber}" para a lixeira?`}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction 
                        onClick={() => handleAction(showDeleted ? 'permanent-delete' : 'soft-delete')} 
                        className="bg-destructive hover:bg-destructive/90" 
                        disabled={isActionLoading}
                    >
                        {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {showDeleted ? "Excluir Permanentemente" : "Sim, Enviar para Lixeira"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
           )}
          </CardContent>
        </Card>
      </div>
    </AlertDialog>
  );
}
