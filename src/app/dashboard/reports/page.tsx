
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileDown, Users, Gavel, CheckSquare, CalendarClock, Loader2 } from "lucide-react";
import { getClientReportData, getProcessReportData, getTaskReportData, getDeadlineReportData } from "./actions";
import * as XLSX from 'xlsx';
import { format, parseISO } from 'date-fns';
import { useToast } from "@/hooks/use-toast";

type ReportType = 'clients' | 'processes' | 'tasks' | 'deadlines';

const reportItems: { type: ReportType, title: string, description: string, icon: React.ElementType, fileName: string }[] = [
    { type: 'clients', title: "Relatório de Clientes", description: "Lista completa de todos os clientes cadastrados.", icon: Users, fileName: "relatorio_clientes.xlsx" },
    { type: 'processes', title: "Relatório de Processos", description: "Detalhes de todos os processos, incluindo status e vara.", icon: Gavel, fileName: "relatorio_processos.xlsx" },
    { type: 'tasks', title: "Relatório de Tarefas", description: "Todas as tarefas, seus responsáveis, prazos e status.", icon: CheckSquare, fileName: "relatorio_tarefas.xlsx" },
    { type: 'deadlines', title: "Relatório de Prazos", description: "Lista de todos os prazos futuros e vencidos.", icon: CalendarClock, fileName: "relatorio_prazos.xlsx" },
];

export default function ReportsPage() {
    const [loadingReport, setLoadingReport] = useState<ReportType | null>(null);
    const { toast } = useToast();

    const handleExport = async (type: ReportType) => {
        setLoadingReport(type);
        try {
            let data: any[] = [];
            let fileName = 'relatorio.xlsx';

            switch (type) {
                case 'clients':
                    const clients = await getClientReportData();
                    data = clients.map(c => ({
                        'Nome': c.name,
                        'Tipo': c.type,
                        'CPF/CNPJ': c.cpfCnpj,
                        'Email': c.email,
                        'Telefone': c.phone,
                        'Endereço': [c.addressStreet, c.addressNumber, c.addressComplement, c.addressDistrict, c.addressCity, c.addressState, c.addressZipCode].filter(Boolean).join(', '),
                        'Data de Cadastro': c.createdAt ? format(parseISO(c.createdAt as string), 'dd/MM/yyyy HH:mm') : '',
                    }));
                    fileName = 'relatorio_clientes.xlsx';
                    break;
                case 'processes':
                    const processes = await getProcessReportData();
                    data = processes.map(p => ({
                        'Nº Processo': p.processNumber,
                        'Clientes': p.clientNames.join(', '),
                        'Tipo de Ação': p.actionType,
                        'Status': p.status,
                        'Vara': p.vara,
                        'Comarca': p.comarca,
                        'Instância': p.instancia,
                        'Data de Cadastro': p.createdAt ? format(parseISO(p.createdAt as string), 'dd/MM/yyyy HH:mm') : '',
                        'Última Atualização': p.lastUpdate ? format(parseISO(p.lastUpdate as string), 'dd/MM/yyyy HH:mm') : '',
                    }));
                    fileName = 'relatorio_processos.xlsx';
                    break;
                case 'tasks':
                     const tasks = await getTaskReportData();
                     data = tasks.map(t => ({
                        'Tarefa': t.title,
                        'Cliente Associado': t.clientName || 'N/A',
                        'Processo Associado': t.processNumber || 'N/A',
                        'Responsável': t.responsible,
                        'Prioridade': t.priority,
                        'Status': t.status,
                        'Data de Criação': t.createdAt ? format(parseISO(t.createdAt as string), 'dd/MM/yyyy HH:mm') : '',
                        'Prazo Final': t.dueDate ? format(parseISO(t.dueDate as string), 'dd/MM/yyyy') : 'N/A',
                        'Data de Conclusão': t.completedAt ? format(parseISO(t.completedAt as string), 'dd/MM/yyyy HH:mm') : 'N/A',
                     }));
                     fileName = 'relatorio_tarefas.xlsx';
                    break;
                case 'deadlines':
                     const deadlines = await getDeadlineReportData();
                     data = deadlines.map(t => ({
                        'Prazo Final': t.dueDate ? format(parseISO(t.dueDate as string), 'dd/MM/yyyy') : '',
                        'Tarefa': t.title,
                        'Cliente Associado': t.clientName || 'N/A',
                        'Processo Associado': t.processNumber || 'N/A',
                        'Responsável': t.responsible,
                        'Prioridade': t.priority,
                        'Status': t.status,
                     }));
                     fileName = 'relatorio_prazos.xlsx';
                    break;
            }

            if (data.length === 0) {
                toast({ title: "Nenhum dado para exportar", description: "Não foram encontrados registros para este tipo de relatório.", variant: "default" });
                return;
            }

            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Dados');
            XLSX.writeFile(workbook, fileName);

        } catch (error) {
            console.error("Failed to export data:", error);
            toast({ title: "Erro na Exportação", description: "Não foi possível gerar o relatório. Tente novamente.", variant: "destructive" });
        } finally {
            setLoadingReport(null);
        }
    };


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
                            <Card key={item.title} className="flex flex-col">
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
