

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Tag, Type, Trash2, User, Loader2, PlusCircle, Gavel, Link as LinkIcon, Users, Edit, ListFilter, ArchiveRestore, ShieldAlert } from "lucide-react";
import type { ClientUpdate, Client, Update as NewClientUpdate, User as AuthUser } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { getClientUpdates, getProcessUpdates, addClientUpdate, softDeleteClientUpdate, restoreClientUpdate, permanentlyDeleteClientUpdate } from "@/app/dashboard/clients/[id]/actions";
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
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { Calendar as CalendarComponent } from "./ui/calendar";



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
    const [mainClientIdForProcess, setMainClientIdForProcess] = useState<string | undefined>();
    const [newUpdateDescription, setNewUpdateDescription] = useState("");
    const [newUpdateDate, setNewUpdateDate] = useState<Date | undefined>(new Date());
    const [newUpdateType, setNewUpdateType] = useState<ClientUpdate['type']>(processId ? 'Andamento Processual' : 'Atendimento');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedUpdateTypes, setSelectedUpdateTypes] = useState<string[]>([]);
    const [showDeleted, setShowDeleted] = useState(false);
    const [updateToAction, setUpdateToAction] = useState<ClientUpdate | null>(null);

    
    const fetchUpdates = useCallback(async (): Promise<ClientUpdate[]> => {
        setIsLoading(true);
        try {
            let fetchedUpdates: ClientUpdate[] = [];
            if (processId) { // On a process page
                fetchedUpdates = await getProcessUpdates(processId);
                 const fetchedProcess = await getProcessById(processId);
                 setMainClientIdForProcess(fetchedProcess?.mainClientId);
            } else if (clientId) { // On a client page
                fetchedUpdates = await getClientUpdates(clientId);
            }
            setUpdates(fetchedUpdates);
            return fetchedUpdates;
        } catch (error) {
            toast({
                title: "Erro ao buscar andamentos",
                description: "Não foi possível carregar os andamentos.",
                variant: "destructive"
            });
            return []; // Return empty array on error
        } finally {
             setIsLoading(false);
        }
    }, [clientId, processId, toast]);
    
     useEffect(() => {
        fetchUpdates();
    }, [fetchUpdates]);


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
            };

            // Associate with process if on process page
            if (processId) {
                newUpdate.processId = processId;
                 if (newUpdateType === 'Anotação' || newUpdateType === 'Atendimento') {
                    newUpdate.clientId = mainClientIdForProcess;
                }
            } else if (clientId) {
                // If on client page, associate with that client.
                newUpdate.clientId = clientId;
            }

            if (newUpdate.type === 'Andamento Processual') {
                 newUpdate.updateDate = newUpdateDate?.toISOString();
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
    
    const handleDeleteAction = async (action: 'soft-delete' | 'restore' | 'permanent-delete') => {
        if (!updateToAction || !user) return;

        setIsSubmitting(true);
        try {
            let successMessage = "";
            switch (action) {
                case 'soft-delete':
                    await softDeleteClientUpdate(updateToAction.id, user.name);
                    successMessage = "Andamento enviado para a lixeira.";
                    break;
                case 'restore':
                    await restoreClientUpdate(updateToAction.id);
                    successMessage = "Andamento restaurado com sucesso!";
                    break;
                case 'permanent-delete':
                    await permanentlyDeleteClientUpdate(updateToAction.id);
                    successMessage = "Andamento excluído permanentemente.";
                    break;
            }
            toast({ title: successMessage });
            const updatedList = await fetchUpdates();

            // Auto-hide trash if it's now empty
             if (showDeleted) {
                const remainingDeleted = updatedList.filter(u => u.deleted).length;
                if (remainingDeleted === 0) {
                    setShowDeleted(false);
                }
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({ title: "Erro ao executar ação", description: errorMessage, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
            setUpdateToAction(null);
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
                ([key]) => key === 'Andamento Processual' || key === 'Tarefa' || key === 'Anotação'
            );
        }
        return Object.entries(updateTypeConfig).filter(
            ([key]) => key !== 'Andamento Processual'
        );
    }, [processId]);

    const filteredUpdates = useMemo(() => {
        let baseUpdates: ClientUpdate[];

        if (showDeleted) {
            if (user?.isAdmin) {
                baseUpdates = updates.filter(u => u.deleted);
            } else {
                baseUpdates = updates.filter(u => u.deleted && u.deletedBy === user?.name);
            }
        } else {
            baseUpdates = updates.filter(u => !u.deleted);
        }

        if (selectedUpdateTypes.length === 0) {
            return baseUpdates;
        }
        return baseUpdates.filter(u => selectedUpdateTypes.includes(u.type));
    }, [updates, selectedUpdateTypes, showDeleted, user]);

    const deletedCount = useMemo(() => {
        if (user?.isAdmin) {
            return updates.filter(u => u.deleted).length;
        }
        return updates.filter(u => u.deleted && u.deletedBy === user?.name).length;
    }, [updates, user]);

    return (
        <AlertDialog>
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle>Andamentos</CardTitle>
                    <div className="flex items-center gap-2">
                         {deletedCount > 0 && (
                            <Button variant="outline" onClick={() => setShowDeleted(!showDeleted)}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                {showDeleted ? `Ver Ativos` : `Lixeira (${deletedCount})`}
                            </Button>
                        )}
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
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {!showDeleted && (
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

                                {newUpdateType === 'Andamento Processual' && (
                                     <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant={"outline"}
                                                className={cn("w-[240px] justify-start text-left font-normal", !newUpdateDate && "text-muted-foreground")}
                                                disabled={isSubmitting}
                                            >
                                                <Calendar className="mr-2 h-4 w-4" />
                                                {newUpdateDate ? format(newUpdateDate, "PPP", { locale: ptBR }) : <span>Selecione a data</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <CalendarComponent mode="single" selected={newUpdateDate} onSelect={setNewUpdateDate} initialFocus />
                                        </PopoverContent>
                                    </Popover>
                                )}
                            </div>
                            <Button onClick={handleAddUpdate} disabled={!newUpdateDescription.trim() || !user || isSubmitting}>
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                                Adicionar
                            </Button>
                        </div>
                    </div>
                </div>
                )}


                {/* Lista de andamentos */}
                <div className="space-y-4">
                    {isLoading ? (
                        <div className="text-center text-muted-foreground py-8">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                            <p className="mt-2">Carregando andamentos...</p>
                        </div>
                    ) : filteredUpdates.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                            {showDeleted ? "A lixeira está vazia." : selectedUpdateTypes.length > 0
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
                                
                                const shouldShowClientName = processId && update.clientId && update.clientId !== mainClientIdForProcess;

                                const getEditHref = () => {
                                    const baseClientId = clientId || update.clientId;
                                    const processIdParam = processId ? `?processId=${processId}` : '';
                                    const clientIdParam = baseClientId ? `?clientId=${baseClientId}` : '';

                                    switch (update.type) {
                                        case 'Tarefa': return `/dashboard/tasks/${update.id}/edit`;
                                        case 'Anotação': return `/dashboard/annotations/${update.id}/edit${clientIdParam}`;
                                        case 'Atendimento': return `/dashboard/communications/${update.id}/edit${clientIdParam}`;
                                        case 'Andamento Processual': return `/dashboard/process-updates/${update.id}/edit${processIdParam}`;
                                        default: return undefined;
                                    }
                                };
                                const editHref = getEditHref();

                                return (
                                    <div key={update.id} className={cn("flex items-start gap-3 rounded-lg border p-3 transition-colors group", config.color, update.deleted && 'bg-muted/50 text-muted-foreground')}>
                                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-background flex-shrink-0 mt-0.5">
                                            <Icon className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="flex-1">
                                                    {/* Layout para Andamento Processual */}
                                                    {update.type === 'Andamento Processual' ? (
                                                        <>
                                                            <p className="font-medium text-sm text-foreground">
                                                                {update.updateDate ? format(parseISO(update.updateDate as string), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : 'Data não informada'}
                                                            </p>
                                                            <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{update.description}</p>
                                                            <div className="text-xs text-muted-foreground/80 flex items-center gap-1.5 flex-wrap mt-2">
                                                                <User className="h-3 w-3" /> 
                                                                <span>Registrado por: {update.author}</span>
                                                                <span>&bull;</span>
                                                                <span>{format(parseISO(update.createdAt as string), "dd/MM/yyyy 'às' HH:mm")}</span>
                                                            </div>
                                                        </>
                                                    ) : (
                                                    // Layout para outros tipos de andamento
                                                    <>
                                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                                            <p className="font-medium text-sm text-foreground">{config.label}</p>
                                                            {shouldShowClientName && update.clientName && (
                                                                <Button variant="link" asChild className="p-0 h-auto font-normal text-muted-foreground hover:text-primary">
                                                                    <Link href={`/dashboard/clients/${update.clientId}`}>{update.clientName}</Link>
                                                                </Button>
                                                            )}
                                                            {(update.type === 'Tarefa') && update.processId && update.processNumber && !processId && (
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
                                                            <span>{format(parseISO(update.createdAt as string), "dd/MM/yyyy 'às' HH:mm")}</span>
                                                        </div>
                                                        <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{update.description}</p>
                                                    </>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                    {!update.deleted && editHref && (
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" asChild>
                                                            <Link href={editHref}>
                                                                <Edit className="h-4 w-4" />
                                                                <span className="sr-only">Editar</span>
                                                            </Link>
                                                        </Button>
                                                    )}
                                                    
                                                     {!update.deleted && (
                                                         <AlertDialogTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-7 w-7 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                                                onClick={() => setUpdateToAction(update)}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                                <span className="sr-only">Excluir</span>
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                     )}
                                                     
                                                    {update.deleted && (
                                                         <AlertDialogTrigger asChild>
                                                            <Button variant="outline" size="sm" className="h-7" onClick={() => setUpdateToAction(update)}>
                                                                <ArchiveRestore className="h-4 w-4" />
                                                                <span className="ml-2">Restaurar</span>
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                    )}

                                                    {update.deleted && user?.isAdmin && (
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="destructive" size="sm" className="h-7" onClick={() => setUpdateToAction(update)}>
                                                                Excluir Perm.
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                    )}
                                                </div>
                                            </div>
                                            
                                             {update.deleted && (
                                                <div className="text-xs text-destructive mt-2">
                                                    Excluído por {update.deletedBy} em {format(parseISO(update.deletedAt as string), 'dd/MM/yy')}
                                                </div>
                                            )}

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
                 {updateToAction && (
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                                <ShieldAlert className="h-6 w-6 text-amber-500" />
                                {showDeleted
                                    ? user?.isAdmin
                                        ? "Escolha uma Ação"
                                        : "Confirmar Restauração"
                                    : "Confirmar Exclusão"
                                }
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {showDeleted
                                    ? user?.isAdmin
                                        ? `O que você deseja fazer com este andamento de "${updateToAction.author}"?`
                                        : `Tem certeza que deseja restaurar este andamento?`
                                    : `Tem certeza que deseja enviar este andamento para a lixeira?`}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                             <AlertDialogCancel onClick={() => setUpdateToAction(null)}>Cancelar</AlertDialogCancel>
                            {showDeleted && user?.isAdmin && (
                                <>
                                    <AlertDialogAction onClick={() => handleDeleteAction('restore')}>Restaurar</AlertDialogAction>
                                    <AlertDialogAction onClick={() => handleDeleteAction('permanent-delete')} className="bg-destructive hover:bg-destructive/90">Excluir Perm.</AlertDialogAction>
                                </>
                            )}
                            {showDeleted && !user?.isAdmin && (
                                 <AlertDialogAction onClick={() => handleDeleteAction('restore')}>Sim, Restaurar</AlertDialogAction>
                            )}
                            {!showDeleted && (
                                <AlertDialogAction onClick={() => handleDeleteAction('soft-delete')} className="bg-destructive hover:bg-destructive/90">
                                    Sim, Enviar para Lixeira
                                </AlertDialogAction>
                            )}
                        </AlertDialogFooter>
                    </AlertDialogContent>
                )}
            </CardContent>
        </Card>
        </AlertDialog>
    );
}
    
    



