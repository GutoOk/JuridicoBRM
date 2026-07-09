import type { Dateish } from "./types";
import { Timestamp } from "firebase/firestore";

// ---------------------------------------------------------------------------
// Código do cliente (1 letra + 4 números, ex.: X9999)
// ---------------------------------------------------------------------------

export const CODE_REGEX = /^[A-Z][0-9]{4}$/;

export function normalizeCode(raw: string | undefined | null): string {
  return (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidCode(raw: string | undefined | null): boolean {
  return CODE_REGEX.test(normalizeCode(raw));
}

// ---------------------------------------------------------------------------
// CPF / CNPJ
// ---------------------------------------------------------------------------

export function digitsOnly(raw: string | undefined | null): string {
  return (raw ?? "").replace(/\D+/g, "");
}

export function formatCpfCnpj(raw: string | undefined | null): string {
  const d = digitsOnly(raw);
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return raw ?? "";
}

function checkDigits(digits: number[], weightsList: number[][]): boolean {
  const base = digits.length - weightsList.length;
  for (let w = 0; w < weightsList.length; w++) {
    const weights = weightsList[w];
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += digits[i] * weights[i];
    const mod = sum % 11;
    const expected = mod < 2 ? 0 : 11 - mod;
    if (digits[base + w] !== expected) return false;
  }
  return true;
}

export function isValidCpf(raw: string | undefined | null): boolean {
  const d = digitsOnly(raw);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const n = d.split("").map(Number);
  return checkDigits(n, [
    [10, 9, 8, 7, 6, 5, 4, 3, 2],
    [11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
  ]);
}

export function isValidCnpj(raw: string | undefined | null): boolean {
  const d = digitsOnly(raw);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const n = d.split("").map(Number);
  return checkDigits(n, [
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  ]);
}

/** Valida CPF (11 dígitos) ou CNPJ (14 dígitos). Vazio é considerado válido (campo opcional). */
export function isValidCpfCnpj(raw: string | undefined | null): boolean {
  const d = digitsOnly(raw);
  if (!d) return true;
  if (d.length === 11) return isValidCpf(d);
  if (d.length === 14) return isValidCnpj(d);
  return false;
}

// ---------------------------------------------------------------------------
// Telefone / WhatsApp
// ---------------------------------------------------------------------------

/** Normaliza para dígitos, removendo 0 inicial de operadora. Mantém DDI se digitado. */
export function normalizePhone(raw: string | undefined | null): string {
  let d = digitsOnly(raw);
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  return d;
}

export function formatPhone(raw: string | undefined | null): string {
  let d = normalizePhone(raw);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw ?? "";
}

/** Link tel: para ligar. */
export function telLink(raw: string | undefined | null): string | null {
  const d = normalizePhone(raw);
  return d ? `tel:+${d.startsWith("55") ? d : "55" + d}` : null;
}

/** Link wa.me com mensagem opcional. Assume DDI 55 quando ausente. */
export function waLink(raw: string | undefined | null, text?: string): string | null {
  let d = normalizePhone(raw);
  if (!d) return null;
  if (!d.startsWith("55") || d.length <= 11) d = "55" + d;
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${d}${q}`;
}

// ---------------------------------------------------------------------------
// Datas (aceita Timestamp do Firestore, string ISO legada, Date)
// ---------------------------------------------------------------------------

export function toDate(v: Dateish): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (v instanceof Timestamp) return v.toDate();
  // objeto serializado { seconds, nanoseconds }
  const anyV = v as { seconds?: number; toDate?: () => Date };
  if (typeof anyV.toDate === "function") return anyV.toDate();
  if (typeof anyV.seconds === "number") return new Date(anyV.seconds * 1000);
  return null;
}

export function formatDate(v: Dateish): string {
  const d = toDate(v);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function formatDateTime(v: Dateish): string {
  const d = toDate(v);
  if (!d) return "—";
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** "hoje", "ontem", "há 3 dias", "há 2 meses"… */
export function formatRelative(v: Dateish): string {
  const d = toDate(v);
  if (!d) return "nunca";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(days / 365);
  return `há ${years} ano${years > 1 ? "s" : ""}`;
}

/** Milissegundos desde epoch (0 quando vazio) — para ordenação. */
export function dateMillis(v: Dateish): number {
  return toDate(v)?.getTime() ?? 0;
}

export function daysSince(v: Dateish): number | null {
  const d = toDate(v);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

// ---------------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------------

/** Minúsculo e sem acentos, para busca tolerante. */
export function searchable(raw: string | undefined | null): string {
  return (raw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
