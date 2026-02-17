// server.js
// Intercom Dashboard Bot — Localhost Web UI + Agent + Dexscreener
// Anti-429: cache TTL

import express from "express";

const app = express();
const PORT = process.env.PORT || 8788;

// --- Config ---
const SOL_RPC = process.env.SOL_RPC || "https://api.mainnet-beta.solana.com";
const REFRESH_TTL_MS = Number(process.env.REFRESH_TTL_MS || 15000); // cache 15s
const TX_LIMIT = Number(process.env.TX_LIMIT || 10);

// Optional AI (Groq) — if not set, fallback logic used
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_BASE = "https://api.groq.com/openai/v1";

const cache = new Map(); // key -> { ts, data }
async function cached(key, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < REFRESH_TTL_MS) return hit.data;
  const data = await fn();
  cache.set(key, { ts: now, data });
  return data;
}

app.use(express.json());
app.use(express.static("public"));

// ---- Solana RPC helpers ----
async function solRpc(method, params = []) {
  const res = await fetch(SOL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}: ${await res.text()}`);
  const j = await res.json();
  if (j?.error) throw new Error(j.error?.message || "RPC error");
  return j.result;
}

function lamportsToSOL(l) {
  return Number(l) / 1_000_000_000;
}

// ---- Optional Groq JSON helper ----
async function groqJSON(system, user) {
  if (!GROQ_API_KEY) return null;
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: system + "\nReturn STRICT JSON only. No markdown." },
        { role: "user", content: user },
      ],
    }),
  });
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(text);
  } catch {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s !== -1 && e !== -1) {
      try {
        return JSON.parse(text.slice(s, e + 1));
      } catch {}
    }
    return null;
  }
}

// ---- Health ----
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ---- Solana balance ----
app.get("/api/sol/balance", async (req, res) => {
  try {
    const pubkey = String(req.query.pubkey || "").trim();
    if (!pubkey) return res.status(400).json({ ok: false, error: "Missing pubkey" });

    const data = await cached(`bal:${pubkey}`, async () => {
      const lamports = await solRpc("getBalance", [pubkey, { commitment: "confirmed" }]);
      return { sol: lamportsToSOL(lamports.value) };
    });

    res.json({ ok: true, pubkey, ...data, updated: new Date().toISOString() });
  } catch (e) {
    res.json({ ok: false, error: String(e?.message || e) });
  }
});

// ---- Solana recent TX ----
app.get("/api/sol/tx", async (req, res) => {
  try {
    const pubkey = String(req.query.pubkey || "").trim();
    if (!pubkey) return res.status(400).json({ ok: false, error: "Missing pubkey" });

    const data = await cached(`tx:${pubkey}`, async () => {
      const sigs = await solRpc("getSignaturesForAddress", [pubkey, { limit: TX_LIMIT }]);
      return { sigs };
    });

    res.json({ ok: true, pubkey, ...data, updated: new Date().toISOString() });
  } catch (e) {
    res.json({ ok: false, error: String(e?.message || e) });
  }
});

// ---- Prices (CoinGecko) ----
app.get("/api/prices", async (_req, res) => {
  try {
    const data = await cached("prices", async () => {
      const url =
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true";
      const r = await fetch(url);
      if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
      return await r.json();
    });
    res.json({ ok: true, data, updated: new Date().toISOString() });
  } catch (e) {
    res.json({ ok: false, error: String(e?.message || e) });
  }
});

// ---- Swap simulator ----
app.post("/api/simulate", (req, res) => {
  try {
    const reserveX = Number(req.body?.reserveX ?? 1000);
    const reserveY = Number(req.body?.reserveY ?? 1000);
    const amountIn = Number(req.body?.amountIn ?? 10);
    const feeBps = Number(req.body?.feeBps ?? 30);

    if (![reserveX, reserveY, amountIn, feeBps].every(Number.isFinite)) {
      return res.status(400).json({ ok: false, error: "Bad input" });
    }
    if (reserveX <= 0 || reserveY <= 0 || amountIn <= 0) {
      return res.status(400).json({ ok: false, error: "Values must be > 0" });
    }

    const fee = feeBps / 10_000;
    const amountInAfterFee = amountIn * (1 - fee);

    const k = reserveX * reserveY;
    const newX = reserveX + amountInAfterFee;
    const newY = k / newX;
    const amountOut = reserveY - newY;

    const priceImpactPct = (amountOut / reserveY) * 100;

    res.json({
      ok: true,
      input: { reserveX, reserveY, amountIn, feeBps },
      result: { amountOut, newReserveX: newX, newReserveY: newY, priceImpactPct },
    });
  } catch (e) {
    res.json({ ok: false, error: String(e?.message || e) });
  }
});

// ================================
// ✅ DEXSCREENER + AGENT ENDPOINTS
// ================================

// Fetch Dexscreener market snapshot (symbol or CA)
app.get("/api/dex", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ ok: false, error: "Missing q (symbol or CA)" });

    const data = await cached(`dex:${q}`, async () => {
      let url;
      if (q.startsWith("0x") || q.length > 30) {
        url = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(q)}`;
      } else {
        url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`;
      }

      const r = await fetch(url);
      if (!r.ok) throw new Error(`Dexscreener ${r.status}`);
      const j = await r.json();
      if (!j?.pairs?.length) return null;

      const p = j.pairs[0];
      return {
        name: p.baseToken?.name || "Unknown",
        symbol: p.baseToken?.symbol || "Unknown",
        chain: p.chainId || "unknown",
        dex: p.dexId || "unknown",
        priceUsd: p.priceUsd || "N/A",
        liquidityUsd: p.liquidity?.usd || 0,
        volume24h: p.volume?.h24 || 0,
        fdv: p.fdv || 0,
        pairAddress: p.pairAddress || "",
        url: p.url || ""
      };
    });

    if (!data) return res.json({ ok: false, error: "No pairs found. Try CA for accuracy." });
    res.json({ ok: true, q, data, updated: new Date().toISOString() });
  } catch (e) {
    res.json({ ok: false, error: String(e?.message || e) });
  }
});

// Agent analyze (uses Dex snapshot + AI optional)
app.get("/api/agent/analyze", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ ok: false, error: "Missing q" });

    // get dex data via cache
    const dex = await cached(`dex:${q}`, async () => {
      let url;
      if (q.startsWith("0x") || q.length > 30) {
        url = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(q)}`;
      } else {
        url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`;
      }
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Dexscreener ${r.status}`);
      const j = await r.json();
      if (!j?.pairs?.length) return null;
      const p = j.pairs[0];
      return {
        name: p.baseToken?.name || "Unknown",
        symbol: p.baseToken?.symbol || "Unknown",
        chain: p.chainId || "unknown",
        dex: p.dexId || "unknown",
        priceUsd: p.priceUsd || "N/A",
        liquidityUsd: p.liquidity?.usd || 0,
        volume24h: p.volume?.h24 || 0,
        fdv: p.fdv || 0,
        pairAddress: p.pairAddress || "",
        url: p.url || ""
      };
    });

    if (!dex) {
      return res.json({ ok: false, error: "No pairs found. Use contract address (CA)." });
    }

    // ---------- Fallback logic (no API) ----------
    const liq = Number(dex.liquidityUsd || 0);
    const vol = Number(dex.volume24h || 0);

    let signal = "HOLD";
    const why = [];
    let status = "CAUTION";
    const flags = [];
    const checklist = ["verify_contract_CA", "check_liquidity_depth", "check_top_holders", "start_small_test_trade"];

    if (liq < 5000) {
      status = "BLOCK";
      flags.push("Very low liquidity → high slippage / rug risk.");
    } else if (liq < 20000) {
      status = "CAUTION";
      flags.push("Low liquidity → expect slippage.");
    } else {
      status = "CAUTION";
    }

    if (vol < 5000) {
      status = status === "BLOCK" ? "BLOCK" : "CAUTION";
      flags.push("Very low 24h volume → easy to manipulate.");
    }

    if (liq >= 50000 && vol >= 50000) {
      signal = "HOLD";
      why.push("Liquidity + volume look healthy.");
      why.push("Still avoid chasing — wait confirmation.");
    } else {
      signal = "HOLD";
      why.push("Data suggests higher risk or weak confirmation.");
      why.push("Prefer patience until liquidity/volume improve.");
    }

    // ---------- Optional AI refine (Groq) ----------
    const system = `
You are a trading copilot (Intercom-style).
Return STRICT JSON only:
{
  "signal":"BUY|SELL|HOLD",
  "why":["...","...","..."],
  "risk":{"status":"SAFE|CAUTION|BLOCK","flags":["...","..."],"checklist":["...","..."]},
  "decision":"OK TO PROCEED|SMALL SIZE / WAIT|DO NOT TRADE"
}
No hype. No guarantees.
`.trim();

    const user = `
Token query: ${q}
Dexscreener snapshot:
${JSON.stringify(dex, null, 2)}

Use the snapshot only.
`.trim();

    const ai = await groqJSON(system, user);

    let out;
    if (ai && ai.signal && ai.risk?.status) {
      out = ai;
    } else {
      const decision = status === "BLOCK" ? "DO NOT TRADE" : "SMALL SIZE / WAIT";
      out = {
        signal,
        why: why.slice(0, 3),
        risk: {
          status,
          flags: flags.slice(0, 4),
          checklist: checklist.slice(0, 4),
        },
        decision,
      };
    }

    res.json({
      ok: true,
      q,
      dex,
      agent: out,
      updated: new Date().toISOString(),
      mode: GROQ_API_KEY ? "ai" : "fallback",
    });
  } catch (e) {
    res.json({ ok: false, error: String(e?.message || e) });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`⚡ Dashboard running: http://127.0.0.1:${PORT}`);
  console.log(`RPC: ${SOL_RPC}`);
  console.log(`Cache TTL: ${REFRESH_TTL_MS}ms`);
  console.log(`Agent mode: ${GROQ_API_KEY ? "Groq AI" : "Fallback (no API)"}`);
});
