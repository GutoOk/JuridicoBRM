
"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Client } from "@/lib/types";
import { createCommunications } from "@/app/dashboard/communications/actions";


const formSchema = z.object({
    description: z.string().min(1, "A descrição é obrigatória."),
    selectedClientIds: z.array(z.string()).default([]),
});

type AddCommunicationFormValues = z.infer<typeof formSchema>;

interface AddCommunicationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    clients: Client[];
    onCommunicationCreated: () => void;
}

export function AddCommunicationDialog({ open, onOpenChange, clients, onCommunicationCreated }: AddCommunicationDialogProps) {
    const { toast } = useToast();
    const { user } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<AddCommunicationFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            description: "",
            selectedClientIds: [],
        },
    });

    const handleClose = () => {
        form.reset();
        onOpenChange(false);
    };

    const onSubmit = async (values: AddCommunicationFormValues) => {
        if (!user) {
            toast({ title: "Usuário não autenticado", variant: "destructive" });
            return;
        }
        if (values.selectedClientIds.length === 0) {
            toast({ title: "Nenhum cliente selecionado", description: "Por favor, selecione ao menos um cliente para registrar o atendimento.", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                ...values,
                author: user.name,
            };

            await createCommunications(payload as any);
            
            const clientCount = values.selectedClientIds.length;
            toast({ title: "Atendimento(s) Registrado(s)!", description: `Um novo atendimento foi adicionado para ${clientCount} cliente(s).` });
           
            onCommunicationCreated();
            handleClose();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({ title: "Erro ao registrar atendimento(s)", description: errorMessage, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const selectedClientsCount = form.watch("selectedClientIds").length;

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Registrar Novo Atendimento</DialogTitle>
                    <DialogDescription>
                        Descreva o atendimento e selecione os clientes envolvidos.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="description">Descrição do Atendimento</Label>
                        <Textarea id="description" {...form.register("description")} placeholder="Ex: Reunião para discutir o caso..." />
                         {form.formState.errors.description && <p className="text-sm font-medium text-destructive">{form.formState.errors.description.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <div className="rounded-md border">
                            <div className="flex items-center justify-between border-b bg-muted/50 p-3">
                                <p className="text-sm font-medium">Selecionar Clientes</p>
                                <p className="text-sm text-muted-foreground">{selectedClientsCount} de {clients.length} selecionado(s)</p>
                            </div>
                            <ScrollArea className="h-48">
                                <div className="p-3 space-y-2">
                                     {clients.length > 0 ? clients.map(client => (
                                        <div key={client.id} className="flex items-center space-x-2">
                                            <Controller
                                                control={form.control}
                                                name="selectedClientIds"
                                                render={({ field }) => (
                                                    <Checkbox
                                                        id={`client-comm-${client.id}`}
                                                        checked={field.value?.includes(client.id)}
                                                        onCheckedChange={(checked) => {
                                                            return checked
                                                                ? field.onChange([...(field.value || []), client.id])
                                                                : field.onChange(field.value?.filter(id => id !== client.id));
                                                        }}
                                                    />
                                                )}
                                            />
                                            <Label htmlFor={`client-comm-${client.id}`} className="font-normal w-full cursor-pointer">{client.name}</Label>
                                        </div>
                                    )) : (
                                        <p className="text-sm text-center text-muted-foreground py-4">Nenhum cliente cadastrado.</p>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
                        <Button type="submit" disabled={isSubmitting || selectedClientsCount === 0}>
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {selectedClientsCount > 1 ? `Registrar ${selectedClientsCount} Atendimentos` : 'Registrar Atendimento'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}


    