/**
 * Contact Form Handler for Jayboi Services
 * Submits form data to:
 * 1. Google Sheets (via Firebase Function) - for lead tracking
 * 2. Formspree - for email notifications
 */

(function () {
    'use strict';

    // Firebase Function URL (deployed)
    const SHEETS_FUNCTION_URL = 'https://submittogooglesheets-muvce667eq-uc.a.run.app';

    // Formspree endpoint (existing)
    const FORMSPREE_URL = 'https://formspree.io/f/xgoeldlb';

    /**
     * Initialize the contact form handler
     */
    function initContactForm() {
        const form = document.getElementById('contactForm');
        if (!form) return;

        // Remove the default form action to handle submission via JavaScript
        form.removeAttribute('action');

        form.addEventListener('submit', handleFormSubmit);
    }

    /**
     * Handle form submission
     */
    async function handleFormSubmit(event) {
        event.preventDefault();

        const form = event.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.textContent : 'Send Message';

        // Get form data
        const formData = {
            name: form.querySelector('[name="name"]')?.value || '',
            email: form.querySelector('[name="email"]')?.value || '',
            phone: form.querySelector('[name="phone"]')?.value || '',
            service: form.querySelector('[name="service"]')?.value || 'General Inquiry',
            message: form.querySelector('[name="message"]')?.value || '',
            source: 'Contact Form'
        };

        // Validate required fields
        if (!formData.name || !formData.email) {
            showMessage('Please fill in your name and email.', 'error');
            return;
        }

        // Disable submit button and show loading state
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';
        }

        try {
            // Submit to both endpoints in parallel
            const [sheetsResult, formspreeResult] = await Promise.allSettled([
                submitToGoogleSheets(formData),
                submitToFormspree(formData)
            ]);

            // Check results
            const sheetsSuccess = sheetsResult.status === 'fulfilled';
            const formspreeSuccess = formspreeResult.status === 'fulfilled';

            if (sheetsSuccess || formspreeSuccess) {
                // At least one succeeded - show success message
                showMessage('Thank you! Your message has been sent. We\'ll get back to you soon!', 'success');
                form.reset();
            } else {
                // Both failed
                console.error('Both submissions failed:', sheetsResult.reason, formspreeResult.reason);
                showMessage('There was an error sending your message. Please call us at 470-484-4814 or email info@jayboiservicesllc.com', 'error');
            }

        } catch (error) {
            console.error('Form submission error:', error);
            showMessage('There was an error sending your message. Please call us at 470-484-4814', 'error');
        } finally {
            // Re-enable submit button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            }
        }
    }

    /**
     * Submit form data to Google Sheets via Firebase Function
     */
    async function submitToGoogleSheets(data) {
        const response = await fetch(SHEETS_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to submit to Google Sheets');
        }

        return response.json();
    }

    /**
     * Submit form data to Formspree for email notifications
     */
    async function submitToFormspree(data) {
        const formData = new FormData();
        formData.append('name', data.name);
        formData.append('email', data.email);
        formData.append('phone', data.phone);
        formData.append('service', data.service);
        formData.append('message', data.message);

        const response = await fetch(FORMSPREE_URL, {
            method: 'POST',
            body: formData,
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to submit to Formspree');
        }

        return response.json();
    }

    /**
     * Show a message to the user (success or error)
     */
    function showMessage(text, type) {
        // Remove any existing message
        const existingMsg = document.querySelector('.form-message');
        if (existingMsg) existingMsg.remove();

        // Create message element
        const msgDiv = document.createElement('div');
        msgDiv.className = `form-message form-message-${type}`;
        msgDiv.style.cssText = `
            padding: 15px 20px;
            margin: 15px 0;
            border-radius: 8px;
            font-weight: 500;
            text-align: center;
            animation: fadeIn 0.3s ease;
            ${type === 'success'
                ? 'background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white;'
                : 'background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white;'
            }
        `;
        msgDiv.textContent = text;

        // Insert after form
        const form = document.getElementById('contactForm');
        if (form) {
            form.parentNode.insertBefore(msgDiv, form.nextSibling);
        }

        // Auto-remove after 10 seconds for success, keep error longer
        setTimeout(() => {
            msgDiv.style.opacity = '0';
            msgDiv.style.transition = 'opacity 0.3s ease';
            setTimeout(() => msgDiv.remove(), 300);
        }, type === 'success' ? 10000 : 15000);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initContactForm);
    } else {
        initContactForm();
    }
})();
