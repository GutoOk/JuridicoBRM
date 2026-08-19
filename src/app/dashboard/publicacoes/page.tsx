"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlarmClock,
  ArchiveRestore,
  ExternalLink,
  FileBadge,
  Link2,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { formatDisponibilizacao, sanitizePublicationHtml } from "@/lib/djen";
import { syncDjenPublications, SYNC_WINDOW_DAYS } from "@/lib/djen-sync";
import { setPublicationDeleted, setPublicationTriage } from "@/lib/publication-actions";
import { formatDateTime, searchable } from "@/lib/normalize";
import { suggestedDeadline } from "@/lib/publication-deadline";
import { publicationLinkStatus } from "@/lib/publication-links";
import {
  PUBLICATION_LINK_LABELS,
  PUBLICATION_TRIAGE_LABELS,
  PUBLICATION_TRIAGE_STATUSES,
  type Client,
  type Lawyer,
  type Process,
  type Publication,
  type PublicationSync,
  type PublicationTriageStatus,
  type UserProfile,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { PublicationLinkDialog } from "@/components/shared/publication-link-dialog";
import { TaskDialog, type TaskPrefill } from "@/components/shared/task-dialog";
import {
  EmptyState,
  FilterChip,
  HelpTip,
  PageHeader,
  SearchBox,
  Toolbar,
} from "@/components/shared/page-shell";

/**
 * Destaque da linha pelo estado do vínculo: amarelo claro pede providência
 * (nenhum processo do sistema reconhece esta publicação) e cinza claro marca o
 * processo particular de um advogado, que não é da sociedade.
 */
const LINK_ROW_CLASSES: Record<string, string> = {
  pendente: "bg-amber-50/80 hover:bg-amber-50",
  particular: "bg-slate-100/70 hover:bg-slate-100",
  vinculada: "",
};

const TRIAGE_CHIP_CLASSES: Record<PublicationTriageStatus, string> = {
  nova: "bg-amber-100 text-amber-800",
  em_analise: "bg-sky-100 text-sky-800",
  tratada: "bg-emerald-100 text-emerald-800",
  sem_providencia: "bg-slate-100 text-slate-700",
};

export default function PublicacoesPage() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();

  const { data: publications } = useCollection<Publication>(
    "publications",
    { orderBy: [["disponibilizacaoDate", "desc"]], limit: 500 }
  );
  const { data: lawyers } = useCollection<Lawyer>("lawyers");
  const { data: syncs } = useCollection<PublicationSync>(
    "publicationSyncs",
    { orderBy: [["finishedAt", "desc"]], limit: 1 }
  );
  const { data: processes } = useCollection<Process>("processes");
  const { data: clients } = useCollection<Client>("clients");
  const { data: users } = useCollection<UserProfile>("users");

  const [triageFilter, setTriageFilter] = useState<PublicationTriageStatus | "todas">("nova");
  const [lawyerFilter, setLawyerFilter] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [aberta, setAberta] = useState<Publication | null>(null);
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [aExcluir, setAExcluir] = useState<Publication | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [linkFilter, setLinkFilter] = useState<"todos" | "pendente" | "vinculada" | "particular">("todos");
  const [aVincular, setAVincular] = useState<Publication | null>(null);
  const [taskPrefill, setTaskPrefill] = useState<TaskPrefill | null>(null);
  const [prazoDias, setPrazoDias] = useState("15");

  const ultimaSync = syncs?.[0] ?? null;
  const monitorados = (lawyers ?? []).filter((lawyer) => !lawyer.deleted && lawyer.monitored);

  const lista = useMemo(() => {
    const termo = searchable(search);
    return (publications ?? [])
      .filter((publicacao) => (showDeleted ? publicacao.deleted : !publicacao.deleted))
      .filter((publicacao) =>
        triageFilter === "todas" ? true : publicacao.triageStatus === triageFilter
      )
      .filter((publicacao) =>
        lawyerFilter === "todos" ? true : (publicacao.lawyerIds ?? []).includes(lawyerFilter)
      )
      .filter((publicacao) =>
        linkFilter === "todos" ? true : publicationLinkStatus(publicacao) === linkFilter
      )
      .filter((publicacao) => {
        if (!termo) return true;
        const alvo = searchable(
          [
            publicacao.numeroProcessoMascara,
            publicacao.numeroProcessoDigits,
            publicacao.orgao,
            publicacao.tribunal,
            publicacao.tipoComunicacao,
            publicacao.nomeClasse,
            (publicacao.lawyerNames ?? []).join(" "),
            (publicacao.destinatarios ?? []).join(" "),
            publicacao.textoPlain,
          ].join(" ")
        );
        return alvo.includes(termo);
      });
  }, [publications, showDeleted, triageFilter, lawyerFilter, linkFilter, search]);

  const contagemPorTriagem = useMemo(() => {
    const contagem: Record<string, number> = { todas: 0 };
    for (const status of PUBLICATION_TRIAGE_STATUSES) contagem[status] = 0;
    for (const publicacao of publications ?? []) {
      if (publicacao.deleted) continue;
      contagem.todas++;
      contagem[publicacao.triageStatus] = (contagem[publicacao.triageStatus] ?? 0) + 1;
    }
    return contagem;
  }, [publications]);

  const contagemPorVinculo = useMemo(() => {
    const contagem: Record<string, number> = { pendente: 0, vinculada: 0, particular: 0 };
    for (const publicacao of publications ?? []) {
      if (publicacao.deleted) continue;
      contagem[publicationLinkStatus(publicacao)] = (contagem[publicationLinkStatus(publicacao)] ?? 0) + 1;
    }
    return contagem;
  }, [publications]);

  const excluidas = (publications ?? []).filter((publicacao) => publicacao.deleted).length;

  const buscarAgora = async () => {
    if (!user || !lawyers) return;
    setBuscando(true);
    try {
      const resultado = await syncDjenPublications(lawyers, user, { automatic: false });
      toast({
        title: "Busca concluída",
        description:
          resultado.created > 0
            ? `${resultado.created} nova(s) publicação(ões) em ${resultado.lawyerCount} OAB(s).`
            : `Nenhuma publicação nova em ${resultado.lawyerCount} OAB(s).`,
      });
    } catch (erro) {
      toast({
        variant: "destructive",
        title: "Não foi possível buscar no DJEN",
        description: erro instanceof Error ? erro.message : undefined,
      });
    } finally {
      setBuscando(false);
    }
  };

  const abrir = (publicacao: Publication) => {
    setAberta(publicacao);
    setNota(publicacao.triageNote ?? "");
  };

  const triar = async (status: PublicationTriageStatus) => {
    if (!user || !aberta) return;
    setSalvando(true);
    try {
      await setPublicationTriage(aberta.id, status, user, nota);
      toast({
        title:
          status === aberta.triageStatus
            ? "Observação salva"
            : `Publicação marcada como ${PUBLICATION_TRIAGE_LABELS[status].toLowerCase()}`,
      });
      setAberta(null);
    } catch {
      toast({ variant: "destructive", title: "Erro ao salvar a triagem" });
    } finally {
      setSalvando(false);
    }
  };

  /**
   * Abre a tarefa de prazo já preenchida. A data é sugestão contada em dias
   * úteis — o DJEN não informa feriado forense, então ela chega editável.
   */
  const abrirPrazo = () => {
    if (!aberta?.processId) return;
    const primeiroCliente = (aberta.clientIds ?? [])[0];
    setTaskPrefill({
      description: `Prazo — ${aberta.tipoComunicacao ?? "publicação"} de ${formatDisponibilizacao(
        aberta.disponibilizacaoDate
      )}${aberta.orgao ? ` (${aberta.orgao})` : ""}`,
      processId: aberta.processId,
      processNumber: aberta.processNumber ?? undefined,
      clientId: primeiroCliente,
      clientName: (aberta.clientNames ?? [])[0],
      dueDate: suggestedDeadline(aberta.disponibilizacaoDate, Number(prazoDias)),
    });
    setAberta(null);
  };

  const excluir = async (publicacao: Publication) => {
    if (!user) return;
    setExcluindo(true);
    try {
      await setPublicationDeleted(publicacao.id, true, user);
      toast({ title: "Publicação excluída" });
      setAExcluir(null);
      setAberta(null);
    } catch {
      toast({ variant: "destructive", title: "Erro ao excluir" });
    } finally {
      setExcluindo(false);
    }
  };

  const restaurar = async (publicacao: Publication) => {
    if (!user) return;
    try {
      await setPublicationDeleted(publicacao.id, false, user);
      toast({ title: "Publicação restaurada" });
      setShowDeleted(false);
    } catch {
      toast({ variant: "destructive", title: "Erro ao restaurar" });
    }
  };

  if (!publications || !lawyers || !processes || !clients) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="publicações"
        title="Publicações"
        description={
          <>
            Intimações e citações das OABs do escritório no Diário de Justiça Eletrônico
            Nacional. A cada busca o sistema reconsulta os últimos {SYNC_WINDOW_DAYS} dias, para
            não perder dia sem acesso nem deixar de registrar publicação cancelada pelo tribunal.
          </>
        }
      >
        <HelpTip label={`Consulta agora o DJEN das ${monitorados.length} OAB(s) monitorada(s).`}>
          <Button onClick={buscarAgora} disabled={buscando || monitorados.length === 0}>
            {buscando ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            Buscar agora
          </Button>
        </HelpTip>
      </PageHeader>

      {monitorados.length === 0 && (
        <EmptyState
          title="Nenhuma OAB monitorada"
          description="Cadastre os advogados do escritório para o sistema buscar as publicações deles."
        >
          {isAdmin && (
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/settings/lawyers">Cadastrar advogados</Link>
            </Button>
          )}
        </EmptyState>
      )}

      <Toolbar>
        <FilterChip active={triageFilter === "todas"} onClick={() => setTriageFilter("todas")}>
          Todas ({contagemPorTriagem.todas})
        </FilterChip>
        {PUBLICATION_TRIAGE_STATUSES.map((status) => (
          <FilterChip
            key={status}
            active={triageFilter === status}
            onClick={() => setTriageFilter(status)}
          >
            {PUBLICATION_TRIAGE_LABELS[status]} ({contagemPorTriagem[status] ?? 0})
          </FilterChip>
        ))}
        {isAdmin && excluidas > 0 && (
          <FilterChip active={showDeleted} onClick={() => setShowDeleted(!showDeleted)}>
            <Trash2 className="size-3" /> {showDeleted ? "Ver ativas" : `Ver excluídas (${excluidas})`}
          </FilterChip>
        )}
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Buscar por processo, parte, órgão ou texto"
          className="ml-auto max-w-xs"
        />
      </Toolbar>

      <Toolbar>
        <span className="text-xs text-muted-foreground">Vínculo:</span>
        <FilterChip active={linkFilter === "todos"} onClick={() => setLinkFilter("todos")}>
          Todos
        </FilterChip>
        <HelpTip label="Publicações cujo processo ainda não existe no sistema, ou ainda não foi confirmado. São as de fundo amarelo.">
          <FilterChip active={linkFilter === "pendente"} onClick={() => setLinkFilter("pendente")}>
            Sem vínculo ({contagemPorVinculo.pendente ?? 0})
          </FilterChip>
        </HelpTip>
        <FilterChip active={linkFilter === "vinculada"} onClick={() => setLinkFilter("vinculada")}>
          Vinculadas ({contagemPorVinculo.vinculada ?? 0})
        </FilterChip>
        <HelpTip label="Processos pessoais dos advogados, fora da sociedade. São as de fundo cinza.">
          <FilterChip active={linkFilter === "particular"} onClick={() => setLinkFilter("particular")}>
            Particulares ({contagemPorVinculo.particular ?? 0})
          </FilterChip>
        </HelpTip>
      </Toolbar>

      {monitorados.length > 1 && (
        <Toolbar>
          <span className="text-xs text-muted-foreground">Advogado:</span>
          <FilterChip active={lawyerFilter === "todos"} onClick={() => setLawyerFilter("todos")}>
            Todos
          </FilterChip>
          {monitorados.map((lawyer) => (
            <FilterChip
              key={lawyer.id}
              active={lawyerFilter === lawyer.id}
              onClick={() => setLawyerFilter(lawyer.id)}
              title={`OAB ${lawyer.oabUf} ${lawyer.oabNumber}`}
            >
              {lawyer.name}
            </FilterChip>
          ))}
        </Toolbar>
      )}

      {lista.length === 0 ? (
        <EmptyState
          title="Nenhuma publicação nesta lista"
          description={
            search
              ? "Nenhum resultado para esta busca."
              : "Quando o diário divulgar uma comunicação das OABs monitoradas, ela aparece aqui."
          }
        />
      ) : (
        <div className="work-table">
          <Table className="column-dividers table-fixed">
            <TableHeader>
              <TableRow className="ledger-header">
                <TableHead className="w-24">
                  <HelpTip label="Data em que o tribunal disponibilizou a comunicação no diário.">
                    <span className="cursor-help underline decoration-dotted underline-offset-2">
                      Divulgação
                    </span>
                  </HelpTip>
                </TableHead>
                <TableHead className="w-[190px]">Processo</TableHead>
                <TableHead className="hidden w-24 md:table-cell">Tribunal</TableHead>
                <TableHead className="hidden w-28 lg:table-cell">Tipo</TableHead>
                <TableHead>Órgão</TableHead>
                <TableHead className="hidden w-36 xl:table-cell">Vínculo</TableHead>
                <TableHead className="w-32">Situação</TableHead>
                <TableHead className="w-10 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((publicacao) => (
                <TableRow key={publicacao.id} className={LINK_ROW_CLASSES[publicationLinkStatus(publicacao)]}>
                  <TableCell className="truncate text-[13px]">
                    {formatDisponibilizacao(publicacao.disponibilizacaoDate)}
                  </TableCell>
                  <TableCell className="truncate font-code text-[13px]">
                    <button
                      type="button"
                      onClick={() => abrir(publicacao)}
                      className="block w-full truncate text-left text-primary underline-offset-2 hover:underline"
                      title="Abrir o inteiro teor da publicação"
                    >
                      {publicacao.numeroProcessoMascara || "sem número"}
                    </button>
                  </TableCell>
                  <TableCell className="hidden truncate text-[13px] md:table-cell">
                    {publicacao.tribunal || "—"}
                  </TableCell>
                  <TableCell
                    className="hidden truncate text-[13px] lg:table-cell"
                    title={publicacao.tipoComunicacao}
                  >
                    {publicacao.tipoComunicacao || "—"}
                  </TableCell>
                  <TableCell className="truncate text-[13px]" title={publicacao.orgao}>
                    {publicacao.orgao || "—"}
                  </TableCell>
                  <TableCell
                    className="hidden truncate text-[13px] xl:table-cell"
                    title={
                      publicationLinkStatus(publicacao) === "particular"
                        ? `Particular de ${publicacao.privateOwnerName ?? ""}`
                        : publicacao.processNumber ?? "Sem processo no sistema"
                    }
                  >
                    {publicationLinkStatus(publicacao) === "vinculada"
                      ? (publicacao.clientNames ?? []).join(", ") || publicacao.processNumber
                      : publicationLinkStatus(publicacao) === "particular"
                        ? publicacao.privateOwnerName ?? "Particular"
                        : "—"}
                  </TableCell>
                  <TableCell className="text-[13px]">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${TRIAGE_CHIP_CLASSES[publicacao.triageStatus]}`}
                    >
                      {PUBLICATION_TRIAGE_LABELS[publicacao.triageStatus]}
                    </span>
                    {publicacao.cancelada && (
                      <span className="ml-1 rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-800">
                        Cancelada
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {showDeleted ? (
                      <HelpTip label="Restaura esta publicação para a lista ativa." side="left">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => restaurar(publicacao)}
                        >
                          <ArchiveRestore className="size-3.5" />
                        </Button>
                      </HelpTip>
                    ) : (
                      <HelpTip label="Exclui esta publicação da lista." side="left">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive"
                          onClick={() => setAExcluir(publicacao)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </HelpTip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {ultimaSync
          ? `Última busca em ${formatDateTime(ultimaSync.finishedAt)} por ${ultimaSync.runBy ?? "sistema"} — ${
              ultimaSync.status === "ok"
                ? `${ultimaSync.created} nova(s), ${ultimaSync.updated} atualizada(s)`
                : `falhou: ${ultimaSync.error ?? "erro desconhecido"}`
            }.`
          : "Nenhuma busca registrada ainda."}
      </p>

      <Dialog open={!!aberta} onOpenChange={(open) => !open && setAberta(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          {aberta && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">
                  {aberta.tipoComunicacao || "Publicação"} — {aberta.numeroProcessoMascara || "sem número"}
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-3">
                <Campo rotulo="Divulgação" valor={formatDisponibilizacao(aberta.disponibilizacaoDate)} />
                <Campo rotulo="Tribunal" valor={aberta.tribunal} />
                <Campo rotulo="Órgão" valor={aberta.orgao} />
                <Campo rotulo="Classe" valor={aberta.nomeClasse} />
                <Campo rotulo="Documento" valor={aberta.tipoDocumento} />
                <Campo rotulo="Advogado" valor={(aberta.lawyerNames ?? []).join(", ")} />
                <Campo
                  rotulo="Destinatários"
                  valor={(aberta.destinatarios ?? []).join(", ")}
                  className="col-span-2 sm:col-span-3"
                />
              </div>

              {aberta.cancelada && (
                <p className="rounded border border-rose-200 bg-rose-50 p-2 text-[13px] text-rose-800">
                  O tribunal cancelou esta comunicação
                  {aberta.dataCancelamento ? ` em ${formatDisponibilizacao(aberta.dataCancelamento)}` : ""}
                  {aberta.motivoCancelamento ? `: ${aberta.motivoCancelamento}` : "."}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 rounded border p-2 text-[13px]">
                {publicationLinkStatus(aberta) === "vinculada" ? (
                  <span className="min-w-0 flex-1">
                    Vinculada ao processo{" "}
                    <Link
                      href={`/dashboard/processes/${aberta.processId}`}
                      className="font-code text-primary underline-offset-2 hover:underline"
                    >
                      {aberta.processNumber}
                    </Link>
                    {(aberta.clientNames ?? []).length > 0 && ` — ${(aberta.clientNames ?? []).join(", ")}`}
                  </span>
                ) : publicationLinkStatus(aberta) === "particular" ? (
                  <span className="min-w-0 flex-1">
                    Processo particular de <strong>{aberta.privateOwnerName}</strong>.
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 text-amber-800">
                    Nenhum processo do sistema com este número.
                  </span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAVincular(aberta);
                    setAberta(null);
                  }}
                >
                  <Link2 className="mr-2 size-3.5" />
                  {publicationLinkStatus(aberta) === "pendente" ? "Vincular" : "Alterar vínculo"}
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {aberta.processId && (
                  <>
                    <Select value={prazoDias} onValueChange={setPrazoDias}>
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5 dias úteis</SelectItem>
                        <SelectItem value="10">10 dias úteis</SelectItem>
                        <SelectItem value="15">15 dias úteis</SelectItem>
                        <SelectItem value="30">30 dias úteis</SelectItem>
                      </SelectContent>
                    </Select>
                    <HelpTip label="Cria a tarefa deste processo com a data sugerida a partir da publicação. A contagem não considera feriado forense — confira antes de salvar.">
                      <Button size="sm" onClick={abrirPrazo}>
                        <AlarmClock className="mr-2 size-3.5" /> Prazo
                      </Button>
                    </HelpTip>
                  </>
                )}
                {aberta.linkInteiroTeor && (
                  <Button asChild variant="outline" size="sm">
                    <a href={aberta.linkInteiroTeor} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 size-3.5" /> Abrir no tribunal
                    </a>
                  </Button>
                )}
                {aberta.certidaoUrl && (
                  <HelpTip label="Baixa a certidão oficial da publicação, em PDF, gerada pelo CNJ.">
                    <Button asChild variant="outline" size="sm">
                      <a href={aberta.certidaoUrl} target="_blank" rel="noopener noreferrer">
                        <FileBadge className="mr-2 size-3.5" /> Certidão da publicação
                      </a>
                    </Button>
                  </HelpTip>
                )}
              </div>

              <div
                className="max-h-72 overflow-y-auto rounded border bg-muted/20 p-3 text-[13px] leading-relaxed [&_table]:w-full [&_td]:align-top [&_td]:pr-2"
                // Conteúdo externo: passa pelo saneador antes de chegar ao DOM.
                dangerouslySetInnerHTML={{ __html: sanitizePublicationHtml(aberta.textoHtml) }}
              />

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="triage-note">
                  Observação da triagem
                </label>
                <Textarea
                  id="triage-note"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  rows={2}
                  placeholder="O que foi feito ou precisa ser feito com esta publicação."
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {nota.trim() !== (aberta.triageNote ?? "").trim() && (
                  <HelpTip label="Guarda a observação sem mudar a situação da triagem.">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={salvando}
                      onClick={() => triar(aberta.triageStatus)}
                    >
                      {salvando && <Loader2 className="mr-2 size-3.5 animate-spin" />}
                      Salvar observação
                    </Button>
                  </HelpTip>
                )}
                {PUBLICATION_TRIAGE_STATUSES.filter((status) => status !== aberta.triageStatus).map(
                  (status) => (
                    <Button
                      key={status}
                      variant={status === "tratada" ? "default" : "outline"}
                      size="sm"
                      disabled={salvando}
                      onClick={() => triar(status)}
                    >
                      {salvando && <Loader2 className="mr-2 size-3.5 animate-spin" />}
                      Marcar como {PUBLICATION_TRIAGE_LABELS[status].toLowerCase()}
                    </Button>
                  )
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {user && (
        <PublicationLinkDialog
          publication={aVincular}
          clients={clients}
          processes={processes}
          users={users ?? []}
          user={user}
          open={!!aVincular}
          onOpenChange={(aberto) => !aberto && setAVincular(null)}
        />
      )}

      <TaskDialog
        prefill={taskPrefill}
        open={!!taskPrefill}
        onOpenChange={(aberto) => !aberto && setTaskPrefill(null)}
      />

      <ConfirmDeleteDialog
        open={!!aExcluir}
        onOpenChange={(open) => !open && setAExcluir(null)}
        title="Excluir publicação?"
        description="Deseja excluir esta publicação?"
        onConfirm={() => {
          if (aExcluir) return excluir(aExcluir);
        }}
        loading={excluindo}
      />
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  className,
}: {
  rotulo: string;
  valor?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      <p className="truncate" title={valor}>
        {valor || "—"}
      </p>
    </div>
  );
}
