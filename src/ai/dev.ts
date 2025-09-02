import { config } from 'dotenv';
config();

import '@/ai/flows/summarize-communications.ts';
import '@/ai/flows/summarize-process-updates.ts';
import '@/ai/flows/extract-client-data.ts';
import '@/ai/flows/extract-process-data.ts';
