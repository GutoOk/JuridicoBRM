

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
import { PlusCircle, Trash2, Loader2, Edit, ArrowUpDown, Search, Eye, EyeOff, ArchiveRestore, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { getClients, softDeleteClient, restoreClient, permanentlyDeleteClient } from "@/app/dashboard/clients/actions";
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
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

export default function ClientsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [clientToAction, setClientToAction] = useState<Client | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Client; direction: 'ascending' | 'descending' } | null>({ key: 'name', direction: 'ascending' });
  const [nameFilter, setNameFilter] = useState('');
  const [cpfCnpjFilter, setCpfCnpjFilter] = useState('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  
  const fetchClients = async () => {
    setIsLoading(true);
    try {
        const clientList = await getClients();
        setClients(clientList);
        return clientList;
    } catch(error) {
         toast({ title: "Erro ao carregar clientes", variant: "destructive" });
         return [];
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
    let filteredClients: Client[];

    if (showDeleted) {
        if(user?.isAdmin) {
            filteredClients = clients.filter(c => c.deleted);
        } else {
            filteredClients = clients.filter(c => c.deleted && c.deletedBy === user?.name);
        }
    } else {
        filteredClients = clients.filter(c => !c.deleted);
    }

    if (nameFilter) {
        filteredClients = filteredClients.filter(client => 
            client.name.toLowerCase().includes(nameFilter.toLowerCase())
        );
    }

    if (cpfCnpjFilter) {
        filteredClients = filteredClients.filter(client => 
            client.cpfCnpj?.replace(/[^\d]/g, '').includes(cpfCnpjFilter.replace(/[^\d]/g, ''))
        );
    }

    if (phoneFilter) {
        const cleanPhoneFilter = phoneFilter.replace(/[^\d]/g, '');
        filteredClients = filteredClients.filter(client => 
            client.phones && client.phones.some(phone => phone.number.replace(/[^\d]/g, '').includes(cleanPhoneFilter))
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
  }, [clients, sortConfig, nameFilter, cpfCnpjFilter, phoneFilter, showDeleted, user]);

  const handleAction = async (action: 'soft-delete' | 'restore' | 'permanent-delete') => {
    if (!clientToAction || !user) return;
    
    setIsActionLoading(true);
    try {
        let successMessage = "";
        switch(action) {
            case 'soft-delete':
                await softDeleteClient(clientToAction.id, user.name);
                successMessage = "Cliente enviado para a lixeira.";
                break;
            case 'restore':
                await restoreClient(clientToAction.id);
                successMessage = "Cliente restaurado com sucesso!";
                break;
            case 'permanent-delete':
                await permanentlyDeleteClient(clientToAction.id);
                successMessage = "Cliente excluído permanentemente.";
                break;
        }
        toast({ title: successMessage });
        const updatedClients = await fetchClients();

        // If the last item in the trash was just deleted, switch back to active view
        const remainingDeleted = updatedClients.filter(c => c.deleted).length;
        if (showDeleted && remainingDeleted === 0) {
            setShowDeleted(false);
        }

    } catch(error) {
        const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
        toast({ title: "Erro ao executar ação", description: errorMessage, variant: "destructive" });
    } finally {
        setIsActionLoading(false);
        setClientToAction(null);
    }
  };

  const deletedCount = useMemo(() => {
    if (user?.isAdmin) {
        return clients.filter(c => c.deleted).length;
    }
    return clients.filter(c => c.deleted && c.deletedBy === user?.name).length;
  }, [clients, user]);

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
                <div className="flex items-center gap-2">
                    {deletedCount > 0 && (
                        <Button variant="outline" onClick={() => setShowDeleted(!showDeleted)}>
                            {showDeleted ? <Eye className="mr-2 h-4 w-4" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            {showDeleted ? "Ver Ativos" : `Ver Lixeira (${deletedCount})`}
                        </Button>
                    )}
                    <Button asChild className="bg-accent hover:bg-accent/90">
                        <Link href="/dashboard/clients/new">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Novo Cliente
                        </Link>
                    </Button>
                </div>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Filtrar por nome..."
                        className="pl-8 w-full"
                        value={nameFilter}
                        onChange={(e) => setNameFilter(e.target.value)}
                    />
                </div>
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Filtrar por CPF/CNPJ..."
                        className="pl-8 w-full"
                        value={cpfCnpjFilter}
                        onChange={(e) => setCpfCnpjFilter(e.target.value)}
                    />
                </div>
                 <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Filtrar por telefone..."
                        className="pl-8 w-full"
                        value={phoneFilter}
                        onChange={(e) => setPhoneFilter(e.target.value)}
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
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
             {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                        <TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell>
                    </TableRow>
                ))
              ) : filteredAndSortedClients.length === 0 ? (
                 <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">Nenhum cliente encontrado.</TableCell>
                </TableRow>
              ) : (
                filteredAndSortedClients.map((client) => {
                  const primaryPhone = client.phones?.find(p => p.isPrimary)?.number || client.phones?.[0]?.number;
                  return (
                    <TableRow key={client.id} className={cn(client.deleted && "bg-muted/50 text-muted-foreground")}>
                        <TableCell className="font-medium">
                            <Link href={`/dashboard/clients/${client.id}`} className="hover:underline">
                                {client.name}
                            </Link>
                             {client.deleted && (
                                <div className="text-xs">
                                    Excluído por {client.deletedBy} em {format(parseISO(client.deletedAt as string), 'dd/MM/yy')}
                                </div>
                            )}
                        </TableCell>
                        <TableCell>{primaryPhone || 'N/A'}</TableCell>
                        <TableCell>{client.cpfCnpj || 'N/A'}</TableCell>
                        <TableCell>
                            <Badge variant={client.type === 'Pessoa Jurídica' ? 'default' : 'secondary'}>
                            {client.type}
                            </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                             <div className="flex justify-end items-center gap-2">
                                {showDeleted ? (
                                    <>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="sm" onClick={() => setClientToAction(client)} disabled={isActionLoading}>
                                                <ArchiveRestore className="mr-2 h-4 w-4" /> Restaurar
                                            </Button>
                                        </AlertDialogTrigger>
                                        {user?.isAdmin && (
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="sm" onClick={() => setClientToAction(client)} disabled={isActionLoading}>
                                                    Excluir Perm.
                                                </Button>
                                            </AlertDialogTrigger>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <Button variant="ghost" size="icon" asChild>
                                            <Link href={`/dashboard/clients/${client.id}/edit`}>
                                                <Edit className="h-4 w-4" />
                                                <span className="sr-only">Editar</span>
                                            </Link>
                                        </Button>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={isActionLoading} onClick={() => setClientToAction(client)}>
                                                <Trash2 className="h-4 w-4" />
                                                <span className="sr-only">Excluir</span>
                                            </Button>
                                        </AlertDialogTrigger>
                                    </>
                                )}
                            </div>
                        </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
           {clientToAction && (
             <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                         <ShieldAlert className="h-6 w-6 text-amber-500" />
                          {showDeleted
                            ? user?.isAdmin
                                ? "Confirmar Exclusão Permanente"
                                : "Confirmar Restauração"
                            : "Confirmar Exclusão"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                         {showDeleted
                            ? user?.isAdmin
                                ? `Tem certeza que deseja excluir permanentemente o cliente "${clientToAction.name}"? Esta ação não pode ser desfeita e removerá todos os dados associados.`
                                : `Tem certeza que deseja restaurar o cliente "${clientToAction.name}"?`
                            : `Tem certeza que deseja enviar o cliente "${clientToAction.name}" para a lixeira?`}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction 
                        onClick={() => handleAction(showDeleted ? (user?.isAdmin ? 'permanent-delete' : 'restore') : 'soft-delete')} 
                        className={cn( (showDeleted && !user?.isAdmin) || (!showDeleted && "bg-destructive hover:bg-destructive/90"))}
                        disabled={isActionLoading}
                    >
                        {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {showDeleted ? (user?.isAdmin ? 'Excluir Permanentemente' : 'Sim, Restaurar') : 'Sim, Enviar para Lixeira'}
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

    