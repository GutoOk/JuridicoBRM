"use client";

import { use } from "react";
import { Loader2 } from "lucide-react";
import { useDoc } from "@/hooks/use-collection";
import type { Client } from "@/lib/types";
import { ClientForm } from "@/components/shared/client-form";
import { PageHeader } from "@/components/shared/page-shell";

export default function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: client } = useDoc<Client>("clients", id);

  if (client === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (client === null) {
    return <p className="text-muted-foreground">Cliente não encontrado.</p>;
  }

  return (
    <div className="page-shell max-w-5xl">
      <PageHeader
        eyebrow="cadastro"
        title="Editar cliente"
        description={client.name}
      />
      <ClientForm client={client} />
    </div>
  );
}
