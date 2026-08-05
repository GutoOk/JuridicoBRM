import { formatCpfCnpj } from "@/lib/normalize";
import type { Address, Client } from "@/lib/types";

function clean(value: string | undefined | null): string {
  return (value ?? "").trim();
}

function formatZipCode(value: string | undefined): string {
  const raw = clean(value);
  const digits = raw.replace(/\D/g, "");
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : raw;
}

function formatAddressNumber(value: string | undefined): string {
  const number = clean(value);
  if (!number) return "";
  return /^(?:s\/n|n[º°.]?\s*)/i.test(number) ? number : `nº ${number}`;
}

function qualificationAddress(client: Client): { text: string; hasStreet: boolean } {
  const storedAddress =
    (client.addresses ?? []).find((item) => item.isPrimary) ??
    client.addresses?.[0];
  const hasStoredAddress = !!storedAddress && [
    storedAddress.street,
    storedAddress.number,
    storedAddress.complement,
    storedAddress.district,
    storedAddress.city,
    storedAddress.state,
    storedAddress.zipCode,
  ].some((value) => clean(value));

  if (!hasStoredAddress) {
    const street = clean(client.addressLine);
    const city = clean(client.city);
    const state = clean(client.state).toUpperCase();
    const zipCode = formatZipCode(client.zipCode);
    return {
      text: [
        street,
        city && state ? `${city}/${state}` : city || state,
        zipCode ? `CEP ${zipCode}` : "",
      ].filter(Boolean).join(", "),
      hasStreet: !!street,
    };
  }

  const address = storedAddress as Address;
  const street = clean(address.street) || clean(client.addressLine);
  const city = clean(address.city) || clean(client.city);
  const state = (clean(address.state) || clean(client.state)).toUpperCase();
  const zipCode = formatZipCode(address.zipCode || client.zipCode);

  return {
    text: [
      street,
      formatAddressNumber(address.number),
      clean(address.complement),
      clean(address.district),
      city && state ? `${city}/${state}` : city || state,
      zipCode ? `CEP ${zipCode}` : "",
    ].filter(Boolean).join(", "),
    hasStreet: !!street,
  };
}

export function formatClientPrimaryAddress(client: Client): string {
  return qualificationAddress(client).text;
}

function residenceGenderSuffix(client: Client): "a" | "o" | "o(a)" {
  for (const value of [client.nationality, client.maritalStatus, client.profession]) {
    const lastWord = clean(value).toLocaleLowerCase("pt-BR").split(/\s+/).at(-1);
    if (lastWord?.endsWith("a")) return "a";
    if (lastWord?.endsWith("o")) return "o";
  }
  return "o(a)";
}

/** Monta a qualificação civil com os dados já cadastrados, sem alterar o cliente. */
export function buildClientQualification(client: Client): string {
  const name = clean(client.name).toLocaleUpperCase("pt-BR");
  const document = clean(client.cpfCnpj);
  const address = qualificationAddress(client);
  const addressPreposition = address.hasStreet ? "à" : "em";

  if (client.type === "Pessoa Jurídica") {
    return [
      name,
      "pessoa jurídica de direito privado",
      document ? `inscrita no CNPJ/ME sob nº ${formatCpfCnpj(document)}` : "",
      address.text ? `com sede ${addressPreposition} ${address.text}` : "",
    ].filter(Boolean).join(", ") + ".";
  }

  const rg = clean(client.rg);
  const rgIssuer = clean(client.rgIssuer);
  const genderSuffix = residenceGenderSuffix(client);

  return [
    name,
    clean(client.nationality),
    clean(client.profession),
    clean(client.maritalStatus),
    rg ? `RG nº ${rg}${rgIssuer ? ` ${rgIssuer}` : ""}` : "",
    document ? `CPF/ME nº ${formatCpfCnpj(document)}` : "",
    address.text
      ? `residente e domiciliad${genderSuffix} ${addressPreposition} ${address.text}`
      : "",
  ].filter(Boolean).join(", ") + ".";
}
