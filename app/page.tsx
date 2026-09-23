"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, Guitar, Menu, Sparkles, Trash2, WandSparkles, X } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };
const welcome: Message = { role: "assistant", content: "Hey! I’m Rock, your guitar coach. 🎸\n\nTell me what you want to play, what you’re stuck on, or even ask me something completely random. I’ll keep track of our conversation and guide you one step at a time." };
const starters = ["Teach me my first chord", "Make me a 10-minute practice plan", "How do I play a clean barre chord?"];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const saved = localStorage.getItem("rock-chat"); if (saved) setMessages(JSON.parse(saved)); }, []);
  useEffect(() => { localStorage.setItem("rock-chat", JSON.stringify(messages)); endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send(text = input) {
    const value = text.trim(); if (!value || loading) return;
    const next = [...messages, { role: "user" as const, content: value }]; setMessages(next); setInput(""); setLoading(true);
    try { const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next }) }); const data = await response.json(); setMessages([...next, { role: "assistant", content: data.message || data.error }]); }
    catch { setMessages([...next, { role: "assistant", content: "I lost the signal for a second. Try sending that again." }]); }
    finally { setLoading(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); send(); }
  function clearChat() { setMessages([welcome]); localStorage.removeItem("rock-chat"); setMenuOpen(false); }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark"><Guitar size={22} /></span><span>rock<span className="orange">.</span></span></a><div className="header-actions"><span className="status"><i /> Gemini-ready coach</span><button className="icon-button mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu">{menuOpen ? <X size={19} /> : <Menu size={19} />}</button><button className="clear" onClick={clearChat}><Trash2 size={15} /> Clear chat</button></div></header>
    <section className="hero"><div className="eyebrow"><Sparkles size={15} /> YOUR POCKET-SIZED COACH</div><h1>Make some <em>noise.</em><br />Learn to play.</h1><p className="hero-copy">A guitar coach that talks like a human, remembers your progress, and gets you playing one step at a time.</p><div className="hero-stats"><div><strong>01</strong><span>Ask anything</span></div><div><strong>02</strong><span>Learn in steps</span></div><div><strong>03</strong><span>Play with confidence</span></div></div></section>
    <section className="coach-card"><div className="card-heading"><div className="avatar"><WandSparkles size={20} /></div><div><h2>Talk to Rock</h2><p>Your context-aware guitar coach</p></div><span className="online"><i /> Online</span></div><div className="conversation">{messages.map((message, index) => <div key={index} className={`message-row ${message.role}`}><div className="message-avatar">{message.role === "assistant" ? <Guitar size={16} /> : "You"}</div><div className="bubble">{message.content.split("\n").map((line, i) => <span key={i}>{line}{i < message.content.split("\n").length - 1 && <br />}</span>)}</div></div>)}{loading && <div className="message-row assistant"><div className="message-avatar"><Guitar size={16} /></div><div className="bubble typing"><i /><i /><i /></div></div>}<div ref={endRef} /></div><div className="suggestions">{starters.map((starter) => <button key={starter} onClick={() => send(starter)}>{starter}</button>)}</div><form className="composer" onSubmit={submit}><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Rock anything…" aria-label="Message Rock" /><button disabled={!input.trim() || loading} aria-label="Send message"><ArrowUp size={20} /></button></form><p className="hint">Rock remembers this conversation in your browser <span>·</span> <button onClick={clearChat}>Start fresh</button></p></section>
    <footer>Built for curious players <span>✦</span> Keep making noise</footer>
  </main>;
}
