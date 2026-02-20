/**
 * Contact Form Handler for Jayboi Services
 * Submits form data to:
 * 1. Google Sheets (via Firebase Function) - for lead tracking
 * 2. Formspree - for email notifications
 * 
 * Supports Contact Form, Get Started Form, and GENERIC Service Pages
 */

(function () {
    'use strict';

    // Firebase Function URL (deployed)
    const SHEETS_FUNCTION_URL = 'https://submittogooglesheets-muvce667eq-uc.a.run.app';

    // Default Formspree endpoint (fallback)
    const FORMSPREE_URL = 'https://formspree.io/f/xgoeldlb';

    /**
     * Initialize form handlers for all forms on the site
     */
    function initFormHandlers() {
        // Select specific named forms AND any form pointing to Formspree
        // We exclude #login-form explicitly to be safe
        const forms = document.querySelectorAll('#contactForm, #onboardingForm, form[action*="formspree"]');

        forms.forEach(form => {
            // Avoid double-binding
            if (form.dataset.handlerAttached) return;
            form.dataset.handlerAttached = 'true';

            // Explicitly exclude login forms
            if (form.id === 'login-form' || form.id === 'driver-login-form') return;

            // Remove native attributes to prevent default browser submission
            // We keep specific hidden fields but remove the action causing redirect
            // Actually, we keep the action so we can read it, but use preventDefault()

            form.addEventListener('submit', (e) => {
                // Determine source based on ID or Page Title
                let source = 'Website Form';
                if (form.id === 'contactForm') source = 'Contact Form';
                else if (form.id === 'onboardingForm') source = 'Get Started Form';
                else {
                    // Use page title or specific hidden field if available
                    const title = document.title.split('|')[0].trim();
                    source = title || 'Service Page';
                }

                handleFormSubmit(e, source);
            });
        });

        // Initialize DOT Auto-fill
        initDotAutoFill();
    }

    /**
     * Initialize DOT Number Auto-fill
     */
    function initDotAutoFill() {
        // Find inputs that look like DOT numbers
        const dotInputs = document.querySelectorAll('input[name="dot"], input[name="usdot"], input[id="dot"], input[name="dot_number"]');

        dotInputs.forEach(input => {
            // Avoid double-binding
            if (input.dataset.autofillAttached) return;
            input.dataset.autofillAttached = 'true';

            input.addEventListener('blur', async (e) => {
                const val = e.target.value.trim();
                // Extract just the number if they typed "USDOT 123456"
                const dotNumber = val.replace(/\D/g, '');

                if (dotNumber.length > 4) {
                    await fetchAndPopulateDotData(dotNumber, input.form);
                }
            });
        });
    }

    /**
     * Fetch data from FMCSA/Transportation.gov API and populate form
     */
    async function fetchAndPopulateDotData(dotNumber, form) {
        showMessage('Searching FMCSA database...', 'info');

        try {
            // Socrata API Endpoint for FMCSA Company Snapshot
            const url = `https://data.transportation.gov/resource/az4n-8mr2.json?dot_number=${dotNumber}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');

            const data = await response.json();

            if (data && data.length > 0) {
                const record = data[0];
                console.log("FMCSA Record Found:", record);

                // Helper to set value if empty or confirm overwrite
                const setField = (selector, value) => {
                    if (!value) return;
                    // Try multiple selectors
                    const field = form.querySelector(selector) || form.querySelector(`[name="${selector.replace('#', '')}"]`);
                    if (field) {
                        // Highlight the field briefly to show it was updated
                        field.style.transition = 'background-color 0.5s';
                        const originalBg = field.style.backgroundColor;
                        field.style.backgroundColor = '#64ffda20'; // Light accent color

                        field.value = value;

                        setTimeout(() => {
                            field.style.backgroundColor = originalBg;
                        }, 1000);
                    }
                };

                // Map Fields
                const companyName = record.legal_name || record.dba_name;
                // Phone comes as string, maybe sanitize formatting?
                const phone = record.phone;
                const email = record.email_address;

                // Extra Data for Message/Notes (Ghost Filled via Hidden Inputs)
                const address = `${record.phy_street || ''}, ${record.phy_city || ''}, ${record.phy_state || ''} ${record.phy_zip || ''}`.replace(/^, /, '').trim();

                // Helper to set hidden input
                const setHidden = (name, val) => {
                    let input = form.querySelector(`input[name="${name}"]`);
                    if (!input) {
                        input = document.createElement('input');
                        input.type = 'hidden';
                        input.name = name;
                        form.appendChild(input);
                    }
                    input.value = val;
                };

                // Ghost fill extra data
                setHidden('company_address', address);
                setHidden('truck_count', record.power_units || '0');
                setHidden('driver_count', record.total_drivers || '0');
                setHidden('mc_number', record.docket_number || ''); // Some records have docket info

                // Set values for visible fields
                setField('#business', companyName);
                setField('#company', companyName);
                setField('input[name="business"]', companyName);

                setField('#phone', phone);
                setField('input[name="phone"]', phone);

                if (email) {
                    setField('#email', email);
                    setField('input[name="email"]', email);
                }

                // Show success
                showMessage(`Found: ${companyName}`, 'success');

            } else {
                // Not found silently, or just log
                console.log("No record found for DOT " + dotNumber);
            }

        } catch (error) {
            console.error("Error fetching DOT data:", error);
            // Don't disturb user with error for auto-fill; just fail silently
        }
    }

    /**
     * Handle form submission
     */
    async function handleFormSubmit(event, source) {
        event.preventDefault();

        const form = event.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.textContent : 'Send Message';

        // 1. Determine Formspree Endpoint
        // Use the form's action attribute if it's a Formspree URL, otherwise default
        let formspreeEndpoint = FORMSPREE_URL;
        const action = form.getAttribute('action');
        if (action && action.includes('formspree.io')) {
            formspreeEndpoint = action;
        }

        // 2. Extract Fields for Google Sheets
        const formDataObj = new FormData(form);

        // Helper to find a value from multiple possible key names
        const getField = (...keys) => {
            for (const key of keys) {
                if (formDataObj.has(key)) return formDataObj.get(key);
                // Case-insensitive check
                for (const k of formDataObj.keys()) {
                    if (key.toLowerCase() === k.toLowerCase()) return formDataObj.get(k);
                }
            }
            return '';
        };

        const name = getField('name', 'contact_name', 'full_name', 'FullName');
        const email = getField('email', 'email_address', 'Email');
        const phone = getField('phone', 'phone_number', 'CellPhone', 'Phone');
        const business = getField('business', 'business_name', 'company', 'company_name', 'legal_name');
        const dot = getField('dot', 'usdot', 'dot_number', 'ein'); // Mapping EIN to DOT column temporarily if needed, or keeping it separate in Message

        // Services: Checkboxes or select
        const servicesChecked = Array.from(form.querySelectorAll('[name="services[]"]:checked'))
            .map(cb => cb.value);
        let serviceVal = servicesChecked.length > 0 ? servicesChecked.join(', ') : getField('service', 'service_type', 'Service', 'tax_period');

        const mainMessage = getField('message', 'comments', 'additional_info', 'inquiry');

        // 3. Capture Extra Data for Message Column
        // We append non-standard fields to the message body so no data is lost
        let extraDetails = [];
        const standardKeys = ['name', 'email', 'phone', 'business', 'business_name', 'dot', 'usdot', 'service', 'message', 'services[]', '_subject', '_next', '_cc', 'g-recaptcha-response'];

        for (const [key, value] of formDataObj.entries()) {
            const isStandard = standardKeys.some(k => k.toLowerCase() === key.toLowerCase())
                || key === 'contact_name' || key === 'phone_number' || key === 'service_type';

            if (!isStandard && value && value.trim() !== '') {
                // Format key: "truck_count" -> "Truck Count"
                const readableKey = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                extraDetails.push(`${readableKey}: ${value}`);
            }
        }

        const finalMessage = extraDetails.length > 0
            ? (mainMessage ? mainMessage + '\n\n--- Details ---\n' : '') + extraDetails.join('\n')
            : mainMessage;

        const sheetData = {
            name: name,
            email: email,
            phone: phone,
            business: business,
            dot: dot,
            service: serviceVal || 'Service Request',
            message: finalMessage,
            source: source
        };

        // Validate required fields
        if (!name || !email) {
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
            // 1. Google Sheets (structured)
            // 2. Formspree (raw form data)
            const [sheetsResult, formspreeResult] = await Promise.allSettled([
                submitToGoogleSheets(sheetData),
                submitToFormspree(form, formspreeEndpoint)
            ]);

            // Check results
            const sheetsSuccess = sheetsResult.status === 'fulfilled';
            const formspreeSuccess = formspreeResult.status === 'fulfilled';

            if (sheetsSuccess || formspreeSuccess) {
                // At least one succeeded - show success message
                showMessage('Thank you! We have received your request.', 'success');

                // Handle Redirect
                const redirectUrl = formDataObj.get('_redirect');
                if (redirectUrl && redirectUrl.startsWith('http')) {
                    showMessage(`Redirecting to payment...`, 'success'); // Optional: update message
                    setTimeout(() => {
                        window.location.href = redirectUrl;
                    }, 2000);
                }

                form.reset();
            } else {
                // Both failed
                console.error('Both submissions failed:', sheetsResult.reason, formspreeResult.reason);
                showMessage('There was an error sending your message. Please call us at 470-484-4814', 'error');
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
     * Uses the full FormData from the form element to ensure all hidden fields are sent.
     */
    async function submitToFormspree(formElement, endpoint) {
        const formData = new FormData(formElement);

        const response = await fetch(endpoint, {
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
            position: relative; 
            z-index: 100;
            ${type === 'success'
                ? 'background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white;'
                : 'background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white;'
            }
        `;
        msgDiv.textContent = text;

        // Insert after the active form (find generic or specific)
        // We try to find the button that was clicked or just append to the active form
        // Since showMessage is called from logic where we have 'form' reference?
        // Wait, showMessage doesn't take form arg. 
        // I need to fix showMessage to attach to the correct form!
        // The old code attached to 'contactForm'.
        // I'll update showMessage to find the visible/active form or just append to center of screen?
        // Better: append to the form that raised the event.
        // But I don't pass 'form' to showMessage.
        // I should update handleFormSubmit to pass 'form' to showMessage, OR update showMessage to act globally (toast).
        // Let's use a Toast-style message fixed at bottom or center?
        // Or finding the recently submitted form.

        // Strategy: Use a fixed toast for reliability.
        msgDiv.style.position = 'fixed';
        msgDiv.style.bottom = '20px';
        msgDiv.style.left = '50%';
        msgDiv.style.transform = 'translateX(-50%)';
        msgDiv.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        document.body.appendChild(msgDiv);

        // Auto-remove
        setTimeout(() => {
            msgDiv.style.opacity = '0';
            msgDiv.style.transition = 'opacity 0.3s ease';
            setTimeout(() => msgDiv.remove(), 300);
        }, type === 'success' ? 5000 : 8000);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFormHandlers);
    } else {
        initFormHandlers();
    }
})();
