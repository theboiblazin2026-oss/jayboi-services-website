// Email Capture Popup for Lead Generation
// Shows a popup after 5 seconds to capture email for free checklist

(function () {
    // Don't show popup if user already submitted or dismissed
    if (localStorage.getItem('popupDismissed') || localStorage.getItem('checklistSubscribed')) {
        return;
    }

    // Don't show on the free-checklist page itself
    if (window.location.pathname.includes('free-checklist') ||
        window.location.pathname.includes('compliance-checklist')) {
        return;
    }

    // Create popup after 5 seconds
    setTimeout(createPopup, 5000);

    function createPopup() {
        const overlay = document.createElement('div');
        overlay.id = 'email-popup-overlay';
        overlay.innerHTML = `
            <div class="email-popup">
                <button class="popup-close" aria-label="Close popup">&times;</button>
                <div class="popup-content">
                    <div class="popup-icon">📋</div>
                    <h2>Free Compliance Checklist</h2>
                    <p>Avoid DOT fines & stay legal. Get the 2026 trucking compliance checklist for owner-operators.</p>
                    <a href="free-checklist.html" class="btn btn-primary popup-cta">Get It Free →</a>
                    <button class="popup-dismiss">No thanks, I'll risk it</button>
                </div>
            </div>
        `;

        // Add styles
        const styles = document.createElement('style');
        styles.textContent = `
            #email-popup-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                animation: fadeIn 0.3s ease;
            }
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            .email-popup {
                background: linear-gradient(135deg, #1a1f2e 0%, #0f1219 100%);
                border: 2px solid #64ffda;
                border-radius: 16px;
                padding: 2.5rem;
                max-width: 420px;
                width: 90%;
                position: relative;
                animation: slideUp 0.4s ease;
                box-shadow: 0 20px 60px rgba(100, 255, 218, 0.15);
            }
            @keyframes slideUp {
                from { transform: translateY(30px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            .popup-close {
                position: absolute;
                top: 12px;
                right: 16px;
                background: none;
                border: none;
                color: #8892b0;
                font-size: 28px;
                cursor: pointer;
                transition: color 0.2s;
            }
            .popup-close:hover {
                color: #64ffda;
            }
            .popup-content {
                text-align: center;
            }
            .popup-icon {
                font-size: 48px;
                margin-bottom: 1rem;
            }
            .popup-content h2 {
                color: #ccd6f6;
                font-size: 1.5rem;
                margin-bottom: 0.75rem;
            }
            .popup-content p {
                color: #8892b0;
                font-size: 1rem;
                line-height: 1.5;
                margin-bottom: 1.5rem;
            }
            .popup-cta {
                display: block;
                width: 100%;
                padding: 14px 24px;
                font-size: 1.1rem;
                font-weight: 600;
                text-decoration: none;
                border-radius: 8px;
                transition: transform 0.2s, box-shadow 0.2s;
            }
            .popup-cta:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(100, 255, 218, 0.3);
            }
            .popup-dismiss {
                background: none;
                border: none;
                color: #5a6a8a;
                font-size: 0.85rem;
                cursor: pointer;
                margin-top: 1rem;
                transition: color 0.2s;
            }
            .popup-dismiss:hover {
                color: #8892b0;
            }
        `;
        document.head.appendChild(styles);
        document.body.appendChild(overlay);

        // Close handlers
        overlay.querySelector('.popup-close').addEventListener('click', dismissPopup);
        overlay.querySelector('.popup-dismiss').addEventListener('click', dismissPopup);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) dismissPopup();
        });

        // Track CTA click
        overlay.querySelector('.popup-cta').addEventListener('click', () => {
            localStorage.setItem('popupDismissed', 'true');
            // Track in GA4
            if (typeof gtag === 'function') {
                gtag('event', 'popup_cta_click', {
                    'event_category': 'engagement',
                    'event_label': 'free_checklist_popup'
                });
            }
        });

        function dismissPopup() {
            overlay.style.animation = 'fadeIn 0.3s ease reverse';
            setTimeout(() => overlay.remove(), 300);
            localStorage.setItem('popupDismissed', 'true');
            // Track dismissal in GA4
            if (typeof gtag === 'function') {
                gtag('event', 'popup_dismissed', {
                    'event_category': 'engagement',
                    'event_label': 'free_checklist_popup'
                });
            }
        }
    }
})();
