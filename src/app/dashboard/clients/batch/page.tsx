
"use client";

import { useState, useMemo } from 'react';
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
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, CheckCircle, XCircle, AlertTriangle, Info, RefreshCw, Loader2, Users } from 'lucide-react';
import Link from 'next/link';
import { processBatchClients, type BatchClient, type BatchResult, type BatchResultStatus } from './actions';
import { useAuth } from '@/hooks/use-auth';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

const initialRowCount = 10;

const createEmptyRows = (count: number): (BatchClient & { status?: BatchResultStatus, message?: string })[] => {
    return Array.from({ length: count }, () => ({ name: '', cpfCnpj: '', phone: '' }));
};

const statusConfig: Record<BatchResultStatus, { icon: React.ElementType, color: string, label: string }> = {
    'Incluído': { icon: CheckCircle, color: 'text-green-500', label: 'Incluído' },
    'Atualizado': { icon: RefreshCw, color: 'text-blue-500', label: 'Atualizado' },
    'Existente': { icon: Info, color: 'text-gray-500', label: 'Existente' },
    'Nome divergente': { icon: AlertTriangle, color: 'text-orange-500', label: 'Nome Divergente' },
    'Falha': { icon: XCircle, color: 'text-red-500', label: 'Falha' },
    'Inválido': { icon: XCircle, color: 'text-red-500', label: 'Dados Inválidos' },
};

export default function BatchClientsPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [clients, setClients] = useState<(BatchClient & { status?: BatchResultStatus, message?: string })[]>(createEmptyRows(initialRowCount));
    const [isProcessing, setIsProcessing] = useState(false);
    const [pasteData, setPasteData] = useState('');

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        setPasteData(text);
        
        const rows = text.split('\n').map(row => row.split('\t'));
        const newClients = rows.map(row => ({
            name: row[0] || '',
            cpfCnpj: row[1] || '',
            phone: row[2] || '',
        })).filter(c => c.name || c.cpfCnpj || c.phone);

        if (newClients.length > 0) {
            setClients(newClients);
        }
    };

    const handleInputChange = (index: number, field: keyof BatchClient, value: string) => {
        const newClients = [...clients];
        newClients[index] = { ...newClients[index], [field]: value, status: undefined, message: undefined };
        setClients(newClients);
    };

    const handleSubmit = async () => {
        if (!user) {
            toast({ title: 'Usuário não autenticado', variant: 'destructive' });
            return;
        }

        const clientsToProcess = clients.filter(c => c.name.trim() || c.cpfCnpj?.trim() || c.phone?.trim());
        if (clientsToProcess.length === 0) {
            toast({ title: 'Nenhum cliente para processar', description: 'Por favor, insira os dados dos clientes.', variant: "destructive" });
            return;
        }

        setIsProcessing(true);
        try {
            const results = await processBatchClients(clientsToProcess, user.name);
            
            const updatedClients = [...clients];
            let successCount = 0;
            let failCount = 0;

            results.forEach((result, i) => {
                 const originalIndex = clients.findIndex(c => c.name === result.client.name && c.cpfCnpj === result.client.cpfCnpj);
                 if (originalIndex !== -1) {
                    updatedClients[originalIndex].status = result.status;
                    updatedClients[originalIndex].message = result.message;
                 }
                 if (result.status === 'Incluído' || result.status === 'Atualizado') {
                     successCount++;
                 } else if (result.status === 'Falha' || result.status === 'Inválido' || result.status === 'Nome divergente') {
                     failCount++;
                 }
            });
            
            setClients(updatedClients);
            toast({
                title: 'Processamento Concluído',
                description: `${successCount} clientes processados com sucesso. ${failCount > 0 ? `${failCount} clientes com problemas.` : ''}`,
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({ title: "Erro no processamento em lote", description: errorMessage, variant: "destructive" });
        } finally {
            setIsProcessing(false);
        }
    };
    
    const nonEmptyClients = useMemo(() => clients.filter(c => c.name || c.cpfCnpj || c.phone), [clients]);

    return (
        <div className="mx-auto w-full max-w-7xl">
            <div className="flex items-center gap-4 mb-6">
                <Button variant="outline" size="icon" asChild>
                    <Link href="/dashboard/clients"><ArrowLeft className="h-4 w-4" /><span className="sr-only">Voltar</span></Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Inclusão de Clientes em Lote</h1>
                    <p className="text-muted-foreground">Copie e cole dados de uma planilha ou insira manualmente.</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Dados dos Clientes</CardTitle>
                    <CardDescription>
                        Cole os dados aqui (Nome, CPF/CNPJ, Telefone) separados por tabulação ou preencha a tabela abaixo.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <Textarea
                        placeholder="Copie e cole os dados de uma planilha (Nome, CPF/CNPJ, Telefone)..."
                        onPaste={handlePaste}
                        className="min-h-[100px]"
                        value={pasteData}
                        onChange={(e) => setPasteData(e.target.value)}
                    />
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[40%]">Nome</TableHead>
                                    <TableHead className="w-[25%]">CPF/CNPJ</TableHead>
                                    <TableHead className="w-[25%]">Telefone</TableHead>
                                    <TableHead className="w-[10%] text-center">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {clients.map((client, index) => (
                                    <TableRow key={index}>
                                        <TableCell>
                                            <Input value={client.name} onChange={(e) => handleInputChange(index, 'name', e.target.value)} placeholder="Nome completo" />
                                        </TableCell>
                                        <TableCell>
                                            <Input value={client.cpfCnpj} onChange={(e) => handleInputChange(index, 'cpfCnpj', e.target.value)} placeholder="Apenas números" />
                                        </TableCell>
                                        <TableCell>
                                            <Input value={client.phone} onChange={(e) => handleInputChange(index, 'phone', e.target.value)} placeholder="(XX) XXXXX-XXXX" />
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {client.status && statusConfig[client.status] && (
                                                <div className="flex justify-center items-center" title={client.message}>
                                                    <Badge variant={
                                                        client.status === 'Falha' || client.status === 'Inválido' || client.status === 'Nome divergente' ? 'destructive' :
                                                        client.status === 'Atualizado' ? 'default' : 'secondary'
                                                    }>
                                                        <statusConfig[client.status].icon className="mr-1 h-3 w-3" />
                                                        {statusConfig[client.status].label}
                                                    </Badge>
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="flex justify-between items-center pt-4">
                         <Button variant="outline" onClick={() => setClients(prev => [...prev, { name: '', cpfCnpj: '', phone: '' }])}>
                            Adicionar Linha
                        </Button>
                        <Button onClick={handleSubmit} disabled={isProcessing || nonEmptyClients.length === 0} className="bg-accent hover:bg-accent/90">
                            {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                            Processar Lote
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
