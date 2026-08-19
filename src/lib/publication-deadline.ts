/**
 * Prazo sugerido a partir da publicação.
 *
 * Fica em módulo próprio, sem Firestore e sem "use client", porque é aritmética
 * de calendário pura: dá para testar isoladamente e usar em qualquer contexto.
 */

function ehFimDeSemana(data: Date): boolean {
  const dia = data.getDay();
  return dia === 0 || dia === 6;
}

function proximoDiaUtil(data: Date): Date {
  const resultado = new Date(data);
  while (ehFimDeSemana(resultado)) resultado.setDate(resultado.getDate() + 1);
  return resultado;
}

/**
 * Data sugerida para o prazo, contada em dias úteis a partir do dia útil
 * seguinte à publicação.
 *
 * **É sugestão, não cálculo oficial**: o DJEN não informa feriado forense nem
 * suspensão de prazo do tribunal, então a data sempre chega editável na tarefa.
 */
export function suggestedDeadline(
  disponibilizacaoDate: string | undefined | null,
  diasUteis: number
): string {
  const partes = (disponibilizacaoDate ?? "").trim().slice(0, 10).split("-");
  if (partes.length !== 3) return "";
  const [ano, mes, dia] = partes.map(Number);
  if (!ano || !mes || !dia) return "";

  // Disponibilizado hoje, publica-se no dia útil seguinte.
  const publicacao = new Date(ano, mes - 1, dia);
  publicacao.setDate(publicacao.getDate() + 1);
  const publicacaoUtil = proximoDiaUtil(publicacao);

  // O prazo começa a correr no dia útil seguinte ao da publicação.
  const corrente = new Date(publicacaoUtil);
  corrente.setDate(corrente.getDate() + 1);
  let restantes = Math.max(1, diasUteis);
  let cursor = proximoDiaUtil(corrente);
  while (restantes > 1) {
    cursor.setDate(cursor.getDate() + 1);
    cursor = proximoDiaUtil(cursor);
    restantes--;
  }

  const mesFinal = String(cursor.getMonth() + 1).padStart(2, "0");
  const diaFinal = String(cursor.getDate()).padStart(2, "0");
  return `${cursor.getFullYear()}-${mesFinal}-${diaFinal}`;
}
