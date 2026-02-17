# 🧠 INTERCOM_BY_GAMBER8 — AI Trading Copilot

## 📍 Trac Address
PASTE_TRAC_ADDRESS_LO

---

## 🚀 Overview

INTERCOM_BY_GAMBER8 is a CLI-based AI trading copilot built on top of an Intercom-style multi-agent system.

It combines:
- Real-time market data (Dexscreener)
- Analyst agent (signal generator)
- Risk Gate agent (safety filter)
- Swap link generator (safe mode)
- Interactive Q&A system

---

## ⚙️ Features

- 📊 Real-time token analysis
- 🤖 Dual-agent system:
  - Analyst → market signal (BUY / HOLD / WAIT)
  - Risk Gate → safety validation
- 🔗 Swap link generator (no private key)
- 💬 Interactive Q&A mode
- 🛡️ Safe by design (no auto execution)

---

## 🖥️ Installation

git clone https://github.com/USERNAME/REPO.git
cd REPO
npm install

---

## 🔑 Optional AI (Groq)

export GROQ_API_KEY="your_api_key"
export GROQ_MODEL="llama-3.3-70b-versatile"

If not set → app still works (fallback mode)

---

## ▶️ Usage

node index.js

---

## 📋 Menu

1. Agent Mode (Real Data + Q&A)  
2. Swap (Link Generator)  
3. Risk Check (Real Data)  
4. Exit  

---

## 🧠 Agent System

### Analyst Agent
- Reads market data
- Generates trading signal
- Explains reasoning

### Risk Gate Agent
- Checks liquidity & volume
- Flags risky tokens
- Provides checklist

---

## 🔄 Swap Feature

- Generates swap link only
- No wallet connection
- No transaction execution

Example:
https://jup.ag/swap/TOKEN-SOL

---

## 📊 Example Output

AGENT: ANALYST  
SIGNAL: HOLD  

AGENT: RISK GATE  
STATUS: CAUTION  

DECISION:  
SMALL SIZE / WAIT  

---

## 💬 Q&A Mode

YOU: buy or wait?  
AGENT: Wait. Signal is HOLD and risk is CAUTION.

---

## 📸 Proof

Agent Mode → ./assets/agent.jpg  
Swap → ./assets/swap.jpg  
Risk → ./assets/risk.jpg  

---

## 🎯 Goal

Build a simple AI trading assistant that:
- Helps decision making
- Reduces risk
- Keeps Intercom-style interaction

---

## ⚠️ Disclaimer

This tool is for educational purposes only.  
Always DYOR before trading.
