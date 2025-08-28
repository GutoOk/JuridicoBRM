// Summarizes process updates using AI to provide a quick understanding of the latest developments.

'use server';

/**
 * @fileOverview This file defines a Genkit flow for summarizing process updates using AI.
 *
 * - summarizeProcessUpdates - A function that summarizes process updates.
 * - SummarizeProcessUpdatesInput - The input type for the summarizeProcessUpdates function.
 * - SummarizeProcessUpdatesOutput - The return type for the summarizeProcessUpdates function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeProcessUpdatesInputSchema = z.object({
  processUpdates: z
    .string()
    .describe(
      'The process updates to be summarized.  Include as much context as possible.'
    ),
});
export type SummarizeProcessUpdatesInput = z.infer<
  typeof SummarizeProcessUpdatesInputSchema
>;

const SummarizeProcessUpdatesOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the process updates.'),
});
export type SummarizeProcessUpdatesOutput = z.infer<
  typeof SummarizeProcessUpdatesOutputSchema
>;

export async function summarizeProcessUpdates(
  input: SummarizeProcessUpdatesInput
): Promise<SummarizeProcessUpdatesOutput> {
  return summarizeProcessUpdatesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeProcessUpdatesPrompt',
  input: {schema: SummarizeProcessUpdatesInputSchema},
  output: {schema: SummarizeProcessUpdatesOutputSchema},
  prompt: `You are a lawyer summarizing process updates for a case.

  Summarize the following process updates:

  {{processUpdates}}
  `,
});

const summarizeProcessUpdatesFlow = ai.defineFlow(
  {
    name: 'summarizeProcessUpdatesFlow',
    inputSchema: SummarizeProcessUpdatesInputSchema,
    outputSchema: SummarizeProcessUpdatesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
