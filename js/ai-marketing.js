export async function initAI() {
    console.log("Initializing AI Marketing Studio...");

    // UI Event Listeners
    const generateBtn = document.getElementById('ai-generate-btn');
    const downloadBtn = document.getElementById('ai-download-btn');

    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerate);
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const img = document.getElementById('ai-generated-image');
            const link = document.createElement('a');
            link.href = img.src;
            link.download = `jayboi-marketing-${Date.now()}.png`;
            link.click();
        });
    }
}

async function handleGenerate() {
    const promptInput = document.getElementById('ai-prompt');
    const statusEl = document.getElementById('ai-status');
    const resultContainer = document.getElementById('ai-result-container');
    const resultImg = document.getElementById('ai-generated-image');
    const generateBtn = document.getElementById('ai-generate-btn');

    const promptText = promptInput.value.trim();
    if (!promptText) {
        alert("Please enter a description for the image.");
        return;
    }

    // Client-Side Key Management (Demo/Prototype)
    let apiKey = localStorage.getItem("GOOGLE_API_KEY");
    if (!apiKey) {
        apiKey = prompt("Please enter your Google AI Studio API Key to generate images:");
        if (apiKey) localStorage.setItem("GOOGLE_API_KEY", apiKey);
    }

    if (!apiKey) return;

    try {
        statusEl.textContent = "Generating... (this may take a moment)";
        generateBtn.disabled = true;
        resultContainer.style.display = 'none';

        // NOTE: Direct access to Nano Banana (Imagen) via Studio API in JS
        // Using the v1beta endpoint for 'models/image-generation-002' or similar if available.
        // However, standard Google AI Studio often provides Gemini (text/vision).
        // WE will try to use the multi-modal generation capability or a specific known endpoint.
        // If image generation specific model isn't available, this might need a backend proxy.
        // For this demo, we will attempt the 'gemini-pro' text model to generate a DESCRIPTION of what it would draw
        // OR if the user provides a key with Vertex/Imagen access.

        // Actually, let's use the standard fetch to check connectivity first.

        // Construct standard GenerateContent request (Text-to-Text Example)
        // const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;

        // For Image Generation, we currently need to use specific endpoints. 
        // As of early 2026, if public API support for imagen is in `generativelanguage.googleapis.com`, we use that.
        // Let's assume a hypothetical compliant endpoint for "Nano Banana" image generation.

        // MOCK/PLACEHOLDER logic for "Verification" phase before we have the real key/endpoint details confirmed:
        // We will simulate the delay and show a placeholder or text result if the key is invalid.

        // Real logic attempt:
        // Attempt to call Gemini to "imagine" a description first (Text Generation is universally supported).

        statusEl.textContent = "Asking Gemini...";

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Write a vivid, 1-paragraph description of a marketing image for a trucking company based on this prompt: "${promptText}".`
                    }]
                }]
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const description = data.candidates[0].content.parts[0].text;

        // Since we can't do real Image Gen client-side easily without a specific (often private) endpoint or proxy,
        // we will display the TEXT description as the "AI Concept" and use a placeholder image.
        // UNLESS we use a third party.

        statusEl.textContent = "Concept Generated! (Image Gen requires backend setup)";

        resultContainer.style.display = 'block';
        // Use a placeholder image from Unsplash that matches "truck" context
        resultImg.src = `https://source.unsplash.com/800x600/?truck,${encodeURIComponent(promptText.split(' ')[0])}`;

        // Display the text concept too
        const textContainer = document.createElement('div');
        textContainer.innerHTML = `<p style="color: var(--text-light); margin-top: 10px; font-style: italic;">"AI Concept: ${description}"</p>`;
        // Clear previous concepts
        const prev = resultContainer.querySelector('p[style*="font-style: italic"]');
        if (prev) prev.remove();
        resultContainer.appendChild(textContainer.firstChild);

    } catch (e) {
        console.error(e);
        statusEl.textContent = "Error: " + e.message;
        localStorage.removeItem("GOOGLE_API_KEY"); // Clear if invalid
    } finally {
        generateBtn.disabled = false;
    }
}
