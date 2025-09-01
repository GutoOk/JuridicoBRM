
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
  DialogClose,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, Loader2, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import type { Task, User } from "@/lib/types";
import { updateTask } from "@/app/dashboard/tasks/actions";
import { getUsers } from "@/app/dashboard/users/actions";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";


const priorityConfig = {
    'Alta': { icon: ArrowUp, color: 'text-red-500' },
    'Média': { icon: ArrowDown, color: 'text-yellow-500' },
    'Baixa': { icon: Minus, color: 'text-blue-500' },
}

const formSchema = z.object({
    description: z.string().min(1, "A descrição é obrigatória."),
    responsible: z.string().default('Todos'),
    priority: z.enum(['Alta', 'Média', 'Baixa']).default('Média'),
    dueDate: z.date().optional().nullable(),
});

type EditTaskFormValues = z.infer<typeof formSchema>;

interface EditTaskDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    task: Task;
    onTaskUpdated: () => void;
}

export function EditTaskDialog({ open, onOpenChange, task, onTaskUpdated }: EditTaskDialogProps) {
    const { toast } = useToast();
    const [users, setUsers] = useState<User[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<EditTaskFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            description: task.description || task.title,
            responsible: task.responsible || "Todos",
            priority: task.priority || "Média",
            dueDate: task.dueDate ? parseISO(task.dueDate as string) : null,
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

    const onSubmit = async (values: EditTaskFormValues) => {
        setIsSubmitting(true);
        try {
            const payload = {
                ...task, // Pass all original task properties
                ...values, // Override with form values
                dueDate: values.dueDate ? values.dueDate.toISOString() : null,
            };

            await updateTask(payload);
            
            toast({ title: "Tarefa Atualizada!", description: `A tarefa foi atualizada com sucesso.` });
           
            onTaskUpdated();
            handleClose();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({ title: "Erro ao atualizar tarefa", description: errorMessage, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {task.clientName ? `Tarefa referente a: ${task.clientName}` : 'Editar Tarefa Geral'}
                    </DialogTitle>
                     <DialogDescription>
                        Modifique os campos abaixo e clique em salvar para aplicar as alterações.
                    </DialogDescription>
                </DialogHeader>
                 <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="description">Descrição da Tarefa</Label>
                        <Textarea id="description" {...form.register("description")} placeholder="Ex: Elaborar petição inicial..." />
                         {form.formState.errors.description && <p className="text-sm font-medium text-destructive">{form.formState.errors.description.message}</p>}
                    </div>

                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Responsável</Label>
                            <Controller
                                control={form.control}
                                name="responsible"
                                render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value}>
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
                                     <Select onValueChange={field.onChange} value={field.value}>
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
                                                {field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Data</span>}
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
                                        Tem certeza de que deseja salvar as alterações nesta tarefa?
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
