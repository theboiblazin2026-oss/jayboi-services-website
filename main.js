import { db } from './js/firebase-config.js';
import { doc, getDoc, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { sanitizeInput, rateLimiter, showToast, validateEmail, validatePhone } from './js/utils.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Current Year Update
    const yearSpan = document.getElementById('current-year');
    if (yearSpan) {
        yearSpan.textContent = new Date().getFullYear();
    }

    // Scroll Reveal
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('show');
        });
    });
    const hiddenElements = document.querySelectorAll('.card, .hero-content');
    hiddenElements.forEach((el) => observer.observe(el));

    // --- ONBOARDING FORM HANDLER ---
    const onboardingForm = document.getElementById('onboardingForm');
    if (onboardingForm) {
        onboardingForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            if (!rateLimiter.check('onboarding-form', 3, 60000)) {
                showToast('Too many attempts. Please wait a minute before trying again.', 'warning');
                return;
            }

            const submitButton = onboardingForm.querySelector('button[type="submit"]');
            const originalButtonText = submitButton.textContent;
            submitButton.textContent = 'Processing...';
            submitButton.disabled = true;

            const formData = new FormData(onboardingForm);
            const data = Object.fromEntries(formData.entries());

            // Fix services[] array
            const services = formData.getAll('services[]');
            if (services.length > 0) {
                data['services'] = services;
                delete data['services[]'];
            }

            if (data.email && !validateEmail(data.email)) {
                showToast('Please enter a valid email address.', 'error');
                submitButton.textContent = originalButtonText;
                submitButton.disabled = false;
                return;
            }

            if (data.phone && !validatePhone(data.phone)) {
                showToast('Please enter a valid phone number.', 'error');
                submitButton.textContent = originalButtonText;
                submitButton.disabled = false;
                return;
            }

            const sanitizedData = sanitizeInput(data);

            let firestoreSuccess = false;
            let formspreeSuccess = false;
            let errors = [];

            // 1. Try Firestore
            try {
                await addDoc(collection(db, "requests"), {
                    ...sanitizedData,
                    timestamp: new Date().toISOString(),
                    status: 'pending'
                });
                firestoreSuccess = true;
                console.log("Firestore save success");
            } catch (err) {
                console.error("Firestore Error:", err);
                errors.push("Database: " + err.message);
            }

            // 2. Try Formspree (Backup)
            try {
                const response = await fetch(onboardingForm.action, {
                    method: 'POST',
                    body: JSON.stringify(sanitizedData),
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
                });
                if (response.ok) {
                    formspreeSuccess = true;
                } else {
                    const errData = await response.json();
                    console.error("Formspree Error:", errData);
                    // Don't fail the whole process if just email fails, provided DB worked
                }
            } catch (err) {
                console.error("Formspree Network Error:", err);
                // Don't fail if just email fails
            }

            // 3. Determine Outcome
            if (firestoreSuccess || formspreeSuccess) {
                rateLimiter.reset('onboarding-form');
                showToast('Request received! We have securely saved your information and will contact you shortly.', 'success');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
            } else {
                console.error("All submissions failed:", errors);
                showToast('There was an issue submitting your request. Please call us directly at 470-484-4814.', 'error');
                submitButton.textContent = originalButtonText;
                submitButton.disabled = false;
            }
        });
    }

    // --- CONTACT FORM AJAX HANDLING ---
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const submitButton = contactForm.querySelector('button[type="submit"]');
            const originalButtonText = submitButton.textContent;
            submitButton.textContent = 'Sending...';
            submitButton.disabled = true;

            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData.entries());

            const services = formData.getAll('services[]');
            if (services.length > 0) {
                data['services'] = services;
                delete data['services[]'];
            }

            if (data.email && !validateEmail(data.email)) {
                showToast('Please enter a valid email address.', 'error');
                submitButton.textContent = originalButtonText;
                submitButton.disabled = false;
                return;
            }

            if (data.phone && !validatePhone(data.phone)) {
                showToast('Please enter a valid phone number.', 'error');
                submitButton.textContent = originalButtonText;
                submitButton.disabled = false;
                return;
            }

            const sanitizedData = sanitizeInput(data);

            try {
                const response = await fetch(contactForm.action, {
                    method: 'POST',
                    body: JSON.stringify(sanitizedData),
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });

                if (response.ok) {
                    rateLimiter.reset('contact-form');
                    showToast('Message sent successfully! We\'ll get back to you soon.', 'success');
                    setTimeout(() => {
                        window.location.href = 'success.html';
                    }, 2000);
                } else {
                    const responseData = await response.json();
                    if (Object.hasOwn(responseData, 'errors')) {
                        showToast(responseData["errors"].map(error => error["message"]).join(", "), 'error');
                    } else {
                        showToast("Oops! There was a problem submitting your form", 'error');
                    }
                    submitButton.textContent = originalButtonText;
                    submitButton.disabled = false;
                }
            } catch (error) {
                console.error('Error submitting form:', error);
                showToast("Oops! There was a problem submitting your form", 'error');
                alert("Oops! There was a problem submitting your form");
                submitButton.textContent = originalButtonText;
                submitButton.disabled = false;
            }
        });
    }

    // --- LIVE UPDATES ---
    try {
        const docRef = doc(db, "content", "main");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log("Live Data Loaded:", data);

            // 1. Theme (CSS Variables)
            if (data.theme) {
                const root = document.documentElement;
                if (data.theme.primary) root.style.setProperty('--primary', data.theme.primary);
                if (data.theme.secondary) root.style.setProperty('--secondary', data.theme.secondary);
                if (data.theme.accent) root.style.setProperty('--accent', data.theme.accent);

                // Images
                if (data.theme.logoUrl) {
                    document.querySelectorAll('.logo-img').forEach(img => img.src = data.theme.logoUrl);
                }
                if (data.theme.heroUrl) {
                    // Update hero background
                    const hero = document.querySelector('.hero');
                    if (hero) {
                        hero.style.background = `linear-gradient(rgba(10, 25, 47, 0.9), rgba(10, 25, 47, 0.95)), url('${data.theme.heroUrl}')`;
                        hero.style.backgroundSize = 'cover';
                        hero.style.backgroundPosition = 'center';
                        hero.style.backgroundAttachment = 'fixed';
                    }
                }
            }

            // 2. Settings (Phone/Email)
            if (data.settings) {
                // We need to target text content that contains phone/email
                // This is a bit loose, targeting specific footer items would be better with IDs
                // For now, let's look for specific placeholders if we can, or just expect IDs
                // Added IDs to footer items check? No IDs yet.
                // Let's use the provided content in Contact page as reference
            }

            // 3. Core Solutions (Update text content)
            if (data.solutions && data.solutions.length > 0) {
                // Map to cards. Assuming order 0->Dispatching, 1->2290
                // Dispatching Card
                const cards = document.querySelectorAll('.card');
                // This is brittle without IDs, but matches current DOM order
                // Card 0: Authority, Card 1: 2290, Card 2: Dispatching
                // Wait, index.html order: Authority, 2290, Dispatching

                // Update 2290 (Index 1)
                if (cards[1] && data.solutions[1]) {
                    cards[1].querySelector('h3').textContent = data.solutions[1].title;
                    cards[1].querySelector('p').textContent = data.solutions[1].desc;
                }
                // Update Dispatching (Index 2)
                if (cards[2] && data.solutions[0]) {
                    cards[2].querySelector('h3').textContent = data.solutions[0].title;
                    cards[2].querySelector('p').textContent = data.solutions[0].desc;
                }
            }

            // 4. Pricing Table
            const pricingBody = document.getElementById('pricing-table-body');
            if (pricingBody) {
                if (data.pricing && Array.isArray(data.pricing) && data.pricing.length > 0) {
                    pricingBody.innerHTML = '';
                    data.pricing.forEach(item => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td>${item.service}</td>
                            <td class="price-tag">${item.price}</td>
                        `;
                        pricingBody.appendChild(tr);
                    });
                } else {
                    pricingBody.innerHTML = '<tr><td colspan="2" style="text-align: center; padding: 2rem;">No pricing data available. Please update in Admin Dashboard.</td></tr>';
                }
            }
        }
    } catch (error) {
        console.error("Error fetching live data:", error);
    }
});
