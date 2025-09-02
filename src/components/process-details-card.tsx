
"use client";

import React, { useState } from 'react';
import type { Process, Client } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
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
import { EditProcessNotesDialog } from './edit-process-notes-dialog';

interface ProcessDetailsCardProps {
  process: Process;
  clients: Client[];
  onNotesUpdated: () => void;
}

export function ProcessDetailsCard({ process, clients, onNotesUpdated }: ProcessDetailsCardProps) {
  const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);
  
  const mainClient = clients.find(c => c!.id === process.mainClientId);
  const otherClients = clients.filter(c => c!.id !== process.mainClientId).sort((a,b) => a!.name.localeCompare(b!.name));
  const sortedClients = [mainClient, ...otherClients].filter(Boolean);

  const subtitleCourtInfo = [process.vara, process.comarca].filter(Boolean).join(', ');
  const subtitleLine1 = [subtitleCourtInfo, process.actionType].filter(Boolean).join(' - ');
  const subtitleLine2 = [process.instancia, process.status].filter(Boolean).join(' - ');


  return (
    <>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">{process.processNumber}</h1>
                {subtitleLine1 && <p className="text-muted-foreground">{subtitleLine1}</p>}
                {subtitleLine2 && <p className="text-muted-foreground">{subtitleLine2}</p>}
            </div>
        </div>
         <Button variant="outline" asChild>
            <Link href={`/dashboard/processes/${process.id}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Editar Processo
            </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="space-y-6">
            <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-4">
                <Users className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
                <div className='w-full'>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm font-medium">Clientes Vinculados</p>
                  </div>
                  <div className="text-muted-foreground flex flex-col items-start gap-1">
                    {sortedClients.map(client => client && (
                      <div key={client.id} className="flex items-center justify-start gap-2 w-full group">
                        <Button variant="link" asChild className="p-0 h-auto font-normal -ml-1 text-muted-foreground hover:text-primary">
                          <Link href={`/dashboard/clients/${client.id}`} className="flex items-center gap-1.5">
                            {client.id === process.mainClientId ? 
                              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" /> :
                              <LinkIcon className="h-3 w-3" />}
                            {client.name}
                          </Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
            </div>

             <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-4">
                <StickyNote className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
                <div className="flex-1">
                    <div className="flex justify-between items-center">
                        <p className="text-sm font-medium">Observações Gerais</p>
                         <Button variant="outline" size="sm" onClick={() => setIsNotesDialogOpen(true)}>
                            <Edit className="mr-2 h-3 w-3" />
                            Editar
                        </Button>
                    </div>
                    {process.notes ? (
                        <p className="text-muted-foreground whitespace-pre-wrap mt-2">{process.notes}</p>
                    ) : (
                        <p className="text-sm text-muted-foreground/70 italic mt-2">Nenhuma observação geral adicionada a este processo.</p>
                    )}
                </div>
              </div>
          </div>
        </CardContent>
      </Card>
      
      <EditProcessNotesDialog 
        open={isNotesDialogOpen}
        onOpenChange={setIsNotesDialogOpen}
        process={process}
        onNotesUpdated={onNotesUpdated}
      />
    </>
  );
}
