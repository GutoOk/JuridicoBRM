
"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Check, ChevronsUpDown, Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import type { User, Client } from '@/lib/types';
import { addClientUpdate } from '../clients/[id]/actions';
import { addTask } from './actions';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

const formSchema = z.object({
  title: z.string().min(3, "A descrição da tarefa é obrigatória."),
  clientId: z.string().optional(),
  responsible: z.string().default('Todos'),
  priority: z.enum(['Alta', 'Média', 'Baixa']).default('Média'),
  dueDate: z.date().optional().nullable(),
});

type TaskFormValues = z.infer<typeof formSchema>;

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskCreated: () => void;
  users: User[];
  clients: Client[];
}

export function TaskFormDialog({ open, onOpenChange, onTaskCreated, users, clients = [] }: TaskFormDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClientPopoverOpen, setClientPopoverOpen] = useState(false);

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      clientId: '',
      responsible: user?.name || 'Todos',
      priority: 'Média',
      dueDate: null,
    },
  });

  React.useEffect(() => {
    if(user && open) {
        form.reset({
            title: '',
            clientId: '',
            responsible: user.name || 'Todos',
            priority: 'Média',
            dueDate: null,
        });
    }
  }, [open, user, form]);

  async function onSubmit(values: TaskFormValues) {
    if (!user) {
        toast({ title: "Usuário não autenticado", variant: "destructive" });
        return;
    }
    setIsSubmitting(true);
    try {
      if (values.clientId) {
        // Task linked to a client
        await addClientUpdate(values.clientId, {
            type: 'Tarefa',
            description: values.title,
            author: user.name,
            responsible: values.responsible,
            priority: values.priority,
            dueDate: values.dueDate ? values.dueDate.toISOString() : null
        });
         toast({ title: "Tarefa adicionada ao cliente!" });
      } else {
        // General task
        await addTask({
            title: values.title,
            author: user.name,
            responsible: values.responsible,
            priority: values.priority,
            dueDate: values.dueDate
        })
        toast({ title: "Tarefa geral criada com sucesso!" });
      }
      onTaskCreated();
      onOpenChange(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
      toast({ title: "Erro ao criar tarefa", description: errorMessage, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Criar Nova Tarefa</DialogTitle>
          <DialogDescription>Preencha os detalhes abaixo. Vincular a um cliente é opcional.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição da Tarefa</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Ex: Preparar petição inicial para o caso X" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <FormField
                    control={form.control}
                    name="clientId"
                    render={({ field }) => (
                    <FormItem className="flex flex-col">
                        <FormLabel>Vincular a um Cliente (Opcional)</FormLabel>
                        <Popover open={isClientPopoverOpen} onOpenChange={setClientPopoverOpen}>
                        <PopoverTrigger asChild>
                            <FormControl>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={isClientPopoverOpen}
                                className={cn(
                                "w-full justify-between",
                                !field.value && "text-muted-foreground"
                                )}
                            >
                                {field.value
                                ? clients.find(
                                    (client) => client.id === field.value
                                    )?.name
                                : "Selecione um cliente"}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                            </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                           <Command>
                                <CommandInput placeholder="Buscar cliente..." />
                                <CommandList>
                                <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                                <CommandGroup>
                                    {clients.map((client) => (
                                    <CommandItem
                                        key={client.id}
                                        onSelect={() => {
                                            form.setValue("clientId", client.id === field.value ? "" : client.id)
                                            setClientPopoverOpen(false)
                                        }}
                                    >
                                        <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            client.id === field.value
                                            ? "opacity-100"
                                            : "opacity-0"
                                        )}
                                        />
                                        {client.name}
                                    </CommandItem>
                                    ))}
                                </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                        </Popover>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="responsible"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Responsável</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione o responsável" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="Todos">Todos</SelectItem>
                                {users.map(u => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Prioridade</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Defina a prioridade" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                 <SelectItem value="Baixa">Baixa</SelectItem>
                                 <SelectItem value="Média">Média</SelectItem>
                                 <SelectItem value="Alta">Alta</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                 <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                        <FormItem className='flex flex-col'>
                        <FormLabel>Prazo Final</FormLabel>
                        <Popover>
                            <PopoverTrigger asChild>
                            <FormControl>
                                <Button
                                variant={"outline"}
                                className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                )}
                                >
                                {field.value ? (
                                    format(field.value, "PPP", { locale: ptBR })
                                ) : (
                                    <span>Escolha uma data</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                            </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                mode="single"
                                selected={field.value || undefined}
                                onSelect={field.onChange}
                                disabled={(date) => date < new Date("1900-01-01")}
                                initialFocus
                                locale={ptBR}
                            />
                            </PopoverContent>
                        </Popover>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
            </div>
            <DialogFooter className='pt-4'>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancelar</Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Tarefa
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
