

"use client";

import React, { useEffect, useState, useMemo } from "react";
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
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getProcessById, updateProcess } from "@/app/dashboard/processes/actions";
import { getClients } from "@/app/dashboard/clients/actions";
import { useRouter, useParams } from "next/navigation";
import { Loader2, ArrowLeft, Star } from "lucide-react";
import Link from "next/link";
import type { Client, Process } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

const formSchema = z.object({
  processNumber: z.string().min(3, "O número do processo é obrigatório."),
  clientIds: z.array(z.string()).min(1, "Selecione ao menos um cliente."),
  mainClientId: z.string().optional(),
  actionType: z.string().min(1, "O tipo de ação é obrigatório."),
  vara: z.string().optional(),
  comarca: z.string().optional(),
  instancia: z.string().optional(),
  status: z.enum(['Ativo', 'Arquivado', 'Suspenso', 'Extinto']),
  notes: z.string().optional(),
});

type ProcessFormValues = z.infer<typeof formSchema>;

export default function EditProcessPage() {
    const { toast } = useToast();
    const router = useRouter();
    const params = useParams();
    const processId = params.id as string;

    const [processData, setProcessData] = useState<Process | null>(null);
    const [clients, setClients] = useState<Client[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [clientSearch, setClientSearch] = useState('');

    const form = useForm<ProcessFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            processNumber: "",
            clientIds: [],
            mainClientId: "",
            actionType: "",
            vara: "",
            comarca: "",
            instancia: "",
            status: "Ativo",
            notes: "",
        },
    });

    useEffect(() => {
        if (!processId) return;
        
        async function fetchData() {
            setIsLoading(true);
            try {
                const [fetchedProcess, fetchedClients] = await Promise.all([
                    getProcessById(processId),
                    getClients()
                ]);

                if (fetchedProcess) {
                    setProcessData(fetchedProcess);
                    setClients(fetchedClients);
                    
                    const defaultValues = {
                        processNumber: fetchedProcess.processNumber || "",
                        clientIds: fetchedProcess.clientIds || [],
                        mainClientId: fetchedProcess.mainClientId || "",
                        actionType: fetchedProcess.actionType || "",
                        vara: fetchedProcess.vara || "",
                        comarca: fetchedProcess.comarca || "",
                        instancia: fetchedProcess.instancia || "",
                        status: fetchedProcess.status || "Ativo",
                        notes: fetchedProcess.notes || "",
                    };
                    form.reset(defaultValues);
                } else {
                    toast({ title: "Processo não encontrado", variant: "destructive" });
                    router.push("/dashboard/processes");
                }
            } catch (error) {
                toast({ title: "Erro ao carregar dados", variant: "destructive" });
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, [processId, form, router, toast]);
    
    const { clientIds: selectedClientIds = [], mainClientId } = form.watch();

    // Effect to automatically set mainClientId when selection changes
    useEffect(() => {
        const currentMainClient = form.getValues('mainClientId');
        if (selectedClientIds.length > 0 && !selectedClientIds.includes(currentMainClient || '')) {
            form.setValue('mainClientId', selectedClientIds[0]);
        } else if (selectedClientIds.length === 0) {
            form.setValue('mainClientId', '');
        }
    }, [selectedClientIds, form]);


    async function onSubmit(values: ProcessFormValues) {
        setIsSubmitting(true);
        try {
            const selectedClients = clients.filter(c => values.clientIds.includes(c.id));
             if (selectedClients.length === 0) {
                throw new Error("Cliente(s) selecionado(s) não encontrado(s).");
            }
      
            const updatedProcessData = {
                ...values,
                clientNames: selectedClients.map(c => c.name),
            };

            await updateProcess(processId, updatedProcessData);
            toast({ title: "Processo Atualizado!", description: "Os dados do processo foram salvos." });
            router.push(`/dashboard/processes/${processId}`);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({ title: "Erro ao atualizar", description: errorMessage, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }

    const sortedAndFilteredClients = useMemo(() => {
        const selected = clients.filter(c => selectedClientIds.includes(c.id));
        const unselected = clients.filter(c => !selectedClientIds.includes(c.id));

        selected.sort((a, b) => {
            if (a.id === mainClientId) return -1;
            if (b.id === mainClientId) return 1;
            return a.name.localeCompare(b.name);
        });

        const filteredUnselected = unselected
            .filter(client => client.name.toLowerCase().includes(clientSearch.toLowerCase()))
            .sort((a, b) => a.name.localeCompare(b.name));

        return { selected, filteredUnselected };
    }, [clients, selectedClientIds, mainClientId, clientSearch]);


    if (isLoading) {
        return (
            <div className="mx-auto w-full max-w-7xl">
                <h1 className="text-2xl font-bold tracking-tight">Editar Processo</h1>
                <Card>
                    <CardHeader>
                        <Skeleton className="h-8 w-1/2" />
                        <Skeleton className="h-4 w-3/4" />
                    </CardHeader>
                    <CardContent className="space-y-8">
                         <Skeleton className="h-10 w-full" />
                         <Skeleton className="h-32 w-full" />
                         <Skeleton className="h-10 w-full" />
                    </CardContent>
                </Card>
            </div>
        )
    }

    const renderClientRow = (client: Client) => {
        const isChecked = selectedClientIds.includes(client.id);
        return (
            <div key={client.id} className={cn("flex items-center justify-between p-2 rounded-md", mainClientId === client.id && isChecked && "bg-accent/50")}>
                <FormField
                    key={client.id}
                    control={form.control}
                    name="clientIds"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                            <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                    const newClientIds = checked
                                        ? [...selectedClientIds, client.id]
                                        : selectedClientIds.filter((id) => id !== client.id);
                                    field.onChange(newClientIds);
                                }}
                            />
                            </FormControl>
                            <FormLabel className="font-normal w-full cursor-pointer">{client.name}</FormLabel>
                        </FormItem>
                    )}
                    />
                  {isChecked && (
                    <Button
                        type="button"
                        variant={mainClientId === client.id ? "default" : "ghost"}
                        size="sm"
                        onClick={() => form.setValue("mainClientId", client.id, { shouldDirty: true, shouldTouch: true })}
                        className={cn("h-7", mainClientId === client.id ? "bg-primary text-primary-foreground hover:bg-primary/90" : "")}
                        >
                        <Star className={cn("mr-2 h-4 w-4", mainClientId === client.id ? "text-yellow-300 fill-yellow-300" : "text-muted-foreground")} />
                        {mainClientId === client.id ? 'Principal' : 'Definir'}
                    </Button>
                )}
            </div>
        );
    };

    return (
        <div className="mx-auto w-full max-w-7xl">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" asChild>
                <Link href={`/dashboard/processes/${processId}`}>
                    <ArrowLeft className="h-4 w-4" />
                    <span className="sr-only">Voltar</span>
                </Link>
                </Button>
                <div>
                <h1 className="text-2xl font-bold tracking-tight">Editar Processo</h1>
                <p className="text-muted-foreground">Modificando {processData?.processNumber}</p>
                </div>
            </div>
      
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 mt-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Dados do Processo</CardTitle>
                        <CardDescription>Ajuste os campos necessários e salve as alterações.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                         <FormField control={form.control} name="processNumber" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Número do Processo</FormLabel>
                                <FormControl><Input {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                         )} />

                        <FormField
                            control={form.control}
                            name="clientIds"
                            render={() => (
                            <FormItem>
                                <div className="rounded-md border">
                                    <div className="flex items-center justify-between border-b bg-muted/50 p-3">
                                        <FormLabel className="text-sm font-medium">Clientes Vinculados</FormLabel>
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
                                            
                                            {sortedAndFilteredClients.filteredUnselected.map(renderClientRow)}
                                        </div>
                                    </ScrollArea>
                                </div>
                                <FormMessage />
                            </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                            <FormField control={form.control} name="actionType" render={({ field }) => (
                                <FormItem><FormLabel>Tipo de Ação</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="status" render={({ field }) => (
                                <FormItem>
                                <FormLabel>Status</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="Ativo">Ativo</SelectItem>
                                        <SelectItem value="Arquivado">Arquivado</SelectItem>
                                        <SelectItem value="Suspenso">Suspenso</SelectItem>
                                        <SelectItem value="Extinto">Extinto</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                                </FormItem>
                            )} />
                        </div>
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                             <FormField control={form.control} name="vara" render={({ field }) => (
                                <FormItem><FormLabel>Vara</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                             <FormField control={form.control} name="comarca" render={({ field }) => (
                                <FormItem><FormLabel>Comarca</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                             <FormField control={form.control} name="instancia" render={({ field }) => (
                                <FormItem><FormLabel>Instância</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                        </div>
                        <FormField control={form.control} name="notes" render={({ field }) => (
                            <FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea className="resize-y min-h-[100px]" {...field} /></FormControl><FormDescription>Opcional</FormDescription><FormMessage /></FormItem>
                        )} />

                        <div className="flex justify-end gap-2 pt-4">
                            <Button type="button" variant="outline" asChild>
                            <Link href={`/dashboard/processes/${processId}`}>Cancelar</Link>
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
