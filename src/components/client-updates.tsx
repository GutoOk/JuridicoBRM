

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, PlusCircle, Calendar, Tag, Type, Trash2, User, Loader2, CheckCircle2, UserCog, History, CircleDot, ArrowUp, ArrowDown, Minus, Gavel, Link as LinkIcon, Eye, EyeOff } from "lucide-react";
import type { ClientUpdate, User as AppUser, Client } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { getClientUpdates, getProcessUpdates, addClientUpdate, deleteClientUpdate, updateClientUpdate } from "@/app/dashboard/clients/[id]/actions";
import { getUsers } from "@/app/dashboard/users/actions";
import { getClients } from "@/app/dashboard/clients/actions";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import Link from 'next/link';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Badge } from "./ui/badge";


const updateTypeConfig = {
     "Andamento Processual": {
        icon: Gavel,
        color: "bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700",
        label: "Andamento Processual"
    },
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

const priorityConfig = {
    'Alta': { icon: ArrowUp, color: 'text-red-500' },
    'Média': { icon: Minus, color: 'text-yellow-500' },
    'Baixa': { icon: ArrowDown, color: 'text-blue-500' },
}

// clientId is for single client page, clientIds is for process page
interface ClientUpdatesProps {
    clientId?: string;
    clientIds?: string[];
    processId?: string;
}

export function ClientUpdates({ clientId, clientIds, processId }: ClientUpdatesProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [updates, setUpdates] = useState<ClientUpdate[]>([]);
    const [users, setUsers] = useState<AppUser[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [newUpdateDescription, setNewUpdateDescription] = useState("");
    const [newUpdateType, setNewUpdateType] = useState<ClientUpdate['type']>(processId ? 'Andamento Processual' : 'Atendimento');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    // State for process page to select which client to add the update to
    const [selectedClientIdForNewUpdate, setSelectedClientIdForNewUpdate] = useState<string | undefined>(clientId);
    const [showAllClientUpdates, setShowAllClientUpdates] = useState(false);

    const fetchUpdates = useCallback(async () => {
        try {
            let fetchedUpdates: ClientUpdate[] = [];
            if (processId && clientIds) {
                fetchedUpdates = await getProcessUpdates(clientIds);
            } else if (clientId) {
                fetchedUpdates = await getClientUpdates(clientId);
            }
            setUpdates(fetchedUpdates);
        } catch (error) {
            toast({
                title: "Erro ao buscar andamentos",
                description: "Não foi possível carregar os andamentos.",
                variant: "destructive"
            });
        }
    }, [clientId, clientIds, processId, toast]);
    
    useEffect(() => {
        const fetchInitialData = async () => {
            setIsLoading(true);
            try {
                const [fetchedUsers, fetchedClients] = await Promise.all([
                    getUsers(),
                    // Only fetch all clients if we are on a process page with multiple clients
                    clientIds ? getClients() : Promise.resolve([])
                ]);
                setUsers(fetchedUsers);

                if (clientIds) {
                    const relevantClients = fetchedClients.filter(c => clientIds.includes(c.id));
                    setClients(relevantClients);
                    if (relevantClients.length > 0) {
                        setSelectedClientIdForNewUpdate(relevantClients[0].id);
                    }
                }
                
                await fetchUpdates();

            } catch (error) {
                 toast({
                    title: "Erro ao carregar dados",
                    description: "Não foi possível carregar os andamentos, usuários e clientes.",
                    variant: "destructive"
                });
            } finally {
                setIsLoading(false);
            }
        };
        fetchInitialData();
    }, [fetchUpdates, clientIds, toast]);

    const handleAddUpdate = async () => {
        if (!newUpdateDescription.trim() || !user || !selectedClientIdForNewUpdate) {
            if (!selectedClientIdForNewUpdate) {
                toast({ title: "Selecione um cliente", description: "É preciso selecionar um cliente para adicionar um andamento.", variant: "destructive" });
            }
            return;
        };

        setIsSubmitting(true);
        try {
            const newUpdate: Omit<ClientUpdate, 'id' | 'createdAt'> = {
                description: newUpdateDescription.trim(),
                type: newUpdateType,
                author: user.name,
                processId: processId, // Associate with the process if on process page
            };
            await addClientUpdate(selectedClientIdForNewUpdate, newUpdate);
            await fetchUpdates(); // Refetch updates after adding
            setNewUpdateDescription("");
            setNewUpdateType(processId ? 'Andamento Processual' : 'Atendimento');
            toast({ title: "Andamento adicionado!" });
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
    
    const handleDeleteUpdate = async (id: string, updateClientId?: string) => {
        if (!updateClientId) return;
        const originalUpdates = [...updates];
        setUpdates(updates.filter(update => update.id !== id));
        try {
            await deleteClientUpdate(updateClientId, id, processId);
            toast({ title: "Andamento excluído com sucesso." });
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

    const handleUpdateTaskField = async (updateId: string, updateClientId: string | undefined, field: 'responsible' | 'priority' | 'dueDate', value: string | Date | null) => {
        if (!updateClientId) return;
        try {
            const dataToUpdate = { [field]: value instanceof Date ? value.toISOString() : value, processId };
            await updateClientUpdate(updateClientId, updateId, dataToUpdate);
            await fetchUpdates();
        } catch (error) {
            toast({ title: `Erro ao alterar campo da tarefa`, variant: "destructive" });
        }
    }

    const handleCompleteTask = async (updateId: string, updateClientId?: string) => {
        if (!user || !updateClientId) return;
        try {
            await updateClientUpdate(updateClientId, updateId, { 
                status: 'Concluída',
                completedBy: user.name,
                completedAt: true, // Send a signal to the server to use serverTimestamp
                processId,
            });
            await fetchUpdates(); // Refetch to get the accurate server timestamp
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({ title: "Erro ao concluir tarefa", description: errorMessage, variant: "destructive" });
        }
    }

    const handleReopenTask = async (updateId: string, updateClientId?: string) => {
        if (!updateClientId) return;
         try {
            await updateClientUpdate(updateClientId, updateId, { 
                status: 'Pendente',
                completedBy: null,
                completedAt: null,
                processId,
            });
            await fetchUpdates();
            toast({ title: "Tarefa reaberta com sucesso!" });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({ title: "Erro ao reabrir tarefa", description: errorMessage, variant: "destructive" });
        }
    }
    
    const availableUpdateTypes = Object.entries(updateTypeConfig)
        .filter(([key]) => processId ? true : key !== 'Andamento Processual');

    const filteredUpdates = useMemo(() => {
        if (processId) {
            // On a process page
            if (showAllClientUpdates) { // "Mostrar Tudo" is active
                return updates.filter(u => {
                    // Hide "Andamento Processual" from other processes
                    if (u.type === 'Andamento Processual' && u.processId !== processId) {
                        return false;
                    }
                    // Show everything else for the linked clients
                    return true;
                });
            } else { // Default view
                // Show only updates linked to this specific process
                return updates.filter(u => u.processId === processId);
            }
        }
        // On a client page, show all updates for that client
        return updates;
    }, [updates, processId, showAllClientUpdates]);


    const otherUpdatesCount = useMemo(() => {
        if (!processId) return 0;
        // Count items that would be shown/hidden by the toggle
        return updates.filter(u => {
            if (u.processId === processId) return false; // Already shown
            if (u.type === 'Andamento Processual' && u.processId !== processId) return false; // Should always be hidden
            return true;
        }).length;
    }, [updates, processId]);


    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Andamentos</CardTitle>
                {processId && otherUpdatesCount > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setShowAllClientUpdates(prev => !prev)}>
                        {showAllClientUpdates ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                        {showAllClientUpdates ? "Ocultar tudo" : `Mostrar tudo (${otherUpdatesCount})`}
                    </Button>
                )}
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
                        <div className="flex justify-between items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                                <Select value={newUpdateType} onValueChange={(value) => setNewUpdateType(value as ClientUpdate['type'])} disabled={isSubmitting}>
                                    <SelectTrigger className="w-auto sm:w-[220px]">
                                        <SelectValue placeholder="Tipo de andamento" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableUpdateTypes.map(([key, config]) => (
                                             <SelectItem key={key} value={key}>{config.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {clients.length > 0 && (
                                     <Select value={selectedClientIdForNewUpdate} onValueChange={setSelectedClientIdForNewUpdate} disabled={isSubmitting}>
                                        <SelectTrigger className="w-auto sm:w-[200px]">
                                            <SelectValue placeholder="Selecione um cliente" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                             <Button onClick={handleAddUpdate} disabled={!newUpdateDescription.trim() || !user || isSubmitting || !selectedClientIdForNewUpdate}>
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
                    ) : filteredUpdates.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                            Nenhum andamento encontrado para a visualização atual.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredUpdates.map((update) => {
                                const config = updateTypeConfig[update.type];
                                const Icon = config.icon;
                                const date = new Date(update.createdAt as string);
                                const priority = (update.priority || 'Média') as keyof typeof priorityConfig;
                                const PriorityIcon = priorityConfig[priority]?.icon || Minus;

                                const isOverdue = update.type === 'Tarefa' && update.status !== 'Concluída' && update.dueDate && new Date(update.dueDate as string) < new Date();
                                const clientName = clients.find(c => c.id === update.clientId)?.name || update.clientName;

                                return (
                                    <div key={update.id} className={cn("flex items-start gap-3 rounded-lg border p-3 transition-colors group", config.color)}>
                                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-background flex-shrink-0 mt-0.5">
                                            <Icon className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                                        <p className="font-medium text-sm text-foreground">{config.label}</p>
                                                        
                                                        {clientIds && update.clientId && (
                                                            <Badge variant="outline" className="font-normal">{clientName}</Badge>
                                                        )}

                                                        {update.processId && update.processNumber && (
                                                             <Button variant="secondary" size="xs" className="h-6 px-2 text-xs" asChild>
                                                                <Link href={`/dashboard/processes/${update.processId}`}>
                                                                    <LinkIcon className="mr-1.5 h-3 w-3" />
                                                                    {update.processNumber}
                                                                </Link>
                                                             </Button>
                                                        )}

                                                        {update.type === 'Tarefa' && (
                                                            update.status === 'Concluída' ? (
                                                                <Dialog>
                                                                    <DialogTrigger asChild>
                                                                        <Badge variant="default" className={cn('text-xs h-5 px-1.5 cursor-pointer', 'bg-green-600 hover:bg-green-700')}>
                                                                            <CheckCircle2 className="mr-1 h-3 w-3" />
                                                                            {update.status}
                                                                        </Badge>
                                                                    </DialogTrigger>
                                                                    <DialogContent className="sm:max-w-md">
                                                                        <DialogHeader>
                                                                            <DialogTitle>Detalhes da Tarefa Concluída</DialogTitle>
                                                                        </DialogHeader>
                                                                        <div className="py-4 space-y-4 text-sm">
                                                                            <p>Esta tarefa foi marcada como concluída por <strong>{update.completedBy}</strong> em <strong>{new Date(update.completedAt as string).toLocaleString('pt-BR')}</strong>.</p>
                                                                            <p className="text-muted-foreground">Se esta tarefa precisa ser realizada novamente, você pode reabri-la.</p>
                                                                        </div>
                                                                        <DialogFooter className="justify-between sm:justify-between w-full">
                                                                             <DialogClose asChild><Button variant="ghost">Fechar</Button></DialogClose>
                                                                             <AlertDialog>
                                                                                <AlertDialogTrigger asChild>
                                                                                    <Button variant="outline"><History className="mr-2 h-4 w-4" />Reabrir Tarefa</Button>
                                                                                </AlertDialogTrigger>
                                                                                <AlertDialogContent>
                                                                                    <AlertDialogHeader>
                                                                                        <AlertDialogTitle>Reabrir Tarefa?</AlertDialogTitle>
                                                                                        <AlertDialogDescription>
                                                                                            Tem certeza que deseja marcar esta tarefa como "Pendente" novamente?
                                                                                        </AlertDialogDescription>
                                                                                    </AlertDialogHeader>
                                                                                    <AlertDialogFooter>
                                                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                                        <DialogClose asChild>
                                                                                             <AlertDialogAction onClick={() => handleReopenTask(update.id, update.clientId)}>Confirmar</AlertDialogAction>
                                                                                        </DialogClose>
                                                                                    </AlertDialogFooter>
                                                                                </AlertDialogContent>
                                                                             </AlertDialog>
                                                                        </DialogFooter>
                                                                    </DialogContent>
                                                                </Dialog>
                                                            ) : isOverdue ? (
                                                                 <Badge variant='destructive' className='text-xs h-5 px-1.5'>
                                                                    <CalendarIcon className="mr-1 h-3 w-3" />
                                                                    Vencida
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant='secondary' className='text-xs h-5 px-1.5'>
                                                                    <CircleDot className="mr-1 h-3 w-3" />
                                                                    {update.status}
                                                                </Badge>
                                                            )
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                                        <User className="h-3 w-3" /> 
                                                        <span>{update.author}</span>
                                                        <span>&bull;</span>
                                                        <span>{date.toLocaleDateString('pt-BR')} às {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                    {update.type === 'Tarefa' && (
                                                        <>
                                                             <Popover>
                                                                <PopoverTrigger asChild>
                                                                     <Button
                                                                        variant={"outline"}
                                                                        size="xs"
                                                                        className={cn(
                                                                            "w-auto h-7 justify-start text-left font-normal",
                                                                            !update.dueDate && "text-muted-foreground"
                                                                        )}
                                                                        disabled={update.status === 'Concluída'}
                                                                    >
                                                                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                                                                        {update.dueDate ? format(new Date(update.dueDate as string), "dd/MM/yy") : <span>Prazo</span>}
                                                                    </Button>
                                                                </PopoverTrigger>
                                                                <PopoverContent className="w-auto p-0" align="end">
                                                                    <CalendarComponent
                                                                        locale={ptBR}
                                                                        mode="single"
                                                                        selected={update.dueDate ? new Date(update.dueDate as string) : undefined}
                                                                        onSelect={(date) => handleUpdateTaskField(update.id, update.clientId, 'dueDate', date || null)}
                                                                        initialFocus
                                                                    />
                                                                     <div className="p-2 border-t border-border">
                                                                        <Button variant="ghost" size="sm" className="w-full h-8" onClick={() => handleUpdateTaskField(update.id, update.clientId, 'dueDate', null)}>
                                                                            Limpar Prazo
                                                                        </Button>
                                                                    </div>
                                                                </PopoverContent>
                                                            </Popover>
                                                             <Select value={update.responsible} onValueChange={(value) => handleUpdateTaskField(update.id, update.clientId, 'responsible', value)} disabled={update.status === 'Concluída'}>
                                                                <SelectTrigger className="w-auto h-7 text-xs px-2 focus:ring-ring/40">
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
                                                            <Select value={priority} onValueChange={(value) => handleUpdateTaskField(update.id, update.clientId, 'priority', value)} disabled={update.status === 'Concluída'}>
                                                                <SelectTrigger className="w-auto h-7 text-xs px-2 focus:ring-ring/40">
                                                                    <div className={cn("flex items-center gap-1", priorityConfig[priority]?.color)}>
                                                                         <PriorityIcon className="h-3 w-3" />
                                                                        <SelectValue placeholder="Prioridade" />
                                                                    </div>
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {Object.entries(priorityConfig).map(([key, config]) => (
                                                                        <SelectItem key={key} value={key}>
                                                                            <div className="flex items-center gap-2">
                                                                                <config.icon className={cn("h-4 w-4", config.color)} />
                                                                                {key}
                                                                            </div>
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            {update.status === 'Pendente' && (
                                                                <AlertDialog>
                                                                    <AlertDialogTrigger asChild>
                                                                        <Button size="xs" variant="outline" className="h-7">
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
                                                                            <AlertDialogAction onClick={() => handleCompleteTask(update.id, update.clientId)}>Confirmar</AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                </AlertDialog>
                                                            )}
                                                        </>
                                                    )}

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
                                                                <AlertDialogAction onClick={() => handleDeleteUpdate(update.id, update.clientId)} className="bg-destructive hover:bg-destructive/90">Confirmar</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </div>
                                            </div>
                                            <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{update.description}</p>
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
