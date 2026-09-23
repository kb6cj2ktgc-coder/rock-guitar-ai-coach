# Rock Guitar 🎸

A conversational AI guitar coach that remembers the lesson, teaches in small steps, and answers your everyday questions too.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Add a Gemini key to `.env.local` for live responses:

```bash
GEMINI_API_KEY=your_key_here
```

Without a key, the app uses a friendly local demo response so the interface can be explored safely.
