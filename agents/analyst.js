// agents/analyst.js
export async function analystAgent({ llm, chain, token }) {
  const system = `
You are Analyst Agent inside an Intercom-style CLI.
Return STRICT JSON ONLY with keys:
signal ("BUY"|"SELL"|"HOLD"), why (max 3 bullets), questions (max 2).
No markdown.
  `.trim();

  const user = `
chain: ${chain}
token: ${token}
Give a quick signal. No hype. If missing info, ask 1-2 questions.
  `.trim();

  if (!llm) {
    return {
      signal: "HOLD",
      why: ["AI not configured (GROQ_API_KEY missing).", "Run Risk Gate + manual checks first."],
      questions: ["Token contract/mint address?"]
    };
  }

  const out = await llm.json(system, user);
  return {
    signal: out?.signal || "HOLD",
    why: Array.isArray(out?.why) ? out.why.slice(0, 3) : [],
    questions: Array.isArray(out?.questions) ? out.questions.slice(0, 2) : []
  };
}
