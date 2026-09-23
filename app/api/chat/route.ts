import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are Rock, a warm, encouraging conversational AI guitar coach. The product is called Rock Guitar. Prioritize guitar questions, but answer unrelated questions clearly and briefly too. Remember and refer to the conversation. Teach in small, actionable steps. When beginning a multi-step lesson, give only the next useful step and ask if the learner is ready to continue. Never pretend to hear playing unless the user provides an audio feature. Be concise but helpful, use plain language, and include chord fingerings or practice timing when relevant.`;

type Message = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  try {
    const { messages } = (await request.json()) as { messages?: Message[] };
    if (!messages?.length) return NextResponse.json({ error: "No messages provided" }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        message: demoReply(messages[messages.length - 1].content),
        demo: true,
      });
    }

    const prompt = `${SYSTEM_PROMPT}\n\nConversation so far:\n${messages
      .slice(-20)
      .map((message) => `${message.role === "user" ? "Student" : "Rock"}: ${message.content}`)
      .join("\n")}\n\nRespond as Rock to the student's latest message.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );
    if (!response.ok) throw new Error("Gemini request failed");
    const data = await response.json();
    const message = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!message) throw new Error("Gemini returned no text");
    return NextResponse.json({ message });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Rock could not answer right now. Try again in a moment." }, { status: 500 });
  }
}

function demoReply(input: string) {
  const lower = input.toLowerCase();
  if (lower.includes("banana")) return "A banana is a sweet, usually yellow fruit. 🍌\n\nAnd yes, I can answer non-guitar questions too! Want to get back to playing after that?";
  if (lower.includes("chord") || lower.includes("learn")) return "Let’s make it simple. Start with **Em**: put your 2nd finger on the 5th string, 2nd fret, and your 3rd finger on the 4th string, 2nd fret. Strum all six strings slowly.\n\nTry it four times. When you’re ready, say “next” and we’ll add the next step.";
  return "I’m ready to help you make progress. Ask me about a chord, song, technique, theory, or practice plan. I’ll remember where we are and guide you one step at a time.\n\n*Demo mode is active — add GEMINI_API_KEY to connect me to Gemini.*";
}
