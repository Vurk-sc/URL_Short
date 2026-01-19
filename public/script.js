// --- Configuration ---
let supabaseClient = null;
let userSession = null;

// --- DOM Ready ---
document.addEventListener('DOMContentLoaded', async () => {
    await initApp();
});

async function initApp() {
    try {
        // Fetch config from backend to avoid hardcoding keys
        const res = await fetch('/api/config');
        const config = await res.json();

        if (config.supabaseUrl && config.supabaseKey) {
            supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
            window.supabaseClient = supabaseClient; // Export
            await initAuth();
        } else {
            console.error('Supabase config missing');
        }

        if (document.getElementById('shortenForm')) initShortener();
        if (document.getElementById('dashboard')) loadUrls();

    } catch (err) {
        console.error('Failed to initialize app:', err);
    }
}

// --- Auth Handling ---
async function initAuth() {
    if (!supabaseClient) return;

    // Get initial session
    const { data: { session } } = await supabaseClient.auth.getSession();
    handleSessionChange(session);

    // Listen for changes
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        handleSessionChange(session);
    });
}

function handleSessionChange(session) {
    userSession = session;
    const authLinks = document.getElementById('authLinks');
    const userMenu = document.getElementById('userMenu');
    const userEmail = document.getElementById('userEmail');
    const dashboard = document.getElementById('dashboard');

    if (session) {
        if (authLinks) authLinks.classList.add('hidden');
        if (userMenu) userMenu.classList.remove('hidden');
        if (userEmail) userEmail.innerText = session.user.email;
        if (dashboard) dashboard.classList.remove('hidden');
    } else {
        if (authLinks) authLinks.classList.remove('hidden');
        if (userMenu) userMenu.classList.add('hidden');
        if (dashboard) dashboard.classList.add('hidden');
    }
}

// Logout Action
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        if (supabaseClient) await supabaseClient.auth.signOut();
        window.location.reload();
    });
}

// --- Shortener Logic ---
function initShortener() {
    const form = document.getElementById('shortenForm');
    const urlInput = document.getElementById('urlInput');
    const resultCard = document.getElementById('resultCard');
    const shortLink = document.getElementById('shortLink');
    const authUrl = document.getElementById('authUrl');
    const messageArea = document.getElementById('messageArea');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Reset UI
        showMessage('Processing...', 'info');
        resultCard.classList.add('hidden');
        const btn = form.querySelector('button');
        const btnText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const originalUrl = urlInput.value.trim();
            if (!originalUrl) throw new Error('Please enter a URL');

            // Headers incl. Auth
            const headers = { 'Content-Type': 'application/json' };
            if (userSession) {
                headers['Authorization'] = `Bearer ${userSession.access_token}`;
            }

            const res = await fetch('/api/shorten', {
                method: 'POST',
                headers,
                body: JSON.stringify({ originalUrl })
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Failed to shorten');

            // Success
            hideMessage();
            resultCard.classList.remove('hidden');
            shortLink.href = data.shortUrl;
            shortLink.textContent = data.shortUrl;
            authUrl.textContent = data.originalUrl;

            // Refresh dashboard if active
            if (userSession) loadUrls();

        } catch (err) {
            showMessage(err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = btnText;
        }
    });

    function showMessage(text, type) {
        messageArea.innerHTML = `<div class="p-4 rounded-xl ${type === 'error' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'} text-center font-medium">${text}</div>`;
        messageArea.classList.remove('hidden');
    }

    function hideMessage() {
        messageArea.classList.add('hidden');
    }
}

// --- Dashboard Logic ---
async function loadUrls() {
    if (!supabaseClient || !userSession) return;

    const tbody = document.getElementById('urlTableBody');
    const emptyState = document.getElementById('emptyState');
    if (!tbody) return;

    try {
        const headers = { 'Authorization': `Bearer ${userSession.access_token}` };
        const res = await fetch('/api/urls', { headers });
        const data = await res.json();

        tbody.innerHTML = '';
        if (!data || data.length === 0) {
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        data.forEach(url => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50/50 transition-colors border-b border-gray-50';
            row.innerHTML = `
                <td class="p-6">
                    <a href="${url.shortUrl}" target="_blank" class="font-bold text-blue-600 hover:text-blue-800">${url.shortCode}</a>
                </td>
                <td class="p-6 max-w-xs truncate text-gray-500" title="${url.original_url}">
                    ${url.original_url}
                </td>
                <td class="p-6 text-center">
                    <span class="inline-block px-3 py-1 rounded-full bg-blue-50 text-blue-600 font-bold text-sm">${url.clicks}</span>
                </td>
                <td class="p-6 text-right text-gray-400 text-sm">
                    ${new Date(url.created_at).toLocaleDateString()}
                </td>
                <td class="p-6 text-center">
                    <button onclick="copyToClipboard('${url.shortUrl}')" class="text-gray-400 hover:text-blue-600 transition-colors">
                        <i class="fas fa-copy"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

    } catch (err) {
        console.error('Failed to load dashboard', err);
    }
}

// --- Utils ---
function copyToClipboard(text) {
    const target = text || document.getElementById('shortLink')?.href;
    if (!target) return;

    navigator.clipboard.writeText(target).then(() => {
        showToast('Copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Failed to copy', 'error');
    });
}

function showToast(message, type = 'success') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `fixed bottom-5 right-5 z-50 px-6 py-4 rounded-xl shadow-2xl transform transition-all duration-300 translate-y-10 opacity-0 flex items-center gap-3 border ${type === 'success' ? 'bg-white border-green-100 text-green-700' : 'bg-white border-red-100 text-red-700'
        }`;

    // Icon
    const icon = type === 'success' ? '<i class="fas fa-check-circle text-xl"></i>' : '<i class="fas fa-exclamation-circle text-xl"></i>';

    toast.innerHTML = `
        ${icon}
        <span class="font-medium">${message}</span>
    `;

    document.body.appendChild(toast);

    // Animate In
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    });

    // Remove after 3s
    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}
