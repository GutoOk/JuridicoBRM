"use client";

import { useState } from "react";
import { Loader2, Phone } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { registerContact } from "@/lib/db-actions";
import { CONTACT_CHANNELS, CONTACT_RESULTS, type Client, type ContactChannel } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { HelpTip } from "@/components/shared/page-shell";

/**
 * Registro rápido de contato: canal + resultado + observação + próxima ação.
 * Atualiza automaticamente o "último contato" do cliente.
 */
export function ContactDialog({
  client,
  open,
  onOpenChange,
}: {
  client: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [channel, setChannel] = useState<ContactChannel>("Ligação");
  const [result, setResult] = useState<string>("");
  const [note, setNote] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setChannel("Ligação");
    setResult("");
    setNote("");
    setNextAction("");
  };

  const handleSave = async () => {
    if (!client || !user || !result) return;
    setSaving(true);
    try {
      await registerContact(
        client,
        { channel, result, note: note.trim() || undefined, nextAction: nextAction.trim() || undefined },
        user
      );
      toast({ title: "Contato registrado", description: `${client.name}: ${result}` });
      reset();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao registrar contato" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="size-4" /> Registrar contato
          </DialogTitle>
          <DialogDescription>{client?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Canal
              <HelpTip label="Por onde o contato aconteceu: ligação, WhatsApp, e-mail ou atendimento presencial." />
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {CONTACT_CHANNELS.map((c) => (
                <Button
                  key={c}
                  type="button"
                  size="sm"
                  variant={channel === c ? "default" : "outline"}
                  onClick={() => setChannel(c)}
                >
                  {c}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Resultado
              <HelpTip label="Escolha o resultado objetivo do contato para atualizar o histórico do cliente." />
            </Label>
            <div className="grid grid-cols-2 gap-1.5">
              {CONTACT_RESULTS.map((r) => (
                <Button
                  key={r}
                  type="button"
                  size="sm"
                  variant={result === r ? "default" : "outline"}
                  className={cn("justify-start", result === r && "ring-1 ring-ring")}
                  onClick={() => setResult(r)}
                >
                  {r}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observação (opcional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="O que foi conversado, o que ficou combinado…"
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Próxima ação (opcional)
              <HelpTip label="O próximo passo aparece na Operação para orientar quem continuar o atendimento." />
            </Label>
            <Input
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="Ex.: Ligar de novo sexta; aguardar envio do extrato"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <HelpTip label="Salva o contato, atualiza o último contato do cliente e registra no histórico.">
          <Button onClick={handleSave} disabled={!result || saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Registrar
          </Button>
          </HelpTip>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
