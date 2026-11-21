import { useState, useRef, useEffect } from "react";
import "./App.css";

const API = "http://localhost:8000";
const SUGGESTIONS = ["How are you?", "Tell me a fun fact", "What's the weather like in Britain?"];

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [speechOn, setSpeechOn] = useState(
    () => localStorage.getItem("speechOn") !== "false"
  );

  const [activeIdx, setActiveIdx] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | playing | paused

  const audioRef = useRef(null);
  const requestRef = useRef(0);
  const abortRef = useRef(null);
  const cacheRef = useRef(new Map());
  const bottomRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("speechOn", String(speechOn));
    if (!speechOn) stopAudio();
  }, [speechOn]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    return () => cacheRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function stopAudio() {
    requestRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setActiveIdx(null);
    setStatus("idle");
  }

  async function playMessage(idx, text) {
    stopAudio();
    const reqId = requestRef.current;
    setActiveIdx(idx);
    setStatus("loading");

    try {
      let url = cacheRef.current.get(text);
      if (!url) {
        const controller = new AbortController();
        abortRef.current = controller;
        const res = await fetch(`${API}/api/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("TTS failed");
        url = URL.createObjectURL(await res.blob());
        cacheRef.current.set(text, url);
      }
      if (reqId !== requestRef.current) return;

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        if (audioRef.current === audio) {
          audioRef.current = null;
          setActiveIdx(null);
          setStatus("idle");
        }
      };
      await audio.play();
      if (reqId === requestRef.current) setStatus("playing");
    } catch (err) {
      if (err.name === "AbortError") return;
      if (reqId === requestRef.current) {
        setError("Could not play speech.");
        setActiveIdx(null);
        setStatus("idle");
      }
    }
  }

  function togglePlayback(idx, text) {
    if (activeIdx === idx) {
      if (status === "playing") {
        audioRef.current?.pause();
        setStatus("paused");
      } else if (status === "paused") {
        audioRef.current?.play();
        setStatus("playing");
      } else if (status === "loading") {
        stopAudio();
      }
      return;
    }
    playMessage(idx, text);
  }

  function buttonLabel(idx) {
    if (activeIdx !== idx) return "▶ Play";
    if (status === "loading") return "Loading…";
    if (status === "playing") return "⏸ Pause";
    if (status === "paused") return "▶ Resume";
    return "▶ Play";
  }

  async function send(text) {
    text = text.trim();
    if (!text || loading) return;

    setError("");
    setInput("");
    stopAudio();
    const history = messages.map(({ role, content }) => ({ role, content }));
    const replyIdx = history.length + 1;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Chat failed");
      }
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      if (speechOn) playMessage(replyIdx, data.reply);
    } catch (err) {
      setError(
        err.message === "Failed to fetch"
          ? "Cannot reach the backend. Is it running?"
          : err.message
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>British Voice Chat</h1>
        <label className="toggle">
          <input
            type="checkbox"
            checked={speechOn}
            onChange={(e) => setSpeechOn(e.target.checked)}
          />
          <span className="switch" />
          Speech
        </label>
      </header>

      <main className="messages" aria-live="polite">
        {messages.length === 0 && !loading && (
          <div className="empty">
            <h2>Hello there</h2>
            <p>Type a message or try one of these.</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <p>{m.content}</p>
            {m.role === "assistant" && (
              <button
                className={`play ${activeIdx === i ? "active" : ""}`}
                onClick={() => togglePlayback(i, m.content)}
              >
                {buttonLabel(i)}
              </button>
            )}
          </div>
        ))}

        {loading && (
          <div className="bubble assistant" aria-label="Thinking">
            <span className="dots"><span /><span /><span /></span>
          </div>
        )}
        {error && <div className="error">{error}</div>}
        <div ref={bottomRef} />
      </main>

      <form
        className="input-row"
        onSubmit={(e) => { e.preventDefault(); send(input); }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message…"
          aria-label="Message"
          autoFocus
        />
        <button
          type="submit"
          className="send"
          disabled={loading || !input.trim()}
          aria-label="Send"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2.5"
               strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </form>
    </div>
  );
}