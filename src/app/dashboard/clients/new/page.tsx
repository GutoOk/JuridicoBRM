
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

const formSchema = z.object({
  // Identificação Pessoal
  name: z.string().min(3, "Nome completo é obrigatório."),
  nationality: z.string().min(3, "Nacionalidade é obrigatória."),
  profession: z.string().min(3, "Profissão é obrigatória."),
  maritalStatus: z.string().min(3, "Estado civil é obrigatório."),
  // Documentos
  rg: z.string().min(5, "RG é obrigatório."),
  rgIssuer: z.string().min(2, "Órgão emissor é obrigatório."),
  cpfCnpj: z.string().min(11, "CPF/CNPJ é obrigatório."),
  type: z.enum(["Pessoa Física", "Pessoa Jurídica"]),
  // Contato
  email: z.string().email("Formato de email inválido."),
  phone: z.string().min(10, "Telefone principal é obrigatório."),
  phone2: z.string().optional(),
  // Endereço
  addressZipCode: z.string().min(8, "CEP é obrigatório."),
  addressStreet: z.string().min(3, "Logradouro é obrigatório."),
  addressNumber: z.string().min(1, "Número é obrigatório."),
  addressComplement: z.string().optional(),
  addressDistrict: z.string().min(3, "Bairro é obrigatório."),
  addressCity: z.string().min(3, "Cidade é obrigatória."),
  addressState: z.string().min(2, "Estado (UF) é obrigatório."),
  // Informações Jurídicas
  notes: z.string().optional(),
});

type ClientFormValues = z.infer<typeof formSchema>;

export default function NewClientPage() {
  const { toast } = useToast();
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "Pessoa Física",
    },
  });

  function onSubmit(values: ClientFormValues) {
    console.log(values);
    toast({
      title: "Cliente Cadastrado!",
      description: "O novo cliente foi adicionado com sucesso.",
    });
    // Here you would typically send the data to your backend
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Adicionar Novo Cliente</h1>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Dados Cadastrais</CardTitle>
              <CardDescription>Preencha as informações abaixo para criar um novo cliente.</CardDescription>
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
                    <FormControl><Input placeholder="João da Silva" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="nationality" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nacionalidade</FormLabel>
                    <FormControl><Input placeholder="Brasileiro(a)" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name="profession" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Profissão</FormLabel>
                    <FormControl><Input placeholder="Operador de Computador" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name="maritalStatus" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado Civil</FormLabel>
                    <FormControl><Input placeholder="Solteiro(a)" {...field} /></FormControl>
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
                    <FormControl><Input placeholder="00.000.000-0" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name="rgIssuer" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Órgão Emissor</FormLabel>
                    <FormControl><Input placeholder="SSP/SP" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name="cpfCnpj" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF/CNPJ</FormLabel>
                    <FormControl><Input placeholder="000.000.000-00" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
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
                    <FormControl><Input type="email" placeholder="contato@email.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone Principal</FormLabel>
                    <FormControl><Input placeholder="(00) 90000-0000" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name="phone2" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone Alternativo</FormLabel>
                    <FormControl><Input placeholder="(00) 90000-0000" {...field} /></FormControl>
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
                    <FormControl><Input placeholder="00000-000" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name="addressStreet" render={({ field }) => (
                  <FormItem className="md:col-span-3">
                    <FormLabel>Logradouro</FormLabel>
                    <FormControl><Input placeholder="Avenida Brasil" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
               <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                 <FormField control={form.control} name="addressNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número</FormLabel>
                    <FormControl><Input placeholder="123" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                  <FormField control={form.control} name="addressComplement" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Complemento</FormLabel>
                    <FormControl><Input placeholder="Apto 101" {...field} /></FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name="addressDistrict" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bairro</FormLabel>
                    <FormControl><Input placeholder="Centro" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                 <FormField control={form.control} name="addressCity" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Cidade</FormLabel>
                    <FormControl><Input placeholder="São Paulo" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name="addressState" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado (UF)</FormLabel>
                    <FormControl><Input placeholder="SP" {...field} /></FormControl>
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
                        placeholder="Insira aqui informações relevantes sobre o cliente..."
                        className="resize-y min-h-[100px]"
                        {...field}
                        />
                    </FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                    </FormItem>
                )}
                />

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline">Cancelar</Button>
                <Button type="submit" className="bg-accent hover:bg-accent/90">Salvar Cliente</Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}
