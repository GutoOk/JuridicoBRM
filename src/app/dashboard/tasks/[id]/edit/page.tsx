
"use client";

import { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, Loader2, ArrowUp, ArrowDown, Minus, ArrowLeft } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import type { Task, User } from "@/lib/types";
import { getTaskById, updateTask } from "@/app/dashboard/tasks/actions";
import { getUsers } from "@/app/dashboard/users/actions";
import { format, parseISO } from "date-fns";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";


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


export default function EditTaskPage() {
    const { toast } = useToast();
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();

    const taskId = params.id as string;
    const clientId = searchParams.get('clientId');

    const [task, setTask] = useState<Task | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<EditTaskFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            description: "",
            responsible: "Todos",
            priority: "Média",
            dueDate: null,
        },
    });
    
    useEffect(() => {
        if (!taskId) return;

        async function fetchData() {
            setIsLoading(true);
            try {
                const [fetchedTask, fetchedUsers] = await Promise.all([
                    getTaskById(taskId, clientId),
                    getUsers()
                ]);

                if (fetchedTask) {
                    setTask(fetchedTask);
                    setUsers(fetchedUsers);
                    form.reset({
                        description: fetchedTask.description || fetchedTask.title,
                        responsible: fetchedTask.responsible || "Todos",
                        priority: fetchedTask.priority || "Média",
                        dueDate: fetchedTask.dueDate ? parseISO(fetchedTask.dueDate as string) : null,
                    });
                } else {
                    toast({ title: "Tarefa não encontrada", variant: "destructive" });
                    router.push('/dashboard/tasks');
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
                toast({ title: "Erro ao carregar dados", description: errorMessage, variant: "destructive" });
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, [taskId, clientId, router, toast, form]);


    const onSubmit = async (values: EditTaskFormValues) => {
        if (!task) return;
        setIsSubmitting(true);
        try {
            const payload: Partial<Task> = {
                id: taskId,
                clientId: clientId || undefined,
                ...values,
                dueDate: values.dueDate ? values.dueDate.toISOString() : null,
            };
            
            await updateTask(payload);
            
            toast({ title: "Tarefa Atualizada!", description: `A tarefa foi atualizada com sucesso.` });
            
            // Navigate back to the most relevant page
            if (task.processId) {
                router.push(`/dashboard/processes/${task.processId}`);
            } else if (clientId) {
                router.push(`/dashboard/clients/${clientId}`);
            } else {
                router.push("/dashboard/tasks");
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({ title: "Erro ao atualizar tarefa", description: errorMessage, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const cancelHref = task?.processId ? `/dashboard/processes/${task.processId}` : clientId ? `/dashboard/clients/${clientId}` : '/dashboard/tasks';

     if (isLoading) {
        return (
            <div className="mx-auto w-full max-w-7xl">
                 <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10" />
                    <div className="space-y-2">
                        <Skeleton className="h-6 w-64" />
                        <Skeleton className="h-4 w-80" />
                    </div>
                </div>
                <Card className="mt-6">
                    <CardHeader>
                        <Skeleton className="h-8 w-1/2" />
                        <Skeleton className="h-4 w-3/4" />
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <Skeleton className="h-20 w-full" />
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
       <div className="mx-auto w-full max-w-7xl">
            <div className="flex items-center gap-4">
                 <Button variant="outline" size="icon" asChild>
                    <Link href={cancelHref}>
                        <ArrowLeft className="h-4 w-4" />
                        <span className="sr-only">Voltar</span>
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Editar Tarefa</h1>
                    <p className="text-muted-foreground">
                        {task?.clientName ? `Referente a: ${task.clientName}` : 'Tarefa Geral'}
                    </p>
                </div>
            </div>
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 mt-6">
                 <Card>
                    <CardHeader>
                        <CardTitle>Detalhes da Tarefa</CardTitle>
                        <CardDescription>
                           Modifique os campos abaixo e clique em salvar para aplicar as alterações.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <FormField control={form.control} name="description" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Descrição da Tarefa</FormLabel>
                                <FormControl>
                                    <Textarea {...field} placeholder="Ex: Elaborar petição inicial..." />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                           <FormField control={form.control} name="responsible" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Responsável</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="Todos">Todos</SelectItem>
                                            {users.map(u => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="priority" render={({ field }) => (
                                 <FormItem>
                                    <FormLabel>Prioridade</FormLabel>
                                     <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {Object.entries(priorityConfig).map(([key, config]) => (
                                                <SelectItem key={key} value={key as 'Alta' | 'Média' | 'Baixa'}>
                                                    <div className="flex items-center gap-2">
                                                        <config.icon className={cn("h-4 w-4", config.color)} />
                                                        {key}
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                 </FormItem>
                            )} />
                            <FormField control={form.control} name="dueDate" render={({ field }) => (
                                <FormItem className="flex flex-col pt-2">
                                    <FormLabel className="mb-2">Prazo</FormLabel>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                             <FormControl>
                                                <Button
                                                    variant={"outline"}
                                                    className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                                                >
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
                                                </Button>
                                             </FormControl>
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
                                </FormItem>
                             )} />
                        </div>

                         <div className="flex justify-end gap-2 pt-4">
                            <Button type="button" variant="outline" asChild>
                                <Link href={cancelHref}>Cancelar</Link>
                            </Button>
                            <Button type="submit" className="bg-accent hover:bg-accent/90" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Salvar Alterações
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </form>
            </Form>
       </div>
    );
}
