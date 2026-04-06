/**
 * /ai-assistant — AI chat for managers / owners / superadmins.
 *
 * - Message bubbles (user right, AI left)
 * - Persists history via backend ai_conversations table
 * - Animated dots while waiting for response
 * - Welcome message on empty conversation
 */
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../api";
import "./AIAssistant.css";

const WELCOME = "Привет! Я ИИ-ассистент платформы Rehab.You. Могу помочь с анализом обучения, статистикой сотрудников и рекомендациями по развитию команды.";

// ── Data hooks ────────────────────────────────────────────────────────────────

function useHistory() {
  return useQuery({
    queryKey: ["ai-history"],
    queryFn: () => api.get("/api/ai/assistant/me").then(r => r.data),
    placeholderData: [],
    retry: false,
    staleTime: 0,
  });
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingBubble() {
  return (
    <div className="ai-bubble ai-bubble--ai ai-bubble--typing">
      <span className="ai-dot" />
      <span className="ai-dot" />
      <span className="ai-dot" />
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function renderText(text) {
  // Light markdown: bold, line breaks
  return text
    .split("\n")
    .map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g).map((seg, j) => {
        if (seg.startsWith("**") && seg.endsWith("**")) {
          return <strong key={j}>{seg.slice(2, -2)}</strong>;
        }
        return seg;
      });
      return <span key={i}>{parts}{i < text.split("\n").length - 1 && <br />}</span>;
    });
}

function Bubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`ai-bubble-wrap ${isUser ? "ai-bubble-wrap--user" : ""}`}>
      {!isUser && <div className="ai-avatar">🤖</div>}
      <div className={`ai-bubble ${isUser ? "ai-bubble--user" : "ai-bubble--ai"}`}>
        {renderText(msg.content)}
      </div>
    </div>
  );
}

// ── Suggestions ───────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Кто не заходил на платформу больше 3 дней?",
  "Покажи средний прогресс сотрудников",
  "На каких тестах чаще застревают мастера?",
  "Сколько новичков сейчас в обучении?",
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AIAssistant() {
  const qc = useQueryClient();
  const { data: history = [], isLoading } = useHistory();
  const [input, setInput] = useState("");
  const [optimistic, setOptimistic] = useState([]); // messages added before server response
  const [waiting, setWaiting] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  // Combine persisted history + optimistic messages
  const allMessages = [...history, ...optimistic];

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages.length, waiting]);

  const sendMut = useMutation({
    mutationFn: (msg) => api.post("/api/ai/assistant", { message: msg }).then(r => r.data),
    onMutate: (msg) => {
      setWaiting(true);
      setOptimistic(prev => [...prev, { role: "user", content: msg, id: Date.now() }]);
    },
    onSuccess: (data) => {
      setOptimistic([]);
      qc.invalidateQueries({ queryKey: ["ai-history"] });
      setWaiting(false);
    },
    onError: () => {
      setOptimistic([]);
      setWaiting(false);
    },
  });

  function send() {
    const msg = input.trim();
    if (!msg || sendMut.isPending) return;
    setInput("");
    textareaRef.current?.focus();
    sendMut.mutate(msg);
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function useSuggestion(s) {
    setInput(s);
    textareaRef.current?.focus();
  }

  const isEmpty = !isLoading && allMessages.length === 0 && !waiting;

  return (
    <div className="ai-page">
      <header className="ai-header">
        <Link to="/" className="ai-back">‹</Link>
        <div className="ai-header-info">
          <span className="ai-header-title">ИИ-ассистент</span>
          <span className="ai-header-sub">Rehab.You Platform AI</span>
        </div>
        <div className="ai-status-dot" title="Онлайн" />
      </header>

      {/* Message list */}
      <div className="ai-messages">
        {/* Welcome bubble — always shown first */}
        <div className="ai-bubble-wrap">
          <div className="ai-avatar">🤖</div>
          <div className="ai-bubble ai-bubble--ai ai-bubble--welcome">
            {WELCOME}
          </div>
        </div>

        {isLoading && (
          <div className="ai-loading-hint">Загрузка истории…</div>
        )}

        {allMessages.map((m, i) => <Bubble key={m.id ?? i} msg={m} />)}

        {waiting && (
          <div className="ai-bubble-wrap">
            <div className="ai-avatar">🤖</div>
            <TypingBubble />
          </div>
        )}

        {/* Suggestions on empty */}
        {isEmpty && (
          <div className="ai-suggestions">
            <div className="ai-suggestions-label">Попробуйте спросить:</div>
            {SUGGESTIONS.map(s => (
              <button key={s} className="ai-suggestion-btn" onClick={() => useSuggestion(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="ai-input-area">
        {sendMut.isError && (
          <div className="ai-error">
            Ошибка отправки. Попробуйте ещё раз.
          </div>
        )}
        <div className="ai-input-row">
          <textarea
            ref={textareaRef}
            className="ai-input"
            placeholder="Напишите вопрос…"
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
          />
          <button
            className="ai-send-btn"
            onClick={send}
            disabled={!input.trim() || sendMut.isPending}
            aria-label="Отправить"
          >
            {sendMut.isPending ? <span className="ai-send-spinner" /> : "➤"}
          </button>
        </div>
        <div className="ai-input-hint">Enter — отправить · Shift+Enter — новая строка</div>
      </div>
    </div>
  );
}
