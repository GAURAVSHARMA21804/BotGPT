"use client";

import { useState } from "react";

type ChatResponse = {
  reply: string;
  context_used: string[];
};

export default function HomePage() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setReply("");

    try {
      const res = await fetch("http://localhost:8000/api/v1/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer local-dev-token"
        },
        body: JSON.stringify({
          user_id: "local-user",
          message
        })
      });

      if (!res.ok) {
        setReply("Request failed.");
        return;
      }

      const data = (await res.json()) as ChatResponse;
      setReply(data.reply);
    } catch {
      setReply("Backend is unreachable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <h1>BOT GPT</h1>
      <p>React/Next.js frontend calling FastAPI gateway</p>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type your message..."
      />
      <button onClick={sendMessage} disabled={loading}>
        {loading ? "Sending..." : "Send"}
      </button>

      <h3>Reply</h3>
      <p>{reply || "No response yet."}</p>
    </main>
  );
}
