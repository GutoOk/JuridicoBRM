
"use client";

import { useState, useEffect } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, Loader2, Users, UserCog, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Client, User } from "@/lib/types";
import { createTasks } from "@/app/dashboard/tasks/actions";
import { getUsers } from "@/app/dashboard/users/actions";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";


const priorityConfig = {
    'Alta': { icon: ArrowUp, color: 'text-red-500' },
    'Média': { icon: ArrowDown, color: 'text-yellow-500' },
    'Baixa': { icon: Minus, color: 'text-blue-500' },
}

const formSchema = z.object({
    description: z.string().min(1, "A descrição é obrigatória."),
    selectedClientIds: z.array(z.string()).default([]),
    responsible: z.string().default('Todos'),
    priority: z.enum(['Alta', 'Média', 'Baixa']).default('Média'),
    dueDate: z.date().optional().nullable(),
});

type AddTaskFormValues = z.infer<typeof formSchema>;

interface AddTaskDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    clients: Client[];
    onTaskCreated: () => void;
}

export function AddTaskDialog({ open, onOpenChange, clients, onTaskCreated }: AddTaskDialogProps) {
    const { toast } = useToast();
    const { user } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<AddTaskFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            description: "",
            selectedClientIds: [],
            responsible: "Todos",
            priority: "Média",
            dueDate: null,
        },
    });

    useEffect(() => {
        if(open) {
            getUsers().then(setUsers).catch(() => {
                 toast({ title: "Erro ao carregar usuários.", variant: "destructive" });
            });
        }
    }, [open, toast]);

    const handleClose = () => {
        form.reset();
        onOpenChange(false);
    };

    const onSubmit = async (values: AddTaskFormValues) => {
        if (!user) {
            toast({ title: "Usuário não autenticado", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                ...values,
                dueDate: values.dueDate ? values.dueDate.toISOString() : null,
                author: user.name,
            };

            await createTasks(payload as any);
            
            const clientCount = values.selectedClientIds.length;
            if (clientCount > 0) {
                 toast({ title: "Tarefa(s) Criada(s)!", description: `Uma nova tarefa foi adicionada para ${clientCount} cliente(s).` });
            } else {
                 toast({ title: "Tarefa Geral Criada!", description: "A nova tarefa geral foi adicionada com sucesso." });
            }
           
            onTaskCreated();
            handleClose();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({ title: "Erro ao criar tarefa(s)", description: errorMessage, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const selectedClientsCount = form.watch("selectedClientIds").length;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Adicionar Nova Tarefa</DialogTitle>
                    <DialogDescription>
                        Preencha os detalhes da tarefa abaixo. Você pode criar uma tarefa geral ou vinculá-la a um ou mais clientes.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="description">Descrição da Tarefa</Label>
                        <Textarea id="description" {...form.register("description")} placeholder="Ex: Elaborar petição inicial..." />
                         {form.formState.errors.description && <p className="text-sm font-medium text-destructive">{form.formState.errors.description.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label>Vincular a Cliente(s) (Opcional)</Label>
                        <div className="rounded-md border">
                            <div className="flex items-center justify-between border-b bg-muted/50 p-3">
                                <p className="text-sm font-medium">Clientes Cadastrados</p>
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
                                                        id={`client-${client.id}`}
                                                        checked={field.value?.includes(client.id)}
                                                        onCheckedChange={(checked) => {
                                                            return checked
                                                                ? field.onChange([...(field.value || []), client.id])
                                                                : field.onChange(field.value?.filter(id => id !== client.id));
                                                        }}
                                                    />
                                                )}
                                            />
                                            <Label htmlFor={`client-${client.id}`} className="font-normal w-full cursor-pointer">{client.name}</Label>
                                        </div>
                                    )) : (
                                        <p className="text-sm text-center text-muted-foreground py-4">Nenhum cliente cadastrado.</p>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Responsável</Label>
                            <Controller
                                control={form.control}
                                name="responsible"
                                render={({ field }) => (
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Todos">Todos</SelectItem>
                                            {users.map(u => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>
                         <div className="space-y-2">
                            <Label>Prioridade</Label>
                             <Controller
                                control={form.control}
                                name="priority"
                                render={({ field }) => (
                                     <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <SelectTrigger>
                                            <SelectValue />
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
                                )}
                            />
                        </div>
                         <div className="space-y-2">
                            <Label>Prazo</Label>
                             <Controller
                                control={form.control}
                                name="dueDate"
                                render={({ field }) => (
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant={"outline"}
                                                className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <Calendar
                                                mode="single"
                                                selected={field.value || undefined}
                                                onSelect={field.onChange}
                                                initialFocus
                                                locale={ptBR}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                )}
                             />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {selectedClientsCount > 1 ? `Criar ${selectedClientsCount} Tarefas` : 'Criar Tarefa'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

