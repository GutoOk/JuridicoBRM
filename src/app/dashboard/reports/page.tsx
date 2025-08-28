import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileDown, Users, Gavel, CheckSquare, CalendarClock } from "lucide-react";

const reportItems = [
    { title: "Relatório de Clientes", description: "Lista completa de todos os clientes cadastrados.", icon: Users, fileName: "relatorio_clientes.xlsx" },
    { title: "Relatório de Processos", description: "Detalhes de todos os processos, incluindo status e vara.", icon: Gavel, fileName: "relatorio_processos.xlsx" },
    { title: "Relatório de Tarefas", description: "Todas as tarefas, seus responsáveis, prazos e status.", icon: CheckSquare, fileName: "relatorio_tarefas.xlsx" },
    { title: "Relatório de Prazos", description: "Lista de todos os prazos futuros e vencidos.", icon: CalendarClock, fileName: "relatorio_prazos.xlsx" },
]

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Relatórios e Exportações</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Exportar Dados</CardTitle>
          <CardDescription>Faça o download dos dados do sistema em formato PDF ou Excel.</CardDescription>
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
                             <Button className="w-full bg-accent hover:bg-accent/90">
                                <FileDown className="mr-2 h-4 w-4" />
                                Exportar
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visão Personalizada</CardTitle>
          <CardDescription>Dashboards com a visão das suas tarefas e prazos.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="text-center text-muted-foreground py-12">
                <p>Visualizações personalizadas de dashboard em breve.</p>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
