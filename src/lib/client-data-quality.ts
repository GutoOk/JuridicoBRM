import { digitsOnly, formatCpfCnpj, formatPhone, isValidCpfCnpj, normalizePhone } from "@/lib/normalize";
import type { Client } from "@/lib/types";

export type CpfReview = {
  id: string;
  client: Client;
  current: string;
  suggestion: string | null;
  automatic: boolean;
  reason: string;
};

export type PhoneField = "phone" | "whatsapp" | "legacy";

export type PhoneReview = {
  id: string;
  client: Client;
  field: PhoneField;
  legacyIndex?: number;
  label: string;
  current: string;
  suggestion: string | null;
  automatic: boolean;
  reason: string;
};

export function isValidPhoneNumber(raw: string | undefined | null): boolean {
  let digits = normalizePhone(raw);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  return digits.length === 10 || digits.length === 11;
}

export function cpfReviews(clients: Client[]): CpfReview[] {
  return clients.flatMap((client) => {
    if (client.deleted || !client.cpfCnpj?.trim()) return [];
    const current = client.cpfCnpj.trim();
    const digits = digitsOnly(current);
    const valid = isValidCpfCnpj(current);
    const suggestion = valid ? formatCpfCnpj(current) : null;
    const normalizedMismatch = (client.cpfCnpjDigits ?? "") !== digits;
    if (valid && current === suggestion && !normalizedMismatch) return [];
    return [{
      id: client.id,
      client,
      current,
      suggestion,
      automatic: valid,
      reason: valid
        ? normalizedMismatch && current === suggestion
          ? "Índice de busca do CPF/CNPJ precisa ser corrigido"
          : "Apenas a máscara está fora do padrão"
        : digits.length !== 11 && digits.length !== 14
          ? `Quantidade inválida: ${digits.length} dígitos`
          : "Não passa no teste dos dígitos verificadores",
    }];
  });
}

function phoneReview(
  client: Client,
  field: PhoneField,
  current: string,
  label: string,
  legacyIndex?: number,
  normalizedValue?: string
): PhoneReview | null {
  if (!current.trim()) return null;
  const valid = isValidPhoneNumber(current);
  const suggestion = valid ? formatPhone(current) : null;
  const normalizedMismatch = normalizedValue !== undefined && normalizedValue !== normalizePhone(current);
  if (valid && current.trim() === suggestion && !normalizedMismatch) return null;
  const digits = normalizePhone(current);
  return {
    id: `${client.id}:${field}:${legacyIndex ?? "main"}`,
    client,
    field,
    legacyIndex,
    label,
    current: current.trim(),
    suggestion,
    automatic: valid,
    reason: valid
      ? normalizedMismatch && current.trim() === suggestion
        ? "Índice de busca do telefone precisa ser corrigido"
        : "Número válido; somente a apresentação será padronizada"
      : digits.length > 13
        ? "Pode haver mais de um telefone no mesmo campo"
        : `Quantidade duvidosa: ${digits.length} dígitos`,
  };
}

export function phoneReviews(clients: Client[]): PhoneReview[] {
  return clients
    .filter((client) => !client.deleted)
    .flatMap((client) => [
      client.phone ? phoneReview(client, "phone", client.phone, "Telefone principal", undefined, client.phoneDigits) : null,
      client.whatsapp ? phoneReview(client, "whatsapp", client.whatsapp, "WhatsApp", undefined, client.whatsappDigits) : null,
      ...(client.phones ?? []).map((phone, index) =>
        phoneReview(client, "legacy", phone.number, phone.description || `Telefone ${index + 1}`, index)
      ),
    ].filter((review): review is PhoneReview => review !== null));
}
