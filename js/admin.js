import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, addDoc, query, where } from
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { initAI } from './ai-marketing.js';

// ========================
// SESSION TIMEOUT SECURITY
// ========================
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity
let sessionTimeout = null;
let warningTimeout = null;
let lastActivity = Date.now();

function resetSessionTimer() {
    lastActivity = Date.now();

    // Clear existing timeouts
    if (sessionTimeout) clearTimeout(sessionTimeout);
    if (warningTimeout) clearTimeout(warningTimeout);

    // Hide warning if visible
    const warningBanner = document.getElementById('session-warning');
    if (warningBanner) warningBanner.style.display = 'none';

    // Set warning at 25 minutes (5 min before timeout)
    warningTimeout = setTimeout(() => {
        showSessionWarning();
    }, SESSION_TIMEOUT_MS - (5 * 60 * 1000));

    // Set actual timeout at 30 minutes
    sessionTimeout = setTimeout(() => {
        handleSessionTimeout();
    }, SESSION_TIMEOUT_MS);
}

function showSessionWarning() {
    let warningBanner = document.getElementById('session-warning');
    if (!warningBanner) {
        warningBanner = document.createElement('div');
        warningBanner.id = 'session-warning';
        warningBanner.innerHTML = `
            <div style="position: fixed; top: 0; left: 0; right: 0; background: #ffd166; color: #333; padding: 12px 20px; text-align: center; z-index: 9999; font-weight: bold;">
                ⚠️ Your session will expire in 5 minutes due to inactivity. 
                <button onclick="window.extendSession()" style="margin-left: 15px; padding: 5px 15px; background: #333; color: white; border: none; border-radius: 4px; cursor: pointer;">Stay Logged In</button>
            </div>
        `;
        document.body.prepend(warningBanner);
    }
    warningBanner.style.display = 'block';
}

function handleSessionTimeout() {
    // Clear all timeouts
    if (sessionTimeout) clearTimeout(sessionTimeout);
    if (warningTimeout) clearTimeout(warningTimeout);

    alert("⏰ Your session has expired due to inactivity. Please log in again.");
    signOut(auth).then(() => {
        window.location.href = 'login.html';
    });
}

window.extendSession = function () {
    resetSessionTimer();
    console.log("Session extended");
};

// Track user activity
const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
activityEvents.forEach(event => {
    document.addEventListener(event, () => {
        // Only reset if more than 1 second since last activity (prevent constant resets)
        if (Date.now() - lastActivity > 1000) {
            resetSessionTimer();
        }
    }, { passive: true });
});

// Initialize Functions
const functions = getFunctions();

// Navigation Logic
const navItems = document.querySelectorAll('.nav-item:not(.logout-btn)');
const sections = document.querySelectorAll('.content-section');

navItems.forEach((item, index) => {
    item.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        sections.forEach(s => s.style.display = 'none');
        item.classList.add('active');

        // 0=Dashboard, 1=Requests, 2=Core, 3=Pricing, 4=Theme, 5=AI, 6=Settings, 7=Users, 8=ClientFiles
        const sectionIds = ['section-dashboard', 'section-requests', 'section-core', 'section-pricing', 'section-theme', 'section-ai',
            'section-settings', 'section-users', 'section-clientfiles'];

        if (sectionIds[index]) {
            document.getElementById(sectionIds[index]).style.display = 'block';
            if (sectionIds[index] === 'section-users') loadUsers();
            if (sectionIds[index] === 'section-requests') loadRequests();
            if (sectionIds[index] === 'section-clientfiles') loadClientFiles();
        }
    });
});

// Helper: Add Pricing Row (defined early so it's available in loadDashboardData)
window.addPricingRow = function (service = "", price = "") {
    const tbody = document.getElementById('pricing-table-body');
    const tr = document.createElement('tr');
    tr.innerHTML = `
    <td style="padding: 10px;"><input type="text" value="${service}" style="width: 100%;"></td>
    <td style="padding: 10px;"><input type="text" value="${price}" style="width: 100%;"></td>
    <td style="padding: 10px; text-align: center;">
        <button onclick="this.closest('tr').remove()"
            style="background: none; border: none; cursor: pointer;">🗑️</button>
    </td>
    `;
    tbody.appendChild(tr);
};

