"use client";

import { useState } from "react";
import { ArchiveRestore, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import type { Client, Lawyer, MonitoredParty } from "@/lib/types";
import { searchClientsByTerm } from "@/lib/publication-links";
import {
  MIN_PARTY_TERM_LENGTH,
  UF_LIST,
  createLawyer,
  createMonitoredParty,
  setLawyerDeleted,
  setMonitoredPartyDeleted,
  updateLawyer,
  updateMonitoredParty,
  type LawyerInput,
  type MonitoredPartyInput,
} from "@/lib/publication-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState, FilterChip, HelpTip, PageHeader, Toolbar } from "@/components/shared/page-shell";

/**
 * Quem o escritório monitora no DJEN.
 *
 * São duas portas de entrada complementares: a **inscrição da OAB**, que traz o
 * que é publicado em nome dos advogados, e o **nome da parte**, que alcança
 * processo em que nenhum advogado do escritório está cadastrado — típico de
 * cliente empresa intimada diretamente ou de processo sem procuração juntada.
 */
export default function MonitoramentoPage() {
  const { isAdmin } = useAuth();
  const { data: lawyers } = useCollection<Lawyer>("lawyers");
  const { data: parties } = useCollection<MonitoredParty>("monitoredParties");

  if (!isAdmin) {
    return (
      <div className="page-shell">
        <EmptyState
          title="Acesso restrito"
          description="Somente administradores podem definir o que é monitorado no diário."
        />
      </div>
    );
  }

  if (!lawyers || !parties) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const oabsAtivas = lawyers.filter((lawyer) => !lawyer.deleted && lawyer.monitored).length;
  const partesAtivas = parties.filter((party) => !party.deleted && party.monitored).length;

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="publicações"
        title="Monitoramento"
        description={
          <>
            Cada monitoramento vira uma consulta diária ao Diário de Justiça Eletrônico Nacional.
            Hoje são {oabsAtivas} inscrição(ões) da OAB e {partesAtivas} parte(s).
          </>
        }
      />

      <Tabs defaultValue="advogados">
        <TabsList>
          <TabsTrigger value="advogados">Advogados ({oabsAtivas})</TabsTrigger>
          <TabsTrigger value="partes">Partes ({partesAtivas})</TabsTrigger>
        </TabsList>
        <TabsContent value="advogados" className="space-y-3">
          <AdvogadosTab lawyers={lawyers} />
        </TabsContent>
        <TabsContent value="partes" className="space-y-3">
          <PartesTab parties={parties} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Advogados (OAB)
// ---------------------------------------------------------------------------

const LAWYER_VAZIO: LawyerInput = {
  name: "",
  oabNumber: "",
  oabUf: "SP",
  monitored: true,
  notes: "",
};

function AdvogadosTab({ lawyers }: { lawyers: Lawyer[] }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Lawyer | null>(null);
  const [form, setForm] = useState<LawyerInput>(LAWYER_VAZIO);
  const [saving, setSaving] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [toDelete, setToDelete] = useState<Lawyer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const todos = lawyers.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const lista = todos.filter((lawyer) => (showDeleted ? lawyer.deleted : !lawyer.deleted));
  const ocultos = todos.filter((lawyer) => lawyer.deleted).length;

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
    <>
      <Toolbar>
        <FilterChip active={!showDeleted} onClick={() => setShowDeleted(false)}>
          Ativos ({todos.length - ocultos})
        </FilterChip>
        {ocultos > 0 && (
          <FilterChip active={showDeleted} onClick={() => setShowDeleted(true)}>
            <Trash2 className="size-3" /> Ver excluídos ({ocultos})
          </FilterChip>
        )}
        <HelpTip label="Cadastra uma inscrição da OAB para o sistema buscar as publicações dela.">
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => {
              setEditing(null);
              setForm(LAWYER_VAZIO);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" /> Novo advogado
          </Button>
        </HelpTip>
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
                    <MonitoredChip on={lawyer.monitored} />
                  </TableCell>
                  <TableCell
                    className="hidden truncate text-[13px] text-muted-foreground lg:table-cell"
                    title={lawyer.notes}
                  >
                    {lawyer.notes || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <LinhaAcoes
                      excluido={showDeleted}
                      onEdit={() => {
                        setEditing(lawyer);
                        setForm({
                          name: lawyer.name,
                          oabNumber: lawyer.oabNumber,
                          oabUf: lawyer.oabUf,
                          monitored: lawyer.monitored,
                          notes: lawyer.notes ?? "",
                        });
                        setDialogOpen(true);
                      }}
                      onDelete={() => setToDelete(lawyer)}
                      onRestore={() => restore(lawyer)}
                    />
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
                <Select value={form.oabUf} onValueChange={(value) => setForm({ ...form, oabUf: value })}>
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
            <ChaveMonitorada
              rotulo="Buscar publicações desta OAB"
              checked={form.monitored}
              onChange={(checked) => setForm({ ...form, monitored: checked })}
            />
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Partes
// ---------------------------------------------------------------------------

const PARTE_VAZIA: MonitoredPartyInput = {
  name: "",
  searchTerm: "",
  clientId: "",
  monitored: true,
  notes: "",
};

function PartesTab({ parties }: { parties: MonitoredParty[] }) {
  const { user } = useAuth();
  const { data: clients } = useCollection<Client>("clients");
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MonitoredParty | null>(null);
  const [form, setForm] = useState<MonitoredPartyInput>(PARTE_VAZIA);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [toDelete, setToDelete] = useState<MonitoredParty | null>(null);
  const [deleting, setDeleting] = useState(false);

  const todas = parties.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const lista = todas.filter((party) => (showDeleted ? party.deleted : !party.deleted));
  const ocultas = todas.filter((party) => party.deleted).length;

  const clienteEscolhido = (clients ?? []).find((client) => client.id === form.clientId);
  const resultadosCliente = searchClientsByTerm(clients ?? [], buscaCliente, 5);

  const abrirNovo = () => {
    setEditing(null);
    setForm(PARTE_VAZIA);
    setBuscaCliente("");
    setDialogOpen(true);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (editing) await updateMonitoredParty(editing.id, form, todas, clients ?? [], user);
      else await createMonitoredParty(form, todas, clients ?? [], user);
      toast({ title: editing ? "Parte atualizada" : "Parte monitorada" });
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

  const remove = async (party: MonitoredParty) => {
    if (!user) return;
    setDeleting(true);
    try {
      await setMonitoredPartyDeleted(party.id, true, user);
      toast({ title: "Parte excluída" });
      setToDelete(null);
    } catch {
      toast({ variant: "destructive", title: "Erro ao excluir" });
    } finally {
      setDeleting(false);
    }
  };

  const restore = async (party: MonitoredParty) => {
    if (!user) return;
    try {
      await setMonitoredPartyDeleted(party.id, false, user);
      toast({ title: "Parte restaurada" });
      setShowDeleted(false);
    } catch {
      toast({ variant: "destructive", title: "Erro ao restaurar" });
    }
  };

  return (
    <>
      <Toolbar>
        <FilterChip active={!showDeleted} onClick={() => setShowDeleted(false)}>
          Ativas ({todas.length - ocultas})
        </FilterChip>
        {ocultas > 0 && (
          <FilterChip active={showDeleted} onClick={() => setShowDeleted(true)}>
            <Trash2 className="size-3" /> Ver excluídas ({ocultas})
          </FilterChip>
        )}
        <HelpTip label="Monitora publicações pelo nome da parte, mesmo sem advogado do escritório no processo.">
          <Button size="sm" className="ml-auto" onClick={abrirNovo}>
            <Plus className="mr-2 size-4" /> Nova parte
          </Button>
        </HelpTip>
      </Toolbar>

      {lista.length === 0 ? (
        <EmptyState
          title={showDeleted ? "Nenhuma parte excluída" : "Nenhuma parte monitorada"}
          description={
            showDeleted
              ? "Cadastros ocultados ficam aqui e podem ser restaurados."
              : "Cadastre o nome de um cliente empresa, por exemplo, para capturar publicações de processos em que nenhum advogado do escritório aparece."
          }
        />
      ) : (
        <div className="work-table">
          <Table className="column-dividers table-fixed">
            <TableHeader>
              <TableRow className="ledger-header">
                <TableHead>Parte</TableHead>
                <TableHead className="hidden md:table-cell">
                  <HelpTip label="É o texto enviado ao diário. Aceita nome parcial e ignora acento.">
                    <span className="cursor-help underline decoration-dotted underline-offset-2">
                      Termo de busca
                    </span>
                  </HelpTip>
                </TableHead>
                <TableHead className="hidden w-44 lg:table-cell">Cliente</TableHead>
                <TableHead className="w-28">Monitorada</TableHead>
                <TableHead className="w-20 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((party) => (
                <TableRow key={party.id}>
                  <TableCell className="truncate text-[13px]" title={party.name}>
                    {party.name}
                  </TableCell>
                  <TableCell
                    className="hidden truncate text-[13px] text-muted-foreground md:table-cell"
                    title={party.searchTerm}
                  >
                    {party.searchTerm}
                  </TableCell>
                  <TableCell className="hidden truncate text-[13px] lg:table-cell">
                    {party.clientName || "—"}
                  </TableCell>
                  <TableCell className="text-[13px]">
                    <MonitoredChip on={party.monitored} />
                  </TableCell>
                  <TableCell className="text-right">
                    <LinhaAcoes
                      excluido={showDeleted}
                      onEdit={() => {
                        setEditing(party);
                        setForm({
                          name: party.name,
                          searchTerm: party.searchTerm,
                          clientId: party.clientId ?? "",
                          monitored: party.monitored,
                          notes: party.notes ?? "",
                        });
                        setBuscaCliente("");
                        setDialogOpen(true);
                      }}
                      onDelete={() => setToDelete(party)}
                      onRestore={() => restore(party)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar parte" : "Nova parte monitorada"}</DialogTitle>
            <DialogDescription>
              Traz publicações em que esta parte aparece, mesmo quando nenhum advogado do escritório
              está cadastrado no processo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value,
                    // O termo acompanha o nome enquanto não for ajustado à mão.
                    searchTerm: form.searchTerm === form.name ? e.target.value : form.searchTerm,
                  })
                }
                placeholder="GSI Serviços Administrativos Ltda"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Termo de busca no diário</Label>
              <Input
                value={form.searchTerm}
                onChange={(e) => setForm({ ...form, searchTerm: e.target.value })}
                placeholder="GSI Serviços Administrativos"
              />
              <p className="text-xs text-muted-foreground">
                Mínimo de {MIN_PARTY_TERM_LENGTH} caracteres. Nome parcial funciona e acento não
                importa; termo curto ou genérico traz publicação de terceiros.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Cliente correspondente (opcional)</Label>
              {clienteEscolhido ? (
                <div className="flex items-center gap-2 rounded border p-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate">{clienteEscolhido.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() => setForm({ ...form, clientId: "" })}
                  >
                    Remover
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    value={buscaCliente}
                    onChange={(e) => setBuscaCliente(e.target.value)}
                    placeholder="Nome, código ou CPF/CNPJ"
                  />
                  {resultadosCliente.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      className="block w-full truncate rounded border p-2 text-left text-[13px] hover:bg-muted/40"
                      onClick={() => {
                        setForm({ ...form, clientId: client.id });
                        setBuscaCliente("");
                      }}
                    >
                      {client.name}
                      {client.code && <span className="text-muted-foreground"> · {client.code}</span>}
                    </button>
                  ))}
                </>
              )}
            </div>

            <ChaveMonitorada
              rotulo="Buscar publicações desta parte"
              checked={form.monitored}
              onChange={(checked) => setForm({ ...form, monitored: checked })}
            />
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={save}
              disabled={
                saving || !form.name.trim() || form.searchTerm.trim().length < MIN_PARTY_TERM_LENGTH
              }
            >
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Excluir parte?"
        description="Deseja excluir esta parte monitorada?"
        onConfirm={() => {
          if (toDelete) return remove(toDelete);
        }}
        loading={deleting}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Pedaços compartilhados pelas duas abas
// ---------------------------------------------------------------------------

function MonitoredChip({ on }: { on: boolean }) {
  return (
    <span
      className={
        on
          ? "rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800"
          : "rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700"
      }
    >
      {on ? "Sim" : "Não"}
    </span>
  );
}

function ChaveMonitorada({
  rotulo,
  checked,
  onChange,
}: {
  rotulo: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border p-2.5">
      <div className="space-y-0.5">
        <Label>{rotulo}</Label>
        <p className="text-xs text-muted-foreground">
          Desligue para manter o cadastro sem consultar o diário.
        </p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function LinhaAcoes({
  excluido,
  onEdit,
  onDelete,
  onRestore,
}: {
  excluido: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  if (excluido) {
    return (
      <HelpTip label="Restaura este cadastro para a lista ativa." side="left">
        <Button variant="ghost" size="icon" className="size-7" onClick={onRestore}>
          <ArchiveRestore className="size-3.5" />
        </Button>
      </HelpTip>
    );
  }
  return (
    <div className="flex justify-end gap-1">
      <HelpTip label="Edita este cadastro.">
        <Button variant="ghost" size="icon" className="size-7" onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
      </HelpTip>
      <HelpTip label="Exclui este cadastro." side="left">
        <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </Button>
      </HelpTip>
    </div>
  );
}
