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
    actionType: z.string().optional().describe('O tipo de ação do processo (ex: Procedimento Comum Cível). Se o campo for "Classe" ou "Tipo de Ação", use seu valor aqui.'),
    classe: z.string().optional().describe('A classe do processo. Se o campo for "Classe", use seu valor aqui.'),
    assunto: z.string().optional().describe('O assunto principal do processo.'),
    vara: z.string().optional().describe('A vara do processo (ex: 4ª Vara Cível).'),
    foro: z.string().optional().describe('O foro ou comarca do processo (ex: Foro de Mauá). Se o campo for "Foro" ou "Comarca", use seu valor aqui.'),
    juiz: z.string().optional().describe('O nome do juiz responsável pelo processo.'),
    instancia: z.string().optional().describe('A instância do processo, se mencionada (ex: 1ª Instância).'),
    polo: z.enum(["Ativo", "Passivo"]).optional().describe('O polo (ativo ou passivo) em que o cliente se encontra no processo.'),
    parteContraria: z.string().optional().describe('O nome da parte contrária no processo.'),
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
3.  TIPO DE AÇÃO/CLASSE: Se houver um campo chamado "Classe" no texto, use o valor dele tanto para 'actionType' quanto para 'classe'. Caso contrário, procure por "Tipo de Ação" ou similar para preencher 'actionType'.
4.  FORO/COMARCA: O valor do campo 'foro' deve ser extraído do campo "Foro" ou "Comarca" do texto.
5.  PARTE CONTRÁRIA: Procure por campos como "Requerido(a)", "Executado(a)", "Ré(u)" para identificar a parte contrária.
6.  POLO: Inferir o polo do cliente. Se o cliente for "Requerente", "Exequente", ou "Autor(a)", o polo é "Ativo". Se a parte contrária for "Requerido", "Executado" ou "Réu", o polo do cliente é "Ativo". Caso contrário, se o cliente for a parte passiva, o polo é "Passivo".
7.  EXTRAIA APENAS OS DADOS: Não inclua os nomes dos campos (como "Classe:", "Vara:") no valor extraído. Extraia apenas o valor correspondente.

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
