
const { genkit, z } = require('genkit');
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { vertexAI, gemini20Flash } = require('@genkit-ai/vertexai');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// Define secret for Google Sheets credentials (contains full service account JSON)
const sheetsServiceAccountJson = defineSecret('GOOGLE_SERVICE_ACCOUNT_JSON');

// Initialize Firebase Admin
if (admin.apps.length === 0) {
    admin.initializeApp();
}

// Initialize Genkit with the Vertex AI plugin
const ai = genkit({
    plugins: [vertexAI({ location: 'us-central1' })],
    model: gemini20Flash,
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

// Flow 2: Dispatch Chat Helper - Portal Assistant (drives contact to business)
const chatDispatchHelperFlow = ai.defineFlow(
    {
        name: 'chatDispatchHelper',
        inputSchema: ChatInputSchema,
        outputSchema: z.string(),
    },
    async (input) => {
        const systemPrompt = `
You are "Jayboi Dispatch AI", a PORTAL ASSISTANT for Jayboi Services, LLC.
You help drivers navigate the portal and answer basic compliance questions.

The user is ${input.userName || 'a driver'}.

=== YOUR ROLE ===
- Help users navigate the Driver Portal
- Answer basic compliance questions (IFTA, 2290, DOT)
- ALWAYS direct users to contact the office for service inquiries, quotes, or purchases

=== CONTACT INFO (USE FREQUENTLY) ===
📞 Phone: 470-866-1408
✉️ Email: info@jayboiservicesllc.com
🌐 Services: jayboiservicesllc.com/services.html

=== PORTAL NAVIGATION HELP ===
- "My Files" tab: View and upload documents
- "Service Requests" tab: Submit new requests
- "Dashboard": See your stats and recent activity
- Upload: Use camera, gallery, or cloud storage (Google Drive/iCloud)

=== BASIC COMPLIANCE INFO (educational only) ===
- 2290: Heavy Highway Vehicle Use Tax for 55,000+ lb vehicles, due Aug 31st
- IFTA: Fuel tax agreement, requires quarterly filing
- DOT/MC: Required operating authority for commercial trucking
- BOC-3: Process agent filing requirement
- UCR: Unified Carrier Registration, annual requirement

=== RULES ===
1. NEVER quote specific prices - say "Contact us for current pricing"
2. NEVER try to process orders or sign people up
3. For ANY service questions: "Please call 470-866-1408 or email info@jayboiservicesllc.com"
4. For complex compliance questions: "Our team can help you with that! Call 470-866-1408"
5. Keep responses SHORT and helpful
6. Your job is to help with the PORTAL, not replace the sales team

=== EXAMPLE RESPONSES ===
Q: "How much is 2290 filing?"
A: "For current 2290 filing rates, please contact our office at 470-866-1408 or visit jayboiservicesllc.com/services.html. We offer same-day Schedule 1 proof!"

Q: "How do I upload a document?"
A: "Click on 'My Files' in the sidebar, then tap 'Upload File'. You can take a photo, choose from your gallery, or select from cloud storage like Google Drive."

Q: "I need help with my IFTA"
A: "For IFTA filing assistance, please call our team at 470-866-1408. They'll get you sorted out!"
        `;

        const { text } = await ai.generate({
            prompt: input.question,
            system: systemPrompt,
        });

        return text;
    }
);

// Flow 3: Public Website Chatbot - INFORMATIONAL ONLY
const dispatchBotFlow = ai.defineFlow(
    {
        name: "dispatchBotFlow",
        inputSchema: z.object({
            message: z.string(),
            history: z.array(z.object({ role: z.string(), content: z.string() })).optional()
        }),
        outputSchema: z.string(),
    },
    async (input) => {
        const userMsg = input.message;

        const systemPrompt = `
You are "JayBot", the AI Assistant for Jayboi Services, LLC.
You provide INFORMATION ONLY about our services. You do NOT perform any actual services.

=== CRITICAL RULES (NEVER BREAK THESE) ===
1. You are INFORMATIONAL ONLY - you cannot file 2290s, do IFTA, or perform ANY service
2. ALWAYS direct users to call 470-866-1408 or email info@jayboiservicesllc.com to GET STARTED
3. NEVER try to process, sign up, or complete any service yourself
4. NEVER give compliance advice that could replace our paid services
5. For ANY action beyond basic info: "Please call 470-866-1408 to get started!"
6. Keep responses SHORT (2-3 sentences max)

=== ABOUT US ===
• Owner: Calvin Manning
• Phone: 470-866-1408 (mention this frequently!)
• Email: info@jayboiservicesllc.com
• Website: jayboiservicesllc.com
• Experience: 15+ years in trucking compliance
• Location: Georgia, serving clients nationwide

=== SUBSCRIPTION PLANS ===
• Starter ($100/mo): Safety compliance package, driver file management, 24/7 JayBot AI support, document storage, deadline alerts
• Professional ($150/mo): Everything in Starter PLUS IFTA filing INCLUDED, 2290 filing INCLUDED, UCR renewal INCLUDED, priority phone support - "One Monthly Fee, Zero Stress"
• Fleet ($350/mo): Up to 10 driver accounts, dedicated account manager, audit preparation support, custom reporting

=== NEW AUTHORITY STARTUP PACKAGE ===
• $1,099 one-time fee (SAVE $500+!)
• Includes: MC Authority, DOT Number, BOC-3 Filing, UCR Registration, IFTA Setup, First 2290 Filing
• Perfect for new trucking businesses - everything needed to get on the road legally
• Most setups completed within 4-6 weeks

=== INDIVIDUAL SERVICES & PRICING ===
• 2290 Filing: $100 (same-day Schedule 1 proof available! 2 HOUR GUARANTEE!)
• IFTA Quarterly Filing: $75 per quarter
• MC/DOT Authority Setup: $599 (includes BOC-3 filing)
• DOT Number Only: $299
• Driver Qualification File Setup: $150 per driver
• Annual Compliance Audit: $299
• UCR Registration: $75
• Drug Testing Consortium: $50/month

=== DISPATCHING SERVICES ===
• Rate: 5% of gross revenue per load
• Includes: Load negotiation, route planning, back-office support
• Dedicated dispatcher assigned to your account
• 24/7 load board access

=== PROCESSING TIMES ===
• 2290 Filing: Same day (Schedule 1 proof within hours)
• IFTA: 3-5 business days
• MC Authority: 4-6 weeks (FMCSA processing)
• DOT Number: 1-2 business days
• Driver Files: 24-48 hours once documents received

=== EXAMPLE RESPONSES ===

User: "How much is 2290 filing?"
You: "2290 filing is $100 with same-day Schedule 1 proof! Ready to get yours filed? Call us at 470-866-1408 or visit jayboiservicesllc.com/services.html"

User: "Can you file my 2290?"
You: "I can't file it directly, but our team can get your 2290 filed same-day! Call 470-866-1408 to get started - they'll have your Schedule 1 proof in hours!"

User: "What is IFTA?"
You: "IFTA is the International Fuel Tax Agreement - a quarterly tax filing required for trucks operating across state lines. We handle IFTA filings for $75/quarter. Want help with yours? Call 470-866-1408!"

User: "I need help with compliance"
You: "We'd love to help! Our compliance packages start at just $79/mo. Give us a call at 470-866-1408 and we'll get you squared away!"

=== YOUR PERSONALITY ===
• Friendly and professional
• Use trucker-friendly language (10-4, haul, lane)
• Always end with a call-to-action (call or email)
• Be helpful but brief
• Show enthusiasm for helping truckers

Remember: You INFORM, you don't PERFORM. Always drive them to contact the business!
`;

        const { text } = await ai.generate({
            prompt: userMsg,
            system: systemPrompt,
        });

        return text;
    }
);

// Export as Firebase HTTPS callable functions
exports.dispatchBot = onRequest(async (req, res) => {
    try {
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }
        const result = await dispatchBotFlow(req.body);
        res.json({ response: result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

exports.processDriverDocument = onRequest(async (req, res) => {
    try {
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

exports.chatDispatchHelper = onRequest(async (req, res) => {
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

// Flow 4: Marketing Content Generator (Security: Hides API Key)
const marketingContentFlow = ai.defineFlow(
    {
        name: 'marketingContentFlow',
        inputSchema: z.object({
            prompt: z.string(),
        }),
        outputSchema: z.object({
            description: z.string(),
            suggestedTitle: z.string(),
        }),
    },
    async (input) => {
        const prompt = `
            You are a creative marketing expert for a logistics/trucking company.
            Task: Create a vivid concept description for a marketing image based on this input: "${input.prompt}".
            Also suggest a short, catchy title.
            
            Return JSON with properties: 'description' and 'suggestedTitle'.
        `;
        const { output } = await ai.generate({
            prompt,
            output: { format: 'json' }
        });
        return output;
    }
);

exports.generateMarketingContent = onCall(async (request) => {
    // Basic Auth Check
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // Admin/Owner Check validation 
    // For now we allow any authenticated user (e.g. drivers) to use it as a tool, 
    // OR we can restrict it. Let's restrict to admins for safety as it consumes quota.
    const ownerEmail = "theboiblazin2026@gmail.com";
    // Check if user is owner OR has admin custom claim
    const isAdmin = request.auth.token.email === ownerEmail || request.auth.token.admin === true;

    if (!isAdmin) {
        throw new HttpsError('permission-denied', 'Only Admins can generate marketing content.');
    }

    try {
        const result = await marketingContentFlow(request.data);
        return result;
    } catch (error) {
        console.error("Marketing Gen Error:", error);
        throw new HttpsError('internal', error.message);
    }
});

// --- User Management Functions (Admin Only) ---

exports.createUser = onCall(async (request) => {
    // Basic Auth Check
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // Owner Check
    const ownerEmail = "theboiblazin2026@gmail.com";
    if (request.auth.token.email !== ownerEmail) {
        throw new HttpsError('permission-denied', 'Only the Owner can create users.');
    }

    const { email, password, membership, role } = request.data;

    // Validate inputs
    if (!email || !password) {
        throw new HttpsError('invalid-argument', 'Email and password are required.');
    }

    try {
        // 1. Create User in Firebase Auth
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            emailVerified: true
        });

        // 2. Add Custom Claims (if admin)
        if (role === 'admin') {
            await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
        }

        // 3. Create User Profile in Firestore
        await admin.firestore().collection('users').doc(userRecord.uid).set({
            email: email,
            status: 'approved',
            membership: membership || 'starter',
            role: role || 'driver',
            createdAt: new Date().toISOString(),
            createdBy: request.auth.uid // Audit log
        });

        return { success: true, uid: userRecord.uid, message: `User ${email} created successfully.` };

    } catch (error) {
        console.error("Error creating user:", error);
        throw new HttpsError('internal', error.message);
    }
});


exports.deleteUser = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // Owner Check
    const ownerEmail = "theboiblazin2026@gmail.com";
    if (request.auth.token.email !== ownerEmail) {
        throw new HttpsError('permission-denied', 'Only the Owner can delete users.');
    }

    const { uid } = request.data;
    if (!uid) {
        throw new HttpsError('invalid-argument', 'UID is required.');
    }

    try {
        // 1. Delete from Auth
        await admin.auth().deleteUser(uid);

        // 2. Delete from Firestore
        await admin.firestore().collection('users').doc(uid).delete();

        return { success: true, message: "User deleted successfully." };
    } catch (error) {
        console.error("Error deleting user:", error);
        throw new HttpsError('internal', error.message);
    }
});

exports.updateUserPassword = onCall(async (request) => {
    // Auth Check
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // Owner Check
    const ownerEmail = "theboiblazin2026@gmail.com";
    if (request.auth.token.email !== ownerEmail) {
        throw new HttpsError('permission-denied', 'Only the Owner can update passwords.');
    }

    const { uid, newPassword } = request.data;
    if (!uid || !newPassword) {
        throw new HttpsError('invalid-argument', 'UID and new password are required.');
    }

    try {
        await admin.auth().updateUser(uid, {
            password: newPassword
        });

        return { success: true, message: "Password updated successfully." };
    } catch (error) {
        console.error("Error updating password:", error);
        throw new HttpsError('internal', error.message);
    }
});

// --- Google Sheets Integration ---
// Form submission to Google Sheets
const SPREADSHEET_ID = '1fw16e4MYXev2W2Yo-flQxaai77hUkC7cILUccCp8dUY';

// Force redeploy 2026-01-21
exports.submitToGoogleSheets = onRequest(
    {
        secrets: [sheetsServiceAccountJson],
        cors: true  // Enable CORS for frontend requests
    },
    async (req, res) => {
        // Handle preflight requests
        if (req.method === 'OPTIONS') {
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
            res.set('Access-Control-Allow-Headers', 'Content-Type');
            res.status(204).send('');
            return;
        }

        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method Not Allowed' });
            return;
        }

        try {
            const { name, email, phone, service, message, source, business, dot } = req.body;

            // Validate required fields
            if (!name || !email) {
                res.status(400).json({ error: 'Name and email are required' });
                return;
            }

            // Parse the service account JSON from the secret
            const serviceAccountCreds = JSON.parse(sheetsServiceAccountJson.value());

            // Create JWT auth using the parsed credentials
            const serviceAccountAuth = new JWT({
                email: serviceAccountCreds.client_email,
                key: serviceAccountCreds.private_key,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });

            // Connect to the spreadsheet
            const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
            await doc.loadInfo();

            // Get or create the sheet (use first sheet or create one)
            let sheet = doc.sheetsByIndex[0];

            // Setup headers if needed
            await sheet.loadHeaderRow();
            const headers = sheet.headerValues;

            // Check if we need to add new columns (Business, DOT)
            // Note: This simple check assumes if length is small, we're missing columns. 
            // Better to rely on the user adding them or just append if possible.
            // For now, we'll map the data to the expected header names. 
            // If the user hasn't added "Business Name" and "DOT Number" columns, these values won't save.

            // Add the new row
            const timestamp = new Date().toLocaleString('en-US', {
                timeZone: 'America/New_York',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            await sheet.addRow({
                'Timestamp': timestamp,
                'Name': name || '',
                'Business Name': business || '',
                'Email': email || '',
                'Phone': phone || '',
                'DOT Number': dot || '',
                'Service': service || 'General Inquiry',
                'Message': message || '',
                'Source': source || 'Contact Form',
                'Status': 'New'
            });

            console.log(`New lead added to Google Sheets: ${email}`);
            res.json({ success: true, message: 'Form submitted successfully!' });

        } catch (error) {
            console.error('Error submitting to Google Sheets:', error);
            res.status(500).json({
                error: 'Failed to submit form. Please try again or contact us directly.',
                details: error.message
            });
        }
    }
);
