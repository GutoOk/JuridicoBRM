"use client";

import { use } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/page-shell";
import { LegalEditor } from "@/components/legal/legal-editor";
import { useAuth } from "@/hooks/use-auth";
import { useCollection, useDoc } from "@/hooks/use-collection";
import type { LegalQuickPart, LegalTemplate, LegalVersion } from "@/lib/types";

export default function LegalTemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, isAdmin } = useAuth();
  const { data: template, error } = useDoc<LegalTemplate>("legalTemplates", id);
  const { data: versions } = useCollection<LegalVersion>(
    "legalTemplateVersions",
    { where: [["entityId", "==", id]] },
    [id]
  );
  const { data: quickParts } = useCollection<LegalQuickPart>("legalQuickParts", { where: [["deleted", "==", false]] });

  if (!user || template === undefined || versions === null || quickParts === null) {
    return <LoadingEditor />;
  }
  if (!template || error) {
    return (
      <EmptyState title="Modelo não encontrado" description="O modelo pode ter sido removido ou você não tem acesso.">
        <Button asChild variant="outline" size="sm"><Link href="/dashboard/models">Voltar aos modelos</Link></Button>
      </EmptyState>
    );
  }
  return (
    <LegalEditor
      kind="template"
      entity={template}
      user={user}
      isAdmin={isAdmin}
      versions={versions}
      quickParts={quickParts}
      backHref="/dashboard/models"
    />
  );
}

function LoadingEditor() {
  return <div className="surface flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Carregando editor...</div>;
}
