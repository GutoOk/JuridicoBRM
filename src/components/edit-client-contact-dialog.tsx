
"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
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
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, PlusCircle, Trash2, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Client } from "@/lib/types";
import { updateClient } from "@/app/dashboard/clients/actions";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Separator } from "./ui/separator";

const phoneSchema = z.object({
  number: z.string().min(1, "O número é obrigatório."),
  description: z.string().min(1, "A descrição é obrigatória."),
  isPrimary: z.boolean().default(false),
});

const emailSchema = z.object({
  address: z.string().email("E-mail inválido.").or(z.literal('')).optional(),
  description: z.string().min(1, "A descrição é obrigatória."),
  isPrimary: z.boolean().default(false),
});

const formSchema = z.object({
  emails: z.array(emailSchema).optional(),
  phones: z.array(phoneSchema).optional(),
});

type EditContactFormValues = z.infer<typeof formSchema>;

interface EditClientContactDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    client: Client;
    onContactUpdated: () => void;
}

export function EditClientContactDialog({ open, onOpenChange, client, onContactUpdated }: EditClientContactDialogProps) {
    const { toast } = useToast();
    const { user } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<EditContactFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            emails: client.emails || [],
            phones: client.phones || [],
        },
    });

    const { fields: emailFields, append: appendEmail, remove: removeEmail, update: updateEmail } = useFieldArray({
        control: form.control,
        name: "emails",
    });

    const { fields: phoneFields, append: appendPhone, remove: removePhone, update: updatePhone } = useFieldArray({
        control: form.control,
        name: "phones",
    });

    const setPrimaryEmail = (index: number) => {
        emailFields.forEach((field, idx) => {
        updateEmail(idx, { ...field, isPrimary: idx === index });
        });
    };

    const setPrimaryPhone = (index: number) => {
        phoneFields.forEach((field, idx) => {
        updatePhone(idx, { ...field, isPrimary: idx === index });
        });
    };

    const handleClose = () => {
        onOpenChange(false);
        // Delay form reset to avoid flicker
        setTimeout(() => form.reset({
            emails: client.emails || [],
            phones: client.phones || [],
        }), 300);
    };

    const onSubmit = async (values: EditContactFormValues) => {
        if (!user) {
            toast({ title: "Usuário não autenticado.", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            await updateClient(client.id, { emails: values.emails, phones: values.phones }, user.name);
            
            toast({ title: "Contato Atualizado!", description: "Os contatos do cliente foram salvos." });
           
            onContactUpdated();
            handleClose();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({ title: "Erro ao atualizar contato", description: errorMessage, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Editar Contato</DialogTitle>
                     <DialogDescription>
                        Alterando informações de contato para o cliente {client.name}.
                    </DialogDescription>
                </DialogHeader>
                 <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="max-h-[60vh] overflow-y-auto p-1 pr-4 space-y-4">
                            {/* Emails */}
                            <div className="space-y-4 rounded-lg border p-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-medium">E-mails</h4>
                                    <Button type="button" size="sm" variant="outline" onClick={() => appendEmail({ address: "", description: "", isPrimary: emailFields.length === 0 })}><PlusCircle className="mr-2 h-4 w-4" />Adicionar</Button>
                                </div>
                                {emailFields.map((field, index) => (
                                    <div key={field.id} className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr,1fr,auto,auto] sm:items-end">
                                        <FormField control={form.control} name={`emails.${index}.address`} render={({ field }) => (
                                            <FormItem><FormLabel className={cn(index !== 0 && "sr-only")}>E-mail</FormLabel><FormControl><Input {...field} placeholder="email@exemplo.com" type="email" /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name={`emails.${index}.description`} render={({ field }) => (
                                            <FormItem><FormLabel className={cn(index !== 0 && "sr-only")}>Descrição</FormLabel><FormControl><Input {...field} placeholder="Principal, Contato, etc." /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <Button type="button" variant={field.isPrimary ? "default" : "ghost"} size="icon" onClick={() => setPrimaryEmail(index)} className={cn(field.isPrimary && "bg-primary text-primary-foreground hover:bg-primary/90")}><Star className={cn("h-4 w-4", field.isPrimary ? "text-yellow-300 fill-yellow-300" : "text-muted-foreground")} /><span className="sr-only">Principal</span></Button>
                                        <Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => removeEmail(index)}><Trash2 className="h-4 w-4" /><span className="sr-only">Remover</span></Button>
                                    </div>
                                ))}
                                {emailFields.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum e-mail adicionado.</p>}
                                <FormMessage>{form.formState.errors.emails?.root?.message}</FormMessage>
                            </div>
                            {/* Telefones */}
                            <div className="space-y-4 rounded-lg border p-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-medium">Telefones</h4>
                                    <Button type="button" size="sm" variant="outline" onClick={() => appendPhone({ number: "", description: "", isPrimary: phoneFields.length === 0 })}><PlusCircle className="mr-2 h-4 w-4" />Adicionar</Button>
                                </div>
                                {phoneFields.map((field, index) => (
                                    <div key={field.id} className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr,1fr,auto,auto] sm:items-end">
                                        <FormField control={form.control} name={`phones.${index}.number`} render={({ field }) => (
                                            <FormItem><FormLabel className={cn(index !== 0 && "sr-only")}>Número</FormLabel><FormControl><Input {...field} placeholder="(99) 99999-9999" /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name={`phones.${index}.description`} render={({ field }) => (
                                            <FormItem><FormLabel className={cn(index !== 0 && "sr-only")}>Descrição</FormLabel><FormControl><Input {...field} placeholder="Celular, Recado, etc." /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <Button type="button" variant={field.isPrimary ? "default" : "ghost"} size="icon" onClick={() => setPrimaryPhone(index)} className={cn(field.isPrimary && "bg-primary text-primary-foreground hover:bg-primary/90")}><Star className={cn("h-4 w-4", field.isPrimary ? "text-yellow-300 fill-yellow-300" : "text-muted-foreground")} /><span className="sr-only">Principal</span></Button>
                                        <Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => removePhone(index)}><Trash2 className="h-4 w-4" /><span className="sr-only">Remover</span></Button>
                                    </div>
                                ))}
                                {phoneFields.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum telefone adicionado.</p>}
                                <FormMessage>{form.formState.errors.phones?.root?.message}</FormMessage>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting || !form.formState.isDirty}>
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Salvar Alterações
                            </Button>
                        </DialogFooter>
                    </form>
                 </Form>
            </DialogContent>
        </Dialog>
    );
}
    