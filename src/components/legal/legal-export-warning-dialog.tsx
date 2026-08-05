"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LegalExportWarning } from "@/lib/legal-documents";

export function LegalExportWarningDialog({
  open,
  warnings,
  onOpenChange,
  onProceed,
}: {
  open: boolean;
  warnings: LegalExportWarning[];
  onOpenChange: (open: boolean) => void;
  onProceed: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-700" />
            Há campos pendentes
          </DialogTitle>
          <DialogDescription>
            Esses valores aparecerão entre colchetes no arquivo exportado.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-64 divide-y overflow-y-auto rounded-md border">
          {warnings.map((warning) => (
            <div key={warning.key} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
              <span className="truncate">{warning.label}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {warning.kind === "manual" ? "manual" : "cadastro"}
              </span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Voltar ao documento</Button>
          <Button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onProceed();
            }}
          >
            Exportar mesmo assim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
