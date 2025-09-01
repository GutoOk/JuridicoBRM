

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { format, isPast, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, PlusCircle, Calendar, Tag, Type, Trash2, User, Loader2, CheckCircle2, History, CircleDot, Gavel, Link as LinkIcon, Users, Flag, AlertTriangle } from "lucide-react";
import type { ClientUpdate, User as AppUser, Client, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { getClientUpdates, getProcessUpdates, addClientUpdate, deleteClientUpdate, updateClientUpdate } from "@/app/dashboard/clients/[id]/actions";
import { getUsers } from "@/app/dashboard/users/actions";
import { getClientById } from "@/app/dashboard/clients/actions";
import { getProcessById } from "@/app/dashboard/processes/actions";
import { useToast } from "@/hooks/use-toast";
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
import { EditTaskDialog } from "./edit-task-dialog";


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


// clientId is for single client page, processId is for process page
interface ClientUpdatesProps {
    clientId?: string;
    processId?: string;
}

export function ClientUpdates({ clientId, processId }: ClientUpdatesProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [updates, setUpdates] = useState<ClientUpdate[]>([]);
    const [clientsForProcess, setClientsForProcess] = useState<Client[]>([]);
    const [newUpdateDescription, setNewUpdateDescription] = useState("");
    const [newUpdateType, setNewUpdateType] = useState<ClientUpdate['type']>(processId ? 'Andamento Processual' : 'Atendimento');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedClientIdForNewUpdate, setSelectedClientIdForNewUpdate] = useState<string | undefined>(clientId);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    
    const fetchUpdates = useCallback(async () => {
        setIsLoading(true);
        try {
            let fetchedUpdates: ClientUpdate[] = [];

            if (processId) { // On a process page
                fetchedUpdates = await getProcessUpdates(processId);
            } else if (clientId) { // On a client page
                fetchedUpdates = await getClientUpdates(clientId);
            }
            setUpdates(fetchedUpdates);
        } catch (error) {
            toast({
                title: "Erro ao buscar andamentos",
                description: "Não foi possível carregar os andamentos.",
                variant: "destructive"
            });
        } finally {
             setIsLoading(false);
        }
    }, [clientId, processId, toast]);
    
     useEffect(() => {
        fetchUpdates();
    }, [fetchUpdates]);
    
    useEffect(() => {
        const fetchMetadata = async () => {
            try {
                if (processId) {
                    const fetchedProcess = await getProcessById(processId);
                     if (fetchedProcess?.clientIds) {
                        const relevantClients = (await Promise.all(fetchedProcess.clientIds.map(id => getClientById(id)))).filter(Boolean) as Client[];
                        setClientsForProcess(relevantClients);
                        if (fetchedProcess?.mainClientId) {
                            setSelectedClientIdForNewUpdate(fetchedProcess.mainClientId);
                        } else if (relevantClients.length > 0) {
                            setSelectedClientIdForNewUpdate(relevantClients[0].id);
                        }
                    }
                } else if (clientId) {
                    const fetchedClient = await getClientById(clientId);
                    if (fetchedClient) {
                         setClientsForProcess([fetchedClient]);
                    }
                }

            } catch (error) {
                 toast({
                    title: "Erro ao carregar metadados",
                    description: "Não foi possível carregar dados auxiliares.",
                    variant: "destructive"
                });
            }
        };
        fetchMetadata();
    }, [processId, clientId, toast]);
    
    const handleEditClick = (update: ClientUpdate) => {
        if (update.type === 'Tarefa') {
            const taskToEdit: Task = {
                id: update.id,
                title: update.description,
                description: update.description,
                status: update.status || 'Pendente',
                priority: update.priority || 'Média',
                responsible: update.responsible || 'Todos',
                dueDate: update.dueDate,
                createdAt: update.createdAt,
                author: update.author,
                clientId: update.clientId,
                clientName: update.clientName,
                processId: update.processId,
                processNumber: update.processNumber,
                completedAt: update.completedAt,
                completedBy: update.completedBy,
            };
            setEditingTask(taskToEdit);
            setIsEditDialogOpen(true);
        }
    };


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
                processId: (newUpdateType === 'Tarefa' || newUpdateType === 'Andamento Processual') ? processId : undefined,
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
    
    const availableUpdateTypes = Object.entries(updateTypeConfig)
        .filter(([key]) => processId ? true : key !== 'Andamento Processual');

    const getPriorityBadge = (priority?: 'Alta' | 'Média' | 'Baixa') => {
        switch (priority) {
        case 'Alta': return <Badge className={'bg-red-500 text-white hover:bg-red-600'}><Flag className="mr-1 h-3 w-3" />Alta</Badge>;
        case 'Média': return <Badge className={'bg-yellow-500 text-white hover:bg-yellow-600'}><AlertTriangle className="mr-1 h-3 w-3" />Média</Badge>;
        case 'Baixa': return <Badge className={'bg-blue-500 text-white hover:bg-blue-600'}><CircleDot className="mr-1 h-3 w-3" />Baixa</Badge>;
        default: return <Badge variant="secondary">Sem prioridade</Badge>;
        }
    }

    const getStatusBadge = (update: ClientUpdate) => {
        let status: Task['status'] | undefined = update.status;
        if (status !== 'Concluída' && update.dueDate && isPast(new Date(update.dueDate as string))) {
            status = 'Vencida';
        }
        
        switch (status) {
            case 'Concluída':
                return (
                    <Dialog>
                        <DialogTrigger asChild>
                            <Badge variant="default" className={cn('text-xs h-5 px-1.5 cursor-pointer', 'bg-green-600 hover:bg-green-700')}>
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                {status}
                            </Badge>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader><DialogTitle>Detalhes da Tarefa Concluída</DialogTitle></DialogHeader>
                            <div className="py-4 space-y-4 text-sm">
                                <p>Esta tarefa foi marcada como concluída por <strong>{update.completedBy}</strong> em <strong>{update.completedAt ? new Date(update.completedAt as string).toLocaleString('pt-BR') : ''}</strong>.</p>
                                <p className="text-muted-foreground">Se esta tarefa precisa ser realizada novamente, você pode reabri-la.</p>
                            </div>
                            <DialogFooter className="justify-between sm:justify-between w-full">
                                <DialogClose asChild><Button variant="ghost">Fechar</Button></DialogClose>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild><Button variant="outline"><History className="mr-2 h-4 w-4" />Reabrir Tarefa</Button></AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader><AlertDialogTitle>Reabrir Tarefa?</AlertDialogTitle><AlertDialogDescription>Tem certeza que deseja marcar esta tarefa como "Pendente" novamente?</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <DialogClose asChild><AlertDialogAction onClick={async () => {
                                                if (!update.clientId) return;
                                                await updateClientUpdate(update.clientId, update.id, { status: 'Pendente', completedBy: null, completedAt: null, processId: update.processId, clientId: update.clientId });
                                                fetchUpdates();
                                            }}>Confirmar</AlertDialogAction></DialogClose>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                );
            case 'Vencida':
                return (
                    <Badge variant="destructive" className='text-xs h-5 px-1.5'>
                        <CalendarIcon className="mr-1 h-3 w-3" />
                        Vencida
                    </Badge>
                );
            case 'Pendente':
            default:
                return (
                    <Badge variant="secondary" className='text-xs h-5 px-1.5'>
                        <CircleDot className="mr-1 h-3 w-3" />
                        Pendente
                    </Badge>
                );
        }
    }
    
    return (
        <>
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
                                    {processId && clientsForProcess.length > 0 && (
                                        <Select value={selectedClientIdForNewUpdate} onValueChange={setSelectedClientIdForNewUpdate} disabled={isSubmitting}>
                                            <SelectTrigger className="w-auto sm:w-[200px]">
                                                <SelectValue placeholder="Selecione um cliente" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {clientsForProcess.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
                        ) : updates.length === 0 ? (
                            <div className="text-center text-muted-foreground py-8">
                                Nenhum andamento encontrado.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {updates.map((update) => {
                                    const config = updateTypeConfig[update.type];
                                    const Icon = config.icon;
                                    const date = new Date(update.createdAt as string);
                                    
                                    const shouldShowClientName = processId && update.clientId !== clientId;

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
                                                            
                                                            {shouldShowClientName && update.clientName && (
                                                                <Button variant="link" asChild className="p-0 h-auto font-normal text-muted-foreground hover:text-primary">
                                                                    <Link href={`/dashboard/clients/${update.clientId}`}>{update.clientName}</Link>
                                                                </Button>
                                                            )}

                                                            {(update.type === 'Andamento Processual' || update.type === 'Tarefa') && update.processId && update.processNumber && !processId && (
                                                                <Button variant="secondary" size="xs" className="h-6 px-2 text-xs" asChild>
                                                                    <Link href={`/dashboard/processes/${update.processId}`}>
                                                                        <LinkIcon className="mr-1.5 h-3 w-3" />
                                                                        {update.processNumber}
                                                                    </Link>
                                                                </Button>
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
                                                <p 
                                                    className={cn(
                                                        "text-sm text-muted-foreground mt-2 whitespace-pre-wrap",
                                                        update.type === 'Tarefa' && "cursor-pointer hover:text-foreground"
                                                    )}
                                                    onClick={() => handleEditClick(update)}
                                                >
                                                    {update.description}
                                                </p>
                                                 {update.type === 'Tarefa' && (
                                                    <div className="text-xs text-muted-foreground/80 flex items-center flex-wrap gap-x-3 gap-y-1 mt-2">
                                                        <Button variant="link" className="h-auto p-0 text-xs text-muted-foreground/80 hover:text-primary" onClick={() => handleEditClick(update)}>
                                                            <div className="flex items-center gap-1.5">
                                                                <Users className="h-3 w-3" />
                                                                <span>Responsável: <strong className="text-foreground/90">{update.responsible}</strong></span>
                                                            </div>
                                                        </Button>
                                                        <Button variant="link" className="h-auto p-0 text-xs" onClick={() => handleEditClick(update)}>
                                                            <div className="flex items-center gap-1.5">
                                                                <span>Prioridade:</span>
                                                                {getPriorityBadge(update.priority)}
                                                            </div>
                                                        </Button>
                                                         <Button variant="link" className="h-auto p-0 text-xs text-muted-foreground/80 hover:text-primary" onClick={() => handleEditClick(update)}>
                                                            <div className="flex items-center gap-1.5">
                                                                <Calendar className="h-3 w-3" />
                                                                <span>Prazo: {update.dueDate ? format(new Date(update.dueDate as string), 'dd/MM/yyyy') : 'N/A'}</span>
                                                            </div>
                                                        </Button>
                                                        <Button variant="link" className="h-auto p-0 text-xs" onClick={() => handleEditClick(update)}>
                                                            <div className="flex items-center gap-1.5">
                                                                <span>Status:</span>
                                                                {getStatusBadge(update)}
                                                            </div>
                                                        </Button>
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
            {editingTask && (
                <EditTaskDialog
                    key={editingTask.id}
                    open={isEditDialogOpen}
                    onOpenChange={setIsEditDialogOpen}
                    task={editingTask}
                    onTaskUpdated={fetchUpdates}
                />
            )}
        </>
    );
}

