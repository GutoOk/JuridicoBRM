
"use client";

import React, { useState } from 'react';
import type { Process, Client } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Users,
  StickyNote,
  ArrowLeft,
  Edit,
  Link as LinkIcon,
  Star,
  BookText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ClientUpdatesDialog } from './client-updates-dialog';

interface ProcessDetailsCardProps {
  process: Process;
  clients: Client[];
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

  const subtitleCourtInfo = [process.vara, process.comarca].filter(Boolean).join(', ');
  const subtitleLine1 = [subtitleCourtInfo, process.actionType].filter(Boolean).join(' - ');
  const subtitleLine2 = [process.instancia, process.status].filter(Boolean).join(' - ');


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
          {subtitleLine1 && <p className="text-muted-foreground">{subtitleLine1}</p>}
          {subtitleLine2 && <p className="text-muted-foreground">{subtitleLine2}</p>}
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="space-y-6">
            <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-4">
                <Users className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
                <div className='w-full'>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm font-medium">Clientes Vinculados</p>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dashboard/processes/${process.id}/edit`}>
                        <Edit className="mr-2 h-4 w-4" />
                        Editar Processo
                      </Link>
                    </Button>
                  </div>
                  <div className="text-muted-foreground flex flex-col items-start gap-1">
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
                        <Button variant="outline" size="xs" onClick={() => handleOpenClientUpdates(client)} className="h-6 px-2 text-xs">
                            <BookText className="mr-1.5 h-3 w-3" />
                            Ver Andamentos
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
            </div>

            {process.notes ? (
              <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-4">
                    <StickyNote className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
                    <div>
                      <p className="text-sm font-medium">Observações Gerais</p>
                      <p className="text-muted-foreground whitespace-pre-wrap">{process.notes}</p>
                  </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-md border border-dashed bg-muted/30 p-4">
                  <StickyNote className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
                  <div>
                      <p className="text-sm font-medium">Observações Gerais</p>
                      <p className="text-muted-foreground italic">Nenhuma observação geral adicionada a este processo.</p>
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
