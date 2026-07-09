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

/** Lê a primeira planilha de um arquivo CSV/XLSX como matriz de strings. */
export async function readSpreadsheet(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  return rows.map((r) => r.map((c) => String(c ?? "").trim()));
}
