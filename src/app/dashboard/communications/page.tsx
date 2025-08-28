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
import { PlusCircle, Phone, Users, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Communication } from "@/lib/types";

const mockCommunications: Communication[] = [
  { id: "1", type: "Chamada", date: "2024-07-22", responsible: "Dr. Carlos", clientName: "Indústrias Acme Ltda.", processNumber: "0012345-67.2023.8.26.0001", summary: "Discutida estratégia de defesa e próximos passos." },
  { id: "2", type: "Reunião", date: "2024-07-21", responsible: "Assistente Ana", clientName: "João da Silva", processNumber: "0765432-10.2022.8.19.0001", summary: "Alinhamento sobre documentos necessários para audiência." },
  { id: "3", type: "Mensagem", date: "2024-07-20", responsible: "Dr. Carlos", clientName: "Tech Solutions S.A.", processNumber: "5566778-89.2023.8.16.0001", summary: "Enviado link para pagamento de custas." },
  { id: "4", type: "Chamada", date: "2024-07-19", responsible: "Dr. Carlos", clientName: "Pedro Martins", processNumber: "9988776-65.2024.8.21.0001", summary: "Cliente confirmou recebimento da intimação." },
];

const TypeIcon = ({ type }: { type: Communication['type'] }) => {
  switch (type) {
    case 'Chamada': return <Phone className="h-4 w-4 text-muted-foreground" />;
    case 'Reunião': return <Users className="h-4 w-4 text-muted-foreground" />;
    case 'Mensagem': return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
    default: return null;
  }
};

export default function CommunicationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Comunicações</h1>
        <Button className="bg-accent hover:bg-accent/90">
          <PlusCircle className="mr-2 h-4 w-4" />
          Registrar Comunicação
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Comunicações</CardTitle>
          <CardDescription>Centralize o registro de todas as interações com clientes.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Tipo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Processo</TableHead>
                <TableHead>Resumo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockCommunications.map((comm) => (
                <TableRow key={comm.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <TypeIcon type={comm.type} />
                      <span className="font-medium">{comm.type}</span>
                    </div>
                  </TableCell>
                  <TableCell>{new Date(comm.date).toLocaleDateString()}</TableCell>
                  <TableCell>{comm.responsible}</TableCell>
                  <TableCell>{comm.clientName}</TableCell>
                  <TableCell>{comm.processNumber}</TableCell>
                  <TableCell className="max-w-xs truncate">{comm.summary}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
