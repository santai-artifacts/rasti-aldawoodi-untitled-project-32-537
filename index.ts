import Anthropic from "@anthropic-ai/sdk";

const publicDir = `${import.meta.dir}/public`;

const SYSTEM_PROMPT =
  "You are a warm, sharp, concise assistant. Answer clearly and helpfully. " +
  "Use Markdown when it improves readability (lists, code blocks, bold), but keep replies tight. " +
  "If you don't know something, say so plainly.";

const MODEL = "anthropic-claude-bedrock4.5-haiku";

const aiEnabled = Boolean(process.env.SANTAI_AI_TOKEN);

const ai = new Anthropic({
  baseURL: process.env.SANTAI_AI_BASE_URL,
  apiKey: process.env.SANTAI_AI_TOKEN || "placeholder",
});

type ChatMessage = { role: "user" | "assistant"; content: string };

async function handleChat(req: Request): Promise<Response> {
  if (!aiEnabled) {
    return Response.json(
      { error: "AI is not configured in this environment." },
      { status: 503 },
    );
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const messages = (body.messages || [])
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .slice(-20); // keep recent context bounded

  if (messages.length === 0) {
    return Response.json({ error: "No messages provided." }, { status: 400 });
  }

  try {
    const msg = await ai.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const text = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    return Response.json({ reply: text || "(no response)" });
  } catch (err) {
    console.error("AI request failed:", err);
    return Response.json(
      { error: "The assistant hit an error. Please try again." },
      { status: 502 },
    );
  }
}

export default {
  port: process.env.PORT || 3000,
  async fetch(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);

    if (pathname === "/api/chat" && req.method === "POST") {
      return handleChat(req);
    }

    if (pathname === "/api/health") {
      return Response.json({ ok: true, ai: aiEnabled });
    }

    // Static files
    const filePath = `${publicDir}${pathname === "/" ? "/index.html" : pathname}`;
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }

    // SPA-ish fallback
    return new Response(Bun.file(`${publicDir}/index.html`));
  },
};
