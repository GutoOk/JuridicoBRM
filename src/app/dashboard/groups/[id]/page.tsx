
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { ClientGroup, Client, Process } from "@/lib/types";
import { getClientGroupById, updateClientGroup } from "@/app/dashboard/groups/actions";
import { getClients } from "@/app/dashboard/clients/actions";
import { getProcessById } from "@/app/dashboard/processes/actions";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, ArrowLeft, Users, FileText, User, Gavel, Link as LinkIcon, ExternalLink } from "lucide-react";
import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";

const formSchema = z.object({
  name: z.string().min(3, "O nome do grupo é obrigatório."),
  notes: z.string().optional(),
  clientIds: z.array(z.string()).default([]),
});

type GroupFormValues = z.infer<typeof formSchema>;

type ClientWithProcesses = Client & { fetchedProcesses?: (Process | null)[] };

export default function ClientGroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const groupId = params.id as string;

  const [group, setGroup] = useState<ClientGroup | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [groupClients, setGroupClients] = useState<ClientWithProcesses[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  const form = useForm<GroupFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", notes: "", clientIds: [] },
  });

  const { clientIds: selectedClientIds = [] } = form.watch();

  const fetchGroupData = async () => {
    setIsLoading(true);
    try {
        const [fetchedGroup, fetchedAllClients] = await Promise.all([
            getClientGroupById(groupId),
            getClients()
        ]);
        
        if (!fetchedGroup) {
            toast({ title: "Grupo não encontrado", variant: "destructive" });
            router.push("/dashboard/groups");
            return;
        }

        setGroup(fetchedGroup);
        setAllClients(fetchedAllClients.filter(c => !c.deleted));
        form.reset({
            name: fetchedGroup.name,
            notes: fetchedGroup.notes || "",
            clientIds: fetchedGroup.clientIds,
        });

        // Fetch details for clients in the group
        const clientsInGroup = fetchedAllClients.filter(c => fetchedGroup.clientIds.includes(c.id));
        const clientsWithProcesses = await Promise.all(clientsInGroup.map(async (client) => {
            const fetchedProcesses = client.processIds ? await Promise.all(
                client.processIds.map(id => getProcessById(id))
            ) : [];
            return { ...client, fetchedProcesses };
        }));
        setGroupClients(clientsWithProcesses);

    } catch (error) {
      toast({ title: "Erro ao carregar grupo", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (groupId) {
      fetchGroupData();
    }
  }, [groupId]);

  async function onSubmit(values: GroupFormValues) {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const selectedClientsData = allClients.filter(c => values.clientIds.includes(c.id));
      const groupData = {
          ...values,
          clientNames: selectedClientsData.map(c => c.name),
      };
      await updateClientGroup(groupId, groupData, user.name);
      toast({ title: "Grupo atualizado!", description: "As informações do grupo foram salvas." });
      fetchGroupData(); // Refresh data
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
      toast({ title: "Erro ao atualizar", description: errorMessage, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const sortedAndFilteredClients = useMemo(() => {
    const selected = allClients.filter(c => selectedClientIds.includes(c.id));
    const unselected = allClients.filter(c => !selectedClientIds.includes(c.id));
    selected.sort((a, b) => a.name.localeCompare(b.name));
    const filteredUnselected = unselected
        .filter(client => client.name.toLowerCase().includes(clientSearch.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name));
    return { selected, filteredUnselected };
  }, [allClients, selectedClientIds, clientSearch]);


  if (isLoading) {
    return (
        <div className="mx-auto w-full max-w-7xl">
            <Skeleton className="h-10 w-80 mb-6" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Skeleton className="h-64 w-full" />
                </div>
                <div className="lg:col-span-1 space-y-6">
                    <Skeleton className="h-96 w-full" />
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
        <div className="flex items-center gap-4 mb-6">
            <Button variant="outline" size="icon" asChild>
                <Link href="/dashboard/groups"><ArrowLeft className="h-4 w-4" /><span className="sr-only">Voltar</span></Link>
            </Button>
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Gerenciar Grupo: {group?.name}</h1>
                <p className="text-muted-foreground">Visualize e edite os detalhes do grupo.</p>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left side - Client List */}
            <div className="lg:col-span-2 space-y-6">
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Users className="h-6 w-6" /> Clientes no Grupo</CardTitle>
                        <CardDescription>Lista de clientes atualmente neste grupo. Clique para ver detalhes.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-96">
                            <div className="space-y-4 pr-4">
                            {groupClients.length > 0 ? groupClients.map(client => (
                                <Card key={client.id} className="p-4">
                                    <div className="flex justify-between items-center">
                                        <Link href={`/dashboard/clients/${client.id}`} className="font-semibold text-primary hover:underline">{client.name}</Link>
                                        <Button size="sm" variant="outline" asChild><Link href={`/dashboard/clients/${client.id}`}><ExternalLink className="h-4 w-4" /></Link></Button>
                                    </div>
                                    <Separator className="my-2" />
                                    <div className="text-sm text-muted-foreground">
                                        {client.fetchedProcesses && client.fetchedProcesses.length > 0 ? (
                                            <div className="space-y-1">
                                                <p className="font-medium text-foreground">Processos:</p>
                                                {client.fetchedProcesses.map(p => p && (
                                                    <Link key={p.id} href={`/dashboard/processes/${p.id}`} className="flex items-center gap-1.5 hover:text-primary"><Gavel className="h-3 w-3" />{p.processNumber}</Link>
                                                ))}
                                            </div>
                                        ) : (
                                            <p>Nenhum processo vinculado.</p>
                                        )}
                                    </div>
                                </Card>
                            )) : <p className="text-center text-muted-foreground py-10">Nenhum cliente neste grupo.</p>}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>

            {/* Right side - Edit Form */}
            <div className="lg:col-span-1 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><FileText className="h-6 w-6" /> Editar Grupo</CardTitle>
                         <CardDescription>Altere o nome, anotações e membros do grupo.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                <FormField control={form.control} name="name" render={({ field }) => (
                                    <FormItem><FormLabel>Nome do Grupo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <FormField control={form.control} name="notes" render={({ field }) => (
                                    <FormItem><FormLabel>Anotações</FormLabel><FormControl><Textarea className="min-h-[100px]" {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>

                                <FormField control={form.control} name="clientIds" render={() => (
                                    <FormItem>
                                        <FormLabel>Membros</FormLabel>
                                        <div className="rounded-md border">
                                            <div className="p-2 border-b"><Input placeholder="Filtrar por nome..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} /></div>
                                            <ScrollArea className="h-48"><div className="p-2 space-y-1">
                                                {sortedAndFilteredClients.selected.map(c => <div key={c.id} className="flex items-center p-1"><Checkbox id={`edit-${c.id}`} checked={selectedClientIds.includes(c.id)} onCheckedChange={(checked) => form.setValue("clientIds", checked ? [...selectedClientIds, c.id] : selectedClientIds.filter(id => id !== c.id))} /><label htmlFor={`edit-${c.id}`} className="ml-2 text-sm font-normal w-full cursor-pointer">{c.name}</label></div>)}
                                                {sortedAndFilteredClients.selected.length > 0 && sortedAndFilteredClients.filteredUnselected.length > 0 && <Separator className="my-1" />}
                                                {sortedAndFilteredClients.filteredUnselected.map(c => <div key={c.id} className="flex items-center p-1"><Checkbox id={`edit-${c.id}`} checked={selectedClientIds.includes(c.id)} onCheckedChange={(checked) => form.setValue("clientIds", checked ? [...selectedClientIds, c.id] : selectedClientIds.filter(id => id !== c.id))} /><label htmlFor={`edit-${c.id}`} className="ml-2 text-sm font-normal w-full cursor-pointer">{c.name}</label></div>)}
                                            </div></ScrollArea>
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <Button type="submit" disabled={isSubmitting || !form.formState.isDirty} className="w-full">
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar Alterações
                                </Button>
                            </form>
                         </Form>
                    </CardContent>
                </Card>
            </div>
        </div>
    </div>
  );
}
