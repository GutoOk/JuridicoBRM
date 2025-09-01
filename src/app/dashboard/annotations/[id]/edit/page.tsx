
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
} from "@/components/ui/form";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { Update } from "@/lib/types";
import { getUpdateById } from "@/app/dashboard/clients/[id]/actions";
import { updateAnnotation } from "@/app/dashboard/annotations/actions";
import { Loader2, ArrowLeft } from "lucide-react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";

const formSchema = z.object({
    description: z.string().min(1, "A descrição é obrigatória."),
});

type EditAnnotationFormValues = z.infer<typeof formSchema>;

export default function EditAnnotationPage() {
    const { toast } = useToast();
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();

    const annotationId = params.id as string;
    const clientId = searchParams.get('clientId');

    const [annotation, setAnnotation] = useState<Update | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<EditAnnotationFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            description: "",
        },
    });

    useEffect(() => {
        if (!annotationId) return;

        async function fetchData() {
            setIsLoading(true);
            try {
                const fetchedAnnotation = await getUpdateById(annotationId);

                if (fetchedAnnotation && fetchedAnnotation.type === 'Anotação') {
                    setAnnotation(fetchedAnnotation);
                    form.reset({
                        description: fetchedAnnotation.description || "",
                    });
                } else {
                    toast({ title: "Anotação não encontrada", variant: "destructive" });
                    router.push('/dashboard/annotations');
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
                toast({ title: "Erro ao carregar dados", description: errorMessage, variant: "destructive" });
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, [annotationId, router, toast, form]);

    const onSubmit = async (values: EditAnnotationFormValues) => {
        setIsSubmitting(true);
        try {
            await updateAnnotation(annotationId, { description: values.description });
            toast({ title: "Anotação Atualizada!", description: "A anotação foi atualizada com sucesso." });
            
            if (clientId) {
                router.push(`/dashboard/clients/${clientId}`);
            } else {
                router.push("/dashboard/annotations");
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({ title: "Erro ao atualizar anotação", description: errorMessage, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const cancelHref = clientId ? `/dashboard/clients/${clientId}` : '/dashboard/annotations';

     if (isLoading) {
        return (
            <div className="mx-auto w-full max-w-7xl">
                 <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10" />
                    <div className="space-y-2">
                        <Skeleton className="h-6 w-64" />
                        <Skeleton className="h-4 w-80" />
                    </div>
                </div>
                <Card className="mt-6">
                    <CardHeader>
                        <Skeleton className="h-8 w-1/2" />
                        <Skeleton className="h-4 w-3/4" />
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <Skeleton className="h-20 w-full" />
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
       <div className="mx-auto w-full max-w-7xl">
            <div className="flex items-center gap-4">
                 <Button variant="outline" size="icon" asChild>
                    <Link href={cancelHref}>
                        <ArrowLeft className="h-4 w-4" />
                        <span className="sr-only">Voltar</span>
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Editar Anotação</h1>
                    <p className="text-muted-foreground">
                        {annotation?.clientName ? `Referente a: ${annotation.clientName}` : 'Anotação Geral'}
                    </p>
                </div>
            </div>
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 mt-6">
                 <Card>
                    <CardHeader>
                        <CardTitle>Detalhes da Anotação</CardTitle>
                        <CardDescription>
                           Modifique a descrição e clique em salvar para aplicar as alterações.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <FormField control={form.control} name="description" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Descrição</FormLabel>
                                <FormControl>
                                    <Textarea {...field} className="min-h-[150px]" />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                         <div className="flex justify-end gap-2 pt-4">
                            <Button type="button" variant="outline" asChild>
                                <Link href={cancelHref}>Cancelar</Link>
                            </Button>
                            <Button type="submit" className="bg-accent hover:bg-accent/90" disabled={isSubmitting}>
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
