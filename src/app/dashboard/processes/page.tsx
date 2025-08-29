
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, PlusCircle, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { getProcesses } from "./actions";
import { format } from "date-fns";
import { ptBR } from 'date-fns/locale';
// import { SummarizeDialog } from "@/components/summarize-dialog";
// import type { Process } from "@/lib/types";


export default async function ProcessesPage() {
  const processes = await getProcesses();

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Processos</h1>
          <Button asChild className="bg-accent hover:bg-accent/90">
            <Link href="/dashboard/processes/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                Adicionar Processo
            </Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Lista de Processos</CardTitle>
            <CardDescription>Acompanhe o andamento de todos os processos.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº do Processo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vara/Instância</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Última Atualização</TableHead>
                  <TableHead>
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processes.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                            Nenhum processo cadastrado.
                        </TableCell>
                    </TableRow>
                ) : (
                    processes.map((process) => (
                    <TableRow key={process.id}>
                        <TableCell className="font-medium">{process.processNumber}</TableCell>
                        <TableCell>{process.clientName}</TableCell>
                        <TableCell>{process.court}</TableCell>
                        <TableCell>
                        <Badge variant={
                            process.status === 'Ativo' ? 'default' : 
                            process.status === 'Arquivado' ? 'secondary' :
                            process.status === 'Extinto' ? 'secondary' :
                             'destructive'
                            }
                            className={
                                process.status === 'Ativo' ? 'bg-green-600 text-white hover:bg-green-700' :
                                process.status === 'Arquivado' ? 'bg-gray-500 text-white hover:bg-gray-600' :
                                process.status === 'Extinto' ? 'bg-gray-500 text-white hover:bg-gray-600' : ''
                            }>
                            {process.status}
                        </Badge>
                        </TableCell>
                        <TableCell>{format(new Date(process.lastUpdate as string), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</TableCell>
                        <TableCell>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button aria-haspopup="true" size="icon" variant="ghost">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Toggle menu</span>
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuItem>Ver Detalhes</DropdownMenuItem>
                            <DropdownMenuItem>Adicionar Andamento</DropdownMenuItem>
                            <DropdownMenuItem>
                                <Sparkles className="mr-2 h-4 w-4" />
                                Resumo por IA
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive">
                                Arquivar Processo
                            </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        </TableCell>
                    </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      {/* {selectedProcess && (
        <SummarizeDialog
          open={isSummarizeDialogOpen}
          onOpenChange={setIsSummarizeDialogOpen}
          processNumber={selectedProcess.processNumber}
        />
      )} */}
    </>
  );
}
