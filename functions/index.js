const { googleAI } = require('@genkit-ai/googleai');
const { genkit, z } = require('genkit');
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (admin.apps.length === 0) {
    admin.initializeApp();
}

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
📞 Phone: 470-484-4814
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
3. For ANY service questions: "Please call 470-484-4814 or email info@jayboiservicesllc.com"
4. For complex compliance questions: "Our team can help you with that! Call 470-484-4814"
5. Keep responses SHORT and helpful
6. Your job is to help with the PORTAL, not replace the sales team

=== EXAMPLE RESPONSES ===
Q: "How much is 2290 filing?"
A: "For current 2290 filing rates, please contact our office at 470-484-4814 or visit jayboiservicesllc.com/services.html. We offer same-day Schedule 1 proof!"

Q: "How do I upload a document?"
A: "Click on 'My Files' in the sidebar, then tap 'Upload File'. You can take a photo, choose from your gallery, or select from cloud storage like Google Drive."

Q: "I need help with my IFTA"
A: "For IFTA filing assistance, please call our team at 470-484-4814. They'll get you sorted out!"
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
