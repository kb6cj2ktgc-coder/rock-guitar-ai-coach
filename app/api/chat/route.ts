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
    const model = await findModel(key);
    const prompt = `${SYSTEM}\n\nConversation:\n${messages.slice(-20).map((m) => `${m.role === "user" ? "Student" : "Rock"}: ${m.content}`).join("\n")}\n\nReply to the latest student message.`;
    const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });
    const streamResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    if (streamResponse.ok && streamResponse.body) return proxyGeminiStream(streamResponse.body);

    // Some Gemini models/keys allow generateContent but reject streaming. Fall back to it.
    const normalResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    if (!normalResponse.ok) {
      console.error("Gemini request failed", streamResponse.status, await streamResponse.text(), normalResponse.status, await normalResponse.text());
      return sse({ error: normalResponse.status >= 500 ? "Gemini is temporarily unavailable. Please try again in a few seconds." : `Gemini request failed (${normalResponse.status}).` }, 502);
    }
    const data = await normalResponse.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    return text ? sse({ text }) : sse({ error: "Gemini returned no text." }, 502);
  } catch (error) {
    console.error("Chat route error", error);
    return sse({ error: "Rock could not connect to Gemini. Try again." }, 502);
  }
}

function proxyGeminiStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader(); const decoder = new TextDecoder(); const encoder = new TextEncoder(); let buffer = "";
  const stream = new ReadableStream({ async pull(controller) {
    const { value, done } = await reader.read();
    if (done) { controller.close(); return; }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/); buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      try { const json = JSON.parse(line.slice(5).trim()); const text = json.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join(""); if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)); } catch { /* wait for the next complete SSE line */ }
    }
  }, cancel() { reader.cancel(); }});
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" } });
}

async function findModel(key: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
  if (!response.ok) throw new Error(`Model list failed: ${response.status}`);
  const data = await response.json() as { models?: Model[] };
  const available = (data.models || []).filter((m) => m.name && m.supportedGenerationMethods?.includes("generateContent"));
  const preferred = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite"];
  return preferred.map((name) => `models/${name}`).find((name) => available.some((m) => m.name === name)) || available.find((m) => /flash/i.test(m.name || ""))?.name || available[0]?.name || "models/gemini-2.0-flash";
}
function demo(input: string) { if (/warmup|practice plan/i.test(input)) return "Here’s a simple 10-minute warmup: 2 minutes finger warmups, 5 minutes chord practice, and 3 minutes switching between two chords. Start the timer and I’ll coach you through each section."; return "I’m Rock, your guitar coach. Tell me your level and what you want to learn, and we’ll take it one step at a time."; }