// Owner emails - these have FULL edit access to the admin panel
const OWNER_EMAILS = [
    'theboiblazin2026@gmail.com',
    'admin@jayboiservicesllc.com'
];

// All allowed admin emails (includes owners + read-only admins)
const ALLOWED_ADMIN_EMAILS = [
    ...OWNER_EMAILS
    // Add read-only admin emails here if needed
];

// Check if user is an admin via email whitelist (simple and reliable)
async function checkAdminStatus(uid) {
    try {
        const email = auth.currentUser?.email?.toLowerCase();

        if (!email) {
            return { isAdmin: false };
        }

        // Check if email is in allowed list
        if (ALLOWED_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email)) {
            const role = OWNER_EMAILS.map(e => e.toLowerCase()).includes(email) ? 'owner' : 'admin';
            return { isAdmin: true, role: role };
        }

        return { isAdmin: false };
    } catch (e) {
        console.error("Error checking admin status:", e);
        return { isAdmin: false };
    }
}

function isOwner(email) {
    return OWNER_EMAILS.map(e => e.toLowerCase()).includes(email.toLowerCase());
}

// --- AUTHENTICATION ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // SECURITY: Verify user is an admin via Firestore
        const status = await checkAdminStatus(user.uid);

        if (!status.isAdmin) {
            console.error("Access denied: User is not an admin");
            alert("Access Denied: You do not have admin privileges.");
            signOut(auth).then(() => {
                window.location.href = 'login.html';
            });
            return;
        }

        document.getElementById('user-email').textContent = user.email;
        console.log("Admin logged in:", user.email);

        // UI RESTRICTIONS FOR NON-OWNERS
        if (!isOwner(user.email)) {
            document.getElementById('user-email').innerHTML += ' <span style="background: #ef476f; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; margin-left: 10px;">READ ONLY</span>';

            // Disable all inputs and textareas
            const inputs = document.querySelectorAll('input, textarea, select');
            inputs.forEach(input => input.disabled = true);

            // Hide all Save/Update/Delete buttons
            const buttons = document.querySelectorAll('button');
            buttons.forEach(btn => {
                if (btn.textContent.includes('Save') || btn.textContent.includes('Update') || btn.textContent.includes('Delete') ||
                    btn.textContent.includes('Add')) {
                    btn.style.display = 'none';
                }
                if (btn.id === 'logout-btn' || btn.textContent === 'Refresh List' || btn.classList.contains('nav-item')) {
                    btn.style.display = 'block'; // Keep nav/logout/refresh visible
                    btn.disabled = false;
                }
            });

            // Specifically hide action column in tables if possible, but disabling buttons is enough for now
            console.log("Restricted mode enabled for non-owner.");
        }

        loadDashboardData(); // Load data when logged in
        initAI(); // Initialize AI Marketing Studio
        resetSessionTimer(); // Start session timeout timer for security
    } else {
        console.log("No user logged in, redirecting...");
        window.location.href = 'login.html';
    }
});

document.getElementById('logout-btn').addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.href = 'login.html';
    });
});

// --- FIRESTORE LOGIC ---

