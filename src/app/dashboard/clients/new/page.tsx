"use client";

import { ClientForm } from "@/components/shared/client-form";
import { PageHeader } from "@/components/shared/page-shell";

export default function NewClientPage() {
  return (
    <div className="page-shell max-w-5xl">
      <PageHeader
        eyebrow="cadastro"
        title="Novo cliente"
        description="Cada pessoa existe uma única vez no sistema. Os tipos definem em quais operações ela aparece."
      />
      <ClientForm />
    </div>
  );
}
