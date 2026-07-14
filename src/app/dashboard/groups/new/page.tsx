"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientGroupForm } from "@/components/shared/client-group-form";
import { PageHeader } from "@/components/shared/page-shell";

export default function NewClientGroupPage() {
  return (
    <div className="page-shell">
      <PageHeader eyebrow="organização" title="Novo grupo de clientes" description="Monte uma lista personalizada de clientes para um trabalho, sem alterar seus vínculos jurídicos.">
        <Button variant="outline" asChild><Link href="/dashboard/groups"><ArrowLeft className="mr-2 size-4" />Voltar</Link></Button>
      </PageHeader>
      <ClientGroupForm />
    </div>
  );
}
