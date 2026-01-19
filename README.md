# LinkTrim - Premium URL Shortener

A modern, high-performance URL shortener with analytics, built with Node.js, Express, and Supabase.

## Features

- 🔗 **Shorten URLs**: Create clean, short links instantly.
- 📊 **Analytics**: Track clicks and creation dates.
- 🎨 **Premium UI**: Beautiful glassmorphism design.
- 🔒 **Secure**: Powered by Supabase Authentication.
- ⚡ **Fast**: Optimized for Vercel deployment.

## Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Vurk-sc/URL_Short.git
    cd URLShort
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment:**
    Create a `.env` file in the root directory:
    ```env
    PORT=3000
    SUPABASE_URL=your_supabase_url
    SUPABASE_KEY=your_supabase_anon_key
    ```

4.  **Run Locally:**
    ```bash
    npm start
    ```
    Visit `http://localhost:3000`.

## API Endpoints

- `POST /api/shorten`: Shorten a new URL.
- `GET /api/stats/:code`: Get stats for a short code.
- `GET /:code`: Redirect to original URL.

## Tech Stack

- **Frontend**: HTML5, TailwindCSS, Vanilla JS
- **Backend**: Node.js, Express
- **Database**: Supabase (PostgreSQL)
