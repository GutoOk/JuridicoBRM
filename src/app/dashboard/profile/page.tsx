
"use client";

import { useState, useEffect } from "react";
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
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { updateUser, getUsers } from "@/app/dashboard/users/actions";
import { Loader2, Eye, EyeOff } from "lucide-react";
import type { User } from "@/lib/types";
import { useRouter } from "next/navigation";

const formSchema = z.object({
    name: z.string().min(3, "O nome é obrigatório."),
    imageUrl: z.string().url("Por favor, insira uma URL válida.").optional().or(z.literal('')),
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
    confirmPassword: z.string().optional(),
}).refine(data => {
    if (data.newPassword || data.confirmPassword) {
        return !!data.currentPassword;
    }
    return true;
}, {
    message: "A senha atual é obrigatória para definir uma nova senha.",
    path: ["currentPassword"],
}).refine(data => data.newPassword === data.confirmPassword, {
    message: "As novas senhas não coincidem.",
    path: ["confirmPassword"],
}).refine(data => {
    if (data.newPassword) {
        return data.newPassword.length >= 6;
    }
    return true;
}, {
    message: "A nova senha deve ter pelo menos 6 caracteres.",
    path: ["newPassword"],
});


type ProfileFormValues = z.infer<typeof formSchema>;

export default function ProfilePage() {
    const { user, login, loading: authLoading } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    
    const form = useForm<ProfileFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            imageUrl: "",
            currentPassword: "",
            newPassword: "",
            confirmPassword: "",
        },
    });

    const imageUrl = form.watch("imageUrl");

    useEffect(() => {
        if (user) {
            form.reset({
                name: user.name,
                imageUrl: user.imageUrl || "",
            });
        }
    }, [user, form]);
    
    const onSubmit = async (values: ProfileFormValues) => {
        if (!user) {
            toast({ title: "Erro", description: "Usuário não autenticado.", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);

        try {
            // Se a senha for alterada, verifique a senha atual primeiro
            if (values.newPassword) {
                const users = await getUsers();
                const currentUserData = users.find(u => u.id === user.id);

                if (currentUserData?.password !== values.currentPassword) {
                    form.setError("currentPassword", { type: "manual", message: "A senha atual está incorreta." });
                    setIsSubmitting(false);
                    return;
                }
            }

            const dataToUpdate: Partial<User> & { id?: string } = {
                name: values.name,
                imageUrl: values.imageUrl,
            };

            if (values.newPassword) {
                dataToUpdate.password = values.newPassword;
            }

            await updateUser(user.id, dataToUpdate);

            // Re-login with new data to update context and localStorage
            await login(dataToUpdate.name || user.name, dataToUpdate.password || values.currentPassword || "");

            toast({ title: "Perfil Atualizado!", description: "Suas informações foram salvas com sucesso." });
            router.back();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({ title: "Erro ao atualizar perfil", description: errorMessage, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (authLoading) {
        return <p>Carregando...</p>
    }


    return (
        <div className="mx-auto w-full max-w-4xl">
            <h1 className="text-2xl font-bold tracking-tight mb-6">Perfil e Configurações</h1>
             <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                     <Card>
                        <CardHeader>
                            <CardTitle>Informações Públicas</CardTitle>
                            <CardDescription>Essas informações podem ser vistas por outros usuários.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                             <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nome de Usuário</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                             <div className="flex items-center gap-6">
                                <Avatar className="h-20 w-20">
                                    <AvatarImage src={imageUrl || user?.imageUrl} alt={user?.name} />
                                    <AvatarFallback>{user?.name?.substring(0, 1).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <FormField
                                    control={form.control}
                                    name="imageUrl"
                                    render={({ field }) => (
                                        <FormItem className="flex-1">
                                            <FormLabel>URL da Imagem de Perfil</FormLabel>
                                            <FormControl>
                                                <Input {...field} placeholder="https://exemplo.com/sua-imagem.png" />
                                            </FormControl>
                                            <FormDescription>Cole a URL de uma imagem para o seu avatar.</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                             </div>
                        </CardContent>
                     </Card>

                      <Card>
                        <CardHeader>
                            <CardTitle>Segurança</CardTitle>
                            <CardDescription>Altere sua senha de acesso.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                             <FormField
                                control={form.control}
                                name="currentPassword"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Senha Atual</FormLabel>
                                         <div className="relative">
                                            <FormControl>
                                                <Input type={showCurrentPassword ? "text" : "password"} {...field} placeholder="******" />
                                            </FormControl>
                                            <Button type="button" variant="ghost" size="icon" className="absolute inset-y-0 right-0 h-full w-10 text-muted-foreground" onClick={() => setShowCurrentPassword(!showCurrentPassword)}>
                                                {showCurrentPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                            </Button>
                                        </div>
                                        <FormDescription>Necessária apenas se for alterar a senha.</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormField
                                    control={form.control}
                                    name="newPassword"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Nova Senha</FormLabel>
                                            <div className="relative">
                                                <FormControl>
                                                    <Input type={showNewPassword ? "text" : "password"} {...field} placeholder="******" />
                                                </FormControl>
                                                <Button type="button" variant="ghost" size="icon" className="absolute inset-y-0 right-0 h-full w-10 text-muted-foreground" onClick={() => setShowNewPassword(!showNewPassword)}>
                                                    {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                                </Button>
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                 <FormField
                                    control={form.control}
                                    name="confirmPassword"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Confirmar Nova Senha</FormLabel>
                                            <div className="relative">
                                                <FormControl>
                                                    <Input type={showConfirmPassword ? "text" : "password"} {...field} placeholder="******" />
                                                </FormControl>
                                                <Button type="button" variant="ghost" size="icon" className="absolute inset-y-0 right-0 h-full w-10 text-muted-foreground" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                                                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                                </Button>
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                             </div>
                        </CardContent>
                     </Card>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button type="submit" className="bg-accent hover:bg-accent/90" disabled={isSubmitting || !form.formState.isDirty}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Salvar Alterações
                        </Button>
                    </div>
                </form>
             </Form>
        </div>
    );
}
