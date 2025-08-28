"use server";

import { summarizeCommunications } from "@/ai/flows/summarize-communications";
import type { SummarizeCommunicationsInput } from "@/ai/flows/summarize-communications";
import { extractClientData } from "@/ai/flows/extract-client-data";
import type { ExtractClientDataInput, ExtractClientDataOutput } from "@/ai/flows/extract-client-data";


export async function getSummary(input: SummarizeCommunicationsInput) {
  try {
    const result = await summarizeCommunications(input);
    return result.summary;
  } catch (error) {
    console.error("Error summarizing communications:", error);
    return "Ocorreu um erro ao gerar o resumo. Tente novamente.";
  }
}

export async function getClientDataFromText(input: ExtractClientDataInput): Promise<ExtractClientDataOutput> {
    try {
        const result = await extractClientData(input);
        return result;
    } catch (error) {
        console.error("Error extracting client data:", error);
        // Retornar um objeto de erro estruturado pode ser melhor, mas por enquanto uma string basta.
        throw new Error("Falha ao analisar os dados do cliente com IA.");
    }
}
