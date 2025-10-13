
"use client";

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function BatchClientsPage() {
    return (
        <div className="mx-auto w-full max-w-7xl">
            <div className="flex items-center gap-4 mb-6">
                <Button variant="outline" size="icon" asChild>
                    <Link href="/dashboard/clients">
                        <ArrowLeft className="h-4 w-4" />
                        <span className="sr-only">Voltar</span>
                    </Link>
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
                        A funcionalidade será reconstruída aqui passo a passo.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-center text-muted-foreground py-10">
                        Pronto para começar.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
