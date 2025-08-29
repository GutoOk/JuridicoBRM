
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileDown, Users, Gavel, CheckSquare, CalendarClock, Loader2 } from "lucide-react";
import { getClientReportData, getProcessReportData, getTaskReportData, getDeadlineReportData } from "./actions";
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

type ReportType = 'clients' | 'processes' | 'tasks' | 'deadlines';

const reportItems: { type: ReportType, title: string, description: string, icon: React.ElementType, fileName: string, action: () => Promise<any[]> }[] = [
    { type: 'clients', title: "Relatório de Clientes", description: "Lista completa de todos os clientes cadastrados.", icon: Users, fileName: "relatorio_clientes.xlsx", action: getClientReportData },
    { type: 'processes', title: "Relatório de Processos", description: "Detalhes de todos os processos, incluindo status e vara.", icon: Gavel, fileName: "relatorio_processos.xlsx", action: getProcessReportData },
    { type: 'tasks', title: "Relatório de Tarefas", description: "Todas as tarefas, seus responsáveis, prazos e status.", icon: CheckSquare, fileName: "relatorio_tarefas.xlsx", action: getTaskReportData },
    { type: 'deadlines', title: "Relatório de Prazos", description: "Lista de todos os prazos futuros e vencidos.", icon: CalendarClock, fileName: "relatorio_prazos.xlsx", action: getDeadlineReportData },
];

export default function ReportsPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [loadingReport, setLoadingReport] = useState<ReportType | null>(null);
    const [isAuthorized, setIsAuthorized] = useState(false);

    useEffect(() => {
        if (!authLoading) {
            if (user?.name === 'Áttila') {
                setIsAuthorized(true);
            } else {
                toast({
                    title: "Acesso Negado",
                    description: "Você não tem permissão para acessar esta página.",
                    variant: "destructive"
                });
                router.push('/dashboard');
            }
        }
    }, [user, authLoading, router, toast]);

    const handleExport = async (type: ReportType) => {
        setLoadingReport(type);
        try {
            const reportAction = reportItems.find(item => item.type === type);
            if (!reportAction) {
                throw new Error("Tipo de relatório inválido.");
            }

            const data = await reportAction.action();

            if (data.length === 0) {
                toast({ title: "Nenhum dado para exportar", description: "Não foram encontrados registros para este tipo de relatório.", variant: "default" });
                return;
            }

            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Dados');
            XLSX.writeFile(workbook, reportAction.fileName);

        } catch (error) {
            console.error("Failed to export data:", error);
            const errorMessage = error instanceof Error ? error.message : "Não foi possível gerar o relatório. Tente novamente.";
            toast({ title: "Erro na Exportação", description: errorMessage, variant: "destructive" });
        } finally {
            setLoadingReport(null);
        }
    };


    if (authLoading || !isAuthorized) {
       return (
            <div className="mx-auto w-full max-w-7xl">
                <Skeleton className="h-8 w-64 mb-6" />
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-4 w-96 mt-2" />
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Skeleton className="h-40 w-full" />
                        <Skeleton className="h-40 w-full" />
                        <Skeleton className="h-40 w-full" />
                        <Skeleton className="h-40 w-full" />
                    </CardContent>
                </Card>
            </div>
       );
    }

    return (
        <div className="mx-auto w-full max-w-7xl">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">Relatórios e Exportações</h1>
            </div>
            <Card className="mt-6">
                <CardHeader>
                <CardTitle>Exportar Dados</CardTitle>
                <CardDescription>Faça o download dos dados do sistema em formato Excel (XLSX).</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        {reportItems.map((item) => (
                            <Card key={item.type} className="flex flex-col">
                                <CardHeader className="flex-1">
                                    <div className="flex items-start gap-4">
                                        <item.icon className="h-8 w-8 text-primary flex-shrink-0" />
                                        <div className="flex-1">
                                            <CardTitle className="text-base">{item.title}</CardTitle>
                                            <CardDescription className="text-xs mt-1">{item.description}</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Button className="w-full bg-accent hover:bg-accent/90" onClick={() => handleExport(item.type)} disabled={loadingReport === item.type}>
                                        {loadingReport === item.type ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <FileDown className="mr-2 h-4 w-4" />
                                        )}
                                        Exportar
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
