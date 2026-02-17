"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type FormEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Bot, User, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "model";
  parts: string;
}

interface ChatWidgetProps {
  processogramId: string;
  elementContext?: string;
}

async function streamChat(
  processogramId: string,
  message: string,
  history: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(
    `/api/v1/processograms/${processogramId}/chat/stream`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ message, history }),
      signal,
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const payload = trimmed.slice(6);
      if (payload === "[DONE]") return;

      try {
        const parsed = JSON.parse(payload);
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.text) onChunk(parsed.text);
      } catch {
        /* skip malformed chunk */
      }
    }
  }
}

export function ChatWidget({ processogramId, elementContext }: ChatWidgetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [elementContext]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || isStreaming) return;

      setError(null);
      setInput("");

      const userMessage: ChatMessage = { role: "user", parts: trimmed };
      const fullMessage = elementContext
        ? `[Contexto: Elemento selecionado "${elementContext}"]\n\n${trimmed}`
        : trimmed;

      setMessages((prev) => [...prev, userMessage]);

      const assistantMessage: ChatMessage = { role: "model", parts: "" };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsStreaming(true);

      abortRef.current = new AbortController();

      const historyForApi = messages.map((m) => ({
        role: m.role,
        parts: m.parts,
      }));

      try {
        await streamChat(
          processogramId,
          fullMessage,
          historyForApi,
          (chunk) => {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "model") {
                updated[updated.length - 1] = {
                  ...last,
                  parts: last.parts + chunk,
                };
              }
              return updated;
            });
          },
          abortRef.current.signal
        );
      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message || "Erro na conexão com a IA.");
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[updated.length - 1]?.role === "model" && !updated[updated.length - 1]?.parts) {
            updated.pop();
          }
          return updated;
        });
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [input, isStreaming, messages, processogramId, elementContext]
  );

  return (
    <div className="flex h-full flex-col">
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto p-3 scrollbar-thin"
      >
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center gap-3 py-8 text-center"
          >
            <div className="flex size-10 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
              <Bot className="size-5 text-primary" />
            </div>
            <p className="text-xs font-mono text-muted-foreground leading-relaxed max-w-55">
              Pergunte sobre o elemento selecionado ou sobre o processograma.
            </p>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "flex gap-2",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "model" && (
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 mt-0.5">
                  <Bot className="size-3 text-primary" />
                </div>
              )}

              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary/15 text-foreground border border-primary/20"
                    : "bg-white/5 text-foreground font-mono border border-white/10"
                )}
              >
                {msg.parts || (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Processando...
                  </span>
                )}
              </div>

              {msg.role === "user" && (
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 mt-0.5">
                  <User className="size-3 text-muted-foreground" />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            <AlertCircle className="size-3.5 shrink-0" />
            {error}
          </motion.div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-white/10 bg-black/20 px-3 py-2.5"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte à IA..."
          disabled={isStreaming}
          className={cn(
            "flex-1 bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground/50",
            "outline-none disabled:opacity-50"
          )}
        />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          type="submit"
          disabled={isStreaming || !input.trim()}
          className={cn(
            "flex size-7 items-center justify-center rounded-md",
            "border border-primary/30 bg-primary/10 text-primary",
            "transition-colors hover:bg-primary/20",
            "disabled:opacity-30 disabled:cursor-not-allowed"
          )}
        >
          {isStreaming ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Send className="size-3.5" />
          )}
        </motion.button>
      </form>
    </div>
  );
}
