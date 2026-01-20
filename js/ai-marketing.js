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

    // Server-Side Generation via Cloud Function
    // This removes the need for exposing the API Key on the client.

    try {
        statusEl.textContent = "Requesting secure generation...";
        generateBtn.disabled = true;
        resultContainer.style.display = 'none';

        // dynamic import to ensure we get the functions instance from firebase-config
        const { functions } = await import('./firebase-config.js');
        const { httpsCallable } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js");

        const generateContent = httpsCallable(functions, 'generateMarketingContent');

        statusEl.textContent = "AI is brainstorming...";

        const result = await generateContent({ prompt: promptText });
        const data = result.data; // { description, suggestedTitle }

        statusEl.textContent = "Concept Generated!";

        resultContainer.style.display = 'block';

        // Use Unsplash for placeholder visualization
        resultImg.src = `https://source.unsplash.com/800x600/?truck,${encodeURIComponent(promptText.split(' ')[0])}`;

        // Display the text concept
        const textContainer = document.createElement('div');
        // Clear previous
        const existingText = resultContainer.querySelector('.ai-text-result');
        if (existingText) existingText.remove();

        textContainer.className = 'ai-text-result';
        textContainer.innerHTML = `
            <h4 style="margin-top:15px; color: var(--accent);">${data.suggestedTitle}</h4>
            <p style="color: var(--text-light); font-style: italic;">"${data.description}"</p>
        `;
        resultContainer.appendChild(textContainer);

    } catch (e) {
        console.error(e);
        let msg = e.message;
        if (msg.includes("permission-denied")) {
            msg = "Access Denied: You must be an Admin to use this feature.";
        }
        statusEl.textContent = "Error: " + msg;
    } finally {
        generateBtn.disabled = false;
    }
}
