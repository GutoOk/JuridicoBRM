
"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PlusCircle, Trash2, Loader2, Users, FileText } from "lucide-react";
import Link from "next/link";
import { getClientGroups, deleteClientGroup } from "./actions";
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
import type { ClientGroup } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';

export default function ClientGroupsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [groups, setGroups] = useState<ClientGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const fetchGroups = async () => {
    setIsLoading(true);
    try {
        const groupList = await getClientGroups();
        setGroups(groupList);
    } catch(error) {
         toast({ title: "Erro ao carregar grupos", variant: "destructive" });
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleDelete = async (groupId: string) => {
    setIsDeleting(groupId);
    try {
        await deleteClientGroup(groupId);
        toast({ title: "Grupo excluído com sucesso!" });
        fetchGroups(); // Refresh the list
    } catch(error) {
        const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
        toast({ title: "Erro ao excluir grupo", description: errorMessage, variant: "destructive" });
    } finally {
        setIsDeleting(null);
    }
  };

  if (isLoading) {
    return (
        <div className="mx-auto w-full max-w-7xl">
             <div className="flex items-center justify-between mb-6">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-10 w-32" />
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                     <Skeleton key={i} className="h-48 w-full" />
                ))}
            </div>
        </div>
    )
  }

  return (
    <AlertDialog>
    <div className="mx-auto w-full max-w-7xl">
        <div className="flex items-center justify-between mb-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Grupos de Clientes</h1>
                <p className="text-muted-foreground">Organize seus clientes em grupos para facilitar o trabalho.</p>
            </div>
            <Button asChild className="bg-accent hover:bg-accent/90">
                <Link href="/dashboard/groups/new">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Novo Grupo
                </Link>
            </Button>
        </div>
        {groups.length === 0 ? (
             <Card className="text-center py-20">
                <CardHeader>
                    <CardTitle>Nenhum grupo encontrado</CardTitle>
                    <CardDescription>Crie seu primeiro grupo de clientes para começar.</CardDescription>
                </CardHeader>
                 <CardContent>
                    <Button asChild>
                         <Link href="/dashboard/groups/new">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Criar Grupo
                        </Link>
                    </Button>
                </CardContent>
            </Card>
        ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {groups.map((group) => (
                <Card key={group.id} className="flex flex-col">
                    <CardHeader className="flex-1">
                        <CardTitle>{group.name}</CardTitle>
                        <CardDescription className="flex items-center gap-4 pt-1">
                           <span className="flex items-center gap-1.5"> <Users className="h-4 w-4" /> {group.clientIds.length} cliente(s)</span>
                           <span className="flex items-center gap-1.5"> <FileText className="h-4 w-4" /> {group.notes ? "Com anotações" : "Sem anotações"}</span>
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-end gap-2">
                         <AlertDialogTrigger asChild>
                             <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={isDeleting === group.id}>
                                 {isDeleting === group.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                             </Button>
                         </AlertDialogTrigger>
                         <Button asChild>
                            <Link href={`/dashboard/groups/${group.id}`}>Ver Grupo</Link>
                         </Button>
                         <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Tem certeza que deseja excluir o grupo "{group.name}"? Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(group.id)} className="bg-destructive hover:bg-destructive/90">
                                    Excluir
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </CardContent>
                </Card>
                ))}
            </div>
        )}
    </div>
    </AlertDialog>
  );
}
