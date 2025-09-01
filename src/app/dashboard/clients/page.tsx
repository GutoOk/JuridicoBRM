

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
import { PlusCircle, Trash2, Loader2, Edit, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { getClients, deleteClient } from "@/app/dashboard/clients/actions";
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
import type { Client } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/use-auth';

export default function ClientsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Client; direction: 'ascending' | 'descending' } | null>({ key: 'name', direction: 'ascending' });
  
  const fetchClients = async () => {
    setIsLoading(true);
    try {
        const clientList = await getClients();
        setClients(clientList);
    } catch(error) {
         toast({ title: "Erro ao carregar clientes", variant: "destructive" });
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const requestSort = (key: keyof Client) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const sortedClients = useMemo(() => {
    const sortableClients = [...clients];
    if (sortConfig !== null) {
      sortableClients.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;
        
        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableClients;
  }, [clients, sortConfig]);

  const handleDeleteClient = async (clientId: string) => {
    if (!user) {
        toast({ title: "Usuário não autenticado.", variant: "destructive" });
        return;
    }
    setIsDeleting(true);
    try {
        await deleteClient(clientId, user.name);
        toast({ title: "Cliente excluído com sucesso!" });
        await fetchClients();
    } catch(error) {
        const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
        toast({ title: "Erro ao excluir cliente", description: errorMessage, variant: "destructive" });
    } finally {
        setIsDeleting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl">
      <Card>
        <CardHeader className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <CardTitle>Lista de Clientes</CardTitle>
                <Button asChild className="bg-accent hover:bg-accent/90">
                    <Link href="/dashboard/clients/new">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Novo
                    </Link>
                </Button>
            </div>
            <Separator className="w-[750px] mx-auto" />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                   <Button variant="ghost" onClick={() => requestSort('name')} className="px-0">
                    Nome
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>Telefone Principal</TableHead>
                <TableHead>CPF/CNPJ</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Email</TableHead>
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
              ) : sortedClients.length === 0 ? (
                 <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">Nenhum cliente cadastrado.</TableCell>
                </TableRow>
              ) : (
                sortedClients.map((client) => {
                  const primaryPhone = client.phones?.find(p => p.isPrimary)?.number || client.phones?.[0]?.number;
                  return (
                    <TableRow key={client.id}>
                        <TableCell className="font-medium">
                            <Link href={`/dashboard/clients/${client.id}`} className="hover:underline">
                                {client.name}
                            </Link>
                        </TableCell>
                        <TableCell>{primaryPhone}</TableCell>
                        <TableCell>{client.cpfCnpj}</TableCell>
                        <TableCell>
                            <Badge variant={client.type === 'Pessoa Jurídica' ? 'default' : 'secondary'}>
                            {client.type}
                            </Badge>
                        </TableCell>
                        <TableCell>{client.email}</TableCell>
                        <TableCell className="text-right">
                             <div className="flex justify-end items-center gap-2">
                                <Button variant="ghost" size="icon" asChild>
                                    <Link href={`/dashboard/clients/${client.id}/edit`}>
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
                                                Tem certeza que deseja excluir o cliente "{client.name}"? Esta ação não pode ser desfeita e irá remover permanentemente o cliente, seus andamentos e processos que ficarem sem clientes.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleDeleteClient(client.id)} className="bg-destructive hover:bg-destructive/90" disabled={isDeleting}>
                                                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                Confirmar Exclusão
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
