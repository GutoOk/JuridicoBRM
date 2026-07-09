"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Loader2, Plus } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { searchable } from "@/lib/normalize";
import type { Client, Process } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, HelpTip, PageHeader, SearchBox, Toolbar } from "@/components/shared/page-shell";

const STATUSES = ["Ativo", "Suspenso", "Arquivado", "Extinto"] as const;

export default function ProcessesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: processes } = useCollection<Process>("processes");
  const { data: clients } = useCollection<Client>("clients");

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Process | null>(null);
  const [form, setForm] = useState({
    processNumber: "",
    actionType: "",
    vara: "",
    status: "Ativo" as Process["status"],
    clientQuery: "",
    clientId: "",
    clientName: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const activeClients = useMemo(() => (clients ?? []).filter((c) => !c.deleted), [clients]);

  const rows = useMemo(() => {
    let out = (processes ?? []).filter((p) => !p.deleted);
    const q = search.trim();
    if (q) {
      const qs = searchable(q);
      out = out.filter(
        (p) =>
          p.processNumber.toLowerCase().includes(q.toLowerCase()) ||
          (p.clientNames ?? []).some((n) => searchable(n).includes(qs)) ||
          searchable(p.actionType).includes(qs)
      );
    }
    return out.sort((a, b) => a.processNumber.localeCompare(b.processNumber));
  }, [processes, search]);

  const clientMatches = useMemo(() => {
    const q = searchable(form.clientQuery.trim());
    if (q.length < 2) return [];
    return activeClients
      .filter((c) => searchable(c.name).includes(q) || (c.code ?? "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [form.clientQuery, activeClients]);

  const openNew = () => {
    setEditing(null);
    setForm({ processNumber: "", actionType: "", vara: "", status: "Ativo", clientQuery: "", clientId: "", clientName: "", notes: "" });
    setDialogOpen(true);
  };

  const openEdit = (p: Process) => {
    setEditing(p);
    setForm({
      processNumber: p.processNumber,
      actionType: p.actionType ?? "",
      vara: p.vara ?? "",
      status: p.status ?? "Ativo",
      clientQuery: "",
      clientId: p.mainClientId ?? p.clientIds?.[0] ?? "",
      clientName: p.clientNames?.[0] ?? "",
      notes: p.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user || !form.processNumber.trim()) return;
    setSaving(true);
    try {
      const payload = {
        processNumber: form.processNumber.trim(),
        actionType: form.actionType.trim(),
        vara: form.vara.trim(),
        status: form.status,
        notes: form.notes.trim(),
        clientIds: form.clientId ? [form.clientId] : [],
        mainClientId: form.clientId || null,
        clientNames: form.clientName ? [form.clientName] : [],
        updatedAt: serverTimestamp(),
        lastUpdate: serverTimestamp(),
      };
      if (editing) {
        await updateDoc(doc(db, "processes", editing.id), payload);
        toast({ title: "Processo atualizado" });
      } else {
        await addDoc(collection(db, "processes"), {
          ...payload,
          polo: "Ativo",
          createdAt: serverTimestamp(),
          deleted: false,
        });
        toast({ title: "Processo cadastrado" });
      }
      setDialogOpen(false);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao salvar processo" });
    } finally {
      setSaving(false);
    }
  };

  if (!processes) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="judicial"
        title="Processos"
        description={`${rows.length} processo(s). Cadastre o número, tipo de ação e vínculo com cliente para facilitar consulta e relatórios.`}
      >
        <HelpTip label="Cadastra um processo judicial e, se possível, vincula ao cliente principal.">
        <Button onClick={openNew}>
          <Plus className="mr-2 size-4" /> Novo processo
        </Button>
        </HelpTip>
      </PageHeader>

      <Toolbar>
        <SearchBox
          placeholder="Buscar por número, cliente ou tipo de ação..."
          value={search}
          onChange={setSearch}
        />
      </Toolbar>

      <div className="work-table">
        <Table>
          <TableHeader>
            <TableRow className="ledger-header">
              <TableHead>Número</TableHead>
              <TableHead>Cliente(s)</TableHead>
              <TableHead>Tipo de ação</TableHead>
              <TableHead>Vara</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="whitespace-nowrap font-mono text-sm">{p.processNumber}</TableCell>
                <TableCell>
                  {(p.clientIds ?? []).length > 0 && p.clientIds[0] ? (
                    <Link href={`/dashboard/clients/${p.mainClientId ?? p.clientIds[0]}`} className="hover:underline">
                      {(p.clientNames ?? []).join(", ") || "—"}
                    </Link>
                  ) : (
                    (p.clientNames ?? []).join(", ") || "—"
                  )}
                </TableCell>
                <TableCell className="text-sm">{p.actionType || "—"}</TableCell>
                <TableCell className="text-sm">{p.vara || "—"}</TableCell>
                <TableCell>
                  <Badge variant={p.status === "Ativo" ? "secondary" : "outline"}>{p.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <HelpTip label="Abre este processo para alterar dados cadastrais, vínculo e observações." side="left">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                    Editar
                  </Button>
                  </HelpTip>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  <EmptyState
                    title="Nenhum processo encontrado"
                    description="Cadastre um novo processo ou ajuste a busca atual."
                    className="border-0 bg-transparent"
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar processo" : "Novo processo"}</DialogTitle>
            <DialogDescription>
              Informe os dados principais. O vínculo com cliente facilita a consulta na ficha.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Número do processo</Label>
                <Input
                  value={form.processNumber}
                  onChange={(e) => setForm({ ...form, processNumber: e.target.value })}
                  placeholder="0000000-00.0000.0.00.0000"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Process["status"] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de ação</Label>
                <Input value={form.actionType} onChange={(e) => setForm({ ...form, actionType: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Vara/Foro</Label>
                <Input value={form.vara} onChange={(e) => setForm({ ...form, vara: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              {form.clientId ? (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{form.clientName}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, clientId: "", clientName: "" })}>
                    trocar
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    value={form.clientQuery}
                    onChange={(e) => setForm({ ...form, clientQuery: e.target.value })}
                    placeholder="Digite nome ou código para buscar…"
                  />
                  {clientMatches.length > 0 && (
                    <div className="rounded-md border">
                      {clientMatches.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                          onClick={() =>
                            setForm({ ...form, clientId: c.id, clientName: c.name, clientQuery: "" })
                          }
                        >
                          {c.code ? `[${c.code}] ` : ""}
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.processNumber.trim()}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
