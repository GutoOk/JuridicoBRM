
"use client";

import React, { useState } from 'react';
import type { Process, Client } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import {
  Users,
  StickyNote,
  Edit,
  Link as LinkIcon,
  Star,
  BookText,
  Scale,
  Landmark,
  University,
  BadgeInfo,
  CalendarCheck,
  UserCheck,
  Briefcase
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { EditProcessNotesDialog } from './edit-process-notes-dialog';
import { Badge } from './ui/badge';

interface ProcessDetailsCardProps {
  process: Process;
  clients: Client[];
  onNotesUpdated: () => void;
}

function DetailItem({ icon: Icon, label, value, children, fullWidth = false, badge = false }: { icon: React.ElementType, label: string, value?: string | null, children?: React.ReactNode, fullWidth?: boolean, badge?: boolean }) {
  const hasContent = value || children;
  if (!hasContent) {
    return null; // Don't render if there's no content
  }
  return (
    <div className={`flex items-start gap-3 ${fullWidth ? 'col-span-1 md:col-span-2 lg:col-span-3' : ''}`}>
      <Icon className="h-5 w-5 flex-shrink-0 text-muted-foreground mt-1" />
      <div>
        <p className="text-sm font-medium">{label}</p>
        {badge ? (
            <Badge variant={value === 'Ativo' ? 'default' : 'secondary'} className={value === 'Ativo' ? 'bg-green-600 text-white' : ''}>{value}</Badge>
        ) : value ? (
            <p className="text-muted-foreground">{value}</p>
        ) : (
            <div className="text-muted-foreground">{children}</div>
        )}
      </div>
    </div>
  );
}


export function ProcessDetailsCard({ process, clients, onNotesUpdated }: ProcessDetailsCardProps) {
  const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);
  
  const mainClient = clients.find(c => c!.id === process.mainClientId);
  const otherClients = clients.filter(c => c!.id !== process.mainClientId).sort((a,b) => a!.name.localeCompare(b!.name));
  const sortedClients = [mainClient, ...otherClients].filter(Boolean);

  return (
    <>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">{process.processNumber}</h1>
                 <p className="text-muted-foreground">{process.actionType}</p>
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
             {/* Main Details Grid */}
             <div className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm md:grid-cols-2 lg:grid-cols-3">
                <DetailItem icon={BadgeInfo} label="Status" value={process.status} badge />
                <DetailItem icon={BookText} label="Classe" value={process.classe} />
                <DetailItem icon={CalendarCheck} label="Assunto" value={process.assunto} />
                <DetailItem icon={Briefcase} label="Polo do Cliente" value={process.polo} />
                <DetailItem icon={Users} label="Parte Contrária" value={process.parteContraria} />
                <DetailItem icon={Scale} label="Vara" value={process.vara} />
                <DetailItem icon={Landmark} label="Foro" value={process.foro} />
                <DetailItem icon={UserCheck} label="Juiz" value={process.juiz} />
                <DetailItem icon={University} label="Instância" value={process.instancia} />
            </div>
            
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
