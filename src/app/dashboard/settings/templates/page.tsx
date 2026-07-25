"use client";

import { useState } from "react";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { ArchiveRestore, Loader2, Plus, Trash2, Pencil } from "lucide-react";
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
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState, FilterChip, HelpTip, PageHeader, Toolbar } from "@/components/shared/page-shell";

export default function TemplatesPage() {
  const { user, isAdmin } = useAuth();
  const { data: templates } = useCollection<MessageTemplate>("messageTemplates");
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [form, setForm] = useState({ title: "", body: "" });
  const [saving, setSaving] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deleteTemplate, setDeleteTemplate] = useState<MessageTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const allSorted = (templates ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const sorted = allSorted.filter((template) => showDeleted ? template.deleted : !template.deleted);
  const deletedCount = allSorted.filter((template) => template.deleted).length;

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
        const maxOrder = Math.max(0, ...allSorted.map((t) => t.order ?? 0));
        await addDoc(collection(db, "messageTemplates"), {
          title: form.title.trim(),
          body: form.body,
          order: maxOrder + 1,
          updatedAt: serverTimestamp(),
          updatedBy: user.name,
          deleted: false,
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
    if (!user) return;
    setDeleting(true);
    try {
      await updateDoc(doc(db, "messageTemplates", t.id), {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: user.name,
      });
      toast({ title: "Mensagem excluída" });
      setDeleteTemplate(null);
    } catch {
      toast({ variant: "destructive", title: "Erro ao excluir" });
    } finally {
      setDeleting(false);
    }
  };

  const restore = async (t: MessageTemplate) => {
    try {
      await updateDoc(doc(db, "messageTemplates", t.id), {
        deleted: false,
        deletedAt: null,
        deletedBy: null,
      });
      toast({ title: "Mensagem restaurada" });
    } catch {
      toast({ variant: "destructive", title: "Erro ao restaurar" });
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
        description={<>Modelos copiáveis usados na Operação. Variáveis disponíveis: {"{{nome}}"}, {"{{primeiro_nome}}"}, {"{{codigo}}"} e {"{{pendencias}}"}.</>}
      >
        <HelpTip label="Cria um modelo que poderá ser preenchido automaticamente na ficha do cliente.">
        <Button onClick={openNew}>
          <Plus className="mr-2 size-4" /> Nova mensagem
        </Button>
        </HelpTip>
      </PageHeader>

      <Toolbar>
        <FilterChip active={!showDeleted} onClick={() => setShowDeleted(false)}>Ativas</FilterChip>
        {deletedCount > 0 && (
          <FilterChip active={showDeleted} onClick={() => setShowDeleted(true)}>
            <Trash2 className="size-3" /> {showDeleted ? "Ver ativas" : `Ver apagados (${deletedCount})`}
          </FilterChip>
        )}
      </Toolbar>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {sorted.map((t) => (
          <Card key={t.id} className="surface">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle>{t.title}</CardTitle>
              <div className="flex gap-1">
                {!showDeleted && <HelpTip label="Edita o título e o texto deste modelo.">
                <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(t)}>
                  <Pencil className="size-3.5" />
                </Button>
                </HelpTip>}
                {showDeleted ? (
                  <HelpTip label="Restaura este modelo para a lista de mensagens padrão." side="left">
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => restore(t)}>
                      <ArchiveRestore className="size-3.5" />
                    </Button>
                  </HelpTip>
                ) : <HelpTip label="Exclui este modelo." side="left">
                <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => setDeleteTemplate(t)}>
                  <Trash2 className="size-3.5" />
                </Button>
                </HelpTip>}
              </div>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{t.body}</p>
            </CardContent>
          </Card>
        ))}
        {sorted.length === 0 && (
          <EmptyState
            title={showDeleted ? "Nenhuma mensagem ocultada" : "Nenhuma mensagem padrão"}
            description={showDeleted ? "Modelos ocultados permanecem disponíveis aqui para restauração." : "Instale os padrões no Editor de operações ou crie o primeiro modelo aqui."}
            className="md:col-span-2"
          />
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar mensagem" : "Nova mensagem"}</DialogTitle>
            <DialogDescription>
              Use {"{{nome}}"}, {"{{primeiro_nome}}"}, {"{{codigo}}"} e {"{{pendencias}}"} —
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
      <ConfirmDeleteDialog
        open={!!deleteTemplate}
        onOpenChange={(open) => !open && setDeleteTemplate(null)}
        title="Excluir mensagem?"
        description="Deseja excluir esta mensagem?"
        onConfirm={() => {
          if (deleteTemplate) return remove(deleteTemplate);
        }}
        loading={deleting}
      />
    </div>
  );
}
