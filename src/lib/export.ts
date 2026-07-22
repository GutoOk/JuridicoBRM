import * as XLSX from "xlsx";

/**
 * Exporta linhas para um arquivo .xlsx (abre direto no Excel).
 * As chaves do primeiro objeto viram cabeçalhos.
 */
export function exportXlsx(rows: Record<string, unknown>[], filename: string, sheetName = "Dados"): void {
  if (!rows.length) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  // Larguras aproximadas pelas maiores células
  const keys = Object.keys(rows[0]);
  ws["!cols"] = keys.map((k) => {
    const max = Math.max(k.length, ...rows.slice(0, 200).map((r) => String(r[k] ?? "").length));
    return { wch: Math.min(Math.max(max + 2, 8), 60) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/** Exporta CSV UTF-8 com BOM e ponto e vírgula, adequado ao Excel em português. */
export function exportCsv(rows: Record<string, unknown>[], filename: string): void {
  if (!rows.length) return;
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escape = (value: unknown) => {
    const text = String(value ?? "");
    return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const content = [headers.join(";"), ...rows.map((row) => headers.map((header) => escape(row[header])).join(";"))].join("\r\n");
  const blob = new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Lê a primeira planilha de um arquivo CSV/XLSX como matriz de strings. */
export async function readSpreadsheet(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer();
  let wb: XLSX.WorkBook;
  if (file.name.toLocaleLowerCase().endsWith(".csv")) {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      text = new TextDecoder("windows-1252").decode(buf);
    }
    wb = XLSX.read(text, { type: "string", raw: false });
  } else {
    wb = XLSX.read(buf, { type: "array", raw: false });
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  return rows.map((r) => r.map((c) => String(c ?? "").trim()));
}
