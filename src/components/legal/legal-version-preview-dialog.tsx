"use client";

import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { GitCompare, History, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/normalize";
import { legalDocumentDiff, type LegalDiffLine } from "@/lib/legal-diff";
import { cn } from "@/lib/utils";
import {
  legalChromeAutoPageNumber,
  legalChromeContent,
  legalStyleRules,
  parseLegalContent,
  parseLegalPageSettings,
  parseLegalStyles,
} from "@/lib/legal-documents";
import type { LegalVersion } from "@/lib/types";
import { legalEditorExtensions } from "./legal-editor-extensions";
import { LegalChromeView } from "./legal-page-chrome";

/**
 * Mostra o conteúdo de uma versão sem alterar o documento. Usa o mesmo esquema e as
 * mesmas regras de estilo do editor, então o que aparece aqui é o que voltaria caso a
 * versão fosse restaurada. É só leitura: sem paginação, sem réguas e sem edição.
 */
export function LegalVersionPreviewDialog({
  version,
  versions,
  currentVersion,
  canRestore,
  onOpenChange,
  onRestore,
}: {
  version: LegalVersion | null;
  versions: LegalVersion[];
  currentVersion: number;
  canRestore: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (version: LegalVersion) => void;
}) {
  const [compareWith, setCompareWith] = useState<string>("");

  // Ao trocar de versão a comparação recomeça: comparar com um marco que já não faz
  // sentido para a nova seleção só confundiria.
  useEffect(() => { setCompareWith(""); }, [version?.id]);

  const others = useMemo(
    () => versions
      .filter((item) => item.version !== version?.version)
      .sort((first, second) => second.version - first.version),
    [version?.version, versions]
  );
  const comparison = others.find((item) => item.id === compareWith) ?? null;

  return (
    <Dialog open={!!version} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            <History className="size-4" />
            Versão {version?.version}
            {version?.label && (
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-normal text-sky-800">
                {version.label}
              </span>
            )}
            {version?.version === currentVersion && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-normal text-emerald-800">
                em uso
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {version && (
              <>
                {legalVersionReasonLabel(version)} · {version.createdBy || "Usuário não informado"}
                {" · "}
                {formatDateTime(version.createdAt)}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {others.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="legal-version-compare" className="flex items-center gap-1.5 text-xs">
              <GitCompare className="size-3.5" />Comparar com
            </Label>
            <Select value={compareWith || "none"} onValueChange={(value) => setCompareWith(value === "none" ? "" : value)}>
              <SelectTrigger id="legal-version-compare" className="h-7 w-[260px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não comparar</SelectItem>
                {others.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    Versão {item.version}
                    {item.version === currentVersion ? " (em uso)" : ""}
                    {item.label ? ` — ${item.label}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {version && (comparison
          ? <VersionComparison base={comparison} target={version} />
          : <VersionPaper version={version} />)}

        <DialogFooter className="gap-2 sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            Somente leitura. O documento atual não foi alterado.
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            {version && version.version !== currentVersion && (
              <Button
                type="button"
                size="sm"
                disabled={!canRestore}
                onClick={() => onRestore(version)}
              >
                <RotateCcw className="mr-1.5 size-3.5" />Restaurar esta versão
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Diferenças da versão `base` para a versão `target`, parágrafo a parágrafo. */
function VersionComparison({ base, target }: { base: LegalVersion; target: LegalVersion }) {
  const diff = useMemo(
    () => legalDocumentDiff(parseLegalContent(base.contentJson), parseLegalContent(target.contentJson)),
    [base.contentJson, target.contentJson]
  );
  const unchanged = !diff.added && !diff.removed && !diff.changed;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
      <div className="ledger-header flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-2 py-1.5 text-[11px]">
        <span>Da versão {base.version} para a versão {target.version}</span>
        <span className="text-emerald-800">{diff.added} incluído(s)</span>
        <span className="text-rose-800">{diff.removed} removido(s)</span>
        <span className="text-amber-800">{diff.changed} alterado(s)</span>
      </div>
      {unchanged ? (
        <p className="p-4 text-center text-xs text-muted-foreground">
          O texto das duas versões é igual. As diferenças podem estar nos estilos, nas
          margens ou no cabeçalho e rodapé.
        </p>
      ) : (
        <div className="divide-y">
          {diff.lines.map((line, index) => (
            <LegalDiffRow key={index} line={line} />
          ))}
        </div>
      )}
    </div>
  );
}

function LegalDiffRow({ line }: { line: LegalDiffLine }) {
  if (line.kind === "igual") {
    return (
      <p className="px-2 py-1 text-xs leading-relaxed text-muted-foreground">
        {line.before || <span className="italic">(parágrafo vazio)</span>}
      </p>
    );
  }

  if (line.kind === "alterado") {
    return (
      <div className="space-y-0.5 px-2 py-1">
        <p className="bg-rose-50 px-1 text-xs leading-relaxed text-rose-900">
          <span className="mr-1 select-none opacity-60">−</span>
          {line.beforeParts?.map((part, index) => (
            <span key={index} className={part.changed ? "rounded bg-rose-200/70 line-through" : undefined}>
              {part.text}{" "}
            </span>
          ))}
        </p>
        <p className="bg-emerald-50 px-1 text-xs leading-relaxed text-emerald-900">
          <span className="mr-1 select-none opacity-60">+</span>
          {line.afterParts?.map((part, index) => (
            <span key={index} className={part.changed ? "rounded bg-emerald-200/70" : undefined}>
              {part.text}{" "}
            </span>
          ))}
        </p>
      </div>
    );
  }

  const removed = line.kind === "removido";
  return (
    <p
      className={cn(
        "px-2 py-1 text-xs leading-relaxed",
        removed ? "bg-rose-50 text-rose-900" : "bg-emerald-50 text-emerald-900"
      )}
    >
      <span className="mr-1 select-none opacity-60">{removed ? "−" : "+"}</span>
      {(removed ? line.before : line.after) || <span className="italic">(parágrafo vazio)</span>}
    </p>
  );
}

function VersionPaper({ version }: { version: LegalVersion }) {
  const styles = useMemo(() => parseLegalStyles(version.stylesJson), [version.stylesJson]);
  const pageSettings = useMemo(
    () => parseLegalPageSettings(version.pageSettingsJson),
    [version.pageSettingsJson]
  );
  const paper = pageSettings.paperSize === "LETTER" ? 216 : 210;

  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: legalEditorExtensions(),
    content: parseLegalContent(version.contentJson),
    editorProps: { attributes: { class: "legal-prosemirror outline-none" } },
  }, [version.id]);

  if (!editor) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-md border bg-muted/35 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />Carregando versão...
      </div>
    );
  }

  const headerDoc = legalChromeContent(pageSettings, "header");
  const footerDoc = legalChromeContent(pageSettings, "footer");

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-muted/35 p-3">
      <style>{legalStyleRules(styles, ".legal-version-scope")}</style>
      <article
        className="legal-version-scope mx-auto bg-white text-black shadow-sm"
        style={{
          width: `min(${paper}mm, 100%)`,
          boxSizing: "border-box",
          paddingTop: `${pageSettings.marginTop}mm`,
          paddingRight: `${pageSettings.marginRight}mm`,
          paddingBottom: `${pageSettings.marginBottom}mm`,
          paddingLeft: `${pageSettings.marginLeft}mm`,
        }}
      >
        <div className="legal-version-chrome">
          <LegalChromeView content={headerDoc} pageNumber={1} totalPages={1} autoPageNumber={false} />
        </div>
        <EditorContent editor={editor} />
        <div className="legal-version-chrome">
          <LegalChromeView
            content={footerDoc}
            pageNumber={1}
            totalPages={1}
            autoPageNumber={legalChromeAutoPageNumber(pageSettings)}
          />
        </div>
      </article>
    </div>
  );
}

export function legalVersionReasonLabel(version: LegalVersion): string {
  if (version.reason === "initial") return "Criação";
  if (version.reason === "explicit") return "Salva manualmente";
  if (version.reason === "before_restore") return "Rascunho preservado antes de restaurar";
  return version.restoredFromVersion
    ? `Restaurada da versão ${version.restoredFromVersion}`
    : "Restaurada";
}
