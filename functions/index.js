const { googleAI } = require('@genkit-ai/googleai');
const { genkit, z } = require('genkit');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

// Define the secret
const googleApiKey = defineSecret('GOOGLE_API_KEY');

// Initialize Genkit with the Google AI plugin
const ai = genkit({
    plugins: [googleAI({ apiKey: process.env.GOOGLE_API_KEY })],
    model: 'googleai/gemini-1.5-pro',
});

// Define schemas
const DocumentInputSchema = z.object({
    fileUrl: z.string(),
    docType: z.string(),
});

const DocumentOutputSchema = z.object({
    extractedData: z.record(z.string()),
    status: z.string(),
    summary: z.string(),
});

const ChatInputSchema = z.object({
    question: z.string(),
    userName: z.string().optional(),
});

// Flow 1: Document Processor
const processDriverDocumentFlow = ai.defineFlow(
    {
        name: 'processDriverDocument',
        inputSchema: DocumentInputSchema,
        outputSchema: DocumentOutputSchema,
    },
    async (input) => {
        const { fileUrl, docType } = input;

        const prompt = `
You are an expert compliance officer.
I have a document of type: ${docType}.
The document is located at: ${fileUrl}

Please analyze this document.
Extract the following fields if present:
- VIN
- ExpirationDate
- PlateNumber
- CompanyName

Return the data in a clean JSON format.
Also provide a 1-sentence summary of the document status.
        `;

        const { text } = await ai.generate({ prompt });

        return {
            extractedData: { raw_text: text },
            status: "Processed",
            summary: `Analyzed ${docType} successfully. Check extracted data.`
        };
    }
);

// Flow 2: Dispatch Chat Helper
const chatDispatchHelperFlow = ai.defineFlow(
    {
        name: 'chatDispatchHelper',
        inputSchema: ChatInputSchema,
        outputSchema: z.string(),
    },
    async (input) => {
        const systemPrompt = `
You are "Jayboi Dispatch AI", a helpful assistant for truck drivers using the Jayboi Services portal.
The user is ${input.userName || 'a driver'}.

Answer questions about:
- IFTA filing (International Fuel Tax Agreement)
- 2290 Tax Forms (Heavy Highway Vehicle Use Tax)
- DOT Compliance

Keep answers short, professional, and helpful.
If you don't know, say "Please contact the main office at 470-484-4814."
        `;

        const { text } = await ai.generate({
            prompt: input.question,
            system: systemPrompt,
        });

        return text;
    }
);

// Export as Firebase HTTPS callable functions
exports.processDriverDocument = onRequest({ secrets: [googleApiKey] }, async (req, res) => {
    try {
        // Basic auth check (production should use Firebase Auth)
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }
        const result = await processDriverDocumentFlow(req.body);
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

exports.chatDispatchHelper = onRequest({ secrets: [googleApiKey] }, async (req, res) => {
    try {
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }
        const result = await chatDispatchHelperFlow(req.body);
        res.json({ response: result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});
