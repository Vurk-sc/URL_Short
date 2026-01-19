const express = require('express');
const path = require('path');
const cors = require('cors');
const { nanoid } = require('nanoid');
const validUrl = require('valid-url');
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Proxy: Critical for Vercel and correct IP detection
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Explicitly serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Routes ---

// --- Supabase Config ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Check credentials
if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your_supabase_url')) {
    console.warn('⚠️ WARNING: Supabase credentials not set. App will likely fail on DB operations.');
}

// Global Admin Client (Fallback)
const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

// Helper: Get RLS-Safe Client
// If user provides a token, we create a client scoped to that user.
function getSupabase(req) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        return createClient(supabaseUrl, supabaseKey, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        });
    }
    return supabase;
}

// --- Rate Limiting ---
// FIXED: Custom key generator to handle IPv6/Proxy IPs safely
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: (req) => {
        // Authenticated users get higher limits
        if (req.headers.authorization) return 500;
        return 50; // Stricter limit for generic anonymous IPs
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => {
        // Use Authorization token if available (User ID based limit)
        if (req.headers.authorization) {
            return req.headers.authorization;
        }
        // Fallback to IP. 'req.ip' is populated by Express when 'trust proxy' is on.
        return req.ip;
    },
    message: { error: 'Too many requests, please slow down.' }
});

// Apply rate limiting to all API routes
app.use('/api/', limiter);

// --- Routes ---

// Health Check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Shorten URL
app.post('/api/shorten', async (req, res) => {
    const { originalUrl } = req.body;
    const sb = getSupabase(req);

    if (!validUrl.isUri(originalUrl)) {
        return res.status(400).json({ error: 'Invalid URL format' });
    }

    try {
        const shortCode = nanoid(6);
        const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : `http://localhost:${PORT}`;

        // Resolve User ID for response metadata (actual insertion uses RLS)
        let userId = null;
        if (req.headers.authorization) {
            const { data: { user } } = await sb.auth.getUser();
            if (user) userId = user.id;
        }

        const { data, error } = await sb
            .from('urls')
            .insert([{
                original_url: originalUrl,
                short_code: shortCode,
                user_id: userId // RLS will verify this matches the auth token
            }])
            .select()
            .single();

        if (error) throw error;

        res.json({
            shortCode,
            shortUrl: `${baseUrl}/${shortCode}`,
            originalUrl,
            message: 'URL shortened successfully'
        });

    } catch (err) {
        console.error('Shorten Error:', err);
        res.status(500).json({ error: 'Failed to shorten URL. Database connection may be missing.' });
    }
});

// Get Stats
app.get('/api/stats/:shortCode', async (req, res) => {
    const { shortCode } = req.params;
    const sb = getSupabase(req);

    try {
        const { data, error } = await sb
            .from('urls')
            .select('*')
            .eq('short_code', shortCode)
            .single();

        if (error || !data) return res.status(404).json({ error: 'URL not found' });

        const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : `http://localhost:${PORT}`;

        res.json({
            ...data,
            shortUrl: `${baseUrl}/${data.short_code}`
        });

    } catch (err) {
        console.error('Stats Error:', err);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Get User URLs
app.get('/api/urls', async (req, res) => {
    const sb = getSupabase(req);

    // Check if user is authenticated
    const { data: { user }, error: authError } = await sb.auth.getUser();

    // If not authenticated, return empty or public list (depending on requirement)
    // Here we return empty to encourage login
    if (!user || authError) {
        return res.json([]);
    }

    try {
        const { data, error } = await sb
            .from('urls')
            .select('*')
            .eq('user_id', user.id) // Redundant if RLS enforces it, but safe
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : `http://localhost:${PORT}`;

        const mapped = data.map(u => ({
            ...u,
            shortUrl: `${baseUrl}/${u.short_code}`
        }));

        res.json(mapped);

    } catch (err) {
        console.error('Fetch URLs Error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Redirect (Root Handler)
app.get('/:shortCode', async (req, res) => {
    const { shortCode } = req.params;

    // Ignore favicon
    if (shortCode === 'favicon.ico') return res.status(404).end();

    try {
        // Use Global Admin client to read (assuming public read policy)
        const { data, error } = await supabase
            .from('urls')
            .select('original_url, clicks')
            .eq('short_code', shortCode)
            .single();

        if (error || !data) return res.redirect('/?error=not_found');

        // Redirect immediately
        res.redirect(data.original_url);

        // Async click increment (best effort)
        supabase.rpc('increment_clicks', { url_short_code: shortCode })
            .then(({ error }) => {
                // If RPC fails (e.g. doesn't exist), try direct update
                if (error) {
                    supabase
                        .from('urls')
                        .update({ clicks: data.clicks + 1 })
                        .eq('short_code', shortCode)
                        .then(() => { });
                }
            });

    } catch (err) {
        console.error('Redirect Error:', err);
        res.redirect('/?error=server_error');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

module.exports = app;
