"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlarmClock,
  ArchiveRestore,
  Building2,
  CheckSquare,
  ExternalLink,
  FileBadge,
  FilterX,
  Link2,
  Loader2,
  RefreshCw,
  Scale,
  Trash2,
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { formatDisponibilizacao, sanitizePublicationHtml } from "@/lib/djen";
import {
  activeMonitors,
  isoDaysAgo,
  monitorCount,
  syncDjenPublications,
  SYNC_WINDOW_DAYS,
} from "@/lib/djen-sync";
import {
  createTaskFromPublication,
  setPublicationClassification,
  setPublicationDeleted,
  setPublicationTriage,
} from "@/lib/publication-actions";
import { formatDateTime, searchable } from "@/lib/normalize";
import { suggestedDeadline } from "@/lib/publication-deadline";
import {
  donoParticular,
  estadoVinculo,
  publicationLinkStatus,
  type Contexto,
} from "@/lib/publication-links";
import { PRIVATE_ROW_CLASS, privateOwnerLabel } from "@/lib/private-cases";
import {
  PUBLICATION_LINK_LABELS,
  PUBLICATION_CLASSIFICATION_LABELS,
  PUBLICATION_CLASSIFICATIONS,
  PUBLICATION_TRIAGE_LABELS,
  PUBLICATION_TRIAGE_STATUSES,
  type Client,
  type Lawyer,
  type MonitoredParty,
  type Process,
  type Publication,
  type PublicationClassification,
  type PublicationLinkStatus,
  type PublicationSync,
  type PublicationTriageStatus,
  type UserProfile,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
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

const TRIAGE_CHIP_CLASSES: Record<PublicationTriageStatus, string> = {
  nova: "bg-amber-100 text-amber-800",
  em_analise: "bg-sky-100 text-sky-800",
  tratada: "bg-emerald-100 text-emerald-800",
  sem_providencia: "bg-slate-100 text-slate-700",
};

/**
 * Destaque da linha: amarelo claro pede providência (nenhum processo do sistema
 * reconhece esta publicação) e cinza claro marca caso particular.
 */
function linhaClasse(publicacao: Publication, contexto: Contexto): string {
  const estado = estadoVinculo(publicacao, contexto);
  if (estado === "particular") return PRIVATE_ROW_CLASS;
  if (estado === "pendente") return "bg-amber-50/80 hover:bg-amber-50";
  return "";
}

/** Períodos oferecidos na tela; "tudo" abre mão do recorte por data. */
const PERIODOS = [
  { valor: "7", rotulo: "Últimos 7 dias" },
  { valor: "30", rotulo: "Últimos 30 dias" },
  { valor: "90", rotulo: "Últimos 90 dias" },
  { valor: "tudo", rotulo: "Todo o período" },
] as const;
type Periodo = (typeof PERIODOS)[number]["valor"];

/** Teto de documentos lidos por vez; "Tudo" precisa de mais folga. */
const LIMITE_PADRAO = 500;
const LIMITE_TUDO = 1500;

type Filtros = {
  triage: PublicationTriageStatus | "todas";
  /** "todos", "pendente", "vinculada", "particular" ou `particular:{userId}`. */
  link: string;
  /** "todos", `lawyer:{id}` ou `party:{id}`. */
  monitor: string;
  search: string;
  showDeleted: boolean;
};

const FILTROS_LIMPOS: Filtros = {
  triage: "todas",
  link: "todos",
  monitor: "todos",
  search: "",
  showDeleted: false,
};

function monitorCombina(publicacao: Publication, monitor: string): boolean {
  if (monitor === "todos") return true;
  const [tipo, id] = monitor.split(":");
  if (tipo === "lawyer") return (publicacao.lawyerIds ?? []).includes(id);
  if (tipo === "party") return (publicacao.partyIds ?? []).includes(id);
  return true;
}

function vinculoCombina(publicacao: Publication, filtro: string, contexto: Contexto): boolean {
  if (filtro === "todos") return true;
  const estado = estadoVinculo(publicacao, contexto);
  if (filtro.startsWith("particular:")) {
    return estado === "particular" && donoParticular(publicacao, contexto)?.id === filtro.slice(11);
  }
  return estado === filtro;
}

function textoCombina(publicacao: Publication, termo: string): boolean {
  if (!termo) return true;
  return searchable(
    [
      publicacao.numeroProcessoMascara,
      publicacao.numeroProcessoDigits,
      publicacao.orgao,
      publicacao.tribunal,
      publicacao.tipoComunicacao,
      publicacao.nomeClasse,
      (publicacao.lawyerNames ?? []).join(" "),
      (publicacao.partyNames ?? []).join(" "),
      (publicacao.clientNames ?? []).join(" "),
      (publicacao.destinatarios ?? []).join(" "),
      publicacao.textoPlain,
    ].join(" ")
  ).includes(termo);
}

/**
 * Aplica os filtros, podendo ignorar um deles.
 *
 * Ignorar é o que torna as contagens úteis: o número ao lado de "Sem vínculo"
 * mostra quanto sobraria naquele grupo mantendo os demais filtros, em vez de um
 * total global que não corresponde ao que a pessoa está vendo.
 */
function passaNosFiltros(
  publicacao: Publication,
  filtros: Filtros,
  contexto: Contexto,
  ignorar?: "triage" | "link" | "monitor"
): boolean {
  if (filtros.showDeleted !== !!publicacao.deleted) return false;
  if (ignorar !== "triage" && filtros.triage !== "todas" && publicacao.triageStatus !== filtros.triage) {
    return false;
  }
  if (ignorar !== "link" && !vinculoCombina(publicacao, filtros.link, contexto)) return false;
  if (ignorar !== "monitor" && !monitorCombina(publicacao, filtros.monitor)) return false;
  return textoCombina(publicacao, searchable(filtros.search));
}

export default function PublicacoesPage() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();

  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_LIMPOS);

  // O período vira recorte de verdade na consulta ao Firestore: sem ele, uma
  // base com anos de histórico seria truncada em silêncio pelo limite.
  const inicioPeriodo = useMemo(
    () => (periodo === "tudo" ? "" : isoDaysAgo(Number(periodo))),
    [periodo]
  );
  const limite = periodo === "tudo" ? LIMITE_TUDO : LIMITE_PADRAO;

  const { data: publications } = useCollection<Publication>(
    "publications",
    {
      where: inicioPeriodo ? [["disponibilizacaoDate", ">=", inicioPeriodo]] : undefined,
      orderBy: [["disponibilizacaoDate", "desc"]],
      limit: limite,
    },
    [inicioPeriodo, limite]
  );
  const { data: lawyers } = useCollection<Lawyer>("lawyers");
  const { data: parties } = useCollection<MonitoredParty>("monitoredParties");
  const { data: syncs } = useCollection<PublicationSync>(
    "publicationSyncs",
    { orderBy: [["finishedAt", "desc"]], limit: 1 }
  );
  const { data: processes } = useCollection<Process>("processes");
  const { data: clients } = useCollection<Client>("clients");
  const { data: users } = useCollection<UserProfile>("users");

  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [aExcluir, setAExcluir] = useState<Publication | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [aVincular, setAVincular] = useState<Publication | null>(null);
  const [taskPrefill, setTaskPrefill] = useState<TaskPrefill | null>(null);
  const [taskPublication, setTaskPublication] = useState<Publication | null>(null);
  const [prazoDias, setPrazoDias] = useState("15");

  const ultimaSync = syncs?.[0] ?? null;
  const monitores = useMemo(
    () => activeMonitors(lawyers ?? [], parties ?? []),
    [lawyers, parties]
  );

  const contexto = useMemo<Contexto>(
    () => ({ processoPorId: new Map((processes ?? []).map((p) => [p.id, p])) }),
    [processes]
  );

  const lista = useMemo(
    () => (publications ?? []).filter((publicacao) => passaNosFiltros(publicacao, filtros, contexto)),
    [publications, filtros, contexto]
  );

  // Mantém o painel sincronizado com as gravações em tempo real sem fechá-lo.
  const aberta = useMemo(
    () => (abertaId ? (publications ?? []).find((publicacao) => publicacao.id === abertaId) ?? null : null),
    [abertaId, publications]
  );

  /** Contagens do grupo, calculadas com os demais filtros já aplicados. */
  const contagemPorTriagem = useMemo(() => {
    const contagem: Record<string, number> = { todas: 0 };
    for (const status of PUBLICATION_TRIAGE_STATUSES) contagem[status] = 0;
    for (const publicacao of publications ?? []) {
      if (!passaNosFiltros(publicacao, filtros, contexto, "triage")) continue;
      contagem.todas++;
      contagem[publicacao.triageStatus] = (contagem[publicacao.triageStatus] ?? 0) + 1;
    }
    return contagem;
  }, [publications, filtros, contexto]);

  const contagemPorVinculo = useMemo(() => {
    const contagem: Record<string, number> = { todos: 0, pendente: 0, vinculada: 0, particular: 0 };
    for (const publicacao of publications ?? []) {
      if (!passaNosFiltros(publicacao, filtros, contexto, "link")) continue;
      contagem.todos++;
      const estado = estadoVinculo(publicacao, contexto);
      contagem[estado] = (contagem[estado] ?? 0) + 1;
      if (estado === "particular") {
        const dono = donoParticular(publicacao, contexto);
        if (dono?.id) contagem[`particular:${dono.id}`] = (contagem[`particular:${dono.id}`] ?? 0) + 1;
      }
    }
    return contagem;
  }, [publications, filtros, contexto]);

  const contagemPorMonitor = useMemo(() => {
    const contagem: Record<string, number> = { todos: 0 };
    for (const publicacao of publications ?? []) {
      if (!passaNosFiltros(publicacao, filtros, contexto, "monitor")) continue;
      contagem.todos++;
      for (const id of publicacao.lawyerIds ?? []) {
        contagem[`lawyer:${id}`] = (contagem[`lawyer:${id}`] ?? 0) + 1;
      }
      for (const id of publicacao.partyIds ?? []) {
        contagem[`party:${id}`] = (contagem[`party:${id}`] ?? 0) + 1;
      }
    }
    return contagem;
  }, [publications, filtros, contexto]);

  /** Advogados que aparecem como donos de algum caso particular carregado. */
  const donosParticulares = useMemo(() => {
    const porId = new Map<string, string>();
    for (const publicacao of publications ?? []) {
      if (publicacao.deleted) continue;
      if (estadoVinculo(publicacao, contexto) !== "particular") continue;
      const dono = donoParticular(publicacao, contexto);
      if (dono?.id) porId.set(dono.id, dono.name || "Sem nome");
    }
    return Array.from(porId, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR")
    );
  }, [publications, contexto]);

  const excluidas = (publications ?? []).filter((publicacao) => publicacao.deleted).length;
  const carregadas = (publications ?? []).length;
  const truncada = carregadas >= limite;
  const filtrosAtivos =
    filtros.triage !== "todas" ||
    filtros.link !== "todos" ||
    filtros.monitor !== "todos" ||
    !!filtros.search ||
    filtros.showDeleted;

  const ajustar = (patch: Partial<Filtros>) => setFiltros((atual) => ({ ...atual, ...patch }));

  const buscarAgora = async () => {
    if (!user || !lawyers || !parties) return;
    setBuscando(true);
    try {
      const resultado = await syncDjenPublications(monitores, user, { automatic: false });
      toast({
        title: "Busca concluída",
        description:
          resultado.created > 0
            ? `${resultado.created} nova(s) publicação(ões) em ${resultado.lawyerCount} OAB(s) e ${resultado.partyCount} parte(s).`
            : `Nenhuma publicação nova em ${resultado.lawyerCount} OAB(s) e ${resultado.partyCount} parte(s).`,
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
    setAbertaId(publicacao.id);
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
    } catch {
      toast({ variant: "destructive", title: "Erro ao salvar a triagem" });
    } finally {
      setSalvando(false);
    }
  };

  const classificar = async (classification: PublicationClassification) => {
    if (!user || !aberta) return;
    setSalvando(true);
    try {
      await setPublicationClassification(aberta.id, classification, user);
      toast({
        title: `Publicação classificada como ${PUBLICATION_CLASSIFICATION_LABELS[
          classification
        ].toLowerCase()}`,
      });
    } catch {
      toast({ variant: "destructive", title: "Erro ao salvar a classificação" });
    } finally {
      setSalvando(false);
    }
  };

  const abrirTarefa = (comPrazo: boolean) => {
    if (!aberta?.processId) return;
    const primeiroCliente = (aberta.clientIds ?? [])[0];
    const classificacao = aberta.classification
      ? PUBLICATION_CLASSIFICATION_LABELS[aberta.classification]
      : aberta.tipoComunicacao ?? "Publicação";
    setTaskPublication(aberta);
    setTaskPrefill({
      description: `${comPrazo ? "Prazo" : "Providenciar"} — ${classificacao} de ${formatDisponibilizacao(
        aberta.disponibilizacaoDate
      )}${aberta.orgao ? ` (${aberta.orgao})` : ""}`,
      processId: aberta.processId,
      processNumber: aberta.processNumber ?? undefined,
      clientId: primeiroCliente,
      clientName: (aberta.clientNames ?? [])[0],
      dueDate: comPrazo
        ? suggestedDeadline(aberta.disponibilizacaoDate, Number(prazoDias))
        : undefined,
      taskKind: comPrazo ? "prazo" : undefined,
    });
  };

  /**
   * Abre a tarefa de prazo já preenchida. A data é sugestão contada em dias
   * úteis — o DJEN não informa feriado forense, então ela chega editável.
   */
  const abrirPrazo = () => {
    abrirTarefa(true);
  };

  const excluir = async (publicacao: Publication) => {
    if (!user) return;
    setExcluindo(true);
    try {
      await setPublicationDeleted(publicacao.id, true, user);
      toast({ title: "Publicação excluída" });
      setAExcluir(null);
      setAbertaId(null);
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
      ajustar({ showDeleted: false });
    } catch {
      toast({ variant: "destructive", title: "Erro ao restaurar" });
    }
  };

  if (!publications || !lawyers || !parties || !processes || !clients) {
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
            Intimações e citações do Diário de Justiça Eletrônico Nacional, capturadas pelas OABs
            dos advogados e pelos nomes das partes monitoradas. A cada busca o sistema reconsulta os
            últimos {SYNC_WINDOW_DAYS} dias, para não perder dia sem acesso nem deixar de registrar
            publicação cancelada pelo tribunal.
          </>
        }
      >
        <HelpTip
          label={`Consulta agora o DJEN dos ${monitorCount(monitores)} monitoramentos ativos (${monitores.lawyers.length} OAB e ${monitores.parties.length} parte).`}
        >
          <Button onClick={buscarAgora} disabled={buscando || monitorCount(monitores) === 0}>
            {buscando ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            Buscar agora
          </Button>
        </HelpTip>
      </PageHeader>

      {monitorCount(monitores) === 0 && (
        <EmptyState
          title="Nenhum monitoramento ativo"
          description="Cadastre as OABs dos advogados e os nomes das partes que o escritório acompanha."
        >
          {isAdmin && (
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/settings/monitoramento">Abrir monitoramento</Link>
            </Button>
          )}
        </EmptyState>
      )}
      <Toolbar>
        <SearchBox
          value={filtros.search}
          onChange={(valor) => ajustar({ search: valor })}
          placeholder="Buscar por processo, parte, órgão ou texto"
          className="max-w-xs"
        />

        <FiltroSelect
          rotulo="Período"
          valor={periodo}
          onChange={(valor) => setPeriodo(valor as Periodo)}
          largura="w-40"
        >
          {PERIODOS.map((opcao) => (
            <SelectItem key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </SelectItem>
          ))}
        </FiltroSelect>

        <FiltroSelect
          rotulo="Situação"
          valor={filtros.triage}
          onChange={(valor) => ajustar({ triage: valor as Filtros["triage"] })}
          largura="w-44"
        >
          <SelectItem value="todas">Todas ({contagemPorTriagem.todas})</SelectItem>
          {PUBLICATION_TRIAGE_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {PUBLICATION_TRIAGE_LABELS[status]} ({contagemPorTriagem[status] ?? 0})
            </SelectItem>
          ))}
        </FiltroSelect>

        <FiltroSelect
          rotulo="Vínculo"
          valor={filtros.link}
          onChange={(valor) => ajustar({ link: valor })}
          largura="w-52"
          ajuda="Sem vínculo: nenhum processo do sistema reconhece a publicação (fundo amarelo). Particular: caso pessoal de um advogado (fundo cinza)."
        >
          <SelectItem value="todos">Todos ({contagemPorVinculo.todos ?? 0})</SelectItem>
          <SelectItem value="pendente">
            {PUBLICATION_LINK_LABELS.pendente} ({contagemPorVinculo.pendente ?? 0})
          </SelectItem>
          <SelectItem value="vinculada">
            {PUBLICATION_LINK_LABELS.vinculada}s ({contagemPorVinculo.vinculada ?? 0})
          </SelectItem>
          <SelectItem value="particular">
            {PUBLICATION_LINK_LABELS.particular}es ({contagemPorVinculo.particular ?? 0})
          </SelectItem>
          {donosParticulares.length > 0 && (
            <SelectGroup>
              <SelectSeparator />
              <SelectLabel>Particular de</SelectLabel>
              {donosParticulares.map((dono) => (
                <SelectItem key={dono.id} value={`particular:${dono.id}`}>
                  {dono.name} ({contagemPorVinculo[`particular:${dono.id}`] ?? 0})
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </FiltroSelect>

        {monitorCount(monitores) > 1 && (
          <FiltroSelect
            rotulo="Em nome de"
            valor={filtros.monitor}
            onChange={(valor) => ajustar({ monitor: valor })}
            largura="w-56"
            ajuda="Nome pelo qual a publicação foi encontrada no diário: a inscrição do advogado ou a parte monitorada."
          >
            <SelectItem value="todos">Todos ({contagemPorMonitor.todos ?? 0})</SelectItem>
            {monitores.lawyers.length > 0 && (
              <SelectGroup>
                <SelectLabel>Advogados</SelectLabel>
                {monitores.lawyers.map((lawyer) => (
                  <SelectItem key={lawyer.id} value={`lawyer:${lawyer.id}`}>
                    {lawyer.name} ({contagemPorMonitor[`lawyer:${lawyer.id}`] ?? 0})
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {monitores.parties.length > 0 && (
              <SelectGroup>
                <SelectLabel>Partes</SelectLabel>
                {monitores.parties.map((party) => (
                  <SelectItem key={party.id} value={`party:${party.id}`}>
                    {party.name} ({contagemPorMonitor[`party:${party.id}`] ?? 0})
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </FiltroSelect>
        )}

        {isAdmin && excluidas > 0 && (
          <FiltroSelect
            rotulo="Exibir"
            valor={filtros.showDeleted ? "excluidas" : "ativas"}
            onChange={(valor) => ajustar({ showDeleted: valor === "excluidas" })}
            largura="w-36"
          >
            <SelectItem value="ativas">Ativas</SelectItem>
            <SelectItem value="excluidas">Excluídas ({excluidas})</SelectItem>
          </FiltroSelect>
        )}

        {filtrosAtivos && (
          <HelpTip label="Volta os filtros ao padrão, mantendo o período escolhido.">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setFiltros(FILTROS_LIMPOS)}
            >
              <FilterX className="mr-1.5 size-3.5" /> Limpar filtros
            </Button>
          </HelpTip>
        )}

        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {lista.length === carregadas
            ? `${lista.length} publicação(ões)`
            : `${lista.length} de ${carregadas}`}
        </span>
      </Toolbar>

      {truncada && (
        <p className="text-xs text-amber-800">
          Mostrando as {carregadas} publicações mais recentes deste período. Estreite o período ou
          use a busca para alcançar o restante.
        </p>
      )}

      {lista.length === 0 ? (
        <EmptyState
          title="Nenhuma publicação nesta lista"
          description={
            filtros.search
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
                <TableHead className="hidden w-36 lg:table-cell">Classificação</TableHead>
                <TableHead>Órgão</TableHead>
                <TableHead className="hidden w-36 xl:table-cell">Vínculo</TableHead>
                <TableHead className="w-32">Situação</TableHead>
                <TableHead className="w-10 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((publicacao) => (
                <TableRow
                  key={publicacao.id}
                  className={`${linhaClasse(publicacao, contexto)} cursor-pointer`}
                  role="button"
                  tabIndex={0}
                  title="Abrir a publicação no painel lateral"
                  onClick={() => abrir(publicacao)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      abrir(publicacao);
                    }
                  }}
                >
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
                    title={
                      publicacao.classification
                        ? `${PUBLICATION_CLASSIFICATION_LABELS[publicacao.classification]} — tribunal: ${publicacao.tipoComunicacao || "não informado"}`
                        : "Ainda não classificada pela equipe"
                    }
                  >
                    {publicacao.classification
                      ? PUBLICATION_CLASSIFICATION_LABELS[publicacao.classification]
                      : "—"}
                  </TableCell>
                  <TableCell className="truncate text-[13px]" title={publicacao.orgao}>
                    {publicacao.orgao || "—"}
                  </TableCell>
                  <TableCell
                    className="hidden truncate text-[13px] xl:table-cell"
                    title={
                      estadoVinculo(publicacao, contexto) === "particular"
                        ? `Processo particular de ${donoParticular(publicacao, contexto)?.name ?? "um advogado"}`
                        : publicacao.processNumber ?? "Sem processo no sistema"
                    }
                  >
                    {estadoVinculo(publicacao, contexto) === "particular"
                      ? privateOwnerLabel({
                          ownerUserName: donoParticular(publicacao, contexto)?.name,
                        })
                      : publicationLinkStatus(publicacao) === "vinculada"
                        ? (publicacao.clientNames ?? []).join(", ") || publicacao.processNumber
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
                    {filtros.showDeleted ? (
                      <HelpTip label="Restaura esta publicação para a lista ativa." side="left">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={(event) => {
                            event.stopPropagation();
                            restaurar(publicacao);
                          }}
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
                          onClick={(event) => {
                            event.stopPropagation();
                            setAExcluir(publicacao);
                          }}
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

      <Sheet open={!!aberta} onOpenChange={(open) => !open && setAbertaId(null)}>
        <SheetContent className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          {aberta && (
            <>
              <div className="shrink-0 border-b bg-background shadow-sm">
                <SheetHeader className="px-4 py-3 pr-12">
                  <SheetTitle className="truncate text-base">
                    {aberta.tipoComunicacao || "Publicação"} — {aberta.numeroProcessoMascara || "sem número"}
                  </SheetTitle>
                  <SheetDescription className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span>{formatDisponibilizacao(aberta.disponibilizacaoDate)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{aberta.tribunal || "Tribunal não informado"}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 ${TRIAGE_CHIP_CLASSES[aberta.triageStatus]}`}
                    >
                      {PUBLICATION_TRIAGE_LABELS[aberta.triageStatus]}
                    </span>
                  </SheetDescription>
                </SheetHeader>

                <div className="max-h-[55vh] space-y-2.5 overflow-y-auto border-t bg-muted/10 px-4 py-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground" htmlFor="publication-classification">
                        Classificação
                      </label>
                      <Select
                        value={aberta.classification}
                        onValueChange={(value) => classificar(value as PublicationClassification)}
                        disabled={salvando}
                      >
                        <SelectTrigger id="publication-classification" className="h-8">
                          <SelectValue placeholder="Escolher o tipo da publicação" />
                        </SelectTrigger>
                        <SelectContent>
                          {PUBLICATION_CLASSIFICATIONS.map((classification) => (
                            <SelectItem key={classification} value={classification}>
                              {PUBLICATION_CLASSIFICATION_LABELS[classification]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(["em_analise", "sem_providencia"] as const).map((status) => (
                        <Button
                          key={status}
                          variant={aberta.triageStatus === status ? "secondary" : "outline"}
                          size="sm"
                          className="h-8"
                          disabled={salvando || aberta.triageStatus === status}
                          onClick={() => triar(status)}
                          title={`Marcar como ${PUBLICATION_TRIAGE_LABELS[status].toLowerCase()}`}
                        >
                          {PUBLICATION_TRIAGE_LABELS[status]}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 rounded border bg-background p-2 text-[13px]">
                    {publicationLinkStatus(aberta) === "vinculada" ? (
                      <span className="min-w-0 flex-1">
                        Processo{" "}
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
                        Processo particular de <span className="font-medium">{aberta.privateOwnerName}</span>.
                      </span>
                    ) : (
                      <span className="min-w-0 flex-1 text-amber-800">
                        Vincule um processo para criar tarefa ou prazo.
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => {
                        setAVincular(aberta);
                        setAbertaId(null);
                      }}
                      title={publicationLinkStatus(aberta) === "pendente" ? "Vincular a um processo" : "Alterar o vínculo atual"}
                    >
                      <Link2 className="mr-1.5 size-3.5" />
                      {publicationLinkStatus(aberta) === "pendente" ? "Vincular" : "Alterar vínculo"}
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <HelpTip
                      label={
                        aberta.processId
                          ? "Cria uma tarefa vinculada a este processo e marca a publicação como tratada."
                          : "Vincule a publicação a um processo antes de criar a tarefa."
                      }
                    >
                      <Button
                        size="sm"
                        className="h-8"
                        disabled={!aberta.processId}
                        onClick={() => abrirTarefa(false)}
                      >
                        <CheckSquare className="mr-1.5 size-3.5" /> Criar tarefa
                      </Button>
                    </HelpTip>
                    <Select value={prazoDias} onValueChange={setPrazoDias} disabled={!aberta.processId}>
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
                    <HelpTip label="Cria a tarefa com a data sugerida. A contagem não considera feriado forense — confira antes de salvar.">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={!aberta.processId}
                        onClick={abrirPrazo}
                      >
                        <AlarmClock className="mr-1.5 size-3.5" /> Prazo
                      </Button>
                    </HelpTip>
                    {aberta.linkInteiroTeor && (
                      <Button asChild variant="outline" size="sm" className="h-8">
                        <a href={aberta.linkInteiroTeor} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-1.5 size-3.5" /> Tribunal
                        </a>
                      </Button>
                    )}
                    {aberta.certidaoUrl && (
                      <HelpTip label="Abre a certidão oficial em PDF gerada pelo CNJ.">
                        <Button asChild variant="outline" size="sm" className="h-8">
                          <a href={aberta.certidaoUrl} target="_blank" rel="noopener noreferrer">
                            <FileBadge className="mr-1.5 size-3.5" /> Certidão
                          </a>
                        </Button>
                      </HelpTip>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs text-muted-foreground" htmlFor="triage-note">
                        Observação da triagem
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={salvando || nota.trim() === (aberta.triageNote ?? "").trim()}
                        onClick={() => triar(aberta.triageStatus)}
                        title="Salvar a observação sem mudar a situação"
                      >
                        {salvando && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                        Salvar observação
                      </Button>
                    </div>
                    <Textarea
                      id="triage-note"
                      value={nota}
                      onChange={(event) => setNota(event.target.value)}
                      rows={2}
                      className="mt-1 min-h-14 resize-none text-[13px]"
                      placeholder="O que foi feito ou precisa ser feito."
                    />
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-3">
                  <Campo rotulo="Divulgação" valor={formatDisponibilizacao(aberta.disponibilizacaoDate)} />
                  <Campo rotulo="Tribunal" valor={aberta.tribunal} />
                  <Campo rotulo="Órgão" valor={aberta.orgao} />
                  <Campo rotulo="Classe" valor={aberta.nomeClasse} />
                  <Campo rotulo="Documento" valor={aberta.tipoDocumento} />
                  <Campo
                    rotulo="Monitorado por"
                    valor={[...(aberta.lawyerNames ?? []), ...(aberta.partyNames ?? [])].join(", ")}
                  />
                  <Campo
                    rotulo="Destinatários"
                    valor={(aberta.destinatarios ?? []).join(", ")}
                    className="col-span-2 sm:col-span-3"
                  />
                </div>

                {aberta.cancelada && (
                  <p className="mb-3 rounded border border-rose-200 bg-rose-50 p-2 text-[13px] text-rose-800">
                    O tribunal cancelou esta comunicação
                    {aberta.dataCancelamento ? ` em ${formatDisponibilizacao(aberta.dataCancelamento)}` : ""}
                    {aberta.motivoCancelamento ? `: ${aberta.motivoCancelamento}` : "."}
                  </p>
                )}

                <div
                  className="break-words rounded border bg-muted/20 p-3 text-[13px] leading-relaxed [overflow-wrap:anywhere] [&_table]:table-fixed [&_table]:w-full [&_td]:align-top [&_td]:pr-2"
                  // Conteúdo externo: passa pelo saneador antes de chegar ao DOM.
                  dangerouslySetInnerHTML={{ __html: sanitizePublicationHtml(aberta.textoHtml) }}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

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
        createAction={
          taskPublication
            ? (data, author) => createTaskFromPublication(taskPublication, data, author)
            : undefined
        }
        onOpenChange={(aberto) => {
          if (!aberto) {
            setTaskPrefill(null);
            setTaskPublication(null);
          }
        }}
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

/** Rótulo curto + seletor, para a barra de filtros caber numa linha só. */
function FiltroSelect({
  rotulo,
  valor,
  onChange,
  largura,
  ajuda,
  children,
}: {
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  largura: string;
  ajuda?: string;
  children: React.ReactNode;
}) {
  const gatilho = (
    <SelectTrigger className={`h-8 ${largura}`}>
      <SelectValue />
    </SelectTrigger>
  );
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{rotulo}</span>
      <Select value={valor} onValueChange={onChange}>
        {ajuda ? <HelpTip label={ajuda}>{gatilho}</HelpTip> : gatilho}
        <SelectContent>{children}</SelectContent>
      </Select>
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
