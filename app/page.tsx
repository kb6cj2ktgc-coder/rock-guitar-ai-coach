"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, Guitar, Menu, Mic, MicOff, Music2, Pause, Play, RotateCcw, Sparkles, Speaker, Square, Trash2, WandSparkles, X } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };
type SpeechRecognitionEventLike = { results: { [index: number]: { [index: number]: { transcript: string } } } };
type SpeechRecognitionLike = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((event: SpeechRecognitionEventLike) => void) | null; onend: (() => void) | null; onerror: ((event: { error?: string }) => void) | null };
type SpeechWindow = Window & { webkitSpeechRecognition?: new () => SpeechRecognitionLike; SpeechRecognition?: new () => SpeechRecognitionLike };

const welcome: Message = { role: "assistant", content: "Hey! I’m Rock, your guitar coach. 🎸\n\nTell me what you want to play, what you’re stuck on, or even ask me something completely random. I’ll keep track of our conversation and guide you one step at a time." };
const starters = ["Teach me my first chord", "Make me a 10-minute practice plan", "How do I play a clean barre chord?"];
const tabs = ["e|--0--0--0--0--|", "B|--0--0--0--0--|", "G|--0--0--0--0--|", "D|--2--2--2--2--|", "A|--2--2--2--2--|", "E|--0--0--0--0--|"];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [speaking, setSpeaking] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [bpm, setBpm] = useState(80);
  const [metronome, setMetronome] = useState(false);
  const [beat, setBeat] = useState(0);
  const [micStatus, setMicStatus] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => { const saved = localStorage.getItem("rock-chat"); if (saved) setMessages(JSON.parse(saved)); }, []);
  useEffect(() => { localStorage.setItem("rock-chat", JSON.stringify(messages)); endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); recognitionRef.current?.stop(); }, []);
  useEffect(() => {
    if (!metronome) { if (timerRef.current) clearInterval(timerRef.current); setBeat(0); return; }
    const tick = () => { const context = audioRef.current || new AudioContext(); audioRef.current = context; const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.frequency.value = beat === 0 ? 1000 : 700; gain.gain.setValueAtTime(.12, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .06); oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .06); setBeat((value) => (value + 1) % 4); };
    tick(); timerRef.current = setInterval(tick, 60000 / bpm); return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [metronome, bpm]);

  async function send(text = input) {
    const value = text.trim(); if (!value || loading) return;
    const next = [...messages, { role: "user" as const, content: value }]; setMessages(next); setInput(""); setLoading(true);
    try { const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next }) }); const data = await response.json(); setMessages([...next, { role: "assistant", content: data.message || data.error }]); }
    catch { setMessages([...next, { role: "assistant", content: "I lost the signal for a second. Try sending that again." }]); }
    finally { setLoading(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); send(); }
  function clearChat() { setMessages([welcome]); localStorage.removeItem("rock-chat"); setMenuOpen(false); }
  function speak(text: string, index: number) { if (!window.speechSynthesis) return; if (speaking === index) { window.speechSynthesis.cancel(); setSpeaking(null); return; } window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text.replace(/[*#]/g, "")); utterance.rate = .92; utterance.onend = () => setSpeaking(null); window.speechSynthesis.speak(utterance); setSpeaking(index); }
  function toggleVoice() {
    const SpeechRecognition = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicStatus("Voice input is not supported in this browser. On iPhone Safari, speech-to-text is not available. Try Chrome or Edge on mobile, or keep using text input for now.");
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const spoken = event.results[0][0].transcript;
      setInput(spoken);
      setMicStatus(`Heard: “${spoken}”`);
      if (/^(rock[,. ]*)?(next step|next|continue)$/i.test(spoken.trim())) send("next");
      else if (/play (that )?slower/i.test(spoken)) setBpm((value) => Math.max(40, value - 10));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => { setMicStatus("Microphone permission was denied or unavailable. Please try again."); setListening(false); };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    setMicStatus("Listening… try saying “next step”");
  }
  function listenForGuitar() { setMicStatus("Experimental listening mode: play one clear note or chord near your microphone."); navigator.mediaDevices?.getUserMedia({ audio: true }).then(() => setMicStatus("Mic is ready. Rock can hear the input, but automated chord recognition is still experimental.")); }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark"><Guitar size={22} /></span><span>rock<span className="orange">.</span></span></a><div className="header-actions"><span className="status"><i /> Gemini-ready coach</span><button className="icon-button mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu">{menuOpen ? <X size={19} /> : <Menu size={19} />}</button><button className="clear" onClick={clearChat}><Trash2 size={15} /> Clear chat</button></div></header>
    <section className="hero"><div className="eyebrow"><Sparkles size={15} /> YOUR POCKET-SIZED COACH</div><h1>Make some <em>noise.</em><br />Learn to play.</h1><p className="hero-copy">A guitar coach that talks like a human, remembers your progress, and gets you playing one step at a time.</p><div className="hero-stats"><div><strong>01</strong><span>Ask anything</span></div><div><strong>02</strong><span>Learn in steps</span></div><div><strong>03</strong><span>Play with confidence</span></div></div></section>
    <section className="tools-grid"><div className="tool-panel"><div className="tool-title"><Music2 size={17} /> Practice metronome</div><div className="tempo"><strong>{bpm}</strong><span>BPM</span><button onClick={() => setBpm(Math.max(40, bpm - 5))}>−</button><button onClick={() => setBpm(Math.min(220, bpm + 5))}>+</button><button className="play-tool" onClick={() => setMetronome(!metronome)}>{metronome ? <Pause size={15} /> : <Play size={15} />}</button></div><div className="beats">{[0,1,2,3].map((value) => <i key={value} className={metronome && beat === value ? "active" : ""} />)}</div></div><div className="tool-panel tab-panel"><div className="tool-title"><Guitar size={17} /> Em starter tab <button className="listen-button" onClick={listenForGuitar}><Mic size={13} /> Listen</button></div><pre>{tabs.join("\n")}</pre><p>{micStatus || "Play slowly with the metronome. Microphone feedback is experimental."}</p></div></section>
    <section className="coach-card"><div className="card-heading"><div className="avatar"><WandSparkles size={20} /></div><div><h2>Talk to Rock</h2><p>Your context-aware guitar coach</p></div><span className="online"><i /> Online</span></div><div className="conversation">{messages.map((message, index) => <div key={index} className={`message-row ${message.role}`}><div className="message-avatar">{message.role === "assistant" ? <Guitar size={16} /> : "You"}</div><div className="bubble-wrap"><div className="bubble">{message.content.split("\n").map((line, i) => <span key={i}>{line}{i < message.content.split("\n").length - 1 && <br />}</span>)}</div>{message.role === "assistant" && <button className="speak-button" onClick={() => speak(message.content, index)}>{speaking === index ? <><Square size={12} /> Stop</> : <><Speaker size={13} /> Listen</>}</button>}</div></div>)}{loading && <div className="message-row assistant"><div className="message-avatar"><Guitar size={16} /></div><div className="bubble typing"><i /><i /><i /></div></div>}<div ref={endRef} /></div><div className="suggestions">{starters.map((starter) => <button key={starter} onClick={() => send(starter)}>{starter}</button>)}</div><form className="composer" onSubmit={submit}><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Rock anything…" aria-label="Message Rock" /><button type="button" className={`mic-button ${listening ? "recording" : ""}`} onClick={toggleVoice} aria-label="Use voice input">{listening ? <MicOff size={18} /> : <Mic size={18} />}</button><button type="submit" disabled={!input.trim() || loading} aria-label="Send message"><ArrowUp size={20} /></button></form><p className="hint">Rock remembers this conversation in your browser <span>·</span> <button onClick={clearChat}>Start fresh</button></p></section>
    <footer>Built for curious players <span>✦</span> Keep making noise</footer>
  </main>;
}

