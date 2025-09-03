
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
import { addClient, DuplicateClientError, ExistingClientNameError } from "@/app/dashboard/clients/actions";
import { getClientDataFromText } from "@/app/actions";
import type { Client } from "@/lib/types";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Sparkles, Trash2, PlusCircle, Star, Phone, FileText } from "lucide-react";
import Link from "next/link";
import React from "react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";


const phoneSchema = z.object({
  number: z.string().min(1, "O número é obrigatório."),
  description: z.string().min(1, "A descrição é obrigatória."),
  isPrimary: z.boolean().default(false),
});

const emailSchema = z.object({
  address: z.string().email("E-mail inválido.").or(z.literal('')).optional(),
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
  motherName: z.string().optional(),
  nationality: z.string().optional(),
  profession: z.string().optional(),
  maritalStatus: z.string().optional(),
  // Documentos
  rg: z.string().optional(),
  rgIssuer: z.string().optional(),
  cpfCnpj: z.string().optional(),
  type: z.enum(["Pessoa Física", "Pessoa Jurídica"]),
  // Contato
  emails: z.array(emailSchema).optional(),
  phones: z.array(phoneSchema).optional(),
  addresses: z.array(addressSchema).optional(),
  // Informações Jurídicas
  notes: z.string().optional(),
});

type ClientFormValues = z.infer<typeof formSchema>;
type FilledByAI = Partial<Record<keyof ClientFormValues, boolean | Record<string, boolean>>>;

