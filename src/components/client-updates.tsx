
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Calendar, Tag, Type, Trash2, User, Loader2, CheckCircle2, UserCog } from "lucide-react";
import type { ClientUpdate, User as AppUser } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { getClientUpdates, addClientUpdate, deleteClientUpdate, updateClientUpdate } from "@/app/dashboard/clients/[id]/actions";
import { getUsers } from "@/app/dashboard/users/actions";
import { useToast } from "@/hooks/use-toast";
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
import { serverTimestamp } from "firebase/firestore";
import { Badge } from "./ui/badge";


const updateTypeConfig = {
    "Atendimento": {
        icon: Type,
        color: "bg-transparent",
        label: "Atendimento"
    },
    "Tarefa": {
        icon: Calendar,
        color: "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700",
        label: "Tarefa"
    },
    "Anotação": {
        icon: Tag,
        color: "bg-muted/60",
        label: "Anotação"
    }
}

export function ClientUpdates({ clientId }: { clientId: string }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [updates, setUpdates] = useState<ClientUpdate[]>([]);
    const [users, setUsers] = useState<AppUser[]>([]);
    const [newUpdateDescription, setNewUpdateDescription] = useState("");
    const [newUpdateType, setNewUpdateType] = useState<ClientUpdate['type']>('Atendimento');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchUpdates = async () => {
        try {
            setIsLoading(true);
            const fetchedUpdates = await getClientUpdates(clientId);
            setUpdates(fetchedUpdates);
        } catch (error) {
            toast({
                title: "Erro ao buscar andamentos",
                description: "Não foi possível carregar os andamentos deste cliente.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };
    
    useEffect(() => {
        const fetchInitialData = async () => {
            setIsLoading(true);
            try {
                const [fetchedUpdates, fetchedUsers] = await Promise.all([
                    getClientUpdates(clientId),
                    getUsers()
                ]);
                setUpdates(fetchedUpdates);
                setUsers(fetchedUsers);
            } catch (error) {
                 toast({
                    title: "Erro ao carregar dados",
                    description: "Não foi possível carregar os andamentos e usuários.",
                    variant: "destructive"
                });
            } finally {
                setIsLoading(false);
            }
        };
        fetchInitialData();
    }, [clientId, toast]);

    const handleAddUpdate = async () => {
        if (!newUpdateDescription.trim() || !user) return;

        setIsSubmitting(true);
        try {
            const newUpdate: Omit<ClientUpdate, 'id' | 'createdAt'> = {
                description: newUpdateDescription.trim(),
                type: newUpdateType,
                author: user.name,
            };
            await addClientUpdate(clientId, newUpdate);
            // Refetch updates after adding
            const fetchedUpdates = await getClientUpdates(clientId);
            setUpdates(fetchedUpdates);
            setNewUpdateDescription("");
            setNewUpdateType("Atendimento");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({
                title: "Erro ao adicionar andamento",
                description: errorMessage,
                variant: "destructive"
            });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteUpdate = async (id: string) => {
        const originalUpdates = [...updates];
        setUpdates(updates.filter(update => update.id !== id));
        try {
            await deleteClientUpdate(clientId, id);
        } catch (error) {
            setUpdates(originalUpdates);
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({
                title: "Erro ao excluir andamento",
                description: errorMessage,
                variant: "destructive"
            });
        }
    };

    const handleResponsibleChange = async (updateId: string, newResponsible: string) => {
        const originalUpdates = [...updates];
        setUpdates(updates.map(up => up.id === updateId ? {...up, responsible: newResponsible} : up));
        try {
            await updateClientUpdate(clientId, updateId, { responsible: newResponsible });
        } catch (error) {
            setUpdates(originalUpdates);
            toast({ title: "Erro ao alterar responsável", variant: "destructive" });
        }
    }

    const handleCompleteTask = async (updateId: string) => {
        if (!user) return;
        const originalUpdates = [...updates];
        setUpdates(updates.map(up => up.id === updateId ? {...up, status: 'Concluída', completedBy: user.name, completedAt: new Date().toISOString() } : up));
        try {
            await updateClientUpdate(clientId, updateId, { 
                status: 'Concluída',
                completedBy: user.name,
                completedAt: serverTimestamp()
            });
        } catch (error) {
            setUpdates(originalUpdates);
            toast({ title: "Erro ao concluir tarefa", variant: "destructive" });
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Andamentos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Formulário para adicionar novo andamento */}
                <div className="space-y-4">
                    <div className="grid gap-2">
                        <Textarea
                            placeholder="Descreva o andamento..."
                            value={newUpdateDescription}
                            onChange={(e) => setNewUpdateDescription(e.target.value)}
                            className="resize-y"
                            disabled={isSubmitting}
                        />
                        <div className="flex justify-between items-center">
                            <Select value={newUpdateType} onValueChange={(value) => setNewUpdateType(value as ClientUpdate['type'])} disabled={isSubmitting}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Tipo de andamento" />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(updateTypeConfig).map(([key, config]) => (
                                         <SelectItem key={key} value={key}>{config.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                             <Button onClick={handleAddUpdate} disabled={!newUpdateDescription.trim() || !user || isSubmitting}>
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                                Adicionar
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Lista de andamentos */}
                <div className="space-y-4">
                    {isLoading ? (
                         <div className="text-center text-muted-foreground py-8">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                            <p className="mt-2">Carregando andamentos...</p>
                        </div>
                    ) : updates.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                            Nenhum andamento registrado para este cliente.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {updates.map((update) => {
                                const config = updateTypeConfig[update.type];
                                const Icon = config.icon;
                                const date = new Date(update.createdAt as string);
                                return (
                                    <div key={update.id} className={cn("flex items-start gap-3 rounded-lg border p-3 transition-colors group", config.color)}>
                                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-background flex-shrink-0 mt-0.5">
                                            <Icon className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="font-medium text-sm text-foreground">{config.label}</p>
                                                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                                        <User className="h-3 w-3" /> 
                                                        <span>{update.author}</span>
                                                        <span>&bull;</span>
                                                        <span>{date.toLocaleDateString('pt-BR')} às {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                </div>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                            <span className="sr-only">Excluir</span>
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Tem certeza de que deseja excluir este andamento? Esta ação não pode ser desfeita.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleDeleteUpdate(update.id)} className="bg-destructive hover:bg-destructive/90">Confirmar</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                            <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{update.description}</p>
                                            
                                            {/* Seção específica para Tarefas */}
                                            {update.type === 'Tarefa' && (
                                                <div className="mt-3 pt-3 border-t border-dashed">
                                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant={update.status === 'Concluída' ? 'default' : 'secondary'} className={cn('text-xs', update.status === 'Concluída' && 'bg-green-600 hover:bg-green-700')}>
                                                                {update.status}
                                                            </Badge>
                                                             <Select value={update.responsible} onValueChange={(value) => handleResponsibleChange(update.id, value)} disabled={update.status === 'Concluída'}>
                                                                <SelectTrigger className="w-auto h-7 text-xs px-2">
                                                                    <div className="flex items-center gap-1">
                                                                        <UserCog className="h-3 w-3" />
                                                                        <SelectValue placeholder="Responsável" />
                                                                    </div>
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="Todos">Todos</SelectItem>
                                                                    {users.map(u => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>

                                                        {update.status === 'Pendente' && (
                                                            <AlertDialog>
                                                                <AlertDialogTrigger asChild>
                                                                    <Button size="xs" variant="outline">
                                                                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                                                        Concluir
                                                                    </Button>
                                                                </AlertDialogTrigger>
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader>
                                                                        <AlertDialogTitle>Confirmar Conclusão</AlertDialogTitle>
                                                                        <AlertDialogDescription>
                                                                            Tem certeza de que deseja marcar esta tarefa como concluída?
                                                                        </AlertDialogDescription>
                                                                    </AlertDialogHeader>
                                                                    <AlertDialogFooter>
                                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                        <AlertDialogAction onClick={() => handleCompleteTask(update.id)}>Confirmar</AlertDialogAction>
                                                                    </AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            </AlertDialog>
                                                        )}
                                                    </div>
                                                    {update.status === 'Concluída' && update.completedBy && (
                                                        <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                                                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                                                            <span>Concluída por {update.completedBy} em {new Date(update.completedAt as string).toLocaleString('pt-BR')}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

    