

"use client";

import { useForm, useFieldArray } from "react-hook-form";
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
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { getClientById, updateClient } from "@/app/dashboard/clients/actions";
import { useRouter, useParams } from "next/navigation";
import { Loader2, ArrowLeft, PlusCircle, Trash2, Star } from "lucide-react";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { Client } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const phoneSchema = z.object({
  number: z.string().min(1, "O número é obrigatório."),
  description: z.string().min(1, "A descrição é obrigatória."),
  isPrimary: z.boolean().default(false),
});

const addressSchema = z.object({
    description: z.string().min(1, "A descrição é obrigatória."),
    zipCode: z.string().optional(),
    street: z.string().optional(),
    number: z.string().optional(),
    complement: z.string().optional(),
    district: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    isPrimary: z.boolean().default(false),
});

const formSchema = z.object({
  // Identificação Pessoal
  name: z.string().min(3, "Nome completo é obrigatório."),
  nationality: z.string().optional(),
  profession: z.string().optional(),
  maritalStatus: z.string().optional(),
  // Documentos
  rg: z.string().optional(),
  rgIssuer: z.string().optional(),
  cpfCnpj: z.string().optional(),
  type: z.enum(["Pessoa Física", "Pessoa Jurídica"]),
  // Contato
  email: z.string().optional(),
  phones: z.array(phoneSchema).optional(),
  addresses: z.array(addressSchema).optional(),
  // Informações Jurídicas
  notes: z.string().optional(),
});


type ClientFormValues = z.infer<typeof formSchema>;

