import { NextResponse } from "next/server";

export const runtime = "edge";
type Message = { role: "user" | "assistant"; content: string };
type Model = { name?: string; supportedGenerationMethods?: string[] };
const SYSTEM = "You are Rock, a warm, concise guitar coach. First learn whether the student is beginner, intermediate, or advanced. Create timed practice plans when asked, with clear minute-by-minute sections. Give one useful step at a time and keep responses easy to follow aloud.";

function sse(payload: object, status = 200) { return new Response(`data: ${JSON.stringify(payload)}\n\n`, { status, headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" } }); }

export async function POST(request: Request) {
  try {
    const { messages } = await request.json() as { messages?: Message[] };
    if (!messages?.length) return NextResponse.json({ error: "No messages provided" }, { status: 400 });
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) return sse({ text: demo(messages[messages.length - 1].content) });

    const prompt = `${SYSTEM}\n\nConversation:\n${messages.slice(-20).map((m) => `${m.role === "user" ? "Student" : "Rock"}: ${m.content}`).join("\n")}\n\nReply to the latest student message.`;
    const models = await findModels(key);
    let lastStatus = 0;
    for (const model of models) {
      const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });
      // Use the regular endpoint first. It is more widely supported than streamGenerateContent.
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (response.ok) {
        const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
        if (text) return sse({ text });
      }
      lastStatus = response.status;
      console.error("Gemini model failed", model, response.status, await response.text());
      if (![404, 429, 500, 502, 503, 504].includes(response.status)) break;
    }
    return sse({ error: lastStatus >= 500 ? "Gemini is temporarily unavailable. Please try again in a few seconds." : `Gemini request failed (${lastStatus}). Check that the API key has access to a supported Gemini model.` }, 502);
  } catch (error) {
    console.error("Chat route error", error);
    return sse({ error: "Rock could not connect to Gemini. Try again." }, 502);
  }
}

async function findModels(key: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
  if (!response.ok) throw new Error(`Model list failed: ${response.status}`);
  const data = await response.json() as { models?: Model[] };
  const available = (data.models || []).filter((m) => m.name && m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name as string);
  const preferred = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite"].map((name) => `models/${name}`);
  const ordered = [...preferred.filter((name) => available.includes(name)), ...available.filter((name) => /flash/i.test(name) && !preferred.includes(name)), ...available.filter((name) => !/flash/i.test(name) && !preferred.includes(name))];
  if (!ordered.length) throw new Error("No Gemini model supports generateContent");
  return ordered;
}

function demo(input: string) { if (/warmup|practice plan/i.test(input)) return "Here’s a simple 10-minute warmup: 2 minutes finger warmups, 5 minutes chord practice, and 3 minutes switching between two chords. Start the timer and I’ll coach you through each section."; return "I’m Rock, your guitar coach. Tell me your level and what you want to learn, and we’ll take it one step at a time."; }
