"use client";

import { useState } from "react";
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
import { SummarizeDialog } from "@/components/summarize-dialog";
import type { Process } from "@/lib/types";

const mockProcesses: Process[] = [
    { id: "1", processNumber: "0012345-67.2023.8.26.0001", clientName: "Indústrias Acme Ltda.", court: "1ª Vara Cível de São Paulo", status: "Ativo", lastUpdate: "2024-07-21" },
    { id: "2", processNumber: "0765432-10.2022.8.19.0001", clientName: "João da Silva", court: "5ª Vara de Família do Rio de Janeiro", status: "Ativo", lastUpdate: "2024-07-20" },
    { id: "3", processNumber: "1122334-45.2021.8.13.0024", clientName: "Maria Oliveira", court: "2ª Vara do Trabalho de Belo Horizonte", status: "Arquivado", lastUpdate: "2023-12-15" },
    { id: "4", processNumber: "5566778-89.2023.8.16.0001", clientName: "Tech Solutions S.A.", court: "Vara de Falências de Curitiba", status: "Suspenso", lastUpdate: "2024-05-30" },
    { id: "5", processNumber: "9988776-65.2024.8.21.0001", clientName: "Pedro Martins", court: "Juizado Especial Cível de Porto Alegre", status: "Ativo", lastUpdate: "2024-07-18" },
];

export default function ProcessesPage() {
  const [isSummarizeDialogOpen, setIsSummarizeDialogOpen] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState<Process | null>(null);

  const handleOpenSummarizeDialog = (process: Process) => {
    setSelectedProcess(process);
    setIsSummarizeDialogOpen(true);
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Processos</h1>
          <Button className="bg-accent hover:bg-accent/90">
            <PlusCircle className="mr-2 h-4 w-4" />
            Adicionar Processo
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
                {mockProcesses.map((process) => (
                  <TableRow key={process.id}>
                    <TableCell className="font-medium">{process.processNumber}</TableCell>
                    <TableCell>{process.clientName}</TableCell>
                    <TableCell>{process.court}</TableCell>
                    <TableCell>
                       <Badge variant={
                          process.status === 'Ativo' ? 'default' : 
                          process.status === 'Arquivado' ? 'secondary' : 'destructive'
                        }
                        className={
                            process.status === 'Ativo' ? 'bg-green-600 text-white hover:bg-green-700' :
                            process.status === 'Arquivado' ? 'bg-gray-500 text-white hover:bg-gray-600' : ''
                        }>
                        {process.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(process.lastUpdate).toLocaleDateString()}</TableCell>
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
                          <DropdownMenuItem onClick={() => handleOpenSummarizeDialog(process)}>
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
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      {selectedProcess && (
        <SummarizeDialog
          open={isSummarizeDialogOpen}
          onOpenChange={setIsSummarizeDialogOpen}
          processNumber={selectedProcess.processNumber}
        />
      )}
    </>
  );
}
