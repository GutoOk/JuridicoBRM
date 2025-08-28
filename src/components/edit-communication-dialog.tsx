
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ClientUpdate } from "@/lib/types";
import { updateCommunication } from "@/app/dashboard/communications/actions";

const formSchema = z.object({
    description: z.string().min(1, "A descrição é obrigatória."),
});

type EditCommunicationFormValues = z.infer<typeof formSchema>;

interface EditCommunicationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    communication: ClientUpdate;
    onCommunicationUpdated: () => void;
}

export function EditCommunicationDialog({ open, onOpenChange, communication, onCommunicationUpdated }: EditCommunicationDialogProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<EditCommunicationFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            description: communication.description,
        },
    });

    const handleClose = () => {
        form.reset();
        onOpenChange(false);
    };

    const onSubmit = async (values: EditCommunicationFormValues) => {
        setIsSubmitting(true);
        try {
            if (!communication.clientId) {
                throw new Error("Client ID is missing.");
            }

            await updateCommunication(communication.id, communication.clientId, { description: values.description });
            
            toast({ title: "Atendimento Atualizado!", description: "O atendimento foi atualizado com sucesso." });
           
            onCommunicationUpdated();
            handleClose();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({ title: "Erro ao atualizar atendimento", description: errorMessage, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        Editar Atendimento
                    </DialogTitle>
                     <DialogDescription>
                        {communication.clientName ? `Referente a: ${communication.clientName}` : 'Atendimento Geral'}
                    </DialogDescription>
                </DialogHeader>
                 <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="description">Descrição</Label>
                        <Textarea id="description" {...form.register("description")} className="min-h-[150px]"/>
                         {form.formState.errors.description && <p className="text-sm font-medium text-destructive">{form.formState.errors.description.message}</p>}
                    </div>

                    <DialogFooter>
                         <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
                         <AlertDialog>
                            <AlertDialogTrigger asChild>
                                 <Button type="button" disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Salvar Alterações
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Confirmar Alterações</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Tem certeza de que deseja salvar as alterações neste atendimento?
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={form.handleSubmit(onSubmit)}>
                                        Confirmar e Salvar
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

    