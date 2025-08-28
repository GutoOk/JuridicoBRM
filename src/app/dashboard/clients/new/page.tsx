
"use client";

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
import { addClient } from "@/app/dashboard/clients/actions";
import { getClientDataFromText } from "@/app/actions";
import type { ExtractClientDataOutput } from "@/ai/flows/extract-client-data";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
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
import { cn } from "@/lib/utils";


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
  phone: z.string().optional(),
  phone2: z.string().optional(),
  // Endereço
  addressZipCode: z.string().optional(),
  addressStreet: z.string().optional(),
  addressNumber: z.string().optional(),
  addressComplement: z.string().optional(),
  addressDistrict: z.string().optional(),
  addressCity: z.string().optional(),
  addressState: z.string().optional(),
  // Informações Jurídicas
  notes: z.string().optional(),
});

type ClientFormValues = z.infer<typeof formSchema>;
type FilledByAI = Partial<Record<keyof ClientFormValues, boolean>>;

export default function NewClientPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [textToAnalyze, setTextToAnalyze] = React.useState("");
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [filledByAI, setFilledByAI] = React.useState<FilledByAI>({});


  const form = useForm<ClientFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "Pessoa Física",
      name: "",
      nationality: "",
      profession: "",
      maritalStatus: "",
      rg: "",
      rgIssuer: "",
      cpfCnpj: "",
      email: "",
      phone: "",
      phone2: "",
      addressZipCode: "",
      addressStreet: "",
      addressNumber: "",
      addressComplement: "",
      addressDistrict: "",
      addressCity: "",
      addressState: "",
      notes: "",
    },
  });

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
      
      const newValues = {
        ...form.getValues(),
        ...Object.fromEntries(Object.entries(extractedData).filter(([_, v]) => v != null && v !== "")),
      };
      form.reset(newValues);

      const aiFilledFields = Object.keys(extractedData).reduce((acc, key) => {
        if (extractedData[key as keyof ExtractClientDataOutput]) {
          acc[key as keyof ClientFormValues] = true;
        }
        return acc;
      }, {} as FilledByAI);
      setFilledByAI(aiFilledFields);
      
      toast({
        title: "Dados Analisados!",
        description: "Os campos do formulário foram preenchidos. Verifique os dados destacados.",
      });
      setIsDialogOpen(false); // Fecha o dialogo
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


  async function onSubmit(values: ClientFormValues) {
    setIsSubmitting(true);
    try {
      const clientData = Object.fromEntries(
        Object.entries(values).filter(([_, v]) => v != null && v !== "")
      );

      await addClient(clientData as any);
      
      toast({
        title: "Cliente Cadastrado!",
        description: "O novo cliente foi adicionado com sucesso.",
      });
      router.push("/dashboard/clients");
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
        toast({
            title: "Erro ao cadastrar",
            description: errorMessage,
            variant: "destructive",
        });
    } finally {
        setIsSubmitting(false);
    }
  }

  const getInputClass = (fieldName: keyof ClientFormValues) => {
    return cn({ "border-ring ring-2 ring-ring/40": filledByAI[fieldName] });
  };
  
  return (
    <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight">Adicionar Novo Cliente</h1>
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
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
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                 <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input type="email" {...field} className={getInputClass("email")} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone Principal</FormLabel>
                    <FormControl><Input {...field} className={getInputClass("phone")} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name="phone2" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone Alternativo</FormLabel>
                    <FormControl><Input {...field} className={getInputClass("phone2")} /></FormControl>
                     <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

               {/* Endereço */}
              <div className="space-y-2 pt-4">
                <h3 className="text-lg font-medium">Endereço</h3>
                <Separator />
              </div>
               <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                 <FormField control={form.control} name="addressZipCode" render={({ field }) => (
                  <FormItem className="md:col-span-1">
                    <FormLabel>CEP</FormLabel>
                    <FormControl><Input {...field} className={getInputClass("addressZipCode")} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name="addressStreet" render={({ field }) => (
                  <FormItem className="md:col-span-3">
                    <FormLabel>Logradouro</FormLabel>
                    <FormControl><Input {...field} className={getInputClass("addressStreet")} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
               <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                 <FormField control={form.control} name="addressNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número</FormLabel>
                    <FormControl><Input {...field} className={getInputClass("addressNumber")} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                  <FormField control={form.control} name="addressComplement" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Complemento</FormLabel>
                    <FormControl><Input {...field} className={getInputClass("addressComplement")} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name="addressDistrict" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bairro</FormLabel>
                    <FormControl><Input {...field} className={getInputClass("addressDistrict")} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                 <FormField control={form.control} name="addressCity" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Cidade</FormLabel>
                    <FormControl><Input {...field} className={getInputClass("addressCity")} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name="addressState" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado (UF)</FormLabel>
                    <FormControl><Input {...field} className={getInputClass("addressState")} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
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
                <Button type="submit" className="bg-accent hover:bg-accent/90" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar Cliente
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}

    