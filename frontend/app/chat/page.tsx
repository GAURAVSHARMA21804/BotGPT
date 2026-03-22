"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { authLogout, authMe, type UserOut } from "@/lib/auth";
import { sendChatMessage } from "@/lib/chat";
import "./chat.css";

type ChatMsg =
  | {
      id: string;
      role: "user";
      text: string;
      time: string;
      tokens: number;
    }
  | {
      id: string;
      role: "bot";
      text: string;
      time: string;
      tokens: number;
      rag: boolean;
      sources: string[];
    };

const SIDEBAR_CHATS = [
  { id: "1", title: "System Architecture Deep Dive", time: "2m ago", rag: true },
  { id: "2", title: "API Design Patterns", time: "1h ago", rag: false },
  { id: "3", title: "Database Schema Review", time: "3h ago", rag: true },
  { id: "4", title: "Token Optimization Strategy", time: "Yesterday", rag: false },
  { id: "5", title: "FastAPI vs Express Deep Dive", time: "2 days ago", rag: false },
  { id: "6", title: "Docker & CI/CD Setup", time: "3 days ago", rag: false }
];

function formatTime(): string {
  const d = new Date();
  const h = d.getHours();
  const m = d.getMinutes();
  const a = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${a}`;
}

function tokenEstimate(s: string): number {
  return Math.max(1, Math.round(s.length / 4));
}

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserOut | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [docsOpen, setDocsOpen] = useState(true);
  const [showWelcome, setShowWelcome] = useState(true);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [convTitle, setConvTitle] = useState("New Conversation");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [toast, setToast] = useState("");
  const [toastShow, setToastShow] = useState(false);
  const [showRagBar, setShowRagBar] = useState(false);
  const [ragMeta, setRagMeta] = useState({ sources: 0, chunks: 0 });
  const msgsRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const loadUser = useCallback(async () => {
    try {
      const u = await authMe();
      setUser(u);
    } catch {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const initials = useMemo(() => {
    if (!user) return "?";
    const f = user.first_name?.trim()?.[0] ?? "";
    const l = user.last_name?.trim()?.[0] ?? "";
    if (f || l) return (f + l).toUpperCase().slice(0, 2);
    return user.email.slice(0, 2).toUpperCase();
  }, [user]);

  const displayName = useMemo(() => {
    if (!user) return "";
    if (user.first_name?.trim() && user.last_name?.trim()) {
      return `${user.first_name} ${user.last_name}`;
    }
    if (user.first_name?.trim()) return user.first_name;
    return user.email.split("@")[0] ?? "User";
  }, [user]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastShow(true);
    window.setTimeout(() => setToastShow(false), 2400);
  }, []);

  const scrollMsgs = () => {
    requestAnimationFrame(() => {
      const el = msgsRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  useEffect(() => {
    scrollMsgs();
  }, [messages, typing, showWelcome]);

  const growTa = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  const send = async () => {
    const txt = input.trim();
    if (!txt || typing) return;

    if (showWelcome) {
      setShowWelcome(false);
      setShowRagBar(false);
    }

    const uid = crypto.randomUUID();
    const userMsg: ChatMsg = {
      id: uid,
      role: "user",
      text: txt,
      time: formatTime(),
      tokens: tokenEstimate(txt)
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    if (taRef.current) {
      taRef.current.style.height = "auto";
    }
    setTyping(true);

    try {
      const data = await sendChatMessage(txt);
      const n = tokenEstimate(data.reply);
      const sources = data.context_used?.length ?? 0;
      setRagMeta({
        sources,
        chunks: sources > 0 ? Math.max(42, sources * 14) : 0
      });
      if (sources > 0) {
        setShowRagBar(true);
      }
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "bot",
          text: data.reply,
          time: formatTime(),
          tokens: n,
          rag: sources > 0,
          sources: data.context_used ?? []
        }
      ]);
    } catch (e) {
      const err = e instanceof Error ? e.message : "Request failed";
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "bot",
          text: `Sorry — ${err}`,
          time: formatTime(),
          tokens: 0,
          rag: false,
          sources: []
        }
      ]);
    } finally {
      setTyping(false);
    }
  };

  const newChat = () => {
    setConvTitle("New Conversation");
    setShowRagBar(false);
    setShowWelcome(true);
    setMessages([]);
    setActiveChatId(null);
    setRagMeta({ sources: 0, chunks: 0 });
    showToast("New conversation started");
  };

  const pickChat = (id: string, title: string) => {
    setActiveChatId(id);
    setConvTitle(title);
    setShowWelcome(false);
    setShowRagBar(true);
    setMessages([]);
    showToast(`Loaded: ${title}`);
  };

  const fillPrompt = (text: string) => {
    setInput(text);
    setShowWelcome(false);
    setShowRagBar(false);
    setMessages([]);
    requestAnimationFrame(() => {
      if (taRef.current) {
        growTa(taRef.current);
        taRef.current.focus();
      }
    });
  };

  const toggleTheme = () => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  };

  const toggleDocs = () => setDocsOpen((d) => !d);

  const logout = async () => {
    await authLogout();
    router.replace("/login");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  if (!user) {
    return (
      <div className="chat-app" data-theme="light" style={{ alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--t2, #666)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="chat-app" data-theme={theme === "dark" ? "dark" : "light"}>
      <aside className="sb">
        <div className="sb-top">
          <div className="logo-row">
            <div className="lmark">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
              </svg>
            </div>
            <div>
              <div className="lname">
                Bot<span>GPT</span>
              </div>
              <div className="lver">v2.1.0</div>
            </div>
          </div>
          <button type="button" className="nbtn" onClick={newChat}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
            New Conversation
          </button>
        </div>
        <div className="slbl">Recent Chats</div>
        <div className="cl">
          {SIDEBAR_CHATS.map((c) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              className={`ci ${activeChatId === c.id ? "on" : ""}`}
              onClick={() => pickChat(c.id, c.title)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  pickChat(c.id, c.title);
                }
              }}
            >
              <div className="cico">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M20 3H4v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 12H4v2h16v-2zm0 4H4v2h16v-2z" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cnm">{c.title}</div>
                <div className="csub">
                  <span className="ctm">{c.time}</span>
                  {c.rag ? <span className="rp">RAG</span> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="sb-ft">
          <div className="av" aria-hidden>
            {initials}
          </div>
          <div className="fi">
            <div className="fn">{displayName}</div>
            <div className="fp">{user.email}</div>
            <button type="button" className="logout-btn" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
          <button type="button" className="ttog" title="Toggle theme" onClick={toggleTheme}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </aside>

      <main className="mn">
        <div className="bar">
          <div className="bl">
            <div className="bt">{convTitle}</div>
            <div className="stbdg">
              <div className="stdt" />
              <span className="stlb">online</span>
            </div>
          </div>
          <div className="br">
            <div className="mtag">llama-3.1-70b</div>
            <button type="button" className="ib" title="Search">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
            </button>
            <button
              type="button"
              className={`ib ${docsOpen ? "on" : ""}`}
              title="Knowledge base"
              onClick={toggleDocs}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
              </svg>
            </button>
            <button type="button" className="ib" title="More">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
              </svg>
            </button>
          </div>
        </div>

        {showRagBar ? (
          <div className="rb">
            <div className="rbico">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z" />
              </svg>
            </div>
            <div className="rbt">
              RAG active — <b>{ragMeta.sources || 0} sources</b> · <b>{ragMeta.chunks || 0} chunks</b> ready for retrieval
            </div>
            <div className="rbs">—</div>
          </div>
        ) : null}

        <div className="msgs" id="msgs" ref={msgsRef}>
          {showWelcome ? (
            <div className="wc">
              <div className="wo">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                </svg>
              </div>
              <div className="wt">What shall we explore?</div>
              <div className="wsb">
                Upload documents to enable RAG, or start a conversation directly with the AI.
              </div>
              <div className="wch">
                <button type="button" className="wcp" onClick={() => fillPrompt("Summarize the uploaded architecture document")}>
                  Summarize docs
                </button>
                <button type="button" className="wcp" onClick={() => fillPrompt("What API endpoints are defined in the spec?")}>
                  List API endpoints
                </button>
                <button type="button" className="wcp" onClick={() => fillPrompt("Explain the database schema design")}>
                  Explain schema
                </button>
                <button type="button" className="wcp" onClick={() => fillPrompt("What are the key architectural decisions?")}>
                  Key decisions
                </button>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) =>
                msg.role === "user" ? (
                  <div key={msg.id} className="mr u">
                    <div className="mav usr">{initials}</div>
                    <div className="mc">
                      <div className="ml">You</div>
                      <div className="mb usr" style={{ whiteSpace: "pre-wrap" }}>
                        {msg.text}
                      </div>
                      <div className="mft">
                        <span className="mtm">
                          {msg.time} · {msg.tokens} tokens
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={msg.id} className="mr">
                    <div className="mav bot">B</div>
                    <div className="mc">
                      <div className="ml">BotGPT</div>
                      <div className="mb bot" style={{ whiteSpace: "pre-wrap" }}>
                        {msg.text}
                      </div>
                      {msg.sources.length > 0 ? (
                        <div className="sp">
                          {msg.sources.slice(0, 6).map((s) => (
                            <div key={s} className="spl">
                              · {s}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="mft">
                        {msg.rag ? <span className="rtg">RAG</span> : null}
                        <span className="mtm">
                          {msg.time} · {msg.tokens} tokens
                        </span>
                      </div>
                    </div>
                  </div>
                )
              )}
              {typing ? (
                <div className="tw">
                  <div className="mav bot">B</div>
                  <div className="td">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="iw">
          <div className="ic">
            <div className="ir">
              <textarea
                ref={taRef}
                id="mb2"
                className="chat-textarea"
                rows={1}
                placeholder="Ask anything — grounded in your documents…"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  growTa(e.target);
                }}
                onInput={(e) => growTa(e.target as HTMLTextAreaElement)}
                onKeyDown={onKeyDown}
              />
              <button type="button" className="sbtn" onClick={() => void send()} disabled={typing} aria-label="Send">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
            <div className="itb-row">
              <button type="button" className="itbn" onClick={() => showToast("File upload — coming soon")}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
                </svg>
                Attach
              </button>
              <button type="button" className="itbn" onClick={() => showToast("Voice input — coming soon")}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                </svg>
                Voice
              </button>
              <button type="button" className="itbn" onClick={() => showToast("RAG status — see response sources")}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z" />
                </svg>
                RAG On
              </button>
              <div className="tg" />
              <span className="tkc">
                {tokenEstimate(input)} / 4096 tokens
              </span>
            </div>
          </div>
        </div>
      </main>

      <aside className={`dp ${docsOpen ? "" : "cls"}`} id="dp">
        <div className="dh">
          <div className="dt">Knowledge Base</div>
          <div className="ds">Documents indexed for retrieval</div>
        </div>
        <div className="dz" onClick={() => showToast("Select PDF, TXT or Markdown")} role="button" tabIndex={0}>
          <div className="dzico">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          </div>
          <div className="dzlb">
            <b>Upload Document</b>
            <br />
            Drag & drop or click
          </div>
          <div className="dztp">PDF · TXT · MD · DOCX</div>
        </div>
        <div className="dl">
          <div>
            <div className="dsl">Indexed (3)</div>
            <div className="di on">
              <div className="dty pdf">PDF</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="dn">architecture.pdf</div>
                <div className="dm">
                  <span className="dsz">248 KB</span>
                  <span className="dcb">18 chunks</span>
                </div>
              </div>
            </div>
            <div className="di">
              <div className="dty md">MD</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="dn">api-spec.md</div>
                <div className="dm">
                  <span className="dsz">64 KB</span>
                  <span className="dcb">12 chunks</span>
                </div>
              </div>
            </div>
            <div className="di">
              <div className="dty txt">TXT</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="dn">schema.txt</div>
                <div className="dm">
                  <span className="dsz">31 KB</span>
                  <span className="dcb">7 chunks</span>
                </div>
              </div>
            </div>
          </div>
          <div>
            <div className="rl">
              <div className="rlt">Last Retrieved</div>
              <div className="rlr">architecture.pdf · chunk #4</div>
              <div className="rlr">architecture.pdf · chunk #11</div>
              <div className="rlr">api-spec.md · chunk #3</div>
              <div className="rlr">schema.txt · chunk #2</div>
            </div>
          </div>
        </div>
        <div className="dsg">
          <div className="dstb">
            <div className="dstn">42</div>
            <div className="dstl">Chunks</div>
          </div>
          <div className="dstb">
            <div className="dstn">3</div>
            <div className="dstl">Docs</div>
          </div>
          <div className="dstb">
            <div className="dstn">343</div>
            <div className="dstl">Tokens</div>
          </div>
          <div className="dstb">
            <div className="dstn">48ms</div>
            <div className="dstl">Latency</div>
          </div>
        </div>
      </aside>

      <div className={`tst ${toastShow ? "show" : ""}`} id="tstEl" role="status">
        {toast}
      </div>
    </div>
  );
}
