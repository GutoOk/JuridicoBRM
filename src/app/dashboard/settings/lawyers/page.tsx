"use client";

import { useState } from "react";
import { ArchiveRestore, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import type { Lawyer } from "@/lib/types";
import {
  UF_LIST,
  createLawyer,
  setLawyerDeleted,
  updateLawyer,
  type LawyerInput,
} from "@/lib/publication-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState, FilterChip, HelpTip, PageHeader, Toolbar } from "@/components/shared/page-shell";

const FORM_VAZIO: LawyerInput = {
  name: "",
  oabNumber: "",
  oabUf: "SP",
  monitored: true,
  notes: "",
};

export default function LawyersPage() {
  const { user, isAdmin } = useAuth();
  const { data: lawyers } = useCollection<Lawyer>("lawyers");
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Lawyer | null>(null);
  const [form, setForm] = useState<LawyerInput>(FORM_VAZIO);
  const [saving, setSaving] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [toDelete, setToDelete] = useState<Lawyer | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!isAdmin) {
    return (
      <div className="page-shell">
        <EmptyState
          title="Acesso restrito"
          description="Somente administradores podem cadastrar advogados monitorados."
        />
      </div>
    );
  }

  if (!lawyers) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const todos = lawyers
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const lista = todos.filter((lawyer) => (showDeleted ? lawyer.deleted : !lawyer.deleted));
  const ocultos = todos.filter((lawyer) => lawyer.deleted).length;
  const monitorados = todos.filter((lawyer) => !lawyer.deleted && lawyer.monitored).length;

  const openNew = () => {
    setEditing(null);
    setForm(FORM_VAZIO);
    setDialogOpen(true);
  };

  const openEdit = (lawyer: Lawyer) => {
    setEditing(lawyer);
    setForm({
      name: lawyer.name,
      oabNumber: lawyer.oabNumber,
      oabUf: lawyer.oabUf,
      monitored: lawyer.monitored,
      notes: lawyer.notes ?? "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (editing) await updateLawyer(editing.id, form, todos, user);
      else await createLawyer(form, todos, user);
      toast({ title: editing ? "Advogado atualizado" : "Advogado cadastrado" });
      setDialogOpen(false);
    } catch (erro) {
      toast({
        variant: "destructive",
        title: "Não foi possível salvar",
        description: erro instanceof Error ? erro.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (lawyer: Lawyer) => {
    if (!user) return;
    setDeleting(true);
    try {
      await setLawyerDeleted(lawyer.id, true, user);
      toast({ title: "Advogado excluído" });
      setToDelete(null);
    } catch {
      toast({ variant: "destructive", title: "Erro ao excluir" });
    } finally {
      setDeleting(false);
    }
  };

  const restore = async (lawyer: Lawyer) => {
    if (!user) return;
    try {
      await setLawyerDeleted(lawyer.id, false, user);
      toast({ title: "Advogado restaurado" });
      setShowDeleted(false);
    } catch {
      toast({ variant: "destructive", title: "Erro ao restaurar" });
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="publicações"
        title="Advogados monitorados"
        description="Inscrições da OAB consultadas no Diário de Justiça Eletrônico Nacional. Cada advogado monitorado gera uma busca por dia."
      >
        <HelpTip label="Cadastra uma inscrição da OAB para o sistema buscar as publicações dela.">
          <Button onClick={openNew}>
            <Plus className="mr-2 size-4" /> Novo advogado
          </Button>
        </HelpTip>
      </PageHeader>

      <Toolbar>
        <FilterChip active={!showDeleted} onClick={() => setShowDeleted(false)}>
          Ativos ({todos.length - ocultos})
        </FilterChip>
        {ocultos > 0 && (
          <FilterChip active={showDeleted} onClick={() => setShowDeleted(true)}>
            <Trash2 className="size-3" /> Ver excluídos ({ocultos})
          </FilterChip>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {monitorados === 0
            ? "Nenhuma OAB entra na busca diária."
            : `${monitorados} ${monitorados === 1 ? "OAB entra" : "OABs entram"} na busca diária.`}
        </span>
      </Toolbar>

      {lista.length === 0 ? (
        <EmptyState
          title={showDeleted ? "Nenhum advogado excluído" : "Nenhum advogado cadastrado"}
          description={
            showDeleted
              ? "Cadastros ocultados ficam aqui e podem ser restaurados."
              : "Cadastre a OAB de cada advogado do escritório para o sistema buscar as publicações."
          }
        />
      ) : (
        <div className="work-table">
          <Table className="column-dividers table-fixed">
            <TableHeader>
              <TableRow className="ledger-header">
                <TableHead>Advogado</TableHead>
                <TableHead className="w-32">OAB</TableHead>
                <TableHead className="w-28">
                  <HelpTip label="Quando desligado, a OAB fica cadastrada mas sai da busca diária.">
                    <span className="cursor-help underline decoration-dotted underline-offset-2">
                      Monitorado
                    </span>
                  </HelpTip>
                </TableHead>
                <TableHead className="hidden lg:table-cell">Observação</TableHead>
                <TableHead className="w-20 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((lawyer) => (
                <TableRow key={lawyer.id}>
                  <TableCell className="truncate text-[13px]" title={lawyer.name}>
                    {lawyer.name}
                  </TableCell>
                  <TableCell className="truncate font-code text-[13px]">
                    {lawyer.oabUf} {lawyer.oabNumber}
                  </TableCell>
                  <TableCell className="text-[13px]">
                    <span
                      className={
                        lawyer.monitored
                          ? "rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800"
                          : "rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700"
                      }
                    >
                      {lawyer.monitored ? "Sim" : "Não"}
                    </span>
                  </TableCell>
                  <TableCell
                    className="hidden truncate text-[13px] text-muted-foreground lg:table-cell"
                    title={lawyer.notes}
                  >
                    {lawyer.notes || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {showDeleted ? (
                        <HelpTip label="Restaura este advogado para a lista ativa." side="left">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => restore(lawyer)}
                          >
                            <ArchiveRestore className="size-3.5" />
                          </Button>
                        </HelpTip>
                      ) : (
                        <>
                          <HelpTip label="Edita nome, inscrição e monitoramento.">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => openEdit(lawyer)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                          </HelpTip>
                          <HelpTip label="Exclui este advogado." side="left">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-destructive"
                              onClick={() => setToDelete(lawyer)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </HelpTip>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar advogado" : "Novo advogado"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Como aparece na OAB"
              />
            </div>
            <div className="grid grid-cols-[1fr_100px] gap-2">
              <div className="space-y-1.5">
                <Label>Número da OAB</Label>
                <Input
                  value={form.oabNumber}
                  onChange={(e) => setForm({ ...form, oabNumber: e.target.value })}
                  placeholder="Somente números"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label>UF</Label>
                <Select
                  value={form.oabUf}
                  onValueChange={(value) => setForm({ ...form, oabUf: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UF_LIST.map((uf) => (
                      <SelectItem key={uf} value={uf}>
                        {uf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-2.5">
              <div className="space-y-0.5">
                <Label>Buscar publicações desta OAB</Label>
                <p className="text-xs text-muted-foreground">
                  Desligue para manter o cadastro sem consultar o diário.
                </p>
              </div>
              <Switch
                checked={form.monitored}
                onCheckedChange={(checked) => setForm({ ...form, monitored: checked })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving || !form.name.trim() || !form.oabNumber.trim()}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Excluir advogado?"
        description="Deseja excluir este advogado?"
        onConfirm={() => {
          if (toDelete) return remove(toDelete);
        }}
        loading={deleting}
      />
    </div>
  );
}
