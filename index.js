import readline from "readline";
import { createLLM } from "./lib/llm.js";
import { getTokenData } from "./lib/dex.js";
import { analystAgent } from "./agents/analyst.js";
import { riskGateAgent } from "./agents/risk.js";

// ===== CLI SETUP =====
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise((res) => rl.question(q, res));
}

function fmtUSD(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "N/A";
  if (x >= 1_000_000_000) return `$${(x / 1_000_000_000).toFixed(2)}B`;
  if (x >= 1_000_000) return `$${(x / 1_000_000).toFixed(2)}M`;
  if (x >= 1_000) return `$${(x / 1_000).toFixed(2)}K`;
  return `$${x.toFixed(2)}`;
}

// ===== AGENT MODE =====
async function runAgentMode() {
  const llm = createLLM();

  console.log("\n=== AGENT MODE (REAL DATA) ===");
  console.log("Tip: Use contract address (CA) for best accuracy.\n");

  const chain = await ask("Chain hint (sol/eth/bsc/base) [optional]: ");
  const token = await ask("Token (symbol or CA): ");

  console.log("\n[Data] Fetching Dexscreener...");
  const market = await getTokenData(token);

  if (!market) {
    console.log("❌ No Dexscreener data found.");
    console.log("Try pasting the token contract address (CA) instead.\n");
  } else {
    console.log("\n=== MARKET SNAPSHOT ===");
    console.log(`Name: ${market.name} (${market.symbol})`);
    console.log(`Chain: ${market.chain} | DEX: ${market.dex}`);
    console.log(`Price: ${market.price}`);
    console.log(`Liquidity: ${fmtUSD(market.liquidity)}`);
    console.log(`24h Volume: ${fmtUSD(market.volume24h)}`);
    console.log("========================\n");
  }

  console.log("[Agent: Analyst]");
  const a = await analystAgent({ llm, chain, token, market });

  console.log("Signal:", a.signal);
  (a.why || []).forEach((x) => console.log("- " + x));

  if (a.questions?.length) {
    console.log("\nQuestions:");
    a.questions.forEach((q) => console.log("- " + q));
  }

  console.log("\n[Agent: Risk Gate]");
  const r = await riskGateAgent({
    llm,
    chain,
    token,
    context: {
      analyst_signal: a.signal,
      market
    }
  });

  console.log("Status:", r.status);
  (r.flags || []).forEach((x) => console.log("- " + x));

  console.log("\nChecklist:");
  (r.checklist || []).forEach((x) => console.log("- " + x));

  console.log("\n=== DECISION ===");
  if (r.status === "BLOCK") {
    console.log("❌ DO NOT TRADE");
  } else if (r.status === "CAUTION") {
    console.log("⚠️ SMALL SIZE / WAIT");
  } else {
    console.log("✅ OK TO PROCEED (still manage risk)");
  }

  console.log("\n");
}

// ===== MENU =====
async function mainMenu() {
  while (true) {
    console.log("\n=== INTERCOM MENU ===");
    console.log("1. Agent Mode (Real Data)");
    console.log("2. Swap (placeholder)");
    console.log("3. Risk Check (placeholder)");
    console.log("4. Exit");

    const choice = await ask("Select option: ");

    switch (choice) {
      case "1":
        await runAgentMode();
        break;
      case "2":
        console.log("\nSwap feature coming soon...\n");
        break;
      case "3":
        console.log("\nRisk check only mode coming soon...\n");
        break;
      case "4":
        console.log("Bye!");
        rl.close();
        process.exit(0);
      default:
        console.log("Invalid option");
    }
  }
}

mainMenu();
