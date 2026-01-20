const sanitizeHTML = (str) => {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
};

const sanitizeInput = (input) => {
    if (typeof input === 'string') {
        return sanitizeHTML(input.trim());
    }
    if (Array.isArray(input)) {
        return input.map(item => sanitizeHTML(String(item).trim()));
    }
    if (typeof input === 'object' && input !== null) {
        const sanitized = {};
        for (const [key, value] of Object.entries(input)) {
            sanitized[key] = sanitizeInput(value);
        }
        return sanitized;
    }
    return input;
};

const rateLimiter = (() => {
    const attempts = new Map();
    
    return {
        check: (key, maxAttempts = 3, windowMs = 60000) => {
            const now = Date.now();
            const record = attempts.get(key) || { count: 0, resetTime: now + windowMs };
            
            if (now > record.resetTime) {
                attempts.set(key, { count: 1, resetTime: now + windowMs });
                return true;
            }
            
            if (record.count >= maxAttempts) {
                return false;
            }
            
            record.count++;
            attempts.set(key, record);
            return true;
        },
        reset: (key) => {
            attempts.delete(key);
        }
    };
})();

const showToast = (message, type = 'info') => {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.textContent = message;
    
    const styles = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    
    toast.style.cssText = styles;
    
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };
    
    toast.style.backgroundColor = colors[type] || colors.info;
    
    if (!document.querySelector('style[data-toast-styles]')) {
        const styleSheet = document.createElement('style');
        styleSheet.setAttribute('data-toast-styles', '');
        styleSheet.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(400px);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(styleSheet);
    }
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
};

const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

const validatePhone = (phone) => {
    const re = /^[\d\s\-\(\)\+]+$/;
    return re.test(phone) && phone.replace(/\D/g, '').length >= 10;
};

export { sanitizeHTML, sanitizeInput, rateLimiter, showToast, validateEmail, validatePhone };
