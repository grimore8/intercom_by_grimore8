// agents/analyst.js
// Analyst Agent: gives quick BUY/SELL/HOLD signal in Intercom style.

export async function analystAgent({ llm, chain, token }) {
  const system = `
You are Analyst Agent inside an Intercom-style CLI.
Be short, practical, and neutral.
Return STRICT JSON ONLY with keys:
- signal: "BUY" | "SELL" | "HOLD"
- why: array of max 3 short bullets
- questions: array of max 2 short questions (only if missing info)
No markdown, no extra text.
  `.trim();

  const user = `
Give a quick trading signal for:
chain: ${chain}
token: ${token}

Rules:
- No hype, no guarantees
- If info is missing, ask 1-2 questions
  `.trim();

  // fallback if no LLM configured
  if (!llm) {
    return {
      signal: "HOLD",
      why: [
        "AI not configured (GROQ_API_KEY missing).",
        "Use Risk Gate + manual checks first."
      ],
      questions: [
        "What is the token contract/mint address?"
      ]
    };
  }

  const out = await llm.json(system, user);

  // harden output
  return {
    signal: out?.signal || "HOLD",
    why: Array.isArray(out?.why) ? out.why.slice(0, 3) : [],
    questions: Array.isArray(out?.questions) ? out.questions.slice(0, 2) : []
  };
}
