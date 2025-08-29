
"use client";

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getClientUpdates } from '@/app/dashboard/clients/[id]/actions';
import type { ClientUpdate } from '@/lib/types';
import { Loader2, Tag, Calendar, User, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface ClientUpdatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
  clientName: string | null;
}

const updateTypeConfig = {
    "Atendimento": { icon: Type, color: "bg-transparent", label: "Atendimento" },
    "Tarefa": { icon: Calendar, color: "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700", label: "Tarefa" },
    "Anotação": { icon: Tag, color: "bg-muted/60", label: "Anotação" }
};


export function ClientUpdatesDialog({ open, onOpenChange, clientId, clientName }: ClientUpdatesDialogProps) {
  const { toast } = useToast();
  const [updates, setUpdates] = useState<ClientUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && clientId) {
      const fetchUpdates = async () => {
        setIsLoading(true);
        setUpdates([]);
        try {
          const clientUpdates = await getClientUpdates(clientId);
          // Further filter to be absolutely sure no process-related items show up
          setUpdates(clientUpdates.filter(u => u.type !== 'Andamento Processual'));
        } catch (error) {
          toast({
            title: 'Erro ao buscar andamentos',
            description: `Não foi possível carregar os andamentos para ${clientName}.`,
            variant: 'destructive',
          });
        } finally {
          setIsLoading(false);
        }
      };
      fetchUpdates();
    }
  }, [open, clientId, clientName, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Andamentos de {clientName}</DialogTitle>
          <DialogDescription>
            Exibindo andamentos gerais (não vinculados a processos) para este cliente.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto p-1 pr-4">
          <div className="space-y-4">
            {isLoading ? (
              <div className="flex justify-center items-center h-40">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : updates.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                Nenhum andamento geral encontrado para este cliente.
              </div>
            ) : (
              updates.map(update => {
                 const configKey = update.type as keyof typeof updateTypeConfig;
                 const config = updateTypeConfig[configKey];
                 if (!config) return null; // Skip if type is not in config (e.g. Andamento Processual)

                 const Icon = config.icon;

                 return (
                    <div key={update.id} className={cn("flex items-start gap-3 rounded-lg border p-3 transition-colors group", config.color)}>
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-background flex-shrink-0 mt-0.5">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                            <p className="font-medium text-sm text-foreground">{config.label}</p>
                             <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                <User className="h-3 w-3" /> 
                                <span>{update.author}</span>
                                <span>&bull;</span>
                                <span>{format(new Date(update.createdAt as string), "dd/MM/yyyy 'às' HH:mm")}</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{update.description}</p>
                        </div>
                    </div>
                 )
              })
            )}
          </div>
        </div>
         <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
