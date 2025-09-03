
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
import { addProcess, getProcesses } from "@/app/dashboard/processes/actions";
import { getClients } from "@/app/dashboard/clients/actions";
import { getProcessDataFromText } from "@/app/actions";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ArrowLeft, Star, Sparkles, PlusCircle } from "lucide-react";
import Link from "next/link";
import type { Client, Process } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { ActionTypeCombobox } from "@/components/action-type-combobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";


const formSchema = z.object({
  processNumber: z.string().min(3, "O número do processo é obrigatório."),
  clientIds: z.array(z.string()).min(1, "Selecione ao menos um cliente."),
  mainClientId: z.string().optional(),
  polo: z.enum(['Ativo', 'Passivo'], { required_error: "Selecione o polo do cliente." }),
  parteContraria: z.string().optional(),
  actionType: z.string().min(1, "O tipo de ação é obrigatório."),
  classe: z.string().optional(),
  assunto: z.string().optional(),
  vara: z.string().optional(),
  foro: z.string().optional(),
  juiz: z.string().optional(),
  instancia: z.string().optional(),
  status: z.enum(['Ativo', 'Arquivado', 'Suspenso', 'Extinto']),
  notes: z.string().optional(),
});

type ProcessFormValues = z.infer<typeof formSchema>;

