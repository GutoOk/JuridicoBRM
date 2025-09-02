'use server';
/**
 * @fileOverview A Genkit flow for extracting structured process data from unstructured text.
 * - extractProcessData - Analyzes text to extract process information.
 * - ExtractProcessDataInput - The input type for the extractProcessData function.
 * - ExtractProcessDataOutput - The return type for the extractProcessData function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractProcessDataInputSchema = z.object({
  textToAnalyze: z.string().describe('The unstructured text containing process information.'),
});
export type ExtractProcessDataInput = z.infer<typeof ExtractProcessDataInputSchema>;

const ExtractProcessDataOutputSchema = z.object({
    processNumber: z.string().optional().describe('O número do processo, formatado como "XXXXXXX-XX.XXXX.X.XX.XXXX".'),
    actionType: z.string().optional().describe('O tipo de ação do processo (ex: Procedimento Comum Cível). Se o campo for "Classe", use seu valor aqui.'),
    vara: z.string().optional().describe('A vara do processo (ex: 4ª Vara Cível).'),
    comarca: z.string().optional().describe('A comarca do processo (ex: Foro de Mauá).'),
    instancia: z.string().optional().describe('A instância do processo, se mencionada.'),
}).describe('The structured process data extracted from the text.');

export type ExtractProcessDataOutput = z.infer<typeof ExtractProcessDataOutputSchema>;


export async function extractProcessData(input: ExtractProcessDataInput): Promise<ExtractProcessDataOutput> {
  return extractProcessDataFlow(input);
}

const prompt = ai.definePrompt({
  name: 'extractProcessDataPrompt',
  input: {schema: ExtractProcessDataInputSchema},
  output: {schema: ExtractProcessDataOutputSchema},
  prompt: `Você é um assistente especialista em análise de documentos jurídicos. Sua tarefa é extrair informações de um texto não estruturado sobre um processo e preencher os campos de um formulário de forma organizada.

Analise o texto abaixo e extraia CADA uma das informações solicitadas no formato de saída.

REGRAS IMPORTANTES:
1.  Se uma informação não estiver presente no texto, deixe o campo correspondente vazio.
2.  NÚMERO DO PROCESSO: Extraia o número completo do processo no formato especificado.
3.  TIPO DE AÇÃO: Se houver um campo chamado "Classe" no texto, use o valor dele para o campo 'actionType'. Caso contrário, procure por "Tipo de Ação" ou similar.
4.  COMARCA: Se o texto mencionar "Foro de [Cidade]", extraia "[Cidade]" como a comarca.
5.  EXTRAIA APENAS OS DADOS: Não inclua os nomes dos campos (como "Classe:", "Vara:") no valor extraído. Extraia apenas o valor correspondente.

Texto para análise:
{{{textToAnalyze}}}
`,
});

const extractProcessDataFlow = ai.defineFlow(
  {
    name: 'extractProcessDataFlow',
    inputSchema: ExtractProcessDataInputSchema,
    outputSchema: ExtractProcessDataOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
