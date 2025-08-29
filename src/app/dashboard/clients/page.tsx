
"use client";

import React, { useState, useEffect } from 'react';
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
import { MoreHorizontal, PlusCircle, Trash2, Loader2, Edit } from "lucide-react";
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

export default function ClientsPage() {
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  
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

  const handleDeleteClient = async (clientId: string) => {
    setIsDeleting(true);
    try {
        await deleteClient(clientId);
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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
        <Button asChild className="bg-accent hover:bg-accent/90">
          <Link href="/dashboard/clients/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            Adicionar Cliente
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Lista de Clientes</CardTitle>
          <CardDescription>Visualize e gerencie todos os seus clientes.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CPF/CNPJ</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefone</TableHead>
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
              ) : clients.length === 0 ? (
                 <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">Nenhum cliente cadastrado.</TableCell>
                </TableRow>
              ) : (
                clients.map((client) => (
                    <TableRow key={client.id}>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell>{client.cpfCnpj}</TableCell>
                    <TableCell>
                        <Badge variant={client.type === 'Pessoa Jurídica' ? 'default' : 'secondary'}>
                        {client.type}
                        </Badge>
                    </TableCell>
                    <TableCell>{client.email}</TableCell>
                    <TableCell>{client.phone}</TableCell>
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
                                        <Link href={`/dashboard/clients/${client.id}`}>Ver Detalhes</Link>
                                    </DropdownMenuItem>
                                     <DropdownMenuItem asChild>
                                        <Link href={`/dashboard/clients/${client.id}/edit`}>Editar</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <AlertDialogTrigger asChild>
                                        <DropdownMenuItem className="text-destructive">
                                             <Trash2 className="mr-2 h-4 w-4" />
                                            Excluir
                                        </DropdownMenuItem>
                                    </AlertDialogTrigger>
                                </DropdownMenuContent>
                            </DropdownMenu>
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
