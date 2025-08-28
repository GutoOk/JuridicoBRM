"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getSummary } from "@/app/actions";
import { Loader2, Sparkles } from "lucide-react";

type SummarizeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processNumber: string;
};

export function SummarizeDialog({ open, onOpenChange, processNumber }: SummarizeDialogProps) {
  const [communications, setCommunications] = useState("");
  const [summary, setSummary] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerateSummary = async () => {
    if (!communications.trim()) return;

    setIsLoading(true);
    setSummary("");
    const result = await getSummary({
      communications: [{ type: "generic", content: communications }],
    });
    setSummary(result);
    setIsLoading(false);
  };
  
  const handleClose = () => {
    onOpenChange(false);
    // Reset state on close after a small delay to allow for fade-out animation
    setTimeout(() => {
        setCommunications("");
        setSummary("");
        setIsLoading(false);
    }, 300);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle>Resumo por IA</DialogTitle>
          <DialogDescription>
            Cole abaixo as comunicações ou andamentos do processo {processNumber} para gerar um resumo automático.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Textarea
            placeholder="Insira o texto aqui..."
            className="min-h-[200px]"
            value={communications}
            onChange={(e) => setCommunications(e.target.value)}
            disabled={isLoading}
          />
          {isLoading && (
            <div className="flex items-center justify-center rounded-md border border-dashed p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          {summary && (
            <div className="rounded-md border bg-secondary/50 p-4 text-sm">
                <p className="font-medium text-foreground mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4 text-accent" /> Resumo Gerado</p>
                {summary}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleGenerateSummary} disabled={isLoading || !communications.trim()} className="bg-accent hover:bg-accent/90">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Gerar Resumo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