async function loadDashboardData() {
    try {
        const docRef = doc(db, "content", "main");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log("Current Data:", data);

            // 1. Populate Theme
            if (data.theme) {
                const themeInputs = document.querySelectorAll('#section-theme input');
                if (themeInputs.length >= 5) {
                    if (data.theme.primary) themeInputs[0].value = data.theme.primary;
                    if (data.theme.secondary) themeInputs[1].value = data.theme.secondary;
                    if (data.theme.accent) themeInputs[2].value = data.theme.accent;
                    if (data.theme.logoUrl) themeInputs[3].value = data.theme.logoUrl;
                    if (data.theme.heroUrl) themeInputs[4].value = data.theme.heroUrl;
                }
            }

            // 2. Populate Settings
            if (data.settings) {
                const settingsInputs = document.querySelectorAll('#section-settings input');
                if (data.settings.phone) settingsInputs[0].value = data.settings.phone;
                if (data.settings.email) settingsInputs[1].value = data.settings.email;
            }

            // 3. Populate Core Solutions
            if (data.solutions) {
                const coreInputs = document.querySelectorAll('#section-core input, #section-core textarea');
                // Simplification for MVP: Assuming fixed order
                if (data.solutions[0]) {
                    coreInputs[0].value = data.solutions[0].title;
                    coreInputs[1].value = data.solutions[0].desc;
                }
                coreInputs[2].value = data.solutions[1].title;
                coreInputs[3].value = data.solutions[1].desc;
            }

            // 4. Populate Pricing Table
            const pricingBody = document.getElementById('pricing-table-body');
            pricingBody.innerHTML = ''; // Clear existing
            if (data.pricing && Array.isArray(data.pricing) && data.pricing.length > 0) {
                data.pricing.forEach(item => addPricingRow(item.service, item.price));
            } else {
                // Default content from BUnited Services deep dive
                addPricingRow("MC/DOT Authority Setup", "$900.00 + FMCSA Fees");
                addPricingRow("2290 Annual HVUT Filing", "Starts at $69.99 + IRS Fees");
                addPricingRow("Drug & Alcohol Consortium", "$100.00 / Year");
                addPricingRow("Annual UCR Registration", "Starts at $170.00");
                addPricingRow("BOC-3 Filing", "$75.00");
                addPricingRow("MCS-150 Update", "$150.00");
                addPricingRow("IFTA License & IRP Setup", "$399.00");
                addPricingRow("Non-CDL Compliance Pkg", "$40.00 / Month");
                addPricingRow("Owner-Operator Bundle", "$100.00 / Month");
                addPricingRow("Driver Qualification File", "$223.00 / Year");
                addPricingRow("Full Back Office Consult", "$1,500.00");
            }

            // 5. Update Dashboard Overview Cards (Highlights)
            if (data.pricing && Array.isArray(data.pricing)) {
                const pricing = data.pricing;
                if (pricing.length > 0) {
                    document.getElementById('dash-service-0').value = pricing[0].service || '';
                    document.getElementById('dash-price-0').value = pricing[0].price || '';
                }
                if (pricing.length > 1) {
                    document.getElementById('dash-service-1').value = pricing[1].service || '';
                    document.getElementById('dash-price-1').value = pricing[1].price || '';
                }
            }

        } else {
            console.log("No content document found. Creating one on save.");
            // Still show default pricing logic below...
        }
    } catch (e) {
        console.error("Error loading data:", e);
    }
}

// --- DASHBOARD HIGHLIGHTS SAVE ---
const saveDashBtn = document.getElementById('save-dashboard-btn');
if (saveDashBtn) {
    saveDashBtn.addEventListener('click', async () => {
        const button = saveDashBtn;
        const originalText = button.textContent;
        button.textContent = "Updating...";

        try {
            // Fetch current data first to get the full array
            const docRef = doc(db, "content", "main");
            const docSnap = await getDoc(docRef);
            let pricing = [];

            if (docSnap.exists() && docSnap.data().pricing) {
                pricing = docSnap.data().pricing;
            }

            // Ensure array has at least 2 slots
            while (pricing.length < 2) { pricing.push({ service: "New Service", price: "$0.00" }); } // Update first two slots
            pricing[0].service = document.getElementById('dash-service-0').value;
            pricing[0].price = document.getElementById('dash-price-0').value;
            pricing[1].service = document.getElementById('dash-service-1').value;
            pricing[1].price = document.getElementById('dash-price-1').value; await setDoc(docRef, { pricing }, {
                merge: true
            }); alert("Highlights Updated! (Synced with Pricing Table)"); loadDashboardData(); // Refresh UI } catch (e) {
            console.error("Error saving highlights:", e); alert("Error: " + e.message);
        } finally {
            button.textContent = originalText;
        }
    });
}

