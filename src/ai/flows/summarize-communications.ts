
'use server';

/**
 * @fileOverview This file defines a Genkit flow for summarizing communications related to a legal process.
 *
 * The flow takes a list of communications as input and uses AI to generate a concise summary, which is then returned.
 * - summarizeCommunications - A function that handles the summarization process.
 * - SummarizeCommunicationsInput - The input type for the summarizeCommunications function.
 * - SummarizeCommunicationsOutput - The return type for the summarizeCommunications function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeCommunicationsInputSchema = z.object({
  communications: z.array(
    z.object({
      type: z.string().describe('The type of communication (e.g., call, meeting, message).'),
      content: z.string().describe('The content of the communication.'),
    })
  ).describe('A list of communications related to a legal process.'),
  processSummary: z.string().optional().describe('The current summary of the legal process.'),
});

export type SummarizeCommunicationsInput = z.infer<typeof SummarizeCommunicationsInputSchema>;

const SummarizeCommunicationsOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the communications.'),
});

export type SummarizeCommunicationsOutput = z.infer<typeof SummarizeCommunicationsOutputSchema>;

export async function summarizeCommunications(input: SummarizeCommunicationsInput): Promise<SummarizeCommunicationsOutput> {
  return summarizeCommunicationsFlow(input);
}

const summarizeCommunicationsPrompt = ai.definePrompt({
  name: 'summarizeCommunicationsPrompt',
  input: {schema: SummarizeCommunicationsInputSchema},
  output: {schema: SummarizeCommunicationsOutputSchema},
  prompt: `You are a legal assistant. You are responsible for summarizing communications related to a legal process. \n
  The current process summary is: {{{processSummary}}}.\n
  Here are the communications:\n  {{#each communications}}
  Type: {{{type}}}\n  Content: {{{content}}}\n  {{/each}}\n
  Please provide a concise summary of the communications that can be used to update the process summary.\n  Make sure to include all the important information from the communications.\n  Do not repeat information that is already in the process summary.\n  Format the summary as a single paragraph.
  `,
});

const summarizeCommunicationsFlow = ai.defineFlow(
  {
    name: 'summarizeCommunicationsFlow',
    inputSchema: SummarizeCommunicationsInputSchema,
    outputSchema: SummarizeCommunicationsOutputSchema,
  },
  async input => {
    const {output} = await summarizeCommunicationsPrompt(input);
    return output!;
  }
);
