
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { PlusCircle, Trash2, Loader2, Users, FileText, Eye, EyeOff, ArchiveRestore, ShieldAlert, User, Calendar } from "lucide-react";
import Link from "next/link";
import { getClientGroups, softDeleteClientGroup, restoreClientGroup, permanentlyDeleteClientGroup } from "./actions";
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
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

export default function ClientGroupsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [groups, setGroups] = useState<ClientGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [groupToAction, setGroupToAction] = useState<ClientGroup | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);


  const fetchGroups = async () => {
    setIsLoading(true);
    try {
        const groupList = await getClientGroups();
        setGroups(groupList);
        return groupList;
    } catch(error) {
         toast({ title: "Erro ao carregar grupos", variant: "destructive" });
         return [];
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
        fetchGroups();
    }
  }, [user]);

  const handleAction = async (action: 'soft-delete' | 'restore' | 'permanent-delete') => {
    if (!groupToAction || !user) return;
    
    setIsActionLoading(true);
    try {
        let successMessage = "";
        switch(action) {
            case 'soft-delete':
                await softDeleteClientGroup(groupToAction.id, user.name);
                successMessage = "Grupo enviado para a lixeira.";
                break;
            case 'restore':
                await restoreClientGroup(groupToAction.id);
                successMessage = "Grupo restaurado com sucesso!";
                break;
            case 'permanent-delete':
                await permanentlyDeleteClientGroup(groupToAction.id);
                successMessage = "Grupo excluído permanentemente.";
                break;
        }
        toast({ title: successMessage });
        const updatedGroups = await fetchGroups();

        const remainingDeleted = updatedGroups.filter(c => c.deleted && (user.isAdmin || c.deletedBy === user.name)).length;
        if (showDeleted && remainingDeleted === 0) {
            setShowDeleted(false);
        }

    } catch(error) {
        const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
        toast({ title: "Erro ao executar ação", description: errorMessage, variant: "destructive" });
    } finally {
        setIsActionLoading(false);
        setGroupToAction(null);
    }
  };


  const filteredGroups = useMemo(() => {
    if (!user) return [];
    if (showDeleted) {
        if (user.isAdmin) {
            return groups.filter(g => g.deleted);
        }
        return groups.filter(g => g.deleted && g.deletedBy === user.name);
    }
    return groups.filter(g => !g.deleted);
  }, [groups, showDeleted, user]);

  const deletedCount = useMemo(() => {
    if (!user) return 0;
    if (user.isAdmin) {
        return groups.filter(g => g.deleted).length;
    }
    return groups.filter(g => g.deleted && g.deletedBy === user.name).length;
  }, [groups, user]);

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
             <div className="flex items-center gap-2">
                {deletedCount > 0 && (
                    <Button variant="outline" onClick={() => setShowDeleted(!showDeleted)}>
                        {showDeleted ? <Eye className="mr-2 h-4 w-4" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        {showDeleted ? "Ver Ativos" : `Ver Lixeira (${deletedCount})`}
                    </Button>
                )}
                <Button asChild className="bg-accent hover:bg-accent/90">
                    <Link href="/dashboard/groups/new">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Novo Grupo
                    </Link>
                </Button>
             </div>
        </div>
        {filteredGroups.length === 0 ? (
             <Card className="text-center py-20">
                <CardHeader>
                    <CardTitle>{showDeleted ? "Lixeira Vazia" : "Nenhum grupo encontrado"}</CardTitle>
                    <CardDescription>{showDeleted ? "Não há grupos excluídos para visualizar." : "Crie seu primeiro grupo de clientes para começar."}</CardDescription>
                </CardHeader>
                {!showDeleted && (
                 <CardContent>
                    <Button asChild>
                         <Link href="/dashboard/groups/new">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Criar Grupo
                        </Link>
                    </Button>
                </CardContent>
                )}
            </Card>
        ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredGroups.map((group) => (
                <Card key={group.id} className={cn("flex flex-col justify-between", group.deleted && "bg-muted/50")}>
                    <div className="flex-grow">
                        <CardHeader>
                            <CardTitle className={cn("flex items-center gap-2", group.deleted && "text-muted-foreground")}>
                                <Users className="h-5 w-5" />
                                <span className="truncate" title={group.name}>{group.name}</span>
                            </CardTitle>
                            {group.deleted && (
                                <p className="text-xs text-destructive pt-1">
                                    Excluído por {group.deletedBy} em {format(parseISO(group.deletedAt as string), 'dd/MM/yy')}
                                </p>
                            )}
                        </CardHeader>
                        <CardContent>
                           <div className="space-y-3">
                                <div>
                                    <h4 className="text-sm font-medium mb-1">Clientes ({group.clientIds.length})</h4>
                                    <div className="flex flex-col items-start text-sm text-muted-foreground">
                                        {group.clientNames.map((name, index) => (
                                            <Link key={group.clientIds[index]} href={`/dashboard/clients/${group.clientIds[index]}`} className="hover:underline hover:text-primary truncate" title={name}>
                                                - {name}
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                                {group.notes && (
                                    <div>
                                         <Separator className="my-2" />
                                        <h4 className="text-sm font-medium mb-1">Anotações</h4>
                                        <p className="text-sm text-muted-foreground whitespace-pre-wrap truncate">{group.notes}</p>
                                    </div>
                                )}
                           </div>
                        </CardContent>
                    </div>
                    <CardFooter className="flex justify-between items-center bg-muted/20 p-3 mt-4">
                        <div className="text-xs text-muted-foreground space-y-1">
                            <div className="flex items-center gap-1.5">
                                <User className="h-3 w-3" />
                                <span>{group.author}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Calendar className="h-3 w-3" />
                                <span>{format(parseISO(group.createdAt as string), 'dd/MM/yyyy')}</span>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            {showDeleted ? (
                                <>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="sm" onClick={() => setGroupToAction(group)} disabled={isActionLoading}>
                                            <ArchiveRestore className="mr-2 h-4 w-4" /> Restaurar
                                        </Button>
                                    </AlertDialogTrigger>
                                    {user?.isAdmin && (
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" size="sm" onClick={() => setGroupToAction(group)} disabled={isActionLoading}>
                                                Excluir Perm.
                                            </Button>
                                        </AlertDialogTrigger>
                                    )}
                                </>
                            ) : (
                                <>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-8 w-8" onClick={() => setGroupToAction(group)} disabled={isActionLoading}>
                                            {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                            <span className="sr-only">Excluir</span>
                                        </Button>
                                    </AlertDialogTrigger>
                                    <Button asChild size="sm">
                                        <Link href={`/dashboard/groups/${group.id}`}>Ver Detalhes</Link>
                                    </Button>
                                </>
                            )}
                        </div>
                    </CardFooter>
                </Card>
                ))}
            </div>
        )}
         {groupToAction && (
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
                                ? `Tem certeza que deseja excluir permanentemente o grupo "${groupToAction.name}"? Esta ação não pode ser desfeita.`
                                : `Tem certeza que deseja restaurar o grupo "${groupToAction.name}"?`
                            : `Tem certeza que deseja enviar o grupo "${groupToAction.name}" para a lixeira?`}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => handleAction(showDeleted ? (user?.isAdmin ? 'permanent-delete' : 'restore') : 'soft-delete')}
                        className={cn((showDeleted && !user?.isAdmin) || (!showDeleted && "bg-destructive hover:bg-destructive/90"))}
                        disabled={isActionLoading}
                    >
                        {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {showDeleted ? (user?.isAdmin ? 'Excluir Permanentemente' : 'Sim, Restaurar') : 'Sim, Enviar para Lixeira'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        )}
    </div>
    </AlertDialog>
  );
}