// --- SAVE HANDLERS ---

// Save Core Solutions
const saveCoreBtn = document.querySelector('#section-core .btn-primary');
if (saveCoreBtn) {
    saveCoreBtn.addEventListener('click', async () => {
        const button = saveCoreBtn;
        const originalText = button.textContent;
        button.textContent = " Saving...";
        try {
            const inputs = document.querySelectorAll('#section-core input, #section-core textarea');
            const solutions = [
                { title: inputs[0].value, desc: inputs[1].value },
                { title: inputs[2].value, desc: inputs[3].value }
            ];
            await setDoc(doc(db, "content", "main"), { solutions }, { merge: true });
            alert("Core Solutions Saved!");
        } catch (e) {
            console.error("Error saving:", e); alert("Error saving: " + e.message);
        } finally {
            button.textContent = originalText;
        }
    });
}

// Save Theme
const updateThemeBtn = document.querySelector('#section-theme .btn-primary');
if (updateThemeBtn) {
    updateThemeBtn.addEventListener('click', async () => {
        const button = updateThemeBtn;
        const originalText = button.textContent;
        button.textContent = " Updating...";
        try {
            const themeInputs = document.querySelectorAll('#section-theme input');
            const theme = {
                primary: themeInputs[0].value,
                secondary: themeInputs[1].value,
                accent: themeInputs[2].value,
                logoUrl: themeInputs[3].value,
                heroUrl: themeInputs[4].value
            };
            await setDoc(doc(db, "content", "main"), { theme }, { merge: true });
            alert("Theme Updated!");
        } catch (e) {
            alert("Error: " + e.message);
        } finally {
            button.textContent = originalText;
        }
    });
}

// Save Settings
const saveSettingsBtn = document.querySelector('#section-settings .btn-primary');
if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
        const button = saveSettingsBtn;
        const originalText = button.textContent;
        button.textContent = " Saving...";
        try {
            const inputs = document.querySelectorAll('#section-settings input');
            const settings = { phone: inputs[0].value, email: inputs[1].value };
            await setDoc(doc(db, "content", "main"), { settings }, { merge: true });
            alert("Settings Updated!");
        } catch (e) {
            alert("Error: " + e.message);
        } finally {
            button.textContent = originalText;
        }
    });
}

// Save Pricing
const savePricingBtn = document.getElementById('save-pricing-btn');
if (savePricingBtn) {
    savePricingBtn.addEventListener('click', async () => {
        const button = savePricingBtn;
        const originalText = button.textContent;
        button.textContent = " Saving...";
        try {
            const rows = document.querySelectorAll('#pricing-table-body tr');
            const pricing = [];
            rows.forEach(row => {
                const inputs = row.querySelectorAll('input');
                if (inputs.length === 2) {
                    pricing.push({
                        service: inputs[0].value,
                        price: inputs[1].value
                    });
                }
            });

            await setDoc(doc(db, "content", "main"), { pricing }, { merge: true });
            alert("Pricing Table Saved!");
        } catch (e) {
            console.error("Error saving pricing:", e);
            alert("Error saving: " + e.message);
        } finally {
            button.textContent = originalText;
        }
    });
}

// Add New Service Button
const addServiceBtn = document.getElementById('add-service-btn');
if (addServiceBtn) {
    addServiceBtn.addEventListener('click', () => {
        addPricingRow("New Service", "$0.00");
    });
}

// --- USER MANAGEMENT LOGIC ---

