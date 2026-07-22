"use client";

import { useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { CornerDownRight } from "lucide-react";
import { useCollection } from "@/hooks/use-collection";
import { parentClientsOf } from "@/lib/client-nesting";
import type { Client } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CodeBadge } from "@/components/shared/badges";

type PendingNavigation = {
  client: Client;
  href: string;
  parents: Client[];
};

export function NestedClientNavigationGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: clients } = useCollection<Client>("clients");
  const [pending, setPending] = useState<PendingNavigation | null>(null);

  const intercept = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
    if (!anchor || anchor.target === "_blank") return;
    const url = new URL(anchor.href, window.location.origin);
    const match = url.pathname.match(/^\/dashboard\/clients\/([^/]+)\/?$/);
    if (!match) return;
    const target = clients?.find((item) => item.id === decodeURIComponent(match[1]));
    if (!target) return;
    const parents = parentClientsOf(target.id, clients ?? []);
    if (parents.length === 0) return;

    event.preventDefault();
    event.stopPropagation();
    setPending({ client: target, href: `${url.pathname}${url.search}${url.hash}`, parents });
  };

  const go = (href: string) => {
    setPending(null);
    router.push(href);
  };

  return (
    <>
      <div className="contents" onClickCapture={intercept}>{children}</div>
      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Este cliente está aninhado</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.client.name} acompanha a operação do cliente principal. Escolha qual ficha deseja abrir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            {pending?.parents.map((parent) => (
              <Button
                key={parent.id}
                type="button"
                variant="outline"
                className="h-auto w-full justify-start gap-2 bg-amber-50/70 py-2 text-left dark:bg-amber-950/15"
                onClick={() => go(`/dashboard/clients/${parent.id}`)}
              >
                <CodeBadge code={parent.code} />
                <span className="min-w-0 flex-1 truncate">Abrir principal: {parent.name}</span>
              </Button>
            ))}
            {pending && (
              <Button type="button" className="w-full justify-start gap-2" onClick={() => go(pending.href)}>
                <CornerDownRight className="size-4" />
                Abrir cliente vinculado: {pending.client.name}
              </Button>
            )}
            <Button type="button" variant="ghost" className="w-full" onClick={() => setPending(null)}>
              Cancelar
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
