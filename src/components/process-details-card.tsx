
"use client";

import React, { useState } from 'react';
import type { Process, Client } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Gavel,
  Users,
  Briefcase,
  GitBranch,
  CalendarCheck,
  StickyNote,
  ArrowLeft,
  Edit,
  BadgeInfo,
  Link as LinkIcon,
  Star,
  BookText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ClientUpdatesDialog } from './client-updates-dialog';

interface ProcessDetailsCardProps {
  process: Process;
  clients: Client[];
}

function DetailItem({ icon: Icon, label, value, fullWidth = false }: { icon: React.ElementType, label: string, value?: string | null, fullWidth?: boolean }) {
  if (!value) return null;
  return (
    <div className={`flex items-start gap-3 ${fullWidth ? 'col-span-1 md:col-span-2' : ''}`}>
      <Icon className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}

export function ProcessDetailsCard({ process, clients }: ProcessDetailsCardProps) {
  const [isClientUpdatesDialogOpen, setIsClientUpdatesDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<{ id: string, name: string } | null>(null);

  const handleOpenClientUpdates = (client: { id: string, name: string }) => {
    setSelectedClient(client);
    setIsClientUpdatesDialogOpen(true);
  };
  
  const mainClient = clients.find(c => c!.id === process.mainClientId);
  const otherClients = clients.filter(c => c!.id !== process.mainClientId).sort((a,b) => a!.name.localeCompare(b!.name));
  const sortedClients = [mainClient, ...otherClients].filter(Boolean);

  return (
    <>
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/dashboard/processes">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Voltar para Processos</span>
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{process.processNumber}</h1>
          <p className="text-muted-foreground">Processo do tipo "{process.actionType}"</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-3 text-xl">
              <Gavel className="h-6 w-6 text-primary" />
              Informações do Processo
            </CardTitle>
            <Button variant="outline" asChild>
              <Link href={`/dashboard/processes/${process.id}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Editar
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm md:grid-cols-2">
            <DetailItem icon={Briefcase} label="Tipo de Ação" value={process.actionType} />
            <DetailItem icon={GitBranch} label="Vara / Instância" value={process.court} />
            <DetailItem icon={CalendarCheck} label="Última Atualização" value={new Date(process.lastUpdate as string).toLocaleDateString('pt-BR')} />
            <div className="flex items-start gap-3">
              <BadgeInfo className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
              <div>
                <p className="text-sm font-medium">Status</p>
                <div className="text-muted-foreground">
                  <Badge variant={
                      process.status === 'Ativo' ? 'default' : 
                      process.status === 'Arquivado' ? 'secondary' : 'destructive'
                    } className={
                      process.status === 'Ativo' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-500 text-white hover:bg-gray-600'
                  }>
                    {process.status}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="col-span-1 md:col-span-2 mt-4">
              <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-4">
                <Users className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
                <div className='w-full'>
                  <p className="text-sm font-medium">Clientes Vinculados</p>
                  <div className="text-muted-foreground mt-2 flex flex-col items-start gap-1">
                    {sortedClients.map(client => client && (
                      <div key={client.id} className="flex items-center justify-between w-full group">
                        <Button variant="link" asChild className="p-0 h-auto font-normal -ml-1 text-muted-foreground hover:text-primary">
                          <Link href={`/dashboard/clients/${client.id}`} className="flex items-center gap-1.5">
                            {client.id === process.mainClientId ? 
                              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" /> :
                              <LinkIcon className="h-3 w-3" />}
                            {client.name}
                          </Link>
                        </Button>
                        <Button variant="outline" size="xs" onClick={() => handleOpenClientUpdates(client)} className="h-6 px-2 text-xs transition-opacity">
                            <BookText className="mr-1.5 h-3 w-3" />
                            Ver Andamentos
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {process.notes && (
              <div className="col-span-1 md:col-span-2 mt-4">
                <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-4">
                  <StickyNote className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
                  <div>
                    <p className="text-sm font-medium">Observações Gerais</p>
                    <p className="text-muted-foreground whitespace-pre-wrap">{process.notes}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <ClientUpdatesDialog
        open={isClientUpdatesDialogOpen}
        onOpenChange={setIsClientUpdatesDialogOpen}
        clientId={selectedClient?.id || null}
        clientName={selectedClient?.name || null}
      />
    </>
  );
}
