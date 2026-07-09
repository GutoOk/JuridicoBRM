"use client";

import { useState } from "react";
import { Copy, MessageCircle, Check } from "lucide-react";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { waLink } from "@/lib/normalize";
import type { Client, MessageTemplate } from "@/lib/types";
import type { Pendency } from "@/lib/readiness";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, HelpTip } from "@/components/shared/page-shell";

/** Substitui as variáveis do modelo pelos dados do cliente. */
export function fillTemplate(body: string, client: Client, pendencies: Pendency[]): string {
  const firstName = (client.name ?? "").trim().split(/\s+/)[0] ?? "";
  const pendList = pendencies.length
    ? pendencies.map((p) => `• ${p.name}`).join("\n")
    : "• (sem pendências listadas)";
  return body
    .replaceAll("{{nome}}", client.name ?? "")
    .replaceAll("{{primeiro_nome}}", firstName)
    .replaceAll("{{codigo}}", client.code ?? "s/ código")
    .replaceAll("{{pendencias}}", pendList)
    .replaceAll("{{responsavel}}", client.responsibleName ?? "");
}

/**
 * Escolhe um modelo de mensagem, preenche as variáveis e permite
 * copiar ou abrir direto no WhatsApp do cliente.
 */
export function MessagePicker({ client, pendencies }: { client: Client; pendencies: Pendency[] }) {
  const { data: templates } = useCollection<MessageTemplate>("messageTemplates");
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string>("");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  const sorted = (templates ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const pick = (id: string) => {
    setSelectedId(id);
    const tpl = sorted.find((t) => t.id === id);
    if (tpl) setText(fillTemplate(tpl.body, client, pendencies));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ variant: "destructive", title: "Não foi possível copiar" });
    }
  };

  const wa = waLink(client.whatsappDigits || client.whatsapp || client.phoneDigits || client.phone, text);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Escolha um modelo, revise o texto e então copie ou abra no WhatsApp.
      </p>
      <Select value={selectedId} onValueChange={pick}>
        <SelectTrigger>
          <SelectValue placeholder="Escolher mensagem padrão…" />
        </SelectTrigger>
        <SelectContent>
          {sorted.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.title}
            </SelectItem>
          ))}
          {sorted.length === 0 && (
            <EmptyState
              title="Nenhum modelo cadastrado"
              description="Crie modelos em Administração, Mensagens padrão."
              className="border-0 bg-transparent"
            />
          )}
        </SelectContent>
      </Select>
      {text && (
        <>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} className="text-sm" />
          <div className="flex gap-2">
            <HelpTip label="Copia o texto pronto para colar em outro canal.">
            <Button size="sm" variant="outline" onClick={copy}>
              {copied ? <Check className="mr-2 size-4 text-emerald-600" /> : <Copy className="mr-2 size-4" />}
              {copied ? "Copiado!" : "Copiar"}
            </Button>
            </HelpTip>
            {wa && (
              <HelpTip label="Abre o WhatsApp com esta mensagem preenchida. Revise antes de enviar.">
              <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" asChild>
                <a href={wa} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 size-4" /> Abrir WhatsApp
                </a>
              </Button>
              </HelpTip>
            )}
          </div>
        </>
      )}
    </div>
  );
}
