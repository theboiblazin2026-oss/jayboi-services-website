
// Jayboi Dispatch AI Bot - Floating Widget
(function () {
    // Create widget container
    const widget = document.createElement('div');
    widget.id = 'jaybot-widget';
    document.body.appendChild(widget);

    // CSS Styling
    const style = document.createElement('style');
    style.textContent = `
        #jaybot-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 60px;
            height: 60px;
            background: #64ffda;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 30px;
            z-index: 9999;
            transition: all 0.3s;
        }
        #jaybot-btn:hover {
            transform: scale(1.1);
        }
        #jaybot-window {
            position: fixed;
            bottom: 90px;
            right: 20px;
            width: 350px;
            height: 500px;
            background: #112240;
            border: 1px solid #233554;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.4);
            display: none;
            flex-direction: column;
            z-index: 9999;
            overflow: hidden;
        }
        #jaybot-header {
            background: #0a192f;
            padding: 15px;
            color: #64ffda;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #233554;
        }
        #jaybot-messages {
            flex: 1;
            padding: 15px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .msg {
            padding: 8px 12px;
            border-radius: 8px;
            max-width: 80%;
            font-size: 14px;
            line-height: 1.4;
        }
        .bot {
            background: #233554;
            color: #ccd6f6;
            align-self: flex-start;
            border-bottom-left-radius: 2px;
        }
        .user {
            background: #64ffda;
            color: #0a192f;
            align-self: flex-end;
            border-bottom-right-radius: 2px;
        }
        #jaybot-input-area {
            padding: 15px;
            background: #0a192f;
            display: flex;
            gap: 10px;
        }
        #jaybot-input {
            flex: 1;
            padding: 8px;
            border-radius: 4px;
            border: 1px solid #233554;
            background: #112240;
            color: white;
            outline: none;
        }
        #jaybot-send {
            background: #64ffda;
            border: none;
            padding: 8px 15px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
        }
    `;
    document.head.appendChild(style);

    // HTML Structure
    const btn = document.createElement('div');
    btn.id = 'jaybot-btn';
    btn.innerHTML = '🚚';

    const windowDiv = document.createElement('div');
    windowDiv.id = 'jaybot-window';
    windowDiv.innerHTML = `
        <div id="jaybot-header">
            <span>JayBot Dispatch AI</span>
            <span style="cursor:pointer; font-size:20px;" onclick="document.getElementById('jaybot-window').style.display='none'">&times;</span>
        </div>
        <div id="jaybot-messages">
            <div class="msg bot">10-4 Good Buddy! I'm JayBot. How can I help you today?</div>
        </div>
        <div id="jaybot-input-area">
            <input type="text" id="jaybot-input" placeholder="Ask about IFTA, 2290...">
            <button id="jaybot-send">Send</button>
        </div>
    `;

    widget.appendChild(btn);
    widget.appendChild(windowDiv);

    // Logic
    const chatWindow = document.getElementById('jaybot-window');
    const messages = document.getElementById('jaybot-messages');
    const input = document.getElementById('jaybot-input');
    const sendBtn = document.getElementById('jaybot-send');

    btn.addEventListener('click', () => {
        chatWindow.style.display = chatWindow.style.display === 'flex' ? 'none' : 'flex';
    });

    const addMessage = (text, type) => {
        const div = document.createElement('div');
        div.className = `msg ${type}`;
        div.textContent = text;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    };

    const sendMessage = async () => {
        const text = input.value.trim();
        if (!text) return;

        addMessage(text, 'user');
        input.value = '';
        input.disabled = true;

        // Call Cloud Function (Using raw fetch for simplicity, or import firebase logic)
        try {
            // Replace this with your actual Cloud Function URL if not using rewriting, or internal path
            // Assuming firebase hosting rewrite points /api/dispatchBot to the function
            const response = await fetch('/dispatchBot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server Error (${response.status}): ${errorText.substring(0, 100)}`);
            }

            const data = await response.json();

            // Adjust depending on how your function wraps the response (Genkit often returns object)
            // Our function returns { response: "string" }
            if (data.response) {
                addMessage(data.response, 'bot');
            } else {
                addMessage("Error: Empty response from AI.", 'bot');
            }
        } catch (e) {
            console.error(e);
            addMessage(`Connection Failed: ${e.message}`, 'bot');
        } finally {
            input.disabled = false;
            input.focus();
        }
    };

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

})();
