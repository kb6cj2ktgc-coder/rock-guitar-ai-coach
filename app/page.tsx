"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Guitar,
  Menu,
  Music2,
  Play,
  Sparkles,
  Speaker,
  Square,
  Target,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

type CourseStep = {
  type: "instruction" | "chord" | "exercise" | "rhythm" | "song" | "assessment";
  instruction: string;
  expectedChord?: string;
  tempo?: number | null;
  requiredAttempts?: number;
};

type CourseLesson = {
  title: string;
  objective: string;
  steps: CourseStep[];
};

type Course = {
  courseTitle: string;
  skillLevel: string;
  goal: string;
  estimatedLessons: number;
  lessons: CourseLesson[];
};

const welcome: Message = {
  role: "assistant",
  content:
    "Hey! I’m Rock, your guitar coach. 🎸\n\nTell me what you want to play, what you’re stuck on, or ask me anything. I’ll keep track of our conversation and guide you one step at a time.",
};

const starters = [
  "Teach me my first chord",
  "Make me a 10-minute practice plan",
  "How do I play a clean barre chord?",
];

const tabs = [
  "e|--0--0--0--0--|",
  "B|--0--0--0--0--|",
  "G|--0--0--0--0--|",
  "D|--2--2--2--2--|",
  "A|--2--2--2--2--|",
  "E|--0--0--0--0--|",
];

const COURSE_GOALS = [
  "Complete Beginner",
  "Learn Essential Chords",
  "Learn Rhythm Guitar",
  "Learn Fingerstyle",
  "Learn Lead Guitar",
  "Learn a Specific Song",
  "Improve Chord Changes",
  "Improve Strumming",
  "Create My Own Goal",
];

const COURSE_LEVELS = ["Beginner", "Intermediate", "Advanced"];

const CHORD_POSITIONS: Record<string, string[]> = {
  G: ["x", "3", "2", "0", "0", "3"],
  C: ["x", "1", "0", "2", "3", "x"],
  D: ["x", "x", "0", "2", "3", "2"],
  Em: ["0", "2", "2", "0", "0", "0"],
  Am: ["x", "0", "1", "2", "2", "0"],
  F: ["1", "1", "2", "3", "3", "1"],
};

