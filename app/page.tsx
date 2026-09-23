"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, Clock3, Guitar, Mic, MicOff, Play, RotateCcw, Speaker, Square, Trash2 } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((event: { results: { [n: number]: { [n: number]: { transcript: string } } } }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
const welcome: Message = { role: "assistant", content: "Hey, I’m Rock, your guitar coach. 🎸\n\nBefore we begin, are you a beginner, intermediate, or advanced guitarist?" };
const starters = ["Beginner", "Intermediate", "Advanced"];
const warmup = [{ label: "Finger warmup", seconds: 120 }, { label: "Chord practice", seconds: 300 }, { label: "Practice switching chords", seconds: 180 }, { label: "Free play", seconds: 60 }];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([welcome]); const [input, setInput] = useState(""); const [loading, setLoading] = useState(false); const [listening, setListening] = useState(false); const [timer, setTimer] = useState<{ label: string; seconds: number; total: number } | null>(null); const [running, setRunning] = useState(false); const [speaking, setSpeaking] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null); const recognitionRef = useRef<Recognition | null>(null);
  useEffect(() => { try { const saved = localStorage.getItem("rock-chat"); if (saved) setMessages(JSON.parse(saved)); } catch {} }, []);
  useEffect(() => { localStorage.setItem("rock-chat", JSON.stringify(messages)); endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { if (!running || !timer) return; if (timer.seconds <= 0) { setRunning(false); return; } const id = setInterval(() => setTimer((current) => current ? { ...current, seconds: current.seconds - 1 } : current), 1000); return () => clearInterval(id); }, [running, timer]);
  useEffect(() => () => recognitionRef.current?.stop(), []);

  async function send(text = input) {
    const value = text.trim(); if (!value || loading) return;
    const next = [...messages, { role: "user" as const, content: value }]; setMessages(next); setInput(""); setLoading(true);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next }) });
      const reader = response.body?.getReader(); if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder(); let buffer = ""; let answer = ""; setMessages([...next, { role: "assistant", content: "" }]);
      const consume = (line: string) => { if (!line.startsWith("data:")) return; try { const event = JSON.parse(line.slice(5).trim()); if (event.error) throw new Error(event.error); if (event.text) { answer += event.text; setMessages([...next, { role: "assistant", content: answer }]); } } catch (error) { if (error instanceof Error && error.message !== "Unexpected end of JSON input") throw error; } };
      while (true) { const { value: chunk, done } = await reader.read(); if (done) break; buffer += decoder.decode(chunk, { stream: true }); const lines = buffer.split(/\r?\n/); buffer = lines.pop() || ""; for (const line of lines) consume(line); }
      if (buffer.trim()) consume(buffer); if (!answer) throw new Error("Empty response");
    } catch (error) { setMessages([...next, { role: "assistant", content: error instanceof Error ? error.message : "Rock could not connect. Try again." }]); }
    finally { setLoading(false); }
  }
  function startWarmup() { setTimer({ label: warmup[0].label, seconds: warmup[0].seconds, total: warmup[0].seconds }); setRunning(true); send("Create a 10-minute warmup with these timed sections: 2 minutes finger warmup, 5 minutes chord practice, 3 minutes chord switching."); }
  function toggleVoice() { const SpeechRecognition = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition; if (!SpeechRecognition) { setInput("Voice typing is not supported by this browser. Use your keyboard microphone or Chrome/Edge."); return; } if (listening) { recognitionRef.current?.stop(); setListening(false); return; } const recognition = new SpeechRecognition(); recognition.lang = "en-US"; recognition.interimResults = false; recognition.continuous = false; recognition.onresult = (event) => setInput(event.results[0][0].transcript); recognition.onend = () => setListening(false); recognition.onerror = () => { setInput("Microphone permission was denied. Please allow it and try again."); setListening(false); }; recognitionRef.current = recognition; recognition.start(); setListening(true); }
  function speak(text: string, index: number) { if (!window.speechSynthesis) return; if (speaking === index) { speechSynthesis.cancel(); setSpeaking(null); return; } speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text.replace(/[*#]/g, "")); utterance.onend = () => setSpeaking(null); speechSynthesis.speak(utterance); setSpeaking(index); }
  const reset = () => { setTimer(null); setRunning(false); }; const minutes = timer ? Math.floor(timer.seconds / 60).toString().padStart(2, "0") : "00"; const seconds = timer ? (timer.seconds % 60).toString().padStart(2, "0") : "00";
  return <main className="app"><header className="chat-header"><div className="brand"><span><Guitar size={20} /></span><b>rock<span>.</span></b></div><button className="clear" onClick={() => { setMessages([welcome]); localStorage.removeItem("rock-chat"); }}><Trash2 size={15} /> Clear</button></header><section className="chat-shell"><div className="chat-title"><Guitar size={18} /><div><h1>Talk to Rock</h1><p>Your guitar coach, one step at a time</p></div></div><div className="conversation">{messages.map((message, index) => <div className={`message-row ${message.role}`} key={index}><div className="bubble">{message.content || (loading ? "Rock is thinking…" : "")}</div>{message.role === "assistant" && message.content && <button className="listen" onClick={() => speak(message.content, index)}>{speaking === index ? <><Square size={12} /> Stop</> : <><Speaker size={13} /> Listen</>}</button>}</div>)}<div ref={endRef} /></div><div className="quick-actions"><button onClick={startWarmup}><Clock3 size={15} /> Make a 10-minute warmup</button>{starters.map((item) => <button key={item} onClick={() => send(item)}>{item}</button>)}</div>{timer && <div className="timer-card"><div><small>NOW PRACTISING</small><strong>{timer.label}</strong></div><time>{minutes}:{seconds}</time><button onClick={() => setRunning(!running)}>{running ? "Pause" : <><Play size={14} /> Start</>}</button><button className="reset" onClick={reset}><RotateCcw size={14} /></button></div>}<form className="composer" onSubmit={(event: FormEvent) => { event.preventDefault(); send(); }}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask Rock anything…" /><button type="button" className={listening ? "recording" : ""} onClick={toggleVoice} aria-label="Voice input">{listening ? <MicOff size={19} /> : <Mic size={19} />}</button><button type="submit" disabled={!input.trim() || loading}><ArrowUp size={20} /></button></form><p className="note">Use the microphone to dictate, or use your keyboard’s voice typing.</p></section></main>;
}
