
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Tag, Type, Trash2, User, Loader2, PlusCircle, Gavel, Link as LinkIcon, Users, Edit, ListFilter } from "lucide-react";
import type { ClientUpdate, Client, Update as NewClientUpdate } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { getClientUpdates, getProcessUpdates, addClientUpdate, deleteClientUpdate } from "@/app/dashboard/clients/[id]/actions";
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
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";


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
    const [selectedUpdateTypes, setSelectedUpdateTypes] = useState<string[]>([]);
    
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
                    setSelectedClientIdForNewUpdate(clientId);
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


    const handleAddUpdate = async () => {
        if (!newUpdateDescription.trim() || !user ) {
            return;
        };
        if (!processId && !clientId) {
            toast({ title: "Contexto Inválido", description: "Não há um cliente ou processo associado para este andamento.", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            const newUpdate: Partial<NewClientUpdate> = {
                description: newUpdateDescription.trim(),
                type: newUpdateType,
                author: user.name,
                clientId: selectedClientIdForNewUpdate,
            };

            if (processId) {
                newUpdate.processId = processId;
            }

            if (newUpdate.type === 'Tarefa') {
                newUpdate.status = 'Pendente';
                newUpdate.responsible = 'Todos';
                newUpdate.priority = 'Média';
            }

            await addClientUpdate(newUpdate as NewClientUpdate);
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
    
    const handleDeleteUpdate = async (id: string) => {
        const originalUpdates = [...updates];
        setUpdates(updates.filter(update => update.id !== id));
        try {
            await deleteClientUpdate(id);
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

    const handleFilterChange = (type: string) => {
        setSelectedUpdateTypes(prev => 
            prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
        );
    };
    
    const availableUpdateTypes = useMemo(() => {
        if (processId) {
            return Object.entries(updateTypeConfig).filter(
                ([key]) => key === 'Andamento Processual' || key === 'Tarefa'
            );
        }
        return Object.entries(updateTypeConfig).filter(
            ([key]) => key !== 'Andamento Processual'
        );
    }, [processId]);

    const filteredUpdates = useMemo(() => {
        if (selectedUpdateTypes.length === 0) {
            return updates;
        }
        return updates.filter(u => selectedUpdateTypes.includes(u.type));
    }, [updates, selectedUpdateTypes]);

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle>Andamentos</CardTitle>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                             <Button variant="outline">
                                <ListFilter className="mr-2 h-4 w-4" />
                                Filtrar ({selectedUpdateTypes.length > 0 ? selectedUpdateTypes.length : 'Todos'})
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                             <DropdownMenuLabel>Filtrar por tipo</DropdownMenuLabel>
                             <DropdownMenuSeparator />
                             {Object.entries(updateTypeConfig).map(([key, config]) => {
                                 // Don't show "Andamento Processual" filter on client page
                                 if (!processId && key === "Andamento Processual") return null;
                                 return (
                                     <DropdownMenuCheckboxItem
                                        key={key}
                                        checked={selectedUpdateTypes.includes(key)}
                                        onCheckedChange={() => handleFilterChange(key)}
                                    >
                                        {config.label}
                                    </DropdownMenuCheckboxItem>
                                 )
                             })}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
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
                                {processId && clientsForProcess.length > 1 && (
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
                    ) : filteredUpdates.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                            {selectedUpdateTypes.length > 0
                                ? "Nenhum andamento encontrado para os filtros selecionados."
                                : "Nenhum andamento encontrado."
                            }
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredUpdates.map((update) => {
                                const config = updateTypeConfig[update.type];
                                if (!config) return null; // Skip if type is not in config
                                const Icon = config.icon;
                                const date = new Date(update.createdAt as string);
                                
                                const shouldShowClientName = processId && update.clientId !== clientId;

                                const getEditHref = () => {
                                    const baseClientId = clientId || update.clientId;
                                    const processIdParam = processId ? `?processId=${processId}` : '';
                                    const clientIdParam = baseClientId ? `?clientId=${baseClientId}` : '';

                                    switch (update.type) {
                                        case 'Tarefa':
                                            return `/dashboard/tasks/${update.id}/edit`;
                                        case 'Anotação':
                                            return `/dashboard/annotations/${update.id}/edit${clientIdParam}`;
                                        case 'Atendimento':
                                            return `/dashboard/communications/${update.id}/edit${clientIdParam}`;
                                        case 'Andamento Processual':
                                            return `/dashboard/process-updates/${update.id}/edit${processIdParam}`;
                                        default:
                                            return undefined;
                                    }
                                };
                                const editHref = getEditHref();

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
                                                     {editHref && (
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" asChild>
                                                            <Link href={editHref}>
                                                                <Edit className="h-4 w-4" />
                                                                <span className="sr-only">Editar</span>
                                                            </Link>
                                                        </Button>
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
                                                                <AlertDialogAction onClick={() => handleDeleteUpdate(update.id)} className="bg-destructive hover:bg-destructive/90">Confirmar</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </div>
                                            </div>
                                            
                                            
                                            <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{update.description}</p>
                                            

                                             {update.type === 'Tarefa' && (
                                                
                                                <div className="text-xs text-muted-foreground/80 flex items-center flex-wrap gap-x-3 gap-y-1 mt-2">
                                                    <div className="flex items-center gap-1.5">
                                                        <Users className="h-3 w-3" />
                                                        <span>Responsável: <strong className="text-foreground/90">{update.responsible}</strong></span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <strong>Prioridade:</strong>
                                                        <Badge variant={
                                                            update.priority === 'Alta' ? 'destructive' :
                                                            update.priority === 'Média' ? 'default' : 'secondary'
                                                        } className="px-1.5 py-0 text-[10px]">
                                                            {update.priority}
                                                        </Badge>
                                                    </div>
                                                     <div className="flex items-center gap-1.5">
                                                        <Calendar className="h-3 w-3" />
                                                        <span>Prazo: {update.dueDate ? format(parseISO(update.dueDate as string), 'dd/MM/yyyy') : 'N/A'}</span>
                                                    </div>
                                                     <div className="flex items-center gap-1.5">
                                                         <strong>Status:</strong>
                                                         <Badge variant={update.status === 'Concluída' ? 'default' : 'secondary'} className={cn("px-1.5 py-0 text-[10px]", update.status === 'Concluída' ? 'bg-green-600' : '')}>
                                                            {update.status}
                                                         </Badge>
                                                    </div>
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
    
    
