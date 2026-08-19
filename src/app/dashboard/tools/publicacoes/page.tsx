"use client";

import { useRef, useState } from "react";
import { History, Loader2, ShieldAlert, Square } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { isToolsOwner } from "@/lib/constants";
import {
  activeMonitors,
  backfillDjenPublications,
  monitorCount,
  monthWindows,
  HISTORY_START_DATE,
  type BackfillProgress,
} from "@/lib/djen-sync";
import type { Lawyer, MonitoredParty } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { EmptyState, HelpTip, PageHeader } from "@/components/shared/page-shell";

/**
 * Carga histórica do DJEN.
 *
 * Traz tudo desde a criação do escritório para compor o acervo inicial. É uma
 * operação longa — minutos, com a aba aberta — porque a API do CNJ limita 20
 * requisições por minuto. Como a gravação é idempotente pelo ID determinístico,
 * interromper no meio e recomeçar depois não duplica nem apaga nada.
 */
export default function PublicacoesHistoricoPage() {
  const { user } = useAuth();
  const { data: lawyers } = useCollection<Lawyer>("lawyers");
  const { data: parties } = useCollection<MonitoredParty>("monitoredParties");
  const { toast } = useToast();

  const [confirmar, setConfirmar] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState<BackfillProgress | null>(null);
  const pararRef = useRef(false);

  if (!isToolsOwner(user?.email)) {
    return (
      <div className="page-shell">
        <EmptyState
          icon={ShieldAlert}
          title="Ferramenta restrita"
          description="Esta área está disponível somente para Áttila."
        />
      </div>
    );
  }

  const monitores = activeMonitors(lawyers ?? [], parties ?? []);
  const quantos = monitorCount(monitores);
  const meses = monthWindows(HISTORY_START_DATE, new Date().toISOString().slice(0, 10));
  // Cada mês costuma render mais de uma página por monitor; a estimativa usa
  // duas requisições por monitor/mês para não prometer mais rápido do que é.
  const minutosEstimados = Math.max(1, Math.round((meses.length * quantos * 2 * 3.2) / 60));

  const baixar = async () => {
    if (!user || !lawyers || !parties) return;
    setConfirmar(false);
    setRodando(true);
    pararRef.current = false;
    setProgresso(null);
    try {
      const resultado = await backfillDjenPublications(monitores, user, {
        onProgress: setProgresso,
        shouldStop: () => pararRef.current,
      });
      toast({
        title: pararRef.current ? "Carga interrompida" : "Carga histórica concluída",
        description: `${resultado.created} publicação(ões) nova(s) de ${resultado.found} encontrada(s).`,
      });
    } catch (erro) {
      toast({
        variant: "destructive",
        title: "A carga histórica falhou",
        description: erro instanceof Error ? erro.message : undefined,
      });
    } finally {
      setRodando(false);
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="ferramentas"
        title="Histórico de publicações"
        description="Baixa todas as publicações das OABs monitoradas desde setembro de 2025, para compor o acervo inicial do escritório."
      />

      <Card className="surface">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Antes de começar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-[13px] text-muted-foreground">
          <p>
            São <strong>{meses.length} meses</strong> consultados para cada um dos{" "}
            <strong>{quantos} monitoramentos</strong> ativos ({monitores.lawyers.length} OAB(s) e{" "}
            {monitores.parties.length} parte(s)), um mês por vez. A estimativa é de cerca de{" "}
            <strong>{minutosEstimados} minuto(s)</strong>, porque a API do CNJ aceita no máximo 20
            requisições por minuto.
          </p>
          <p>
            <strong>Mantenha esta aba aberta</strong> até o fim — a busca roda no navegador, como
            todo o resto do sistema. Dá para interromper e retomar depois: nada é duplicado nem
            apagado, e as publicações que já estiverem na base só têm os dados do tribunal
            atualizados, preservando triagem e vínculo.
          </p>
          {quantos === 0 && (
            <p className="text-destructive">
              Nenhum monitoramento ativo. Cadastre advogados ou partes antes de rodar a carga.
            </p>
          )}
        </CardContent>
      </Card>

      {progresso && (
        <Card className="surface">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Mês {progresso.monthIndex} de {progresso.monthCount} — {progresso.monthLabel}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={(progresso.monthIndex / progresso.monthCount) * 100} />
            <p className="text-[13px] text-muted-foreground">
              {progresso.found} comunicação(ões) lida(s), {progresso.created} publicação(ões) nova(s)
              gravada(s).
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <HelpTip label="Consulta o DJEN mês a mês desde setembro de 2025 e grava tudo que encontrar.">
          <Button onClick={() => setConfirmar(true)} disabled={rodando || quantos === 0}>
            {rodando ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <History className="mr-2 size-4" />
            )}
            Baixar histórico desde setembro/2025
          </Button>
        </HelpTip>
        {rodando && (
          <HelpTip label="Para depois de terminar o mês em andamento. O que já foi gravado permanece.">
            <Button
              variant="outline"
              onClick={() => {
                pararRef.current = true;
                toast({ title: "Interrompendo ao fim do mês atual…" });
              }}
            >
              <Square className="mr-2 size-4" /> Interromper
            </Button>
          </HelpTip>
        )}
      </div>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Baixar todo o histórico?</AlertDialogTitle>
            <AlertDialogDescription>
              Serão consultados {meses.length} meses em {quantos} monitoramento(s), o que leva cerca
              de {minutosEstimados} minuto(s) com esta aba aberta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={baixar}>Baixar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
