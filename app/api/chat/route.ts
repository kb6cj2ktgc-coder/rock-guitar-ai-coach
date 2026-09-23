import { NextResponse } from "next/server";

export const runtime = "edge";
type Message = { role: "user" | "assistant"; content: string };
const SYSTEM = "You are Rock, a warm, concise guitar coach. First learn whether the student is beginner, intermediate, or advanced. Create timed practice plans when asked, with clear minute-by-minute sections. Give one useful step at a time and keep responses easy to follow aloud.";

export async function POST(request: Request) {
  const { messages } = await request.json() as { messages?: Message[] };
  if (!messages?.length) return NextResponse.json({ error: "No messages provided" }, { status: 400 });
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return new Response(`data: ${JSON.stringify({ text: demo(messages[messages.length - 1].content) })}\n\n`, { headers: { "Content-Type": "text/event-stream" } });
  try {
    const model = await findModel(key);
    const prompt = `${SYSTEM}\n\nConversation:\n${messages.slice(-20).map((m) => `${m.role === "user" ? "Student" : "Rock"}: ${m.content}`).join("\n")}\n\nReply to the latest student message.`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    if (!response.ok || !response.body) return new Response(`data: ${JSON.stringify({ error: `Gemini is temporarily unavailable (${response.status}).` })}\n\n`, { status: 502, headers: { "Content-Type": "text/event-stream" } });
    const reader = response.body.getReader(); const decoder = new TextDecoder(); const encoder = new TextEncoder(); let buffer = "";
    const stream = new ReadableStream({ async pull(controller) { const { value, done } = await reader.read(); if (done) { controller.close(); return; } buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || ""; for (const line of lines) { if (!line.startsWith("data: ")) continue; try { const json = JSON.parse(line.slice(6)); const text = json.candidates?.[0]?.content?.parts?.[0]?.text; if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)); } catch {} } } });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  } catch (error) { console.error(error); return new Response(`data: ${JSON.stringify({ error: "Rock could not connect to Gemini." })}\n\n`, { status: 502, headers: { "Content-Type": "text/event-stream" } }); }
}
async function findModel(key: string) { const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`); const data = await response.json() as { models?: { name?: string; supportedGenerationMethods?: string[] }[] }; const preferred = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash-lite"]; const available = (data.models || []).filter((m) => m.name && m.supportedGenerationMethods?.includes("generateContent")); return preferred.map((name) => `models/${name}`).find((name) => available.some((m) => m.name === name)) || available.find((m) => /flash/i.test(m.name || ""))?.name || available[0]?.name || "models/gemini-2.0-flash"; }
function demo(input: string) { if (/warmup|practice plan/i.test(input)) return "Here’s a simple 10-minute warmup: 2 minutes finger warmups, 5 minutes chord practice, and 3 minutes switching between two chords. Start the timer and I’ll coach you through each section."; return "I’m Rock, your guitar coach. Tell me your level and what you want to learn, and we’ll take it one step at a time."; }
