"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CaseUpper, FileCheck2, FileSpreadsheet, Loader2, Phone, ScanSearch, ShieldAlert, Sparkles, Upload } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { findDuplicateCandidates, type DuplicateResolution } from "@/lib/client-deduplication";
import { cpfReviews, phoneReviews } from "@/lib/client-data-quality";
import { isToolsOwner } from "@/lib/constants";
import type { Client } from "@/lib/types";
import { AiImportDialog } from "@/components/shared/ai-import-dialog";
import { TemporaryBaronImportDialog } from "@/components/shared/temporary-baron-import-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/shared/page-shell";

export default function ToolsPage() {
  const { user, loading } = useAuth();
  const allowed = isToolsOwner(user?.email);
  const { data: clients } = useCollection<Client>(allowed ? "clients" : null);
  const { data: resolutions } = useCollection<DuplicateResolution>(allowed ? "duplicateResolutions" : null);
  const [aiImportOpen, setAiImportOpen] = useState(false);
  const [baronImportOpen, setBaronImportOpen] = useState(false);
  const duplicateCount = useMemo(
    () => clients && resolutions ? findDuplicateCandidates(clients, resolutions).length : 0,
    [clients, resolutions]
  );

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="size-7 animate-spin text-muted-foreground" /></div>;
  if (!allowed) {
    return <EmptyState icon={ShieldAlert} title="Ferramentas restritas" description="Esta área está disponível somente para Áttila." />;
  }
  if (!clients) return <div className="flex h-64 items-center justify-center"><Loader2 className="size-7 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="uso restrito"
        title="Ferramentas"
        description="Importações e revisões sensíveis ficam reunidas aqui. Toda gravação exige conferência e preserva a auditoria do cadastro."
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ToolCard icon={Sparkles} title="Importar com IA" description="Organiza texto ou tabela colada e mostra conflitos antes de gravar.">
          <Button size="sm" onClick={() => setAiImportOpen(true)}>Abrir importação</Button>
        </ToolCard>
        <ToolCard icon={Upload} title="Importar planilha" description="Mapeia CSV ou Excel, valida campos e atualiza por código ou CPF.">
          <Button asChild size="sm" variant="outline"><Link href="/dashboard/import">Abrir planilhas</Link></Button>
        </ToolCard>
        <ToolCard icon={FileSpreadsheet} title="Barão de Mauá" description="Importação temporária com revisão operacional e CSV do que não encaixar.">
          <Button size="sm" variant="outline" onClick={() => setBaronImportOpen(true)}>Importar Barão</Button>
        </ToolCard>
        <ToolCard icon={ScanSearch} title="Possíveis duplicatas" description="Compara CPF, código e nomes semelhantes para decidir ou unificar.">
          <Button asChild size="sm" variant="outline"><Link href="/dashboard/settings/duplicates">Revisar ({duplicateCount})</Link></Button>
        </ToolCard>
        <ToolCard icon={FileCheck2} title="Revisar CPF/CNPJ" description="Separa máscaras corrigíveis automaticamente de documentos que exigem conferência.">
          <Button asChild size="sm" variant="outline"><Link href="/dashboard/tools/cpf">Revisar ({cpfReviews(clients).length})</Link></Button>
        </ToolCard>
        <ToolCard icon={Phone} title="Revisar telefones" description="Padroniza números seguros em lote e deixa casos duvidosos para revisão.">
          <Button asChild size="sm" variant="outline"><Link href="/dashboard/tools/phones">Revisar ({phoneReviews(clients).length})</Link></Button>
        </ToolCard>
        <ToolCard icon={CaseUpper} title="Nomes em maiúsculas" description="Converte nomes de clientes e sincroniza processos, grupos e andamentos.">
          <Button asChild size="sm" variant="outline"><Link href="/dashboard/tools/names">Abrir ({clients.filter((client) => client.name !== client.name.toLocaleUpperCase("pt-BR")).length})</Link></Button>
        </ToolCard>
      </div>

      <AiImportDialog open={aiImportOpen} onOpenChange={setAiImportOpen} clients={clients} />
      <TemporaryBaronImportDialog open={baronImportOpen} onOpenChange={setBaronImportOpen} clients={clients} />
    </div>
  );
}

function ToolCard({ icon: Icon, title, description, children }: { icon: typeof Sparkles; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="flex min-h-40 flex-col">
      <CardHeader className="flex-1">
        <span className="mb-2 flex size-8 items-center justify-center rounded-md bg-slate-800/10 text-slate-700"><Icon className="size-4" /></span>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs leading-relaxed">{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
