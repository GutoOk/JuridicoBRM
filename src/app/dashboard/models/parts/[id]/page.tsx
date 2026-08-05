"use client";

import { use } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/page-shell";
import { LegalEditor } from "@/components/legal/legal-editor";
import { useAuth } from "@/hooks/use-auth";
import { useCollection, useDoc } from "@/hooks/use-collection";
import type { LegalQuickPart, LegalVersion } from "@/lib/types";

export default function LegalQuickPartEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, isAdmin } = useAuth();
  const { data: part, error } = useDoc<LegalQuickPart>("legalQuickParts", id);
  const { data: versions } = useCollection<LegalVersion>(
    "legalQuickPartVersions",
    { where: [["entityId", "==", id]] },
    [id]
  );
  const { data: quickParts } = useCollection<LegalQuickPart>("legalQuickParts", { where: [["deleted", "==", false]] });

  if (!user || part === undefined || versions === null || quickParts === null) {
    return <div className="surface flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Carregando editor...</div>;
  }
  if (!part || error) {
    return (
      <EmptyState title="Parte rápida não encontrada" description="O item pode ter sido removido ou você não tem acesso.">
        <Button asChild variant="outline" size="sm"><Link href="/dashboard/models">Voltar aos modelos</Link></Button>
      </EmptyState>
    );
  }
  return (
    <LegalEditor
      kind="quickPart"
      entity={part}
      user={user}
      isAdmin={isAdmin}
      versions={versions}
      quickParts={quickParts}
      backHref="/dashboard/models"
    />
  );
}
