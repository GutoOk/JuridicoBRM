"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { aiErrorMessage } from "@/lib/ai";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HelpTip } from "@/components/shared/page-shell";

/**
 * "Preencher com IA": cola-se um texto solto (ficha, capa de processo, mensagem
 * do cliente) e a IA preenche o formulário. O pai passa `onAnalyze`, que chama
 * a extração (src/lib/ai.ts) e distribui os valores nos campos.
 */
export function AiExtractButton({
  title,
  description,
  placeholder,
  onAnalyze,
  size = "sm",
}: {
  title: string;
  description: string;
  placeholder: string;
  onAnalyze: (text: string) => Promise<void>;
  size?: "sm" | "default";
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  const analyze = async () => {
    if (!text.trim()) return;
    setAnalyzing(true);
    try {
      await onAnalyze(text);
      toast({ title: "Dados extraídos", description: "Confira os campos preenchidos antes de salvar." });
      setOpen(false);
      setText("");
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Erro na análise", description: aiErrorMessage(err) });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <>
      <HelpTip label="Cole um texto qualquer (ficha, capa do processo, mensagem) e a IA preenche os campos do formulário para você conferir.">
        <Button type="button" variant="outline" size={size} onClick={() => setOpen(true)}>
          <Sparkles className="mr-1.5 size-3.5" /> Preencher com IA
        </Button>
      </HelpTip>
      <Dialog open={open} onOpenChange={(o) => !analyzing && setOpen(o)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4" /> {title}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            rows={10}
            disabled={analyzing}
            className="text-sm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={analyzing}>
              Cancelar
            </Button>
            <Button onClick={analyze} disabled={analyzing || !text.trim()}>
              {analyzing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
              Analisar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
