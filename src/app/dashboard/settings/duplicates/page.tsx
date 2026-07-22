"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2, ScanSearch, ShieldAlert, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import {
  findDuplicateCandidates,
  markNotDuplicate,
  mergeDuplicateClients,
  type DuplicateCandidate,
  type DuplicateReason,
  type DuplicateResolution,
} from "@/lib/client-deduplication";
import { formatPhone, searchable } from "@/lib/normalize";
import type { Client } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CodeBadge, TypeChip } from "@/components/shared/badges";
import { EmptyState, PageHeader, SearchBox, Toolbar } from "@/components/shared/page-shell";
import type { ClientType } from "@/lib/types";

const REASON_LABELS: Record<DuplicateReason, string> = {
  cpf: "mesmo CPF/CNPJ",
  code: "mesmo código",
  exact_name: "mesmo nome",
  similar_name: "nome muito semelhante",
};

type MergeChoice = { candidate: DuplicateCandidate; targetId: string };

export default function DuplicateClientsPage() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const { data: clients } = useCollection<Client>("clients");
  const { data: types } = useCollection<ClientType>("clientTypes");
  const { data: resolutions } = useCollection<DuplicateResolution>("duplicateResolutions");
  const [search, setSearch] = useState("");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [mergeChoice, setMergeChoice] = useState<MergeChoice | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const typeMap = useMemo(() => new Map((types ?? []).map((type) => [type.id, type])), [types]);
  const candidates = useMemo(() => {
    const found = findDuplicateCandidates(clients ?? [], resolutions ?? []);
    const term = searchable(search);
    return term
      ? found.filter((candidate) => candidate.clients.some((client) => searchable(`${client.name} ${client.code ?? ""} ${client.cpfCnpj ?? ""}`).includes(term)))
      : found;
  }, [clients, resolutions, search]);
  const deletedCount = (clients ?? []).filter((client) => client.deleted).length;

  const dismiss = async (candidate: DuplicateCandidate) => {
    if (!user) return;
    setWorkingId(candidate.id);
    try {
      await markNotDuplicate(candidate.clients[0], candidate.clients[1], user);
      toast({ title: "Marcado como não duplicado" });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Não foi possível salvar a decisão" });
    } finally {
      setWorkingId(null);
    }
  };

  const merge = async () => {
    if (!user || !mergeChoice) return;
    const source = mergeChoice.candidate.clients.find((client) => client.id !== mergeChoice.targetId);
    if (!source) return;
    setWorkingId(mergeChoice.candidate.id);
    try {
      await mergeDuplicateClients(mergeChoice.targetId, source.id, user);
      toast({ title: "Clientes unificados", description: "Os vínculos foram transferidos e o duplicado foi ocultado." });
      setMergeChoice(null);
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Não foi possível concluir a unificação",
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setWorkingId(null);
    }
  };

  if (!isAdmin) {
    return <EmptyState icon={ShieldAlert} title="Acesso exclusivo de administrador" description="A unificação altera vínculos em várias coleções." />;
  }
  if (!clients || !types || !resolutions) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="size-7 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="page-shell max-w-6xl">
      <PageHeader
        eyebrow="administração"
        title="Possíveis duplicatas"
        description="Revise coincidências de CPF/CNPJ, código e nomes. Unificar preserva o cadastro descartado na lixeira e redireciona seus registros."
      />

      <Toolbar className="flex-wrap">
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar nas suspeitas…" className="min-w-64 flex-1" />
        <span className="text-xs text-muted-foreground">{candidates.length} pendência(s)</span>
        {deletedCount > 0 && (
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
            <Link href="/dashboard/clients?deleted=1"><Trash2 className="mr-1 size-3.5" /> Ver apagados ({deletedCount})</Link>
          </Button>
        )}
      </Toolbar>

      <div className="space-y-2">
        {candidates.map((candidate) => {
          const selectedId = choices[candidate.id] ?? candidate.clients[0].id;
          const working = workingId === candidate.id;
          return (
            <Card key={candidate.id} className="surface overflow-hidden">
              <CardHeader className="border-b bg-muted/15 py-2">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="flex flex-wrap gap-1">
                    {candidate.reasons.map((reason) => (
                      <span key={reason} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-normal text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        {REASON_LABELS[reason]}
                      </span>
                    ))}
                  </span>
                  <span className="text-[11px] font-normal text-muted-foreground">Escolha o cadastro que permanecerá</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid md:grid-cols-2">
                  {candidate.clients.map((client, index) => (
                    <label key={client.id} className={`cursor-pointer p-3 ${index === 1 ? "border-t md:border-l md:border-t-0" : ""} ${selectedId === client.id ? "bg-emerald-50/55 dark:bg-emerald-950/15" : "hover:bg-muted/20"}`}>
                      <div className="flex items-start gap-2">
                        <input
                          type="radio"
                          name={`target-${candidate.id}`}
                          checked={selectedId === client.id}
                          onChange={() => setChoices((current) => ({ ...current, [candidate.id]: client.id }))}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <Link href={`/dashboard/clients/${client.id}`} className="truncate text-sm font-medium hover:underline">{client.name}</Link>
                            <CodeBadge code={client.code} />
                          </div>
                          <p className="text-xs text-muted-foreground">CPF/CNPJ: {client.cpfCnpj || "—"}</p>
                          <p className="text-xs text-muted-foreground">Telefone: {formatPhone(client.phone || client.phones?.[0]?.number) || "—"}</p>
                          <p className="truncate text-xs text-muted-foreground">E-mail: {client.email || client.emails?.[0]?.address || "—"}</p>
                          <div className="flex flex-wrap gap-1 pt-1">
                            {(client.typeIds ?? []).map((typeId) => typeMap.get(typeId)).filter((type): type is ClientType => !!type).map((type) => <TypeChip key={type.id} type={type} />)}
                          </div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t bg-muted/10 p-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => dismiss(candidate)} disabled={working}>
                    <Check className="mr-1 size-3.5" /> Não é duplicata
                  </Button>
                  <Button type="button" size="sm" onClick={() => setMergeChoice({ candidate, targetId: selectedId })} disabled={working}>
                    {working ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <ArrowRight className="mr-1 size-3.5" />}
                    Unificar no selecionado
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {candidates.length === 0 && (
          <EmptyState icon={ScanSearch} title="Nenhuma pendência de duplicidade" description={search ? "A busca não encontrou suspeitas." : "As combinações atuais foram resolvidas ou não apresentam semelhança relevante."} />
        )}
      </div>

      <AlertDialog open={!!mergeChoice} onOpenChange={(open) => !open && setMergeChoice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unificar estes clientes?</AlertDialogTitle>
            <AlertDialogDescription>
              Processos, andamentos, tarefas, grupos, operações e vínculos serão direcionados ao cadastro selecionado. O outro cadastro será preservado integralmente na lixeira para auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {mergeChoice && (
            <div className="rounded-md bg-amber-50/70 p-3 text-sm dark:bg-amber-950/15">
              Permanecerá: <span className="font-medium">{mergeChoice.candidate.clients.find((client) => client.id === mergeChoice.targetId)?.name}</span>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={merge}>Confirmar unificação</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
