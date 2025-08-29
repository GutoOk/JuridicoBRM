
"use client";

import { useState, useEffect, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, Loader2, ArrowUp, ArrowDown, Minus, ArrowLeft } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Client, User } from "@/lib/types";
import { createTasks } from "@/app/dashboard/tasks/actions";
import { getClients } from "@/app/dashboard/clients/actions";
import { getUsers } from "@/app/dashboard/users/actions";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";


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


export default function NewTaskPage() {
    const { toast } = useToast();
    const router = useRouter();
    const { user } = useAuth();
    const [clients, setClients] = useState<Client[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [clientSearch, setClientSearch] = useState('');

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
        async function fetchData() {
            setIsLoading(true);
            try {
                const [fetchedClients, fetchedUsers] = await Promise.all([
                    getClients(),
                    getUsers()
                ]);
                setClients(fetchedClients);
                setUsers(fetchedUsers);
            } catch (error) {
                 toast({ title: "Erro ao carregar dados.", description: "Não foi possível carregar clientes e usuários.", variant: "destructive" });
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, [toast]);

    const { selectedClientIds = [] } = form.watch();

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
           
            router.push("/dashboard/tasks");

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({ title: "Erro ao criar tarefa(s)", description: errorMessage, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const sortedAndFilteredClients = useMemo(() => {
        const selected = clients.filter(c => selectedClientIds.includes(c.id));
        const unselected = clients.filter(c => !selectedClientIds.includes(c.id));

        selected.sort((a, b) => a.name.localeCompare(b.name));

        const filteredUnselected = unselected
            .filter(client => client.name.toLowerCase().includes(clientSearch.toLowerCase()))
            .sort((a, b) => a.name.localeCompare(b.name));

        return { selected, filteredUnselected };
    }, [clients, selectedClientIds, clientSearch]);


    const renderClientRow = (client: Client) => {
        return (
             <FormField
                key={client.id}
                control={form.control}
                name="selectedClientIds"
                render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-3 space-y-0 p-2 rounded-md">
                    <FormControl>
                    <Checkbox
                        checked={field.value?.includes(client.id)}
                        onCheckedChange={(checked) => {
                             return checked
                                ? field.onChange([...(field.value || []), client.id])
                                : field.onChange(field.value?.filter(id => id !== client.id));
                        }}
                    />
                    </FormControl>
                    <FormLabel className="font-normal w-full cursor-pointer">{client.name}</FormLabel>
                </FormItem>
                )}
            />
        );
    };
    
    if (isLoading) {
        return (
            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10" />
                    <div className="space-y-2">
                        <Skeleton className="h-6 w-64" />
                        <Skeleton className="h-4 w-80" />
                    </div>
                </div>
                <Card>
                    <CardHeader>
                        <Skeleton className="h-8 w-1/2" />
                        <Skeleton className="h-4 w-3/4" />
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-32 w-full" />
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
       <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
                 <Button variant="outline" size="icon" asChild>
                    <Link href="/dashboard/tasks">
                        <ArrowLeft className="h-4 w-4" />
                        <span className="sr-only">Voltar</span>
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Adicionar Nova Tarefa</h1>
                    <p className="text-muted-foreground">Preencha os detalhes e vincule clientes se necessário.</p>
                </div>
            </div>
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                 <Card>
                    <CardHeader>
                        <CardTitle>Detalhes da Tarefa</CardTitle>
                        <CardDescription>
                           Crie uma tarefa geral ou vincule-a a um ou mais clientes.
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

                        <FormField control={form.control} name="selectedClientIds" render={() => (
                             <FormItem>
                                <Label>Selecionar Clientes (opcional)</Label>
                                <div className="rounded-md border">
                                    <div className="flex items-center justify-between border-b bg-muted/50 p-3">
                                         <p className="text-sm font-medium">Clientes Vinculados</p>
                                        <p className="text-sm text-muted-foreground">{selectedClientIds.length} de {clients.length} selecionado(s)</p>
                                    </div>
                                    <div className="p-3">
                                        <Input 
                                            placeholder="Filtrar por nome..."
                                            value={clientSearch}
                                            onChange={(e) => setClientSearch(e.target.value)}
                                        />
                                    </div>
                                    <ScrollArea className="h-60 border-t">
                                        <div className="p-3 space-y-1">
                                            {sortedAndFilteredClients.selected.map(renderClientRow)}
                                            
                                            {sortedAndFilteredClients.selected.length > 0 && sortedAndFilteredClients.filteredUnselected.length > 0 && (
                                                <Separator className="my-2" />
                                            )}
                                            
                                            {sortedAndFilteredClients.filteredUnselected.length > 0 ? (
                                                sortedAndFilteredClients.filteredUnselected.map(renderClientRow)
                                             ) : (
                                                clientSearch && <p className="text-sm text-center text-muted-foreground py-4">Nenhum cliente encontrado para "{clientSearch}".</p>
                                            )}
                                             {!clientSearch && sortedAndFilteredClients.filteredUnselected.length === 0 && (
                                                <p className="text-sm text-center text-muted-foreground py-4">Todos os clientes foram selecionados.</p>
                                             )}
                                        </div>
                                    </ScrollArea>
                                </div>
                             </FormItem>
                        )} />
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <FormField control={form.control} name="responsible" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Responsável</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                                     <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                        </FormControl>
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
                                 </FormItem>
                            )} />
                            <FormField control={form.control} name="dueDate" render={({ field }) => (
                                <FormItem className="flex flex-col pt-2">
                                    <FormLabel>Prazo</FormLabel>
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
                                <Link href="/dashboard/tasks">Cancelar</Link>
                            </Button>
                            <Button type="submit" className="bg-accent hover:bg-accent/90" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {selectedClientIds.length > 1 ? `Criar ${selectedClientIds.length} Tarefas` : 'Criar Tarefa'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </form>
            </Form>
       </div>
    );
}

    