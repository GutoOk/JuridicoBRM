
"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
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
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { addClientGroup } from "@/app/dashboard/groups/actions";
import { getClients } from "@/app/dashboard/clients/actions";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, PlusCircle } from "lucide-react";
import Link from "next/link";
import type { Client } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";


const formSchema = z.object({
  name: z.string().min(3, "O nome do grupo é obrigatório."),
  clientIds: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

type GroupFormValues = z.infer<typeof formSchema>;

export default function NewClientGroupPage() {
  const { toast } = useToast();
  const router = useRouter();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');

  const form = useForm<GroupFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      clientIds: [],
      notes: "",
    },
  });

  useEffect(() => {
    async function fetchData() {
      try {
        const fetchedClients = await getClients();
        setClients(fetchedClients.filter(c => !c.deleted));
      } catch (error) {
        toast({ title: "Erro ao carregar clientes", variant: "destructive" });
      } finally {
        setIsLoadingData(false);
      }
    }
    fetchData();
  }, [toast]);
  
  const { clientIds: selectedClientIds = [] } = form.watch();

  async function onSubmit(values: GroupFormValues) {
     if (!user) {
        toast({ title: "Usuário não autenticado", variant: "destructive" });
        return;
    }
    setIsSubmitting(true);
    try {
      const selectedClientsData = clients.filter(c => values.clientIds.includes(c.id));
      
      const groupData = {
          ...values,
          clientNames: selectedClientsData.map(c => c.name),
      };

      await addClientGroup(groupData, user.name);
      
      toast({
        title: "Grupo Criado!",
        description: "O novo grupo de clientes foi adicionado com sucesso.",
      });

      router.push('/dashboard/groups');
      
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
        toast({
            title: "Erro ao criar grupo",
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

    selected.sort((a, b) => a.name.localeCompare(b.name));

    const filteredUnselected = unselected
        .filter(client => client.name.toLowerCase().includes(clientSearch.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name));

    return { selected, filteredUnselected };
}, [clients, selectedClientIds, clientSearch]);


  const renderClientRow = (client: Client) => {
    const isChecked = selectedClientIds.includes(client.id);
    return (
        <div key={client.id} className="flex items-center justify-between p-2 rounded-md">
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
        </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-7xl">
       <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/dashboard/groups">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Voltar</span>
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Novo Grupo de Clientes</h1>
          <p className="text-muted-foreground">Preencha os dados abaixo para criar um novo grupo.</p>
        </div>
      </div>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Dados do Grupo</CardTitle>
              <CardDescription>Defina um nome, selecione os clientes e adicione observações se necessário.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
               <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Grupo</FormLabel>
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
                                <FormLabel className="text-sm font-medium">Selecionar Clientes</FormLabel>
                                <p className="text-sm text-muted-foreground">{selectedClientIds.length} de {clients.length} selecionado(s)</p>
                            </div>
                             <div className="p-3 flex items-center gap-2">
                                <Input 
                                    placeholder="Filtrar por nome..."
                                    value={clientSearch}
                                    onChange={(e) => setClientSearch(e.target.value)}
                                    className="flex-grow"
                                />
                                 <TooltipProvider>
                                     <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button asChild variant="outline" size="icon">
                                                <Link href={`/dashboard/clients/new?redirect=${encodeURIComponent('/dashboard/groups/new')}`}>
                                                    <PlusCircle className="h-4 w-4" />
                                                    <span className="sr-only">Incluir novo cliente</span>
                                                </Link>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Adicionar novo cliente</p>
                                        </TooltipContent>
                                     </Tooltip>
                                </TooltipProvider>
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

                <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Observações</FormLabel>
                        <FormControl>
                            <Textarea className="resize-y min-h-[100px]" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" asChild>
                  <Link href="/dashboard/groups">Cancelar</Link>
                </Button>
                <Button type="submit" className="bg-accent hover:bg-accent/90" disabled={isSubmitting || isLoadingData}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar Grupo
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}
