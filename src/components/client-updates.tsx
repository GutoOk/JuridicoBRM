
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Calendar, Tag, Type, Trash2 } from "lucide-react";
import type { ClientUpdate } from "@/lib/types";
import { cn } from "@/lib/utils";

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

export function ClientUpdates() {
    const [updates, setUpdates] = useState<ClientUpdate[]>([]);
    const [newUpdateDescription, setNewUpdateDescription] = useState("");
    const [newUpdateType, setNewUpdateType] = useState<ClientUpdate['type']>('Atendimento');
    const [isAdding, setIsAdding] = useState(false);

    const handleAddUpdate = () => {
        if (!newUpdateDescription.trim()) return;

        const newUpdate: ClientUpdate = {
            id: Date.now().toString(),
            date: new Date(),
            description: newUpdateDescription.trim(),
            type: newUpdateType,
        };

        setUpdates([newUpdate, ...updates]);
        setNewUpdateDescription("");
        setNewUpdateType("Atendimento");
        setIsAdding(false);
    };
    
    const handleDeleteUpdate = (id: string) => {
        setUpdates(updates.filter(update => update.id !== id));
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
                        />
                        <div className="flex justify-between items-center">
                            <Select value={newUpdateType} onValueChange={(value) => setNewUpdateType(value as ClientUpdate['type'])}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Tipo de andamento" />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(updateTypeConfig).map(([key, config]) => (
                                         <SelectItem key={key} value={key}>{config.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                             <Button onClick={handleAddUpdate} disabled={!newUpdateDescription.trim()}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Adicionar
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Lista de andamentos */}
                <div className="space-y-4">
                    {updates.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                            Nenhum andamento registrado para este cliente.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {updates.map((update) => {
                                const config = updateTypeConfig[update.type];
                                const Icon = config.icon;
                                return (
                                    <div key={update.id} className={cn("flex items-start gap-4 rounded-lg border p-4 transition-colors group", config.color)}>
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-background flex-shrink-0">
                                            <Icon className="h-5 w-5 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-center">
                                                <p className="font-semibold text-foreground">{config.label}</p>
                                                <p className="text-xs text-muted-foreground">{update.date.toLocaleString('pt-BR')}</p>
                                            </div>
                                            <p className="text-muted-foreground mt-1">{update.description}</p>
                                        </div>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => handleDeleteUpdate(update.id)}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                            <span className="sr-only">Excluir</span>
                                        </Button>
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
