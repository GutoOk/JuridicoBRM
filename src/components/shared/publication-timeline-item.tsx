"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, FileBadge } from "lucide-react";

import { formatDisponibilizacao, sanitizePublicationHtml } from "@/lib/djen";
import type { Publication } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Publicação do DJEN dentro da linha do tempo do processo.
 *
 * O registro não é copiado para `updates`: a publicação continua sendo o
 * documento canônico em `publications` e esta é apenas a sua exibição. Assim, se
 * o tribunal cancelar a comunicação, o andamento reflete na hora — uma cópia
 * gravada envelheceria em silêncio.
 */
export function PublicationTimelineItem({
  publication,
  className,
}: {
  publication: Publication;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const resumo = (publication.textoPlain ?? "").slice(0, 240);

  return (
    <div className={cn("surface p-3 text-sm", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          <Badge
            variant="outline"
            className="mr-2 border-indigo-200/50 bg-indigo-50/70 font-medium text-indigo-700 shadow-none dark:border-indigo-800/40 dark:bg-indigo-950/40 dark:text-indigo-300"
          >
            Publicação
          </Badge>
          {publication.tipoComunicacao}
          {publication.orgao ? ` — ${publication.orgao}` : ""}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatDisponibilizacao(publication.disponibilizacaoDate)}
        </span>
      </div>

      {publication.cancelada && (
        <p className="mt-1 text-xs text-rose-800">
          Comunicação cancelada pelo tribunal
          {publication.motivoCancelamento ? `: ${publication.motivoCancelamento}` : "."}
        </p>
      )}

      {aberto ? (
        <div
          className="mt-2 max-h-72 overflow-y-auto rounded border bg-muted/20 p-2 text-[13px] leading-relaxed [&_table]:w-full [&_td]:align-top [&_td]:pr-2"
          // Texto do tribunal: sempre saneado antes de chegar ao DOM.
          dangerouslySetInnerHTML={{ __html: sanitizePublicationHtml(publication.textoHtml) }}
        />
      ) : (
        <p className="mt-1 text-muted-foreground">
          {resumo}
          {(publication.textoPlain ?? "").length > 240 && "…"}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setAberto(!aberto)}>
          {aberto ? (
            <ChevronDown className="mr-1 size-3.5" />
          ) : (
            <ChevronRight className="mr-1 size-3.5" />
          )}
          {aberto ? "Ocultar texto" : "Ver texto"}
        </Button>
        {publication.linkInteiroTeor && (
          <Button asChild variant="ghost" size="sm" className="h-7 px-2">
            <a href={publication.linkInteiroTeor} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1 size-3.5" /> No tribunal
            </a>
          </Button>
        )}
        {publication.certidaoUrl && (
          <Button asChild variant="ghost" size="sm" className="h-7 px-2">
            <a href={publication.certidaoUrl} target="_blank" rel="noopener noreferrer">
              <FileBadge className="mr-1 size-3.5" /> Certidão
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
