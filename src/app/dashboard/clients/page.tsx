

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
import { PlusCircle, Trash2, Loader2, Edit, ArrowUpDown, Search, ShieldAlert } from "lucide-react";
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
import { Input } from '@/components/ui/input';

export default function ClientsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Client; direction: 'ascending' | 'descending' } | null>({ key: 'name', direction: 'ascending' });
  const [nameFilter, setNameFilter] = useState('');
  const [cpfCnpjFilter, setCpfCnpjFilter] = useState('');
  
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
  
  const filteredAndSortedClients = useMemo(() => {
    let filteredClients = [...clients];

    if (nameFilter) {
        filteredClients = filteredClients.filter(client => 
            client.name.toLowerCase().includes(nameFilter.toLowerCase())
        );
    }

    if (cpfCnpjFilter) {
        filteredClients = filteredClients.filter(client => 
            client.cpfCnpj?.toLowerCase().includes(cpfCnpjFilter.toLowerCase())
        );
    }
    
    if (sortConfig !== null) {
      filteredClients.sort((a, b) => {
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
    return filteredClients;
  }, [clients, sortConfig, nameFilter, cpfCnpjFilter]);

  const handleDeleteClient = async (clientId: string) => {
    if (!user) {
        toast({ title: "Usuário não autenticado.", variant: "destructive" });
        return;
    }
    setIsDeleting(true);
    try {
        await deleteClient(clientId, user.name);
        
        if (user.name === "Áttila") {
            toast({ title: "Cliente excluído com sucesso!" });
        } else {
            toast({ 
                title: "Tarefa de Exclusão Criada",
                description: "Uma tarefa foi criada para 'Áttila' para aprovar a exclusão do cliente."
            });
        }
        await fetchClients();

    } catch(error) {
        const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
        toast({ title: "Erro na solicitação de exclusão", description: errorMessage, variant: "destructive" });
    } finally {
        setIsDeleting(false);
        setClientToDelete(null);
    }
  };

  const getDialogContent = (client: Client | null) => {
    if (!client || !user) return null;

    if (user.name === "Áttila") {
        return {
            title: "Confirmar Exclusão",
            description: `Tem certeza que deseja excluir o cliente "${client.name}"? Esta ação não pode ser desfeita e irá remover permanentemente o cliente, seus andamentos e processos que ficarem sem clientes.`,
            actionText: "Confirmar Exclusão"
        }
    } else {
         return {
            title: "Solicitar Exclusão",
            description: `Você está solicitando a exclusão do cliente "${client.name}". Uma tarefa de alta prioridade será criada para 'Áttila' revisar e aprovar esta solicitação. Deseja continuar?`,
            actionText: "Criar Solicitação"
        }
    }
  }

  return (
    <AlertDialog>
    <div className="mx-auto w-full max-w-7xl">
      <Card>
        <CardHeader className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                    <CardTitle>Lista de Clientes</CardTitle>
                    <CardDescription>Visualize, filtre e gerencie todos os seus clientes.</CardDescription>
                </div>
                <Button asChild className="bg-accent hover:bg-accent/90">
                    <Link href="/dashboard/clients/new">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Novo Cliente
                    </Link>
                </Button>
            </div>
             <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative w-full sm:w-auto flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Filtrar por nome..."
                        className="pl-8 w-full"
                        value={nameFilter}
                        onChange={(e) => setNameFilter(e.target.value)}
                    />
                </div>
                <div className="relative w-full sm:w-auto flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Filtrar por CPF/CNPJ..."
                        className="pl-8 w-full"
                        value={cpfCnpjFilter}
                        onChange={(e) => setCpfCnpjFilter(e.target.value)}
                    />
                </div>
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
                <TableHead>Email Principal</TableHead>
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
              ) : filteredAndSortedClients.length === 0 ? (
                 <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">Nenhum cliente encontrado.</TableCell>
                </TableRow>
              ) : (
                filteredAndSortedClients.map((client) => {
                  const primaryPhone = client.phones?.find(p => p.isPrimary)?.number || client.phones?.[0]?.number;
                  const primaryEmail = client.emails?.find(e => e.isPrimary)?.address || client.emails?.[0]?.address;
                  const dialogContent = getDialogContent(client);
                  return (
                    <TableRow key={client.id}>
                        <TableCell className="font-medium">
                            <Link href={`/dashboard/clients/${client.id}`} className="hover:underline">
                                {client.name}
                            </Link>
                        </TableCell>
                        <TableCell>{primaryPhone || 'N/A'}</TableCell>
                        <TableCell>{client.cpfCnpj || 'N/A'}</TableCell>
                        <TableCell>
                            <Badge variant={client.type === 'Pessoa Jurídica' ? 'default' : 'secondary'}>
                            {client.type}
                            </Badge>
                        </TableCell>
                        <TableCell>{primaryEmail || 'N/A'}</TableCell>
                        <TableCell className="text-right">
                             <div className="flex justify-end items-center gap-2">
                                <Button variant="ghost" size="icon" asChild>
                                    <Link href={`/dashboard/clients/${client.id}/edit`}>
                                        <Edit className="h-4 w-4" />
                                        <span className="sr-only">Editar</span>
                                    </Link>
                                </Button>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={isDeleting} onClick={() => setClientToDelete(client)}>
                                        {isDeleting && clientToDelete?.id === client.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                        <span className="sr-only">Excluir</span>
                                    </Button>
                                </AlertDialogTrigger>
                            </div>
                        </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
           {clientToDelete && (
             <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                         {user?.name !== "Áttila" && <ShieldAlert className="h-6 w-6 text-amber-500" />}
                         {getDialogContent(clientToDelete)?.title}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {getDialogContent(clientToDelete)?.description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction 
                        onClick={() => handleDeleteClient(clientToDelete.id)} 
                        className={user?.name === "Áttila" ? "bg-destructive hover:bg-destructive/90" : ""} 
                        disabled={isDeleting}
                    >
                        {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {getDialogContent(clientToDelete)?.actionText}
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
