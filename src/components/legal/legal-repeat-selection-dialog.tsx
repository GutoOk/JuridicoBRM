"use client";

import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Client } from "@/lib/types";
import type { RepeatableBlockInfo } from "@/lib/legal-documents";

export function LegalRepeatSelectionDialog({
  open,
  blocks,
  clients,
  title = "Selecionar clientes vinculados",
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  blocks: RepeatableBlockInfo[];
  clients: Client[];
  title?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (selection: Record<string, string[]>) => void;
}) {
  const [selection, setSelection] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (open) setSelection({});
  }, [open]);

  const toggle = (blockId: string, clientId: string, checked: boolean) => {
    setSelection((current) => {
      const ids = new Set(current[blockId] ?? []);
      if (checked) ids.add(clientId);
      else ids.delete(clientId);
      return { ...current, [blockId]: [...ids] };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Cada bloco será repetido uma vez para cada cliente marcado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {blocks.map((block) => (
            <section key={block.id} className="space-y-2 rounded-md border p-3">
              <h3 className="text-sm font-medium">{block.label}</h3>
              {clients.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {clients.map((client) => {
                    const id = `${block.id}-${client.id}`;
                    return (
                      <div key={client.id} className="flex items-center gap-2">
                        <Checkbox
                          id={id}
                          checked={(selection[block.id] ?? []).includes(client.id)}
                          onCheckedChange={(value) => toggle(block.id, client.id, value === true)}
                        />
                        <Label htmlFor={id} className="min-w-0 truncate text-xs">{client.name}</Label>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Não há clientes vinculados disponíveis. O bloco ficará sem conteúdo.</p>
              )}
            </section>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            type="button"
            onClick={() => {
              onConfirm(selection);
              onOpenChange(false);
            }}
          >
            Continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
