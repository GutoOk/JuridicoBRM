

"use client";

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MoreHorizontal, PlusCircle, Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { getUsers, addUser, updateUser, deleteUser } from './actions';
import type { User } from '@/lib/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/use-auth';

const formSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(3, 'O nome é obrigatório.'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.').optional().or(z.literal('')),
  isAdmin: z.boolean().default(false),
});

type UserFormValues = z.infer<typeof formSchema>;

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    // Master password check
    if (sessionStorage.getItem('master-access') !== 'true') {
        toast({
            title: "Acesso Negado",
            description: "Você precisa da senha mestra para acessar esta página.",
            variant: "destructive"
        });
      router.push('/');
    } else {
        fetchUsers();
    }
  }, [router, toast]);
  
  const fetchUsers = async () => {
      setLoading(true);
      try {
          const userList = await getUsers();
          setUsers(userList);
      } catch (error) {
          toast({ title: "Erro ao buscar usuários", variant: "destructive" });
      } finally {
          setLoading(false);
      }
  };

  const form = useForm<UserFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { id: '', name: '', password: '', isAdmin: false },
  });

  const handleOpenDialog = (user: User | null = null) => {
    setEditingUser(user);
    setShowPassword(false); // Reset visibility on open
    if (user) {
      form.reset({ ...user, password: '', isAdmin: !!user.isAdmin });
    } else {
      form.reset({ name: '', password: '', isAdmin: false });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = async (values: UserFormValues) => {
    setIsSubmitting(true);
    try {
      if (editingUser) { // Update
        await updateUser(editingUser.id, values);
        toast({ title: "Usuário atualizado com sucesso!" });
      } else { // Create
        if (!values.password) {
            form.setError("password", { type: "manual", message: "A senha é obrigatória para novos usuários." });
            setIsSubmitting(false);
            return;
        }
        await addUser(values as any);
        toast({ title: "Usuário criado com sucesso!" });
      }
      setIsDialogOpen(false);
      fetchUsers();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
      toast({ title: "Erro ao salvar usuário", description: errorMessage, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleDeleteUser = async (id: string) => {
      try {
        await deleteUser(id);
        toast({ title: "Usuário excluído com sucesso!" });
        fetchUsers();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
        toast({ title: "Erro ao excluir usuário", description: errorMessage, variant: "destructive" });
      }
  }


  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Gerenciar Usuários</h1>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} className="bg-accent hover:bg-accent/90">
              <PlusCircle className="mr-2 h-4 w-4" />
              Adicionar Usuário
            </Button>
          </DialogTrigger>
        </div>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Lista de Usuários</CardTitle>
            <CardDescription>Adicione, edite ou remova usuários do sistema.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Criado Em</TableHead>
                  <TableHead><span className="sr-only">Ações</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                    <TableRow><TableCell colSpan={4} className="text-center">Carregando...</TableCell></TableRow>
                ) : (
                    users.map((user) => (
                    <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>
                          {user.isAdmin && <ShieldCheck className="h-5 w-5 text-primary" />}
                        </TableCell>
                        <TableCell>{new Date(user.createdAt as string).toLocaleDateString()}</TableCell>
                        <TableCell>
                        <AlertDialog>
                            <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button aria-haspopup="true" size="icon" variant="ghost" disabled={user.name === 'Áttila'}>
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Toggle menu</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Ações</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => handleOpenDialog(user)}>Editar</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <AlertDialogTrigger asChild>
                                    <DropdownMenuItem className="text-destructive">Excluir</DropdownMenuItem>
                                </AlertDialogTrigger>
                            </DropdownMenuContent>
                            </DropdownMenu>
                             <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Você tem certeza absoluta?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Essa ação não pode ser desfeita. Isso excluirá permanentemente o usuário "{user.name}".
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteUser(user.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        </TableCell>
                    </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Dialog Content for Add/Edit */}
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar Usuário' : 'Adicionar Usuário'}</DialogTitle>
            <DialogDescription>
              {editingUser ? 'Altere os dados abaixo para atualizar o usuário.' : 'Preencha os dados para criar um novo usuário.'}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha</FormLabel>
                    <div className="relative">
                        <FormControl>
                            <Input 
                                type={showPassword ? "text" : "password"} 
                                {...field} 
                                placeholder={editingUser ? 'Deixe em branco para não alterar' : ''} 
                            />
                        </FormControl>
                        <Button type="button" variant="ghost" size="icon" className="absolute inset-y-0 right-0 h-full w-10 text-muted-foreground" onClick={() => setShowPassword(!showPassword)}>
                            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isAdmin"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-2 space-y-0 rounded-md border p-3 shadow-sm">
                     <FormControl>
                        <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={editingUser?.name === 'Áttila'}
                        />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                        <FormLabel>
                        Administrador
                        </FormLabel>
                        <FormMessage />
                    </div>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancelar</Button>
                </DialogClose>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </div>
    </Dialog>
  );
}
