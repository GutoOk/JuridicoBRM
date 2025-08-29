
"use client";

import React, { useState } from 'react';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, PlusCircle, Sparkles, Trash2, Loader2 } from "lucide-react";
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


export default function ProcessesPage() {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

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

  const handleDeleteProcess = async (processId: string, processNumber: string) => {
    setIsDeleting(true);
    try {
        await deleteProcess(processId);
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
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
                <CardTitle>Lista de Processos</CardTitle>
                <Button asChild className="bg-accent hover:bg-accent/90">
                    <Link href="/dashboard/processes/new">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Novo
                    </Link>
                </Button>
            </div>
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
                  <TableHead>
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                          <TableCell colSpan={6}><Skeleton className="h-10 w-full" /></TableCell>
                      </TableRow>
                  ))
                ) : processes.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                            Nenhum processo cadastrado.
                        </TableCell>
                    </TableRow>
                ) : (
                    processes.map((process) => (
                    <TableRow key={process.id}>
                        <TableCell className="font-medium">{process.processNumber}</TableCell>
                        <TableCell>{process.clientNames.join(', ')}</TableCell>
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
                        <TableCell>
                        <AlertDialog>
                            <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button aria-haspopup="true" size="icon" variant="ghost" disabled={isDeleting}>
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Toggle menu</span>
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuItem asChild>
                                <Link href={`/dashboard/processes/${process.id}`}>Ver Detalhes</Link>
                            </DropdownMenuItem>
                             <DropdownMenuItem asChild>
                                <Link href={`/dashboard/processes/${process.id}/edit`}>Editar</Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <AlertDialogTrigger asChild>
                                <DropdownMenuItem className="text-destructive">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Excluir Processo
                                </DropdownMenuItem>
                             </AlertDialogTrigger>
                            </DropdownMenuContent>
                            </DropdownMenu>
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

    