window.loadUsers = async function () {
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';

    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        tbody.innerHTML = '';

        querySnapshot.forEach((doc) => {
            const user = doc.data();
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

            // Status Color
            let statusColor = '#fff';
            if (user.status === 'pending') statusColor = '#ffd166'; // Yellow
            if (user.status === 'approved') statusColor = '#06d6a0'; // Green
            if (user.status === 'rejected') statusColor = '#ef476f'; // Red

            // Action Buttons Logic
            let actionButtons = '';
            if (user.status !== 'approved') {
                actionButtons += `<button onclick="updateUserStatus('${doc.id}', 'approved')" style="cursor: pointer; background: #06d6a0; border: none; padding: 5px 10px; border-radius: 4px; margin-right: 5px;">Approve</button>`;
            }
            if (user.status !== 'rejected') {
                actionButtons += `<button onclick="updateUserStatus('${doc.id}', 'rejected')" style="cursor: pointer; background: #ef476f; border: none; padding: 5px 10px; border-radius: 4px; margin-right: 5px;">Block</button>`;
            }

            // Super Admin Only: Reset Password
            if (isOwner(auth.currentUser.email)) {
                actionButtons += `<button onclick="sendPasswordReset('${user.email}')" style="cursor: pointer; background: #333; border: 1px solid #ffaa00; color: #ffaa00; padding: 5px 10px; border-radius: 4px; margin-right: 5px;">Reset Pwd</button>`;
            }

            actionButtons += `<button onclick="deleteUser('${doc.id}', '${user.email}')" style="cursor: pointer; background: #333; border: 1px solid #ef476f; color: #ef476f; padding: 5px 10px; border-radius: 4px;">🗑️ Delete</button>`;

            tr.innerHTML = `
        <td style="padding: 10px;">${user.email}</td>
        <td style="padding: 10px; color: ${statusColor}; font-weight: bold;">${user.status?.toUpperCase() || 'UNKNOWN'}
        </td>
        <td style="padding: 10px;">${user.membership || 'standard'}</td>
        <td style="padding: 10px;">
            ${actionButtons}
        </td>
        `;

            tbody.appendChild(tr);
        });

        if (querySnapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4">No registered users found.</td></tr>';
        }

    } catch (e) {
        console.error("Error loading users:", e);
        tbody.innerHTML = `<tr>
                        <td colspan="4" style="color: red;">Error: ${e.message}</td>
        </tr> `;
    }
};

window.sendPasswordReset = async function (email) {
    if (!confirm(`Send password reset email to ${email}?`)) return;
    try {
        // Using Firebase client SDK to send reset email
        await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js")
            .then(({ sendPasswordResetEmail }) => {
                return sendPasswordResetEmail(auth, email);
            });
        alert(`Password reset email sent to ${email} `);
    } catch (e) {
        console.error("Error sending reset email:", e);
        alert("Error: " + e.message);
    }
};

window.updateUserStatus = async function (uid, status) {
    if (!confirm(`Are you sure you want to set this user to ${status}?`)) return;

    try {
        // Determine membership based on current status for logic or keep same
        // For now, simpler to just update status
        await updateDoc(doc(db, "users", uid), { status: status });
        loadUsers(); // Reload table
    } catch (e) {
        alert("Error updating status: " + e.message);
    }
};

// Delete User Function (removes from Firestore & Auth via Cloud Function)
window.deleteUser = async function (uid, email) {
    if (!confirm(`⚠️ Are you sure you want to PERMANENTLY DELETE the user: \n\n${email} \n\nThis action cannot be
                    undone!`)) return;

    const originalText = event.target.textContent;
    event.target.textContent = "Deleting...";

    try {
        const deleteUserFn = httpsCallable(functions, 'deleteUser');
        const result = await deleteUserFn({ uid: uid });

        if (result.data.success) {
            alert(`User ${email} has been deleted.`);
            loadUsers(); // Reload table
        } else {
            throw new Error(result.data.message || "Unknown error");
        }
    } catch (e) {
        console.error("Error deleting:", e);
        alert("Error deleting user: " + e.message);
        event.target.textContent = originalText;
    }
};

// Add New User Function
window.addNewUser = async function () {
    const email = document.getElementById('new-user-email').value.trim();
    const password = document.getElementById('new-user-password').value.trim();
    const membership = document.getElementById('new-user-membership').value;
    // Handle potentially missing role element (if older cached version)
    const roleEl = document.getElementById('new-user-role');
    const role = roleEl ? roleEl.value : 'driver';

    const statusEl = document.getElementById('add-user-status');
    // Find the button (assuming it's arguably the only one in that section with that click handler, or just grab the last button in that div)
    const btn = document.querySelector('#section-users button[onclick="addNewUser()"]') || document.querySelector('#section-users button');

    if (!email || !password) {
        statusEl.style.color = '#ef476f';
        statusEl.textContent = 'Please fill in email and password.';
        return;
    }

    if (password.length < 6) {
        statusEl.style.color = '#ef476f';
        statusEl.textContent = 'Password must be at least 6 characters.';
        return;
    }

    statusEl.style.color = '#ffd166';
    statusEl.textContent = 'Creating user...';
    const originalBtnText = btn.textContent;
    btn.textContent = "Creating...";
    btn.disabled = true;

    try {
        // Call Cloud Function to create User
        const createUserFn = httpsCallable(functions, 'createUser');
        const result = await createUserFn({
            email: email,
            password: password,
            membership: membership,
            role: role
        });

        if (result.data.success) {
            // Clear form
            document.getElementById('new-user-email').value = '';
            document.getElementById('new-user-password').value = '';
            if (roleEl) roleEl.value = 'driver';
            statusEl.style.color = '#06d6a0';
            statusEl.textContent = `✓ User ${email} created successfully!`;
            // Reload users list
            loadUsers();
        } else {
            throw new Error(result.data.message || "Unknown error");
        }
    } catch (e) {
        console.error("Error creating user:", e);
        statusEl.style.color = '#ef476f';
        statusEl.textContent = 'Error: ' + e.message;
    } finally {
        btn.textContent = originalBtnText;
        btn.disabled = false;
    }
};

// --- SERVICE REQUESTS LOGIC ---
window.loadRequests = async function () {
    const tbody = document.getElementById('requests-table-body');
    const filterVal = document.getElementById('request-filter').value;

    tbody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
    try {
        const q = collection(db, "requests");
        const querySnapshot = await getDocs(q);

        let requests = [];
        querySnapshot.forEach(doc => {
            const data = doc.data();
            const status = data.status || 'pending';

            // Filter Logic
            let include = false;
            if (filterVal === 'all') include = true;
            else if (filterVal === 'active' && status !== 'completed') include = true;
            else if (filterVal === 'archived' && status === 'completed') include = true;

            if (include) {
                requests.push({ id: doc.id, ...data });
            }
        });

        // Sort by timestamp desc (newest first)
        requests.sort((a, b) => {
            const tA = a.timestamp || "";
            const tB = b.timestamp || "";
            return tA < tB ? 1 : -1;
        });

        tbody.innerHTML = '';
        requests.forEach(req => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

            // Format Date
            const dateObj = req.timestamp ? new Date(req.timestamp) : new Date();
            const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString();

            // Format Status
            const isCompleted = req.status === 'completed';
            const statusColor = isCompleted ? '#06d6a0' : '#ffd166';

            // Services List
            let servicesList = "None";
            if (req.services && Array.isArray(req.services)) servicesList = req.services.join(", ");

            tr.innerHTML = `
                        <td style="padding: 10px; font-size:0.9rem;">${dateStr}</td>
                            <td style="padding: 10px;">
                                <strong>${req.name || 'N/A'}</strong><br>
                                    <span style="color:#aaa;">${req.email || ''}</span><br>
                                        <span style="color:#aaa;">${req.phone || ''}</span>
                                    </td>
                                    <td style="padding: 10px;">
                                        ${req.business || 'N/A'}<br>
                                            <span style="font-size:0.8rem; color:#aaa;">${req.dot || ''}</span>
                                    </td>
                                    <td style="padding: 10px; font-size:0.9rem;">${servicesList}</td>
                                    <td style="padding: 10px; color:${statusColor}; font-weight:bold;">${req.status ? req.status.toUpperCase() : 'PENDING'}</td>
                                    <td style="padding: 10px; text-align:center;">
                                        <button onclick="toggleRequestStatus('${req.id}', '${req.status}', '${req.email}')"
                                            style="cursor:pointer; background:${isCompleted ? '#333' : '#06d6a0'}; color:${isCompleted ? '#aaa' : '#fff'}; border:1px solid ${isCompleted ? '#555' : 'transparent'}; padding:5px 10px; border-radius:4px;">
                                            ${isCompleted ? 'Mark Pending' : '✓ Complete'}
                                        </button>
                                    </td>
                                    `;
            tbody.appendChild(tr);
        });

        if (requests.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No requests found for this filter.</td></tr>';
        }

    } catch (e) {
        console.error("Error loading requests:", e);
        tbody.innerHTML = `<tr><td colspan="6" style="color:red;">Error: ${e.message}</td></tr>`;
    }
};

window.toggleRequestStatus = async function (docId, currentStatus, userEmail) {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';

    try {
        await updateDoc(doc(db, "requests", docId), {
            status: newStatus
        });

        // Trigger Notification
        if (newStatus === 'completed' && userEmail) {
            try {
                const usersQ = query(collection(db, "users"), where("email", "==", userEmail));
                const usersSnap = await getDocs(usersQ);
                if (!usersSnap.empty) {
                    const userId = usersSnap.docs[0].id;
                    await createNotification(userId, 'Service Request Update', 'One of your service requests has been marked as Completed.', 'success');
                }
            } catch (err) { console.error("Error sending notification:", err); }
        }

        loadRequests(); // Reload table
    } catch (e) {
        alert("Error updating status: " + e.message);
    }
};

// ========================
// CLIENT FILES MANAGEMENT
// ========================

// Category labels for display
const categoryLabels = {
    'license': 'Driver License',
    'medical': 'Medical Certificate',
    'drug_test': 'Drug Test Form',
    'physical': 'Physical Form',
    'mvr': 'MVR Report',
    'permit': 'Permit / Authority',
    'ifta': 'IFTA Document',
    '2290': '2290 Filing',
    'insurance': 'Insurance',
    'other': 'Other'
};

// Load all users into client selector dropdown
window.loadClientFiles = async function () {
    const select = document.getElementById('client-select');
    select.innerHTML = '<option value="">-- Loading clients --</option>';

    try {
        const usersSnap = await getDocs(collection(db, "users"));
        select.innerHTML = '<option value="">-- Select a client --</option>';

        usersSnap.forEach(userDoc => {
            const userData = userDoc.data();
            const option = document.createElement('option');
            option.value = userDoc.id;
            option.textContent = userData.email || userDoc.id;
            option.dataset.email = userData.email || '';
            select.appendChild(option);
        });
    } catch (e) {
        console.error("Error loading clients:", e);
        select.innerHTML = '<option value="">Error loading clients</option>';
    }
};

// Load files for selected user
window.loadClientFilesForUser = async function () {
    const select = document.getElementById('client-select');
    const userId = select.value;
    const tbody = document.getElementById('client-files-table-body');

    if (!userId) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding: 2rem; text-align: center; color: var(--text-gray);">Select a client to view their files.</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="4" style="padding: 2rem; text-align: center;">Loading files...</td></tr>';

    try {
        const filesQuery = query(
            collection(db, "userFiles"),
            where("userId", "==", userId)
        );
        const filesSnap = await getDocs(filesQuery);

        if (filesSnap.empty) {
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 2rem; text-align: center; color: var(--text-gray);">No files uploaded for this client yet.</td></tr>';
            return;
        }

        let files = [];
        filesSnap.forEach(fileDoc => {
            files.push({ id: fileDoc.id, ...fileDoc.data() });
        });

        // Sort by upload date (newest first)
        files.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));

        tbody.innerHTML = '';
        files.forEach(file => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

            const dateStr = file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString() : 'N/A';
            const catLabel = categoryLabels[file.category] || file.category || 'Other';

            tr.innerHTML = `
                                    <td style="padding: 10px;">${file.fileName || 'Unnamed'}</td>
                                    <td style="padding: 10px; color: var(--text-gray);">${catLabel}</td>
                                    <td style="padding: 10px;">${dateStr}</td>
                                    <td style="padding: 10px;">
                                        <a href="${file.downloadURL}" target="_blank" style="color: var(--accent); margin-right: 1rem;">📥 Download</a>
                                        <button onclick="adminDeleteFile('${file.id}', '${file.storagePath}')" style="background: none; border: none; color: #ff6b6b; cursor: pointer;">🗑️ Delete</button>
                                    </td>
                                    `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Error loading client files:", e);
        tbody.innerHTML = `<tr><td colspan="4" style="padding: 2rem; text-align: center; color: #ff6b6b;">Error: ${e.message}</td></tr>`;
    }
};

