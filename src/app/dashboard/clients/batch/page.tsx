
"use client";

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, PlusCircle, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { processBatchClients, type BatchClient, type BatchResult, type BatchResultStatus } from './actions';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';


export default function BatchClientsPage() {
    const [clients, setClients] = useState<BatchClient[]>(() => Array.from({ length: 10 }, () => ({ name: '', cpfCnpj: '', phone: '' })));
    const [results, setResults] = useState<(BatchResult | null)[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const { user } = useAuth();
    const { toast } = useToast();

    const handleCellChange = (rowIndex: number, key: keyof BatchClient, value: string) => {
        const newClients = [...clients];
        newClients[rowIndex][key] = value;
        setClients(newClients);
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLTableSectionElement>) => {
        e.preventDefault();
        const pasteData = e.clipboardData.getData('text');
        const rows = pasteData.split('\n').filter(row => row.trim() !== '');
        
        const newClients = [...clients];
        let currentRow = (e.target as HTMLElement).closest('tr') ? ((e.target as HTMLElement).closest('tr')?.rowIndex ?? 1) - 1 : 0;

        rows.forEach((row, i) => {
            const cells = row.split('\t');
            const clientIndex = currentRow + i;

            if (clientIndex < newClients.length) {
                newClients[clientIndex].name = cells[0] || '';
                newClients[clientIndex].cpfCnpj = cells[1] || '';
                newClients[clientIndex].phone = cells[2] || '';
            } else {
                 newClients.push({
                    name: cells[0] || '',
                    cpfCnpj: cells[1] || '',
                    phone: cells[2] || '',
                });
            }
        });
        setClients(newClients);
        toast({ title: "Dados colados!", description: `${rows.length} linha(s) foram preenchidas.` });
    };

    const addRow = () => {
        setClients(prev => [...prev, { name: '', cpfCnpj: '', phone: '' }]);
    };
    
    const removeRow = (index: number) => {
        setClients(prev => prev.filter((_, i) => i !== index));
        setResults(prev => prev.filter((_, i) => i !== index));
    };

    const handleProcessBatch = async () => {
        if (!user) {
            toast({ title: "Usuário não autenticado", variant: "destructive" });
            return;
        }

        const clientsToProcess = clients.filter(c => c.name.trim() !== '' && c.cpfCnpj?.trim() !== '');
        if (clientsToProcess.length === 0) {
            toast({ title: "Nenhum cliente para processar", description: "Preencha ao menos o nome e o CPF/CNPJ de um cliente.", variant: "destructive" });
            return;
        }

        setIsProcessing(true);
        try {
            const batchResults = await processBatchClients(clientsToProcess, user.name);
            const newResults = Array(clients.length).fill(null);
            
            let clientIndex = 0;
            for(let i=0; i<clients.length; i++) {
                if(clients[i].name.trim() !== '' && clients[i].cpfCnpj?.trim() !== ''){
                    if(clientIndex < batchResults.length) {
                        newResults[i] = batchResults[clientIndex];
                        clientIndex++;
                    }
                }
            }

            setResults(newResults);
            toast({ title: "Processamento Concluído", description: `${clientsToProcess.length} clientes foram processados. Verifique o status de cada um.` });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            toast({ title: "Erro no processamento", description: errorMessage, variant: "destructive" });
        } finally {
            setIsProcessing(false);
        }
    };

    const getStatusBadge = (status: BatchResultStatus) => {
        switch (status) {
            case 'Incluído': return <Badge className="bg-green-600 hover:bg-green-700">Incluído</Badge>;
            case 'Atualizado': return <Badge className="bg-blue-600 hover:bg-blue-700">Atualizado</Badge>;
            case 'Existente': return <Badge variant="secondary">Existente</Badge>;
            case 'Nome divergente': return <Badge variant="destructive">Nome Divergente</Badge>;
            case 'Falha': return <Badge variant="destructive">Falha</Badge>;
            case 'Inválido': return <Badge variant="outline">Inválido</Badge>;
            default: return null;
        }
    }


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
                    <div className="flex justify-between items-center">
                        <div>
                             <CardTitle>Dados dos Clientes</CardTitle>
                             <CardDescription>Clique em uma célula para editar. Use Tab para navegar.</CardDescription>
                        </div>
                        <Button onClick={handleProcessBatch} disabled={isProcessing}>
                            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Processar Lote
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[40px]">#</TableHead>
                                    <TableHead>Nome</TableHead>
                                    <TableHead>CPF/CNPJ</TableHead>
                                    <TableHead>Telefone</TableHead>
                                    <TableHead className="w-[200px]">Status</TableHead>
                                    <TableHead className="w-[50px] text-right">Ação</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody onPaste={handlePaste}>
                                {clients.map((client, index) => {
                                    const result = results[index];
                                    const canLink = result && result.clientId && ['Existente', 'Atualizado', 'Nome divergente'].includes(result.status);
                                    
                                    return (
                                        <TableRow key={index} className={cn(result && 'bg-muted/30')}>
                                            <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                                            <TableCell>
                                                {canLink ? (
                                                    <Button variant="link" asChild className="p-0 h-auto font-normal">
                                                        <Link href={`/dashboard/clients/${result.clientId}`} target="_blank">
                                                            {client.name}
                                                        </Link>
                                                    </Button>
                                                ) : (
                                                    <Input
                                                        value={client.name}
                                                        onChange={e => handleCellChange(index, 'name', e.target.value)}
                                                        className="border-none focus-visible:ring-1 bg-transparent"
                                                        placeholder="Nome completo"
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    value={client.cpfCnpj || ''}
                                                    onChange={e => handleCellChange(index, 'cpfCnpj', e.target.value)}
                                                    className="border-none focus-visible:ring-1 bg-transparent"
                                                    placeholder="Apenas números"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    value={client.phone || ''}
                                                    onChange={e => handleCellChange(index, 'phone', e.target.value)}
                                                    className="border-none focus-visible:ring-1 bg-transparent"
                                                    placeholder="(99) 99999-9999"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                {result ? (
                                                    <div className="flex flex-col">
                                                        {getStatusBadge(result.status)}
                                                        <span className="text-xs text-muted-foreground mt-1">{result.message}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground italic text-xs">Aguardando...</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeRow(index)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                    <Button onClick={addRow} variant="outline" size="sm" className="mt-4">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Adicionar Linha
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