export default function EditClientPage() {
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const { user } = useAuth();
  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const clientId = params.id as string;

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      nationality: "",
      profession: "",
      maritalStatus: "",
      rg: "",
      rgIssuer: "",
      cpfCnpj: "",
      type: "Pessoa Física",
      email: "",
      phones: [],
      addresses: [],
      notes: "",
    },
  });

  const { fields: phoneFields, append: appendPhone, remove: removePhone, update: updatePhone } = useFieldArray({
    control: form.control,
    name: "phones",
  });

  const { fields: addressFields, append: appendAddress, remove: removeAddress, update: updateAddress } = useFieldArray({
    control: form.control,
    name: "addresses",
  });

  const setPrimaryPhone = (index: number) => {
    phoneFields.forEach((field, idx) => {
      updatePhone(idx, { ...field, isPrimary: idx === index });
    });
  };

  const setPrimaryAddress = (index: number) => {
    addressFields.forEach((field, idx) => {
      updateAddress(idx, { ...field, isPrimary: idx === index });
    });
  };

  useEffect(() => {
    if (!clientId) return;
    async function fetchClient() {
      setIsLoading(true);
      try {
        const fetchedClient = await getClientById(clientId);
        if (fetchedClient) {
          setClient(fetchedClient);
          // Set default values for the form after fetching the client
          const defaultValues = {
              name: fetchedClient.name || "",
              nationality: fetchedClient.nationality || "",
              profession: fetchedClient.profession || "",
              maritalStatus: fetchedClient.maritalStatus || "",
              rg: fetchedClient.rg || "",
              rgIssuer: fetchedClient.rgIssuer || "",
              cpfCnpj: fetchedClient.cpfCnpj || "",
              type: fetchedClient.type || "Pessoa Física",
              email: fetchedClient.email || "",
              phones: fetchedClient.phones || [],
              addresses: fetchedClient.addresses || [],
              notes: fetchedClient.notes || "",
          };
          form.reset(defaultValues);
        } else {
          toast({ title: "Cliente não encontrado", variant: "destructive" });
          router.push("/dashboard/clients");
        }
      } catch (error) {
        toast({ title: "Erro ao carregar cliente", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    }
    fetchClient();
  }, [clientId, form, router, toast]);

  async function onSubmit(values: ClientFormValues) {
    if (!user) {
      toast({ title: "Usuário não autenticado", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      await updateClient(clientId, values, user.name);
      toast({ title: "Cliente Atualizado!", description: "Os dados do cliente foram salvos com sucesso." });
      router.push(`/dashboard/clients/${clientId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
      toast({ title: "Erro ao atualizar", description: errorMessage, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
        <div className="mx-auto w-full max-w-7xl">
            <h1 className="text-2xl font-bold tracking-tight">Editar Cliente</h1>
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-1/2" />
                    <Skeleton className="h-4 w-3/4" />
                </CardHeader>
                <CardContent className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Skeleton className="h-10 w-full" />
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
          <Link href={`/dashboard/clients/${clientId}`}>
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Voltar</span>
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Editar Cliente</h1>
          <p className="text-muted-foreground">Modificando dados de {client?.name}</p>
        </div>
      </div>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Dados Cadastrais</CardTitle>
              <CardDescription>Ajuste os campos necessários e salve as alterações.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Identificação Pessoal</h3>
                <Separator />
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Completo</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="nationality" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nacionalidade</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="profession" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Profissão</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="maritalStatus" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado Civil</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="space-y-2 pt-4">
                <h3 className="text-lg font-medium">Documentos</h3>
                <Separator />
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                <FormField control={form.control} name="rg" render={({ field }) => (
                  <FormItem><FormLabel>RG</FormLabel><FormControl><Input {...field} /></FormControl><FormDescription>Opcional</FormDescription><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="rgIssuer" render={({ field }) => (
                  <FormItem><FormLabel>Órgão Emissor</FormLabel><FormControl><Input {...field} /></FormControl><FormDescription>Opcional</FormDescription><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="cpfCnpj" render={({ field }) => (
                  <FormItem><FormLabel>CPF/CNPJ</FormLabel><FormControl><Input {...field} /></FormControl><FormDescription>Opcional</FormDescription><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="Pessoa Física">Pessoa Física</SelectItem>
                        <SelectItem value="Pessoa Jurídica">Pessoa Jurídica</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="space-y-2 pt-4">
                <h3 className="text-lg font-medium">Contato</h3>
                <Separator />
              </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                 <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

                <div className="space-y-4 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Telefones</h4>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => appendPhone({ number: "", description: "", isPrimary: phoneFields.length === 0 })}
                    >
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Adicionar
                    </Button>
                  </div>

                  {phoneFields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr,1fr,auto,auto] sm:items-end">
                      <FormField
                        control={form.control}
                        name={`phones.${index}.number`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={cn(index !== 0 && "sr-only")}>Número</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="(99) 99999-9999" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`phones.${index}.description`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={cn(index !== 0 && "sr-only")}>Descrição</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Celular, Recado, etc." />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant={field.isPrimary ? "default" : "ghost"}
                        size="icon"
                        onClick={() => setPrimaryPhone(index)}
                        className={cn(field.isPrimary && "bg-primary text-primary-foreground hover:bg-primary/90")}
                      >
                          <Star className={cn("h-4 w-4", field.isPrimary ? "text-yellow-300 fill-yellow-300" : "text-muted-foreground")} />
                          <span className="sr-only">Marcar como principal</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => removePhone(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Remover telefone</span>
                      </Button>
                    </div>
                  ))}
                  {phoneFields.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum telefone adicionado.</p>}
                  <FormMessage>{form.formState.errors.phones?.root?.message}</FormMessage>
              </div>

               <div className="space-y-2 pt-4">
                <h3 className="text-lg font-medium">Endereços</h3>
                <Separator />
              </div>

               <div className="space-y-4">
                    {addressFields.map((field, index) => (
                        <div key={field.id} className="space-y-4 rounded-lg border p-4 relative">
                            <div className="flex justify-between items-start">
                                <FormField
                                    control={form.control}
                                    name={`addresses.${index}.description`}
                                    render={({ field }) => (
                                    <FormItem className="flex-grow">
                                        <FormLabel>Descrição do Endereço</FormLabel>
                                        <FormControl><Input {...field} placeholder="Ex: Residencial, Comercial" /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                                <div className="flex gap-2 pl-4 pt-2">
                                     <Button type="button" variant={field.isPrimary ? "default" : "ghost"} size="sm" onClick={() => setPrimaryAddress(index)} className={cn(field.isPrimary && "bg-primary text-primary-foreground hover:bg-primary/90")}>
                                        <Star className={cn("h-4 w-4", field.isPrimary ? "text-yellow-300 fill-yellow-300" : "text-muted-foreground")} />
                                         <span className="ml-2 hidden sm:inline">Principal</span>
                                    </Button>
                                    {addressFields.length > 1 && (
                                        <Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => removeAddress(index)}><Trash2 className="h-4 w-4" /><span className="sr-only">Remover endereço</span></Button>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                                <FormField control={form.control} name={`addresses.${index}.zipCode`} render={({ field }) => (
                                <FormItem className="md:col-span-1"><FormLabel>CEP</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name={`addresses.${index}.street`} render={({ field }) => (
                                <FormItem className="md:col-span-3"><FormLabel>Logradouro</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                            </div>
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                                <FormField control={form.control} name={`addresses.${index}.number`} render={({ field }) => (
                                <FormItem><FormLabel>Número</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name={`addresses.${index}.complement`} render={({ field }) => (
                                <FormItem><FormLabel>Complemento</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name={`addresses.${index}.district`} render={({ field }) => (
                                <FormItem className="md:col-span-2"><FormLabel>Bairro</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                            </div>
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                                <FormField control={form.control} name={`addresses.${index}.city`} render={({ field }) => (
                                <FormItem className="md:col-span-2"><FormLabel>Cidade</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name={`addresses.${index}.state`} render={({ field }) => (
                                <FormItem><FormLabel>Estado (UF)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                            </div>
                        </div>
                    ))}
                    <Button type="button" size="sm" variant="outline" onClick={() => appendAddress({ description: "", isPrimary: addressFields.length === 0 })}>
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Adicionar Outro Endereço
                    </Button>
                    <FormMessage>{form.formState.errors.addresses?.root?.message}</FormMessage>
               </div>
              
              <div className="space-y-2 pt-4">
                <h3 className="text-lg font-medium">Observações Gerais</h3>
                <Separator />
              </div>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea className="resize-y min-h-[100px]" {...field} /></FormControl><FormDescription>Opcional</FormDescription><FormMessage /></FormItem>
              )} />

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" asChild>
                  <Link href={`/dashboard/clients/${clientId}`}>Cancelar</Link>
                </Button>
                <Button type="submit" className="bg-accent hover:bg-accent/90" disabled={isSubmitting || !user}>
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
