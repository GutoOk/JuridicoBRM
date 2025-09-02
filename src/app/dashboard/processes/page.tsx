

"use client";

import React, { useState, useMemo } from 'react';
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
import { PlusCircle, Trash2, Loader2, Edit, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { getProcesses, deleteProcess } from "./actions";
import { format } from "date-fns";
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


export default function ProcessesPage() {
  const { user } = useAuth();
  const [processes, setProcesses] = useState<Process[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const [processNumberFilter, setProcessNumberFilter] = useState('');
  const [clientNameFilter, setClientNameFilter] = useState('');

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

  React.useEffect(() => {
    fetchProcesses();
  }, []);
  
  const filteredAndSortedProcesses = useMemo(() => {
    let filteredProcesses = [...processes];

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
    
    // Default sort by creation date desc if no other sort is set
    filteredProcesses.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());

    return filteredProcesses;
  }, [processes, processNumberFilter, clientNameFilter]);


  const handleDeleteProcess = async (processId: string, processNumber: string) => {
    if (!user) {
        toast({ title: "Usuário não autenticado.", variant: "destructive" });
        return;
    }
    setIsDeleting(true);
    try {
        await deleteProcess(processId, user.name);
        toast({ title: "Processo excluído com sucesso!" });
        await fetchProcesses();
    } catch(error) {
        const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
        toast({ title: "Erro ao excluir processo", description: errorMessage, variant: "destructive" });
    } finally {
        setIsDeleting(false);
    }
  };


  return (
    <>
      <div className="mx-auto w-full max-w-7xl">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <CardTitle>Lista de Processos</CardTitle>
                <Button asChild className="bg-accent hover:bg-accent/90">
                    <Link href="/dashboard/processes/new">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Novo
                    </Link>
                </Button>
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
                    <TableRow key={process.id}>
                        <TableCell className="font-medium">
                            <Link href={`/dashboard/processes/${process.id}`} className="hover:underline">
                                {process.processNumber}
                            </Link>
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
                                <Button variant="ghost" size="icon" asChild>
                                    <Link href={`/dashboard/processes/${process.id}/edit`}>
                                        <Edit className="h-4 w-4" />
                                        <span className="sr-only">Editar</span>
                                    </Link>
                                </Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={isDeleting}>
                                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                            <span className="sr-only">Excluir</span>
                                        </Button>
                                    </AlertDialogTrigger>
                                     <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Tem certeza que deseja excluir o processo "{process.processNumber}"? Esta ação não pode ser desfeita e irá remover permanentemente todos os andamentos vinculados.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleDeleteProcess(process.id, process.processNumber)} className="bg-destructive hover:bg-destructive/90" disabled={isDeleting}>
                                                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                Confirmar Exclusão
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
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
    </>
  );
}