const DEFAULT_COURSE_STATE = {
  course: null as Course | null,
  currentLessonIndex: 0,
  currentStepIndex: 0,
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [speaking, setSpeaking] = useState<number | null>(null);
  const [bpm, setBpm] = useState(80);
  const [metronome, setMetronome] = useState(false);
  const [beat, setBeat] = useState(0);
  const [courseGoal, setCourseGoal] = useState(COURSE_GOALS[0]);
  const [courseLevel, setCourseLevel] = useState(COURSE_LEVELS[0]);
  const [course, setCourse] = useState<Course | null>(null);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [courseLoading, setCourseLoading] = useState(false);
  const [courseMessage, setCourseMessage] = useState("");

  const endRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      const savedChat = localStorage.getItem("rock-chat");
      if (savedChat) setMessages(JSON.parse(savedChat));
      const savedCourse = localStorage.getItem("rock-course-state");
      if (savedCourse) {
        const parsed = JSON.parse(savedCourse) as typeof DEFAULT_COURSE_STATE;
        setCourse(parsed.course);
        setCurrentLessonIndex(parsed.currentLessonIndex ?? 0);
        setCurrentStepIndex(parsed.currentStepIndex ?? 0);
      }
    } catch {
      // Ignore invalid local storage.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("rock-chat", JSON.stringify(messages));
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!course) {
      localStorage.removeItem("rock-course-state");
      return;
    }
    localStorage.setItem(
      "rock-course-state",
      JSON.stringify({
        course,
        currentLessonIndex,
        currentStepIndex,
      }),
    );
  }, [course, currentLessonIndex, currentStepIndex]);

  useEffect(() => {
    if (!metronome) {
      if (timerRef.current) clearInterval(timerRef.current);
      setBeat(0);
      return;
    }

    const tick = () => {
      const context = audioRef.current || new AudioContext();
      audioRef.current = context;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = beat === 0 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.09);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.1);
      setBeat((value) => (value + 1) % 4);
    };

    tick();
    timerRef.current = setInterval(tick, 60000 / bpm);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [metronome, bpm, beat]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  }, []);

  async function send(text = input) {
    const value = text.trim();
    if (!value || loading) return;

    const next = [...messages, { role: "user" as const, content: value }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      setMessages([...next, { role: "assistant", content: "" }]);

      const consume = (line: string) => {
        if (!line.startsWith("data:")) return;
        try {
          const event = JSON.parse(line.slice(5).trim());
          if (event.error) throw new Error(event.error);
          if (event.text) {
            answer += event.text;
            setMessages((current) => {
              const cloned = [...current];
              const target = cloned[cloned.length - 1];
              if (target?.role === "assistant") target.content = answer;
              return cloned;
            });
          }
        } catch {
          // Ignore malformed payloads.
        }
      };

      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) consume(line);
      }

      if (buffer.trim()) consume(buffer);
      if (!answer) throw new Error("Empty response");
    } catch (error) {
      setMessages([
        ...next,
        {
          role: "assistant",
          content:
            error instanceof Error ? error.message : "I lost the signal for a second. Try sending that again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    send();
  }

  function clearChat() {
    setMessages([welcome]);
    localStorage.removeItem("rock-chat");
    setMenuOpen(false);
  }

  function speak(text: string, index: number) {
    if (!window.speechSynthesis) return;
    if (speaking === index) {
      window.speechSynthesis.cancel();
      setSpeaking(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/\*/g, "").replace(/[#`]/g, ""));
    utterance.rate = 0.92;
    utterance.onend = () => setSpeaking(null);
    window.speechSynthesis.speak(utterance);
    setSpeaking(index);
  }

  function createCourse() {
    setCourseMessage("");
    setCourseLoading(true);

    fetch("/api/course", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal: courseGoal,
        skillLevel: courseLevel,
      }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || data?.error) {
          throw new Error(data?.error || "Could not create your course.");
        }
        const generated = data as Course;
        setCourse(generated);
        setCurrentLessonIndex(0);
        setCurrentStepIndex(0);
        setCourseMessage(`Course ready: ${generated.courseTitle}`);
      })
      .catch((error: Error) => {
        setCourseMessage(error.message || "Something went wrong while creating your course.");
      })
      .finally(() => setCourseLoading(false));
  }

  function repeatCourseInstruction() {
    if (!course || currentStepIndex >= (course.lessons[currentLessonIndex]?.steps?.length ?? 0)) return;
    const step = course.lessons[currentLessonIndex].steps[currentStepIndex];
    if (!step?.instruction || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(step.instruction.replace(/\*/g, ""));
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  function advanceCourse() {
    if (!course) return;
    const lesson = course.lessons[currentLessonIndex];
    const nextStep = currentStepIndex + 1;

    if (nextStep < (lesson?.steps.length ?? 0)) {
      setCurrentStepIndex(nextStep);
      return;
    }

    if (currentLessonIndex + 1 < course.lessons.length) {
      setCurrentLessonIndex(currentLessonIndex + 1);
      setCurrentStepIndex(0);
      return;
    }

    setCourseMessage("Course complete. Nice work — keep practising and we’ll build on this next time.");
  }

  function skipForNow() {
    if (!course) return;
    const lesson = course.lessons[currentLessonIndex];
    if ((currentStepIndex + 1) < (lesson?.steps.length ?? 0)) {
      setCurrentStepIndex(currentStepIndex + 1);
      return;
    }

    if (currentLessonIndex + 1 < course.lessons.length) {
      setCurrentLessonIndex(currentLessonIndex + 1);
      setCurrentStepIndex(0);
      return;
    }

    setCourseMessage("You skipped the final step. That’s okay — we can come back to it.");
  }

  function continueCourse() {
    try {
      const savedCourse = localStorage.getItem("rock-course-state");
      if (!savedCourse) {
        setCourseMessage("There’s no saved course yet. Start a new one whenever you’re ready.");
        return;
      }

      const parsed = JSON.parse(savedCourse) as typeof DEFAULT_COURSE_STATE;
      if (parsed.course) {
        setCourse(parsed.course);
        setCurrentLessonIndex(parsed.currentLessonIndex ?? 0);
        setCurrentStepIndex(parsed.currentStepIndex ?? 0);
        setCourseMessage("Welcome back. We’ll continue from where you left off.");
      }
    } catch {
      setCourseMessage("Your saved course could not be loaded. Start a new one.");
    }
  }

  const currentLesson = course?.lessons[currentLessonIndex] ?? null;
  const currentStep = currentLesson?.steps[currentStepIndex] ?? null;
  const courseProgress = course
    ? Math.round(
        ((currentLessonIndex * 100) / Math.max(course.lessons.length, 1)) +
          ((currentStepIndex / Math.max(currentLesson?.steps.length ?? 1, 1)) * 100) / Math.max(course.lessons.length, 1),
      )
    : 0;

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-mark">
            <Guitar size={22} />
          </span>
          <span>
            rock<span className="orange">.</span>
          </span>
        </a>

        <div className="header-actions">
          <span className="status">
            <i /> Gemini-ready coach
          </span>
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu">
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <button className="clear" onClick={clearChat}>
            <Trash2 size={15} /> Clear chat
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow">
          <Sparkles size={15} /> YOUR POCKET-SIZED COACH
        </div>
        <h1>
          Make some <em>noise.</em>
          <br />
          Learn to play.
        </h1>
        <p className="hero-copy">
          A guitar coach that teaches in small steps, remembers your progress, and helps you improve without throwing a giant wall of text at you.
        </p>

        <div className="hero-stats">
          <div>
            <strong>01</strong>
            <span>Ask anything</span>
          </div>
          <div>
            <strong>02</strong>
            <span>Learn in steps</span>
          </div>
          <div>
            <strong>03</strong>
            <span>Track your progress</span>
          </div>
        </div>
      </section>

      <section className="course-panel">
        <div className="course-header">
          <div>
            <div className="eyebrow subtle">
              <BookOpen size={15} /> COURSE MODE
            </div>
            <h2>Start a Course</h2>
          </div>
          <div className="course-actions">
            <button className="secondary" onClick={continueCourse}>Continue Course</button>
            <button className="primary" onClick={createCourse} disabled={courseLoading}>
              {courseLoading ? "Creating..." : "Start a Course"}
            </button>
          </div>
        </div>

        <div className="course-builder">
          <label>
            <span>Goal</span>
            <select value={courseGoal} onChange={(event) => setCourseGoal(event.target.value)}>
              {COURSE_GOALS.map((goal) => (
                <option key={goal} value={goal}>{goal}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Skill level</span>
            <select value={courseLevel} onChange={(event) => setCourseLevel(event.target.value)}>
              {COURSE_LEVELS.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </label>
        </div>

        {courseMessage && <div className="coach-note">{courseMessage}</div>}

        {course && currentLesson && currentStep && (
          <div className="course-player">
            <div className="lesson-card">
              <div className="lesson-meta">
                Lesson {currentLessonIndex + 1} of {course.lessons.length}
                <span className="dot" />
                {course.skillLevel}
              </div>

              <h3>{currentLesson.title}</h3>
              <p className="objective">{currentLesson.objective}</p>

              {currentStep.expectedChord && (
                <div className="chord-block">
                  <div className="chord-header">
                    <strong>{currentStep.expectedChord}</strong>
                    <span>Practice this chord</span>
                  </div>
                  <ChordDiagram chordName={currentStep.expectedChord} />
                </div>
              )}

              <div className="step-box">
                <span className="step-type">{currentStep.type}</span>
                <p>{currentStep.instruction}</p>
              </div>

              <div className="lesson-actions">
                <button className="secondary" onClick={repeatCourseInstruction}>
                  <Speaker size={15} /> Speak
                </button>
                <button className="secondary" onClick={skipForNow}>
                  <ChevronRight size={15} /> Skip for now
                </button>
                <button className="primary" onClick={advanceCourse}>
                  <CheckCircle2 size={15} /> Next step
                </button>
              </div>
            </div>

            <aside className="course-side">
              <div className="mini-card">
                <div className="mini-label">Current course</div>
                <h4>{course.courseTitle}</h4>
                <p>{course.goal}</p>
              </div>

              <div className="mini-card">
                <div className="mini-label">Progress</div>
                <div className="progress-row">
                  <strong>{courseProgress}%</strong>
                  <span>{currentLessonIndex + 1}/{course.lessons.length} lessons</span>
                </div>
                <div className="progress-bar"><span style={{ width: `${Math.min(courseProgress, 100)}%` }} /></div>
              </div>

              <div className="mini-card">
                <div className="mini-label">Practice reminder</div>
                <p>Keep the tempo steady and focus on clean finger placement before rushing the next chord.</p>
              </div>
            </aside>
          </div>
        )}
      </section>

      <section className="tools-grid">
        <div className="tool-panel">
          <div className="tool-title">
            <Music2 size={17} /> Practice metronome
          </div>
          <div className="tempo">
            <strong>{bpm}</strong>
            <span>BPM</span>
          </div>
          <div className="tempo-controls">
            <button onClick={() => setBpm((value) => Math.max(40, value - 5))}>-</button>
            <button onClick={() => setBpm((value) => Math.min(200, value + 5))}>+</button>
            <button className="play-tool" onClick={() => setMetronome((value) => !value)}>
              {metronome ? <Square size={15} /> : <Play size={15} />}
              {metronome ? "Stop" : "Play"}
            </button>
          </div>
          <div className="beats">
            {[0, 1, 2, 3].map((value) => (
              <i key={value} className={metronome && beat === value ? "active" : ""} />
            ))}
          </div>
        </div>

        <div className="tool-panel tab-panel">
          <div className="tool-title">
            <Target size={17} /> Essential starter tab
          </div>
          <pre>{tabs.join("\n")}</pre>
          <p>Practice slowly and listen for clean notes. Start with open strings and a steady rhythm.</p>
        </div>
      </section>

      <section className="coach-card">
        <div className="card-heading">
          <div className="avatar">
            <WandSparkles size={20} />
          </div>
          <div>
            <h2>Talk to Rock</h2>
            <p>Your context-aware guitar coach</p>
          </div>
          <span className="online">
            <i /> Online
          </span>
        </div>

        <div className="conversation">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`message-row ${message.role}`}>
              <div className="message-avatar">{message.role === "assistant" ? <Guitar size={16} /> : "You"}</div>
              <div className="bubble-wrap">
                <div className="bubble">
                  {message.content.split("\n").map((line, i) => (
                    <span key={`${line}-${i}`}>
                      {line}
                      {i < message.content.split("\n").length - 1 && <br />}
                    </span>
                  ))}
                </div>
                {message.role === "assistant" && (
                  <button className="speak-button" onClick={() => speak(message.content, index)}>
                    {speaking === index ? <Square size={12} /> : <Speaker size={12} />} {speaking === index ? "Stop" : "Listen"}
                  </button>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="message-row assistant">
              <div className="message-avatar">
                <Guitar size={16} />
              </div>
              <div className="bubble typing">
                <i />
                <i />
                <i />
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        <div className="suggestions">
          {starters.map((starter) => (
            <button key={starter} onClick={() => send(starter)}>
              {starter}
            </button>
          ))}
        </div>

        <form className="composer" onSubmit={submit}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask Rock anything..."
            aria-label="Message Rock"
          />
          <button type="submit" disabled={!input.trim() || loading} aria-label="Send message">
            <ArrowUp size={20} />
          </button>
        </form>

        <p className="hint">
          Rock remembers this conversation in your browser <button onClick={clearChat}>Start fresh</button>
        </p>
      </section>

      <footer>
        Built for curious players <span>✦</span> Keep making noise
      </footer>
    </main>
  );
}

function ChordDiagram({ chordName }: { chordName: string }) {
  const positions = CHORD_POSITIONS[chordName] || ["x", "x", "x", "x", "x", "x"];

  return (
    <div className="chord-diagram" aria-label={`${chordName} chord diagram`}>
      <div className="chord-grid">
        {Array.from({ length: 6 }).map((_, stringIndex) => (
          <div key={`string-${stringIndex}`} className="chord-string">
            {Array.from({ length: 5 }).map((__, fretIndex) => {
              const value = positions[stringIndex] ?? "x";
              const isDot = value !== "x" && Number(value) === fretIndex + 1;
              const isMuted = value === "x";
              const isOpen = value === "0";
              return (
                <span
                  key={`fret-${stringIndex}-${fretIndex}`}
                  className={[
                    "chord-dot",
                    isDot ? "filled" : "",
                    isMuted ? "muted" : "",
                    isOpen ? "open" : "",
                  ].join(" ")}
                >
                  {isOpen ? "○" : isDot ? "●" : ""}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
