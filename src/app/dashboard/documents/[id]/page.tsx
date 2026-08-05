"use client";

import { use } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/page-shell";
import { LegalEditor } from "@/components/legal/legal-editor";
import { useAuth } from "@/hooks/use-auth";
import { useCollection, useDoc } from "@/hooks/use-collection";
import type { Client, LegalDocument, LegalQuickPart, LegalVersion } from "@/lib/types";

export default function LegalDocumentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, isAdmin } = useAuth();
  const { data: document, error } = useDoc<LegalDocument>("legalDocuments", id);
  const { data: client } = useDoc<Client>("clients", document?.clientId);
  const { data: allClients } = useCollection<Client>("clients");
  const { data: versions } = useCollection<LegalVersion>(
    "legalDocumentVersions",
    { where: [["entityId", "==", id]] },
    [id]
  );
  const { data: quickParts } = useCollection<LegalQuickPart>("legalQuickParts", { where: [["deleted", "==", false]] });

  if (!user || document === undefined || client === undefined || versions === null || quickParts === null || allClients === null) {
    return <div className="surface flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Carregando documento...</div>;
  }
  if (!document || !client || error) {
    return (
      <EmptyState title="Documento não encontrado" description="O documento ou o cliente vinculado não está disponível.">
        <Button asChild variant="outline" size="sm"><Link href="/dashboard/clients">Voltar aos clientes</Link></Button>
      </EmptyState>
    );
  }
  return (
    <LegalEditor
      kind="document"
      entity={document}
      user={user}
      isAdmin={isAdmin}
      versions={versions}
      quickParts={quickParts}
      currentClient={client}
      allClients={allClients}
      backHref={`/dashboard/clients/${client.id}?tab=documents`}
    />
  );
}
