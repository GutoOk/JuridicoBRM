'use server';
/**
 * @fileOverview A Genkit flow for extracting structured client data from unstructured text.
 * - extractClientData - Analyzes text to extract client information.
 * - ExtractClientDataInput - The input type for the extractClientData function.
 * - ExtractClientDataOutput - The return type for the extractClientData function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractClientDataInputSchema = z.object({
  textToAnalyze: z.string().describe('The unstructured text containing client information.'),
});
export type ExtractClientDataInput = z.infer<typeof ExtractClientDataInputSchema>;

// Using a partial schema for the output, as not all fields may be present in the text.
const ExtractClientDataOutputSchema = z.object({
    name: z.string().optional().describe('O nome completo do cliente.'),
    nationality: z.string().optional().describe('A nacionalidade do cliente.'),
    profession: z.string().optional().describe('A profissão do cliente.'),
    maritalStatus: z.string().optional().describe('O estado civil do cliente.'),
    rg: z.string().optional().describe('O número do RG do cliente.'),
    rgIssuer: z.string().optional().describe('O órgão emissor do RG.'),
    cpfCnpj: z.string().optional().describe('O CPF ou CNPJ do cliente.'),
    type: z.enum(["Pessoa Física", "Pessoa Jurídica"]).optional().describe('O tipo de pessoa, inferido se for CPF ou CNPJ.'),
    email: z.string().optional().describe('O endereço de e-mail do cliente.'),
    phone: z.string().optional().describe('O telefone principal do cliente.'),
    phone2: z.string().optional().describe('O telefone alternativo do cliente.'),
    addressZipCode: z.string().optional().describe('O CEP do endereço.'),
    addressStreet: z.string().optional().describe('O logradouro do endereço (rua, avenida, etc.).'),
    addressNumber: z.string().optional().describe('O número do endereço.'),
    addressComplement: z.string().optional().describe('O complemento do endereço (apto, bloco, etc.).'),
    addressDistrict: z.string().optional().describe('O bairro do endereço.'),
    addressCity: z.string().optional().describe('A cidade do endereço.'),
    addressState: z.string().optional().describe('O estado (UF) do endereço.'),
    notes: z.string().optional().describe('Quaisquer observações gerais sobre o cliente contidas no texto.'),
}).describe('The structured client data extracted from the text.');

export type ExtractClientDataOutput = z.infer<typeof ExtractClientDataOutputSchema>;


export async function extractClientData(input: ExtractClientDataInput): Promise<ExtractClientDataOutput> {
  return extractClientDataFlow(input);
}

const prompt = ai.definePrompt({
  name: 'extractClientDataPrompt',
  input: {schema: ExtractClientDataInputSchema},
  output: {schema: ExtractClientDataOutputSchema},
  prompt: `Você é um assistente especialista em análise de documentos e textos para escritórios de advocacia. Sua tarefa é extrair informações de um texto não estruturado e preencher os campos de um cadastro de cliente de forma organizada.

Analise o texto abaixo e extraia CADA uma das informações solicitadas no formato de saída.

REGRAS IMPORTANTES:
1.  Se uma informação não estiver presente no texto, deixe o campo correspondente vazio.
2.  FORMATAÇÃO DO NOME: Se o nome do cliente estiver em letras maiúsculas, formate-o para o padrão de capitalização de nomes próprios (ex: "JOÃO DA SILVA" deve se tornar "João da Silva").
3.  CORREÇÃO ORTOGRÁFICA: Corrija a ortografia apenas para os seguintes campos, se necessário: 'nationality', 'profession', 'maritalStatus'.

Texto para análise:
{{{textToAnalyze}}}
`,
});

const extractClientDataFlow = ai.defineFlow(
  {
    name: 'extractClientDataFlow',
    inputSchema: ExtractClientDataInputSchema,
    outputSchema: ExtractClientDataOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
