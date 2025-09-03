

"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
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
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, Loader2, ArrowUp, ArrowDown, Minus, Trash2, ShieldAlert } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import type { Task, User } from "@/lib/types";
import { updateTasksInBatch, softDeleteTasks } from "@/app/dashboard/tasks/actions";
import { getUsers } from "@/app/dashboard/users/actions";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const priorityConfig = {
    'Alta': { icon: ArrowUp, color: 'text-red-500' },
    'Média': { icon: Minus, color: 'text-yellow-500' },
    'Baixa': { icon: ArrowDown, color: 'text-blue-500' },
};

interface BulkTaskEditDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tasks: Task[];
    onTasksUpdated: () => void;
    currentUser: User;
}

export function BulkTaskEditDialog({ open, onOpenChange, tasks, onTasksUpdated, currentUser }: BulkTaskEditDialogProps) {
    const { toast } = useToast();
    const { control, handleSubmit, reset } = useForm();
    const [users, setUsers] = useState<User[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if(open) {
            getUsers().then(setUsers).catch(() => {
                 toast({ title: "Erro ao carregar usuários.", variant: "destructive" });
            });
        }
    }, [open, toast]);

    const handleClose = (updated = false) => {
        reset({ responsible: '', priority: '', dueDate: null, status: '' });
        onOpenChange(false);
        if(updated) {
            onTasksUpdated();
        }
    };

    const onUpdateSubmit = async (data: any) => {
        setIsSubmitting(true);
        try {
            const updates: {[key: string]: any} = Object.fromEntries(Object.entries(data).filter(([_, v]) => v));
             if (data.dueDate !== undefined) {
                updates.dueDate = data.dueDate ? data.dueDate.toISOString() : null;
            }

            if (Object.keys(updates).length === 0) {
                 toast({ title: "Nenhuma alteração selecionada", description: "Selecione ao menos um campo para alterar.", variant: "destructive" });
                 setIsSubmitting(false);
                 return;
            }

            await updateTasksInBatch({ tasks, updates, currentUser });
            toast({ title: "Tarefas Atualizadas!", description: `${tasks.length} tarefa(s) foram atualizadas com sucesso.` });
            handleClose(true);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({ title: "Erro ao atualizar tarefas", description: errorMessage, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const onDeleteSubmit = async () => {
        setIsDeleting(true);
        try {
            await softDeleteTasks(tasks, currentUser.name);
            toast({ title: "Tarefas Enviadas para a Lixeira!", description: `${tasks.length} tarefa(s) foram movidas para a lixeira.` });
            handleClose(true);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({ title: "Erro ao excluir tarefas", description: errorMessage, variant: "destructive" });
        } finally {
             setIsDeleting(false);
        }
    }


    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Ações em Lote para {tasks.length} Tarefa(s)</DialogTitle>
                    <DialogDescription>
                        Altere ou exclua as tarefas selecionadas. Apenas os campos preenchidos serão alterados.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onUpdateSubmit)} className="space-y-4 py-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Responsável</Label>
                            <Controller
                                control={control} name="responsible" defaultValue=""
                                render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <SelectTrigger><SelectValue placeholder="Manter inalterado" /></SelectTrigger>
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
                                control={control} name="priority" defaultValue=""
                                render={({ field }) => (
                                     <Select onValueChange={field.onChange} value={field.value}>
                                        <SelectTrigger><SelectValue placeholder="Manter inalterada" /></SelectTrigger>
                                        <SelectContent>
                                            {Object.entries(priorityConfig).map(([key, config]) => (
                                                <SelectItem key={key} value={key}>
                                                    <div className="flex items-center gap-2"><config.icon className={cn("h-4 w-4", config.color)} />{key}</div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>
                    </div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Prazo</Label>
                             <Controller
                                control={control} name="dueDate"
                                render={({ field }) => (
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Manter inalterado</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value || undefined} onSelect={field.onChange} initialFocus locale={ptBR} /></PopoverContent>
                                    </Popover>
                                )}
                             />
                        </div>
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Controller
                                control={control} name="status" defaultValue=""
                                render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <SelectTrigger><SelectValue placeholder="Manter inalterado" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Pendente">Pendente</SelectItem>
                                            <SelectItem value="Concluída">Concluída</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>
                    </div>

                    <DialogFooter className="pt-4">
                         <div className="flex w-full justify-between items-center">
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button type="button" variant="destructive" disabled={isDeleting}>
                                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                        Excluir
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader><AlertDialogTitle>Enviar para a Lixeira?</AlertDialogTitle><AlertDialogDescription>Tem certeza que deseja enviar as {tasks.length} tarefas selecionadas para a lixeira?</AlertDialogDescription></AlertDialogHeader>
                                    <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={onDeleteSubmit} className="bg-destructive hover:bg-destructive/90">Confirmar Exclusão</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            
                            <div className="flex gap-2">
                                <Button type="button" variant="outline" onClick={() => handleClose()}>Cancelar</Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild><Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar Alterações</Button></AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader><AlertDialogTitle>Confirmar Alterações</AlertDialogTitle><AlertDialogDescription>Você confirma a aplicação das alterações em {tasks.length} tarefas?</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleSubmit(onUpdateSubmit)}>Confirmar e Salvar</AlertDialogAction></AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
