"use client";

import { useState } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Loader2, Plus, Trash2, Pencil } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import type { MessageTemplate } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, HelpTip, PageHeader } from "@/components/shared/page-shell";

export default function TemplatesPage() {
  const { user, isAdmin } = useAuth();
  const { data: templates } = useCollection<MessageTemplate>("messageTemplates");
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [form, setForm] = useState({ title: "", body: "" });
  const [saving, setSaving] = useState(false);

  if (!isAdmin) {
    return (
      <div className="page-shell">
        <EmptyState
          title="Acesso restrito"
          description="Somente administradores podem gerenciar mensagens padrão."
        />
      </div>
    );
  }

  const sorted = (templates ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", body: "" });
    setDialogOpen(true);
  };

  const openEdit = (t: MessageTemplate) => {
    setEditing(t);
    setForm({ title: t.title, body: t.body });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!user || !form.title.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, "messageTemplates", editing.id), {
          title: form.title.trim(),
          body: form.body,
          updatedAt: serverTimestamp(),
          updatedBy: user.name,
        });
      } else {
        const maxOrder = Math.max(0, ...sorted.map((t) => t.order ?? 0));
        await addDoc(collection(db, "messageTemplates"), {
          title: form.title.trim(),
          body: form.body,
          order: maxOrder + 1,
          updatedAt: serverTimestamp(),
          updatedBy: user.name,
        });
      }
      toast({ title: "Mensagem salva" });
      setDialogOpen(false);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: MessageTemplate) => {
    try {
      await deleteDoc(doc(db, "messageTemplates", t.id));
      toast({ title: "Mensagem excluída" });
    } catch {
      toast({ variant: "destructive", title: "Erro ao excluir" });
    }
  };

  if (!templates) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="atendimento"
        title="Mensagens padrão"
        description={<>Modelos copiáveis usados na Operação. Variáveis disponíveis: {"{{nome}}"}, {"{{primeiro_nome}}"}, {"{{codigo}}"}, {"{{pendencias}}"} e {"{{responsavel}}"}.</>}
      >
        <HelpTip label="Cria um modelo que poderá ser preenchido automaticamente na ficha do cliente.">
        <Button onClick={openNew}>
          <Plus className="mr-2 size-4" /> Nova mensagem
        </Button>
        </HelpTip>
      </PageHeader>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {sorted.map((t) => (
          <Card key={t.id} className="surface">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-headline text-xl">{t.title}</CardTitle>
              <div className="flex gap-1">
                <HelpTip label="Edita o título e o texto deste modelo.">
                <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(t)}>
                  <Pencil className="size-3.5" />
                </Button>
                </HelpTip>
                <HelpTip label="Remove este modelo da lista de mensagens padrão." side="left">
                <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => remove(t)}>
                  <Trash2 className="size-3.5" />
                </Button>
                </HelpTip>
              </div>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{t.body}</p>
            </CardContent>
          </Card>
        ))}
        {sorted.length === 0 && (
          <EmptyState
            title="Nenhuma mensagem padrão"
            description="Instale os padrões em Tipos & Checklists ou crie o primeiro modelo aqui."
            className="md:col-span-2"
          />
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar mensagem" : "Nova mensagem"}</DialogTitle>
            <DialogDescription>
              Use {"{{nome}}"}, {"{{primeiro_nome}}"}, {"{{codigo}}"}, {"{{pendencias}}"} e {"{{responsavel}}"} —
              serão substituídos pelos dados do cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Mensagem</Label>
              <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={8} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving || !form.title.trim() || !form.body.trim()}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
