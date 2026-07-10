"use client";

import { useState } from "react";
import { Copy, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { summarizeTimeline, aiErrorMessage } from "@/lib/ai";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HelpTip } from "@/components/shared/page-shell";

/**
 * "Resumir com IA": gera um resumo curto de uma linha do tempo (contatos,
 * anotações e andamentos) — situação atual, pendências e próxima ação.
 */
export function SummarizeButton({ context, lines }: { context: string; lines: string[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");

  const run = async () => {
    setOpen(true);
    setLoading(true);
    setSummary("");
    try {
      const text = await summarizeTimeline(context, lines.slice(0, 60));
      setSummary(text);
    } catch (err) {
      console.error(err);
      setSummary("");
      toast({ variant: "destructive", title: "Erro no resumo", description: aiErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(summary);
    toast({ title: "Resumo copiado" });
  };

  return (
    <>
      <HelpTip label="A IA lê o histórico listado e gera um resumo: situação atual, pendências e próxima ação sugerida.">
        <Button variant="outline" size="sm" onClick={run} disabled={lines.length === 0}>
          <Sparkles className="mr-1.5 size-3.5" /> Resumir com IA
        </Button>
      </HelpTip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4" /> Resumo do histórico
            </DialogTitle>
            <DialogDescription>{context}</DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : summary ? (
            <>
              <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
                {summary}
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={copy}>
                  <Copy className="mr-1.5 size-3.5" /> Copiar
                </Button>
              </div>
            </>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Não foi possível gerar o resumo. Tente novamente.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