export function NewClientForm() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [textToAnalyze, setTextToAnalyze] = React.useState("");
  const [isAiDialogOpen, setIsAiDialogOpen] = React.useState(false);
  const [filledByAI, setFilledByAI] = React.useState<FilledByAI>({});
  const [isConfirmNameDialogOpen, setIsConfirmNameDialogOpen] = React.useState(false);
  const [existingClients, setExistingClients] = React.useState<Client[]>([]);


  const redirectUrl = searchParams.get('redirect');


  const form = useForm<ClientFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "Pessoa Física",
      name: "",
      motherName: "",
      nationality: "",
      profession: "",
      maritalStatus: "",
      rg: "",
      rgIssuer: "",
      cpfCnpj: "",
      emails: [{ address: "", description: "Principal", isPrimary: true }],
      phones: [{ number: "", description: "Celular", isPrimary: true }],
      addresses: [{
          description: "Principal",
          isPrimary: true,
          street: "",
          city: "",
          zipCode: "",
          number: "",
          complement: "",
          district: "",
          state: ""
      }],
      notes: "",
    },
  });

  const { fields: phoneFields, append: appendPhone, remove: removePhone, update: updatePhone } = useFieldArray({
    control: form.control,
    name: "phones",
  });

  const { fields: emailFields, append: appendEmail, remove: removeEmail, update: updateEmail } = useFieldArray({
    control: form.control,
    name: "emails",
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

  const setPrimaryEmail = (index: number) => {
    emailFields.forEach((field, idx) => {
      updateEmail(idx, { ...field, isPrimary: idx === index });
    });
  };

  const setPrimaryAddress = (index: number) => {
    addressFields.forEach((field, idx) => {
      updateAddress(idx, { ...field, isPrimary: idx === index });
    });
  };

  const handleAnalyze = async () => {
    if (!textToAnalyze.trim()) {
      toast({
        title: "Texto Vazio",
        description: "Por favor, cole alguma informação na caixa de texto para análise.",
        variant: "destructive",
      });
      return;
    }
    setIsAnalyzing(true);
    try {
      const extractedData = await getClientDataFromText({ textToAnalyze });

      const aiFilledFields: FilledByAI = {};
      const newValues: Partial<ClientFormValues> = { ...form.getValues() };

      // Populate direct fields and mark them as AI-filled
      Object.keys(extractedData).forEach(key => {
        const value = extractedData[key as keyof typeof extractedData];
        if (value !== null && value !== undefined && value !== '' && typeof value !== 'object') {
          newValues[key as keyof ClientFormValues] = value as any;
          aiFilledFields[key as keyof ClientFormValues] = true;
        }
      });

       if (extractedData.email) {
          newValues.emails = [{ address: extractedData.email, description: "Principal", isPrimary: true }];
          aiFilledFields.emails = true;
      }

      // Handle phone numbers
      const phones = [];
      if (extractedData.phone) {
        phones.push({ number: extractedData.phone, description: "Principal", isPrimary: true });
        aiFilledFields.phones = true;
      }
      if (extractedData.phone2) {
        phones.push({ number: extractedData.phone2, description: "Alternativo", isPrimary: !extractedData.phone });
        aiFilledFields.phones = true;
      }
      if (phones.length > 0) newValues.phones = phones;

      // Handle address
      if (extractedData.address) {
        const newAddress = {
            ...(form.getValues('addresses')?.[0] || {}),
            ...extractedData.address,
            description: "Principal",
            isPrimary: true,
        };
        newValues.addresses = [newAddress];
        aiFilledFields.addresses = {
            zipCode: !!extractedData.address.zipCode,
            street: !!extractedData.address.street,
            number: !!extractedData.address.number,
            complement: !!extractedData.address.complement,
            district: !!extractedData.address.district,
            city: !!extractedData.address.city,
            state: !!extractedData.address.state,
        };
      }

      form.reset(newValues as ClientFormValues);
      setFilledByAI(aiFilledFields);

      toast({
        title: "Dados Analisados!",
        description: "Os campos do formulário foram preenchidos. Verifique os dados destacados.",
      });
      setIsAiDialogOpen(false); // Fecha o dialogo
    } catch (error) {
       const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
        toast({
            title: "Erro na Análise",
            description: errorMessage,
            variant: "destructive",
        });
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleClientCreation = async (values: ClientFormValues, force: boolean = false) => {
    if (!user) {
      toast({
        title: "Usuário não autenticado",
        description: "Por favor, faça login para cadastrar um cliente.",
        variant: "destructive",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const clientData = Object.fromEntries(
        Object.entries(values).filter(([_, v]) => v != null && v !== "")
      );

      await addClient(clientData as any, user.name, force);

      toast({
        title: "Cliente Cadastrado!",
        description: "O novo cliente foi adicionado com sucesso.",
      });

      if (redirectUrl) {
        // Just go back, the previous page will refetch the data.
        router.push(redirectUrl);
      } else {
        router.push("/dashboard/clients");
      }
    } catch (error) {
      if (error instanceof DuplicateClientError) {
        toast({
          title: "Cliente já existe",
          description: (
            <div>
              {error.message}
              <Link href={`/dashboard/clients/${error.clientId}`} className="underline font-bold ml-1">
                Ver cliente existente.
              </Link>
            </div>
          ),
          variant: "destructive",
          duration: 10000,
        });
        form.setError("cpfCnpj", { type: "manual", message: "Este CPF/CNPJ já está em uso." });
      } else if (error instanceof ExistingClientNameError) {
        setExistingClients(error.existingClients);
        setIsConfirmNameDialogOpen(true);
      } else {
        const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
        toast({
          title: "Erro ao cadastrar",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };


  async function onSubmit(values: ClientFormValues) {
     await handleClientCreation(values, false);
  }
  
  const handleConfirmNameAndSubmit = async () => {
      setIsConfirmNameDialogOpen(false);
      await handleClientCreation(form.getValues(), true);
  }

  const getInputClass = (fieldName: keyof ClientFormValues) => {
    return cn({ "border-ring ring-2 ring-ring/40": filledByAI[fieldName] });
  };

  const getNestedInputClass = (parent: 'addresses', index: number, fieldName: keyof z.infer<typeof addressSchema>) => {
    const parentField = filledByAI[parent];
    if (typeof parentField === 'object' && parentField && fieldName in parentField) {
        return cn({ "border-ring ring-2 ring-ring/40": parentField[fieldName as any] });
    }
    return '';
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
        <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight">Adicionar Novo Cliente</h1>
             <Dialog open={isAiDialogOpen} onOpenChange={setIsAiDialogOpen}>
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
                            Cole os dados do cliente abaixo e clique em "Analisar com IA" para preencher o formulário automaticamente.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <Textarea
                            placeholder="Cole aqui o texto com as informações do cliente (nome, endereço, documentos, etc.)."
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
              <CardTitle>Dados Cadastrais</CardTitle>
              <CardDescription>Apenas o nome completo é obrigatório. Preencha ou corrija os demais campos conforme necessário.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Identificação Pessoal */}
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Identificação Pessoal</h3>
                <Separator />
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Completo</FormLabel>
                    <FormControl><Input {...field} className={getInputClass("name")} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="motherName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da Mãe</FormLabel>
                    <FormControl><Input {...field} className={getInputClass("motherName")} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="nationality" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nacionalidade</FormLabel>
                    <FormControl><Input {...field} className={getInputClass("nationality")} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name="profession" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Profissão</FormLabel>
                    <FormControl><Input {...field} className={getInputClass("profession")} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name="maritalStatus" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado Civil</FormLabel>
                    <FormControl><Input {...field} className={getInputClass("maritalStatus")} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

               {/* Documentos */}
              <div className="space-y-2 pt-4">
                <h3 className="text-lg font-medium">Documentos</h3>
                <Separator />
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                 <FormField control={form.control} name="rg" render={({ field }) => (
                  <FormItem>
                    <FormLabel>RG</FormLabel>
                    <FormControl><Input {...field} className={getInputClass("rg")} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name="rgIssuer" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Órgão Emissor</FormLabel>
                    <FormControl><Input {...field} className={getInputClass("rgIssuer")} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name="cpfCnpj" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF/CNPJ</FormLabel>
                    <FormControl><Input {...field} className={getInputClass("cpfCnpj")} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                     <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className={getInputClass("type")}>
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Pessoa Física">Pessoa Física</SelectItem>
                        <SelectItem value="Pessoa Jurídica">Pessoa Jurídica</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

               {/* Contato */}
              <div className="space-y-2 pt-4">
                <h3 className="text-lg font-medium">Contato</h3>
                <Separator />
              </div>

              <div className="space-y-4 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">E-mails</h4>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => appendEmail({ address: "", description: "", isPrimary: emailFields.length === 0 })}
                    >
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Adicionar
                    </Button>
                  </div>
                   {emailFields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr,1fr,auto,auto] sm:items-end">
                      <FormField
                        control={form.control}
                        name={`emails.${index}.address`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={cn(index !== 0 && "sr-only")}>E-mail</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="email@exemplo.com" type="email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`emails.${index}.description`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={cn(index !== 0 && "sr-only")}>Descrição</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Principal, Contato, etc." />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant={field.isPrimary ? "default" : "ghost"}
                        size="icon"
                        onClick={() => setPrimaryEmail(index)}
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
                        onClick={() => removeEmail(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Remover e-mail</span>
                      </Button>
                    </div>
                  ))}
                  {emailFields.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum e-mail adicionado.</p>}
                  <FormMessage>{form.formState.errors.emails?.root?.message}</FormMessage>
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

              {/* Endereços */}
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
                                <FormItem className="md:col-span-1"><FormLabel>CEP</FormLabel><FormControl><Input {...field} className={getNestedInputClass('addresses', index, 'zipCode')} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name={`addresses.${index}.street`} render={({ field }) => (
                                <FormItem className="md:col-span-3"><FormLabel>Logradouro</FormLabel><FormControl><Input {...field} className={getNestedInputClass('addresses', index, 'street')} /></FormControl><FormMessage /></FormItem>
                                )} />
                            </div>
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                                <FormField control={form.control} name={`addresses.${index}.number`} render={({ field }) => (
                                <FormItem><FormLabel>Número</FormLabel><FormControl><Input {...field} className={getNestedInputClass('addresses', index, 'number')} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name={`addresses.${index}.complement`} render={({ field }) => (
                                <FormItem><FormLabel>Complemento</FormLabel><FormControl><Input {...field} className={getNestedInputClass('addresses', index, 'complement')} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name={`addresses.${index}.district`} render={({ field }) => (
                                <FormItem className="md:col-span-2"><FormLabel>Bairro</FormLabel><FormControl><Input {...field} className={getNestedInputClass('addresses', index, 'district')} /></FormControl><FormMessage /></FormItem>
                                )} />
                            </div>
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                                <FormField control={form.control} name={`addresses.${index}.city`} render={({ field }) => (
                                <FormItem className="md:col-span-2"><FormLabel>Cidade</FormLabel><FormControl><Input {...field} className={getNestedInputClass('addresses', index, 'city')} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name={`addresses.${index}.state`} render={({ field }) => (
                                <FormItem><FormLabel>Estado (UF)</FormLabel><FormControl><Input {...field} className={getNestedInputClass('addresses', index, 'state')} /></FormControl><FormMessage /></FormItem>
                                )} />
                            </div>
                        </div>
                    ))}
                    <Button type="button" size="sm" variant="outline" onClick={() => appendAddress({ description: "", isPrimary: addressFields.length === 0, street: "", city: "", zipCode: "", number: "", complement: "", district: "", state: "" })}>
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Adicionar Outro Endereço
                    </Button>
                    <FormMessage>{form.formState.errors.addresses?.root?.message}</FormMessage>
               </div>

              {/* Observações */}
               <div className="space-y-2 pt-4">
                <h3 className="text-lg font-medium">Observações Gerais</h3>
                <Separator />
              </div>
                <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                        <Textarea
                        className={cn("resize-y min-h-[100px]", getInputClass("notes"))}
                        {...field}
                        />
                    </FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                    </FormItem>
                )}
                />

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" asChild>
                  <Link href="/dashboard/clients">Cancelar</Link>
                </Button>
                <Button type="submit" className="bg-accent hover:bg-accent/90" disabled={isSubmitting || !user}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar Cliente
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
      
      <AlertDialog open={isConfirmNameDialogOpen} onOpenChange={setIsConfirmNameDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Cliente com nome semelhante encontrado</AlertDialogTitle>
                    <AlertDialogDescription>
                        Já existe(m) cliente(s) com este nome. Deseja criar um novo cliente mesmo assim? Verifique os dados abaixo.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                    {existingClients.map(client => (
                         <Card key={client.id} className="p-3">
                             <Link href={`/dashboard/clients/${client.id}`} className="font-semibold text-primary hover:underline">{client.name}</Link>
                             <div className="text-sm text-muted-foreground space-y-1 mt-1">
                                <div className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> CPF/CNPJ: {client.cpfCnpj || 'N/A'}</div>
                                <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Telefone: {client.phones?.[0]?.number || 'N/A'}</div>
                             </div>
                         </Card>
                    ))}
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setExistingClients([])}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirmNameAndSubmit}>Sim, criar novo cliente</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

    </div>
  );
}