// Admin upload file for selected client
window.adminUploadFile = async function () {
    const fileInput = document.getElementById('admin-file-input');
    const select = document.getElementById('client-select');
    const userId = select.value;
    const category = document.getElementById('admin-file-category').value;

    if (!userId) {
        alert("Please select a client first.");
        fileInput.value = '';
        return;
    }

    if (!fileInput.files.length) return;

    const file = fileInput.files[0];
    const timestamp = Date.now();
    const fileName = `${timestamp}_${file.name}`;
    const storagePath = `users/${userId}/${fileName}`;
    const storageRef = ref(storage, storagePath);

    // Show progress
    const progressDiv = document.getElementById('admin-upload-progress');
    const progressBar = document.getElementById('admin-progress-bar');
    const progressText = document.getElementById('admin-progress-text');
    progressDiv.style.display = 'block';

    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed',
        (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            progressBar.style.width = progress + '%';
            progressText.textContent = `Uploading... ${Math.round(progress)}%`;
        },
        (error) => {
            console.error("Upload error:", error);
            alert("Upload failed: " + error.message);
            progressDiv.style.display = 'none';
            fileInput.value = '';
        },
        async () => {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

            await addDoc(collection(db, "userFiles"), {
                userId: userId,
                fileName: file.name,
                storagePath: storagePath,
                downloadURL: downloadURL,
                category: category,
                uploadedAt: new Date().toISOString(),
                uploadedBy: 'admin',
                size: file.size
            });

            // Trigger Notification
            await createNotification(userId, 'New Document Uploaded', `Admin has uploaded a new document: ${file.name}`, 'info');

            progressText.textContent = "Upload complete!";
            setTimeout(() => {
                progressDiv.style.display = 'none';
                progressBar.style.width = '0%';
                fileInput.value = '';
                loadClientFilesForUser();
            }, 1000);
        }
    );
};

// Admin delete file
window.adminDeleteFile = async function (docId, storagePath) {
    if (!confirm("Are you sure you want to delete this file?")) return;

    try {
        const storageRef = ref(storage, storagePath);
        await deleteObject(storageRef);
        await deleteDoc(doc(db, "userFiles", docId));
        loadClientFilesForUser();
    } catch (e) {
        console.error("Error deleting file:", e);
        alert("Error deleting file: " + e.message);
    }
};

// Helper to create notification
async function createNotification(userId, title, message, type) {
    try {
        await addDoc(collection(db, "notifications"), {
            userId: userId,
            title: title,
            message: message,
            type: type, // 'info', 'success', 'warning', 'error'
            read: false,
            timestamp: new Date()
        });
    } catch (e) {
        console.error("Error creating notification:", e);
    }
}

// Request Document from User
window.requestDocument = async function () {
    const select = document.getElementById('client-select');
    const userId = select.value;

    if (!userId) {
        alert("Please select a client first.");
        return;
    }

    const docName = prompt("What document do you need from the client? (e.g. 'Medical Card', 'CDL Copy')");
    if (!docName) return;

    try {
        await createNotification(userId, "Document Requested", `Please upload your ${docName} as soon as possible.`, "info");
        alert(`Request for "${docName}" sent to client!`);
    } catch (e) {
        console.error("Error sending request:", e);
        alert("Failed to send request.");
    }
};
