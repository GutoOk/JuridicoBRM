
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Process } from "@/lib/types";
import { updateProcessNotes } from "@/app/dashboard/processes/actions";

const formSchema = z.object({
    notes: z.string().optional(),
});

type EditNotesFormValues = z.infer<typeof formSchema>;

interface EditProcessNotesDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    process: Process;
    onNotesUpdated: () => void;
}

export function EditProcessNotesDialog({ open, onOpenChange, process, onNotesUpdated }: EditProcessNotesDialogProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<EditNotesFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            notes: process.notes || "",
        },
    });

    const handleClose = () => {
        onOpenChange(false);
    };

    const onSubmit = async (values: EditNotesFormValues) => {
        setIsSubmitting(true);
        try {
            await updateProcessNotes(process.id, values.notes || "");
            toast({ title: "Observações Atualizadas!", description: "As observações do processo foram salvas." });
            onNotesUpdated();
            handleClose();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({ title: "Erro ao atualizar observações", description: errorMessage, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Editar Observações Gerais</DialogTitle>
                    <DialogDescription>
                        Alterando observações para o processo {process.processNumber}.
                    </DialogDescription>
                </DialogHeader>
                 <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="notes">Observações</Label>
                        <Textarea id="notes" {...form.register("notes")} className="min-h-[200px]"/>
                         {form.formState.errors.notes && <p className="text-sm font-medium text-destructive">{form.formState.errors.notes.message}</p>}
                    </div>
                    <DialogFooter>
                         <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
                         <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Salvar Alterações
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
