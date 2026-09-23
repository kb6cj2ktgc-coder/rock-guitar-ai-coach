import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are Rock, a warm, encouraging conversational AI guitar coach. The product is called Rock Guitar. Prioritize guitar questions, but answer unrelated questions clearly and briefly too. Remember and refer to the conversation. Teach in small, actionable steps. When beginning a multi-step lesson, give only the next useful step and ask if the learner is ready to continue. Never pretend to hear playing unless the user provides an audio feature. Be concise but helpful, use plain language, and include chord fingerings or practice timing when relevant.`;
type Message = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  try {
    const { messages } = (await request.json()) as { messages?: Message[] };
    if (!messages?.length) return NextResponse.json({ error: "No messages provided" }, { status: 400 });
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ message: demoReply(messages[messages.length - 1].content), demo: true });

    const prompt = `${SYSTEM_PROMPT}\n\nConversation so far:\n${messages.slice(-20).map((message) => `${message.role === "user" ? "Student" : "Rock"}: ${message.content}`).join("\n")}\n\nRespond as Rock to the student's latest message.`;
    const model = await findModel(apiKey);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!response.ok) {
      const details = await response.text();
      console.error("Gemini API error", response.status, details, "model", model);
      return NextResponse.json({ error: explainGeminiError(response.status) }, { status: 502 });
    }
    const data = await response.json();
    const message = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!message) throw new Error("Gemini returned no text");
    return NextResponse.json({ message });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Rock could not connect to Gemini. Check the Vercel function logs." }, { status: 500 });
  }
}

async function findModel(apiKey: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
  if (!response.ok) throw new Error(`Could not list Gemini models (${response.status})`);
  const data = await response.json();
  const models = (data.models || []).filter((model: { name?: string; supportedGenerationMethods?: string[] }) => model.name && model.supportedGenerationMethods?.includes("generateContent"));
  const preferred = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite"];
  const selected = preferred.map((name) => models.find((model: { name: string }) => model.name === `models/${name}`)).find(Boolean) || models.find((model: { name: string }) => /flash/i.test(model.name));
  if (!selected) throw new Error("This API key has no model that supports generateContent");
  return selected.name;
}

function explainGeminiError(status: number) {
  if (status === 400) return "Gemini rejected the request. Check that your API key is from Google AI Studio.";
  if (status === 401 || status === 403) return "Gemini rejected this API key. Replace GEMINI_API_KEY in Vercel with a fresh AI Studio key.";
  if (status === 404) return "Gemini could not find a model for this key. The app now checks available models automatically; verify the key belongs to Google AI Studio.";
  if (status === 429) return "The Gemini free quota has been reached. Try again later.";
  if (status >= 500) return "Google Gemini is temporarily unavailable. Try again shortly.";
  return `Gemini returned an unexpected error (${status}).`;
}

function demoReply(input: string) {
  const lower = input.toLowerCase();
  if (lower.includes("banana")) return "A banana is a sweet, usually yellow fruit. 🍌\n\nAnd yes, I can answer non-guitar questions too! Want to get back to playing after that?";
  if (lower.includes("chord") || lower.includes("learn")) return "Let’s make it simple. Start with **Em**: put your 2nd finger on the 5th string, 2nd fret, and your 3rd finger on the 4th string, 2nd fret. Strum all six strings slowly.\n\nTry it four times. When you’re ready, say “next” and we’ll add the next step.";
  return "I’m ready to help you make progress. Ask me about a chord, song, technique, theory, or practice plan. I’ll remember where we are and guide you one step at a time.\n\n*Demo mode is active — add GEMINI_API_KEY to connect me to Gemini.*";
}
