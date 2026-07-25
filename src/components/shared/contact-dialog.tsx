"use client";

import { useEffect, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { Loader2, MessageSquareText, Pencil, Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { registerContact } from "@/lib/db-actions";
import { CONTACT_CHANNELS, CONTACT_RESULTS, type Client, type ContactChannel } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { HelpTip } from "@/components/shared/page-shell";
import { cn } from "@/lib/utils";

/** Painel de atendimento com textos rápidos personalizados por usuário. */
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
  const [channel, setChannel] = useState<ContactChannel | "">("");
  const [record, setRecord] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [quickTexts, setQuickTexts] = useState<string[]>([...CONTACT_RESULTS]);
  const [editingQuickTexts, setEditingQuickTexts] = useState(false);
  const [savingQuickTexts, setSavingQuickTexts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteQuickTextIndex, setDeleteQuickTextIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setChannel("");
    setRecord("");
    setNextAction("");
    setQuickTexts(user?.attendanceQuickTexts?.length ? [...user.attendanceQuickTexts] : [...CONTACT_RESULTS]);
    setEditingQuickTexts(false);
  }, [open, user?.attendanceQuickTexts]);

  const saveQuickTexts = async () => {
    if (!user) return;
    const cleaned = quickTexts.map((text) => text.trim()).filter(Boolean).slice(0, 20);
    setSavingQuickTexts(true);
    try {
      await updateDoc(doc(db, "users", user.id), { attendanceQuickTexts: cleaned });
      setQuickTexts(cleaned);
      setEditingQuickTexts(false);
      toast({ title: "Atalhos de atendimento salvos" });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao salvar os atalhos" });
    } finally {
      setSavingQuickTexts(false);
    }
  };

  const handleSave = async () => {
    if (!client || !user || !record.trim()) return;
    setSaving(true);
    try {
      await registerContact(
        client,
        {
          channel: channel || undefined,
          record: record.trim(),
          nextAction: nextAction.trim() || undefined,
        },
        user
      );
      toast({ title: "Atendimento registrado", description: client.name });
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao registrar atendimento" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b p-4 pr-12">
          <SheetTitle className="flex items-center gap-2">
            <MessageSquareText className="size-4" /> Registrar atendimento
          </SheetTitle>
          <SheetDescription>{client?.name}</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Canal (opcional)
              <HelpTip label="Informe por onde o atendimento aconteceu, quando essa informação for útil." />
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {CONTACT_CHANNELS.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn(channel === item && "border-transparent bg-accent/15 text-accent-foreground")}
                  onClick={() => setChannel((current) => current === item ? "" : item)}
                >
                  {item}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Textos rápidos</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setEditingQuickTexts((current) => !current)}
              >
                <Pencil className="mr-1 size-3" /> {editingQuickTexts ? "Cancelar edição" : "Personalizar"}
              </Button>
            </div>
            {editingQuickTexts ? (
              <div className="space-y-2 rounded-md border bg-muted/20 p-2.5">
                {quickTexts.map((text, index) => (
                  <div key={index} className="flex gap-1.5">
                    <Input
                      value={text}
                      maxLength={120}
                      onChange={(event) => setQuickTexts((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                      placeholder="Texto do atalho"
                      className="h-8 text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 text-muted-foreground"
                      title="Remover texto rápido"
                      onClick={() => setDeleteQuickTextIndex(index)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <div className="flex justify-between gap-2">
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" disabled={quickTexts.length >= 20} onClick={() => setQuickTexts((current) => [...current, ""])}>
                    <Plus className="mr-1 size-3" /> Adicionar
                  </Button>
                  <Button type="button" size="sm" className="h-7 text-xs" onClick={saveQuickTexts} disabled={savingQuickTexts}>
                    {savingQuickTexts && <Loader2 className="mr-1 size-3 animate-spin" />} Salvar atalhos
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {quickTexts.map((text) => (
                  <Button key={text} type="button" size="sm" variant="outline" className="h-7 bg-muted/20 text-xs" onClick={() => setRecord(text)}>
                    {text}
                  </Button>
                ))}
                {quickTexts.length === 0 && <p className="text-xs text-muted-foreground">Personalize esta área para criar seus textos rápidos.</p>}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">Um texto rápido apenas preenche o registro abaixo; você pode editá-lo antes de salvar.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="attendance-record">Registro do atendimento</Label>
            <Textarea
              id="attendance-record"
              value={record}
              onChange={(event) => setRecord(event.target.value)}
              placeholder="Registre o que aconteceu e o que ficou combinado."
              rows={6}
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Próxima ação (opcional)
              <HelpTip label="O próximo passo aparece nas listas para orientar a continuidade do atendimento." />
            </Label>
            <Input
              value={nextAction}
              onChange={(event) => setNextAction(event.target.value)}
              placeholder="Ex.: Ligar novamente na sexta-feira"
            />
          </div>
        </div>

        <SheetFooter className="shrink-0 border-t p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <HelpTip label="Salva um atendimento no histórico e atualiza o último contato do cliente.">
            <Button onClick={handleSave} disabled={!record.trim() || saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Registrar atendimento
            </Button>
          </HelpTip>
        </SheetFooter>
        </SheetContent>
      </Sheet>
      <ConfirmDeleteDialog
        open={deleteQuickTextIndex !== null}
        onOpenChange={(dialogOpen) => !dialogOpen && setDeleteQuickTextIndex(null)}
        title="Excluir texto rápido?"
        description="Deseja excluir este texto rápido?"
        onConfirm={() => {
          if (deleteQuickTextIndex !== null) {
            setQuickTexts((current) => current.filter((_, itemIndex) => itemIndex !== deleteQuickTextIndex));
          }
          setDeleteQuickTextIndex(null);
        }}
      />
    </>
  );
}
