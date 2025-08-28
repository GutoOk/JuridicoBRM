
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Calendar, Tag, Type, Trash2, User, Loader2 } from "lucide-react";
import type { ClientUpdate } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { getClientUpdates, addClientUpdate, deleteClientUpdate } from "@/app/dashboard/clients/[id]/actions";
import { useToast } from "@/hooks/use-toast";

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
    const [newUpdateDescription, setNewUpdateDescription] = useState("");
    const [newUpdateType, setNewUpdateType] = useState<ClientUpdate['type']>('Atendimento');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
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

        fetchUpdates();
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
        // Optimistic UI update
        const originalUpdates = [...updates];
        setUpdates(updates.filter(update => update.id !== id));

        try {
            await deleteClientUpdate(clientId, id);
        } catch (error) {
            // Revert if error
            setUpdates(originalUpdates);
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({
                title: "Erro ao excluir andamento",
                description: errorMessage,
                variant: "destructive"
            });
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
                        <div className="space-y-3">
                            {updates.map((update) => {
                                const config = updateTypeConfig[update.type];
                                const Icon = config.icon;
                                const date = new Date(update.createdAt as string);
                                return (
                                    <div key={update.id} className={cn("flex items-start gap-4 rounded-lg border p-4 transition-colors group", config.color)}>
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-background flex-shrink-0">
                                            <Icon className="h-5 w-5 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="font-semibold text-foreground">{config.label}</p>
                                                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                                                        <User className="h-3 w-3" /> 
                                                        <span>{update.author}</span>
                                                        <span>&bull;</span>
                                                        <span>{date.toLocaleString('pt-BR')}</span>
                                                    </div>
                                                </div>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                                    onClick={() => handleDeleteUpdate(update.id)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                    <span className="sr-only">Excluir</span>
                                                </Button>
                                            </div>
                                            <p className="text-muted-foreground mt-2 whitespace-pre-wrap">{update.description}</p>
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
