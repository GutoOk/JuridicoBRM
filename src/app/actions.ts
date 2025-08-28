"use server";

import { summarizeCommunications } from "@/ai/flows/summarize-communications";
import type { SummarizeCommunicationsInput } from "@/ai/flows/summarize-communications";

export async function getSummary(input: SummarizeCommunicationsInput) {
  try {
    const result = await summarizeCommunications(input);
    return result.summary;
  } catch (error) {
    console.error("Error summarizing communications:", error);
    return "Ocorreu um erro ao gerar o resumo. Tente novamente.";
  }
}