export function NewProcessForm() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [allProcesses, setAllProcesses] = useState<Process[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [textToAnalyze, setTextToAnalyze] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);


  const preselectedClientId = searchParams.get('clientId');
  const cancelHref = preselectedClientId ? `/dashboard/clients/${preselectedClientId}` : '/dashboard/processes';

  const form = useForm<ProcessFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      processNumber: "",
      clientIds: preselectedClientId ? [preselectedClientId] : [],
      mainClientId: preselectedClientId ? preselectedClientId : "",
      polo: undefined,
      parteContraria: "",
      actionType: "",
      classe: "",
      assunto: "",
      vara: "",
      foro: "",
      juiz: "",
      instancia: "",
      status: "Ativo",
      notes: "",
    },
  });

  useEffect(() => {
    async function fetchData() {
      try {
        const [fetchedClients, fetchedProcesses] = await Promise.all([
            getClients(),
            getProcesses()
        ]);
        setClients(fetchedClients);
        setAllProcesses(fetchedProcesses);

      } catch (error) {
        toast({ title: "Erro ao carregar dados iniciais", variant: "destructive" });
      } finally {
        setIsLoadingData(false);
      }
    }
    fetchData();
  }, [toast]);

  const { clientIds: selectedClientIds = [], mainClientId } = form.watch();

  // Effect to automatically set mainClientId when selection changes
  useEffect(() => {
    if (selectedClientIds.length > 0 && !selectedClientIds.includes(mainClientId || '')) {
      form.setValue('mainClientId', selectedClientIds[0]);
    } else if (selectedClientIds.length === 0) {
      form.setValue('mainClientId', '');
    }
  }, [selectedClientIds, mainClientId, form]);


  const handleAnalyze = async () => {
    if (!textToAnalyze.trim()) {
        toast({ title: "Texto Vazio", description: "Cole alguma informação para análise.", variant: "destructive" });
        return;
    }
    setIsAnalyzing(true);
    try {
        const extractedData = await getProcessDataFromText({ textToAnalyze });

        if (extractedData.processNumber) form.setValue('processNumber', extractedData.processNumber, {shouldDirty: true});
        if (extractedData.actionType) form.setValue('actionType', extractedData.actionType, {shouldDirty: true});
        if (extractedData.classe) form.setValue('classe', extractedData.classe, {shouldDirty: true});
        if (extractedData.assunto) form.setValue('assunto', extractedData.assunto, {shouldDirty: true});
        if (extractedData.vara) form.setValue('vara', extractedData.vara, {shouldDirty: true});
        if (extractedData.foro) form.setValue('foro', extractedData.foro, {shouldDirty: true});
        if (extractedData.juiz) form.setValue('juiz', extractedData.juiz, {shouldDirty: true});
        if (extractedData.instancia) form.setValue('instancia', extractedData.instancia, {shouldDirty: true});
        if (extractedData.polo) form.setValue('polo', extractedData.polo, {shouldDirty: true});
        if (extractedData.parteContraria) form.setValue('parteContraria', extractedData.parteContraria, {shouldDirty: true});

        toast({ title: "Dados Extraídos!", description: "O formulário foi preenchido com os dados do texto." });
        setIsDialogOpen(false);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
        toast({ title: "Erro na Análise", description: errorMessage, variant: "destructive" });
    } finally {
        setIsAnalyzing(false);
    }
  };


  async function onSubmit(values: ProcessFormValues) {
    setIsSubmitting(true);
    try {
      const selectedClients = clients.filter(c => values.clientIds.includes(c.id));
      if (selectedClients.length === 0) {
          throw new Error("Cliente(s) selecionado(s) não encontrado(s).");
      }

      const processData = {
          ...values,
          clientNames: selectedClients.map(c => c.name), // Denormalize client names
      };

      await addProcess(processData as any);

      toast({
        title: "Processo Cadastrado!",
        description: "O novo processo foi adicionado com sucesso.",
      });

      router.push(cancelHref);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
        toast({
            title: "Erro ao cadastrar processo",
            description: errorMessage,
            variant: "destructive",
        });
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
                                field.onChange(
                                    checked
                                    ? [...field.value, client.id]
                                    : field.value?.filter((value) => value !== client.id)
                                );
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
                    onClick={() => form.setValue("mainClientId", client.id)}
                    className={cn("h-7", mainClientId === client.id ? "bg-primary text-primary-foreground hover:bg-primary/90" : "")}
                    >
                    <Star className={cn("mr-2 h-4 w-4", mainClientId === client.id ? "text-yellow-300 fill-yellow-300" : "text-muted-foreground")} />
                    {mainClientId === client.id ? 'Principal' : 'Definir'}
                </Button>
            )}
        </div>
    );
  };

  const uniqueValues = (key: keyof Process) => {
    return [...new Set(allProcesses.map(p => p[key]).filter(Boolean) as string[])].sort();
  }


  return (
    <div className="mx-auto w-full max-w-7xl">
       <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" asChild>
                <Link href={cancelHref}>
                    <ArrowLeft className="h-4 w-4" />
                    <span className="sr-only">Voltar</span>
                </Link>
                </Button>
                <div>
                <h1 className="text-2xl font-bold tracking-tight">Adicionar Novo Processo</h1>
                <p className="text-muted-foreground">Preencha os dados abaixo para registrar um novo processo.</p>
                </div>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                    <Button type="button" variant="outline">
                        <Sparkles className="mr-2 h-4 w-4" />
                        Extrair Dados com IA
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[625px]">
                    <DialogHeader>
                        <DialogTitle>Extração de Dados com IA</DialogTitle>
                        <DialogDescription>
                            Cole os dados do processo abaixo e clique em "Analisar com IA" para preencher o formulário.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <Textarea
                            placeholder="Cole aqui o texto com as informações do processo (número, vara, comarca, etc.)."
                            className="min-h-[200px] resize-y"
                            value={textToAnalyze}
                            onChange={(e) => setTextToAnalyze(e.target.value)}
                            disabled={isAnalyzing}
                        />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                             <Button type="button" variant="outline">Cancelar</Button>
                        </DialogClose>
                        <Button type="button" onClick={handleAnalyze} disabled={isAnalyzing || !textToAnalyze.trim()}>
                            {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                            Analisar com IA
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Dados do Processo</CardTitle>
              <CardDescription>Preencha os campos obrigatórios e salve para criar o processo.</CardDescription>
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
                                <div className="flex items-center gap-2">
                                     <FormLabel className="text-sm font-medium">Selecionar Clientes</FormLabel>
                                    <TooltipProvider>
                                     <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button asChild variant="outline" size="icon" className="h-6 w-6">
                                                <Link href={`/dashboard/clients/new?redirect=${encodeURIComponent('/dashboard/processes/new')}`}>
                                                    <PlusCircle className="h-4 w-4" />
                                                    <span className="sr-only">Incluir novo cliente</span>
                                                </Link>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Incluir novo cliente</p>
                                        </TooltipContent>
                                     </Tooltip>
                                    </TooltipProvider>
                                </div>
                                <p className="text-sm text-muted-foreground">{selectedClientIds.length} de {clients.length} selecionado(s)</p>
                            </div>
                             <div className="p-3">
                                <Input
                                    placeholder="Filtrar por nome..."
                                    value={clientSearch}
                                    onChange={(e) => setClientSearch(e.target.value)}
                                />
                            </div>
                            {isLoadingData ? <div className="p-4"><Skeleton className="h-24 w-full" /></div> : (
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
                                </div>
                            </ScrollArea>
                            )}
                        </div>
                        <FormMessage />
                    </FormItem>
                    )}
                />

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <FormField control={form.control} name="polo" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Polo do Cliente</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Selecione o polo"/></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="Ativo">Ativo</SelectItem>
                                <SelectItem value="Passivo">Passivo</SelectItem>
                            </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="parteContraria" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Parte Contrária</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>


                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <FormField control={form.control} name="actionType" render={({ field }) => (
                        <FormItem className="flex flex-col">
                        <FormLabel>Tipo de Ação</FormLabel>
                        <ActionTypeCombobox value={field.value} onChange={field.onChange} actionTypes={uniqueValues('actionType')} />
                        <FormMessage />
                        </FormItem>
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
                 <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <FormField control={form.control} name="classe" render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Classe</FormLabel>
                            <ActionTypeCombobox value={field.value || ''} onChange={field.onChange} actionTypes={uniqueValues('classe')} />
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="assunto" render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Assunto</FormLabel>
                            <ActionTypeCombobox value={field.value || ''} onChange={field.onChange} actionTypes={uniqueValues('assunto')} />
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <FormField control={form.control} name="foro" render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Foro</FormLabel>
                             <ActionTypeCombobox value={field.value || ''} onChange={field.onChange} actionTypes={uniqueValues('foro')} />
                            <FormMessage />
                        </FormItem>
                    )} />
                     <FormField control={form.control} name="vara" render={({ field }) => (
                        <FormItem><FormLabel>Vara</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                     <FormField control={form.control} name="juiz" render={({ field }) => (
                        <FormItem><FormLabel>Juiz</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                     <FormField control={form.control} name="instancia" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Instância</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Selecione a instância"/></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="1ª Instância">1ª Instância</SelectItem>
                                    <SelectItem value="2ª Instância">2ª Instância</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea className="resize-y min-h-[100px]" {...field} /></FormControl><FormDescription>Opcional</FormDescription><FormMessage /></FormItem>
              )} />
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" asChild>
                  <Link href={cancelHref}>Cancelar</Link>
                </Button>
                <Button type="submit" className="bg-accent hover:bg-accent/90" disabled={isSubmitting || isLoadingData}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar Processo
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}
