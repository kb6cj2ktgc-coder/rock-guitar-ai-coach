import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are Rock, a warm, encouraging conversational AI guitar coach. The product is called Rock Guitar. Prioritize guitar questions, but answer unrelated questions clearly and briefly too. Remember and refer to the conversation. Teach in small, actionable steps. When beginning a multi-step lesson, give only the next useful step and ask if the learner is ready to continue. Never pretend to hear playing unless the user provides an audio feature. Be concise but helpful, use plain language, and include chord fingerings or practice timing when relevant.`;
type Message = { role: "user" | "assistant"; content: string };
type Model = { name?: string; supportedGenerationMethods?: string[] };

export async function POST(request: Request) {
  try {
    const { messages } = (await request.json()) as { messages?: Message[] };
    if (!messages?.length) return NextResponse.json({ error: "No messages provided" }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ message: demoReply(messages[messages.length - 1].content), demo: true });

    const prompt = `${SYSTEM_PROMPT}\n\nConversation so far:\n${messages.slice(-20).map((message) => `${message.role === "user" ? "Student" : "Rock"}: ${message.content}`).join("\n")}\n\nRespond as Rock to the student's latest message.`;
    const models = await availableModels(apiKey);
    let lastStatus = "";

    for (const model of models) {
      const result = await generateWithRetries(model, apiKey, prompt);
      if (result.message) return NextResponse.json({ message: result.message });
      lastStatus = result.status;
      if (![400, 404, 429, 500, 502, 503, 504].includes(result.code)) break;
    }

    console.error("No Gemini model completed the request:", lastStatus);
    if (lastStatus.startsWith("429")) return NextResponse.json({ error: "The Gemini free quota has been reached. Try again later." }, { status: 502 });
    if (/^5\d\d/.test(lastStatus)) return NextResponse.json({ error: "Gemini is temporarily busy. Please try sending your message again in a few seconds." }, { status: 503 });
    return NextResponse.json({ error: "Gemini could not answer with the available models. Check the Vercel logs." }, { status: 502 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Rock could not connect to Gemini. Check the Vercel function logs." }, { status: 500 });
  }
}

async function generateWithRetries(model: string, apiKey: string, prompt: string) {
  let lastCode = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (response.ok) {
      const data = await response.json();
      const message = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (message) return { message, code: 200, status: "200" };
    }
    lastCode = response.status;
    if (![429, 500, 502, 503, 504].includes(response.status)) break;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
  }
  return { message: "", code: lastCode, status: String(lastCode) };
}

async function availableModels(apiKey: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
  if (!response.ok) throw new Error(`Could not list Gemini models (${response.status}): ${await response.text()}`);
  const data = await response.json() as { models?: Model[] };
  const models = (data.models || []).filter((model) => model.name && model.supportedGenerationMethods?.includes("generateContent"));
  const preferred = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite"];
  const preferredModels = preferred.map((name) => `models/${name}`).filter((name) => models.some((model) => model.name === name));
  const otherFlashModels = models.map((model) => model.name as string).filter((name) => /flash/i.test(name) && !preferredModels.includes(name));
  return [...preferredModels, ...otherFlashModels];
}

function demoReply(input: string) {
  const lower = input.toLowerCase();
  if (lower.includes("banana")) return "A banana is a sweet, usually yellow fruit. 🍌\n\nAnd yes, I can answer non-guitar questions too! Want to get back to playing after that?";
  if (lower.includes("chord") || lower.includes("learn")) return "Let’s make it simple. Start with **Em**: put your 2nd finger on the 5th string, 2nd fret, and your 3rd finger on the 4th string, 2nd fret. Strum all six strings slowly.\n\nTry it four times. When you’re ready, say “next” and we’ll add the next step.";
  return "I’m ready to help you make progress. Ask me about a chord, song, technique, theory, or practice plan. I’ll remember where we are and guide you one step at a time.\n\n*Demo mode is active — add GEMINI_API_KEY to connect me to Gemini.*";
}
