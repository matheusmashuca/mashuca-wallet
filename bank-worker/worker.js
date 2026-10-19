/*
 * Mashuca Wallet · servidor de conexão bancária (Cloudflare Worker)
 *
 * Guarda as chaves dos agregadores e repassa ao app só transações e saldos.
 *   França / UE (PSD2):    Enable Banking  — modo "contas vinculadas", uso pessoal
 *   Brasil (Open Finance): Pluggy          — itens conectados no Meu Pluggy
 *
 * Variáveis (Settings › Variables and Secrets do Worker):
 *   ALLOWED_ORIGINS      ex.: https://matheusmashuca.github.io,https://localhost
 *   FIREBASE_PROJECT_ID  ex.: mashuca-wallet
 *   ALLOWED_EMAILS       e-mails Google que podem usar (vírgula). Vazio = qualquer conta do projeto
 *   EB_APP_ID            (secret) ID da aplicação Enable Banking
 *   EB_PRIVATE_KEY       (secret) conteúdo do arquivo .pem da aplicação
 *   PLUGGY_CLIENT_ID     (secret)
 *   PLUGGY_CLIENT_SECRET (secret)
 *
 * Toda chamada (menos /health) exige "Authorization: Bearer <ID token do Firebase>".
 */

const EB_API = "https://api.enablebanking.com";
const PLUGGY_API = "https://api.pluggy.ai";
const GOOGLE_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health") {
        return json({ ok: true, enableBanking: !!(env.EB_APP_ID && env.EB_PRIVATE_KEY), pluggy: !!(env.PLUGGY_CLIENT_ID && env.PLUGGY_CLIENT_SECRET) }, 200, cors);
      }
      if (!cors["Access-Control-Allow-Origin"]) return json({ error: "origem não autorizada" }, 403, cors);
      if (request.method !== "POST") return json({ error: "use POST" }, 405, cors);
      const user = await verifyFirebase(request.headers.get("Authorization"), env);
      const body = await request.json().catch(() => ({}));
      const route = ROUTES[url.pathname];
      if (!route) return json({ error: "rota desconhecida" }, 404, cors);
      return json(await route(body, env, user), 200, cors);
    } catch (e) {
      const status = e.status || 500;
      return json({ error: e.message || String(e), detail: e.detail }, status, cors);
    }
  },
};

const ROUTES = {
  /* ---------- Enable Banking ---------- */
  "/eb/aspsps": async (b, env) => {
    const country = String(b.country || "FR").toUpperCase().slice(0, 2);
    const r = await eb(env, "GET", `/aspsps?country=${country}`);
    return { aspsps: (r.aspsps || []).map(a => ({ name: a.name, country: a.country, logo: a.logo || null, maxDays: a.maximum_consent_validity ? Math.floor(a.maximum_consent_validity / 86400) : 90 })) };
  },
  "/eb/start": async (b, env) => {
    need(b, ["aspsp", "redirect_url", "state"]);
    const days = Math.max(1, Math.min(Number(b.days) || 90, 180));
    const validUntil = new Date(Date.now() + days * 86400e3).toISOString();
    const r = await eb(env, "POST", "/auth", {
      access: { valid_until: validUntil },
      aspsp: { name: b.aspsp.name, country: b.aspsp.country },
      state: String(b.state),
      redirect_url: String(b.redirect_url),
      psu_type: "personal",
    });
    return { url: r.url, authorization_id: r.authorization_id };
  },
  "/eb/session": async (b, env) => {
    need(b, ["code"]);
    const r = await eb(env, "POST", "/sessions", { code: String(b.code) });
    return {
      session_id: r.session_id,
      valid_until: r.access && r.access.valid_until || null,
      aspsp: r.aspsp || null,
      accounts: (r.accounts || []).map(a => ({
        id: a.uid,
        name: a.name || a.product || (a.account_id && a.account_id.iban) || "Conta",
        number: (a.account_id && (a.account_id.iban || (a.account_id.other && a.account_id.other.identification))) || "",
        currency: a.currency || "EUR",
        type: a.cash_account_type === "CARD" ? "card" : "bank",
      })),
    };
  },
  "/eb/sync": async (b, env) => {
    need(b, ["account_id"]);
    const id = encodeURIComponent(b.account_id);
    const from = isoDay(b.date_from) || isoDay(new Date(Date.now() - 60 * 86400e3));
    const out = [];
    let key = null, pages = 0;
    do {
      const q = new URLSearchParams({ date_from: from });
      if (key) q.set("continuation_key", key);
      const r = await eb(env, "GET", `/accounts/${id}/transactions?${q}`);
      for (const t of r.transactions || []) {
        const n = normEB(t);
        if (n) out.push(n);
      }
      key = r.continuation_key || null;
    } while (key && ++pages < 30);
    let balance = null;
    try {
      const bal = await eb(env, "GET", `/accounts/${id}/balances`);
      balance = pickBalanceEB(bal.balances || []);
    } catch (e) { /* saldo é opcional */ }
    return { transactions: out, balance };
  },

  /* ---------- Pluggy ---------- */
  "/pluggy/accounts": async (b, env) => {
    need(b, ["item_id"]);
    const item = await pluggy(env, "GET", `/items/${encodeURIComponent(b.item_id)}`);
    const r = await pluggy(env, "GET", `/accounts?itemId=${encodeURIComponent(b.item_id)}`);
    return {
      item: { id: item.id, bank: item.connector && item.connector.name || "Banco", status: item.status, lastUpdatedAt: item.lastUpdatedAt || null },
      accounts: (r.results || []).map(a => ({
        id: a.id, name: a.name || a.marketingName || "Conta", number: a.number || "", currency: a.currencyCode || "BRL",
        type: a.type === "CREDIT" ? "card" : "bank",
      })),
    };
  },
  "/pluggy/refresh": async (b, env) => {
    need(b, ["item_id"]);
    const r = await pluggy(env, "PATCH", `/items/${encodeURIComponent(b.item_id)}`, {});
    return { status: r.status || "UPDATING" };
  },
  "/pluggy/sync": async (b, env) => {
    need(b, ["account_id"]);
    const from = isoDay(b.date_from) || isoDay(new Date(Date.now() - 60 * 86400e3));
    const acc = await pluggy(env, "GET", `/accounts/${encodeURIComponent(b.account_id)}`);
    const isCard = acc.type === "CREDIT";
    const out = [];
    let after = null, pages = 0;
    do {
      const q = new URLSearchParams({ accountId: b.account_id, dateFrom: from });
      if (after) q.set("after", after);
      const r = await pluggy(env, "GET", `/v2/transactions?${q}`);
      for (const t of r.results || []) {
        const n = normPluggy(t, isCard);
        if (n) out.push(n);
      }
      after = r.next ? new URLSearchParams(String(r.next).replace(/^\?/, "")).get("after") : null;
    } while (after && ++pages < 30);
    const balance = typeof acc.balance === "number"
      ? { amount: isCard ? -Math.abs(acc.balance) : acc.balance, currency: acc.currencyCode || "BRL", date: isoDay(acc.updatedAt || new Date()) }
      : null;
    return { transactions: out, balance };
  },
};

/* ---------- normalização: {id, date, amount (com sinal), desc, currency, pending} ---------- */
function normEB(t) {
  const amt = Number(t.transaction_amount && t.transaction_amount.amount);
  if (!isFinite(amt)) return null;
  const sign = t.credit_debit_indicator === "DBIT" ? -1 : 1;
  const date = t.booking_date || t.value_date || t.transaction_date;
  if (!date) return null;
  const parts = [].concat(t.remittance_information || []).filter(Boolean);
  const who = sign < 0 ? t.creditor && t.creditor.name : t.debtor && t.debtor.name;
  const desc = (parts.join(" ").trim() || who || t.bank_transaction_code && t.bank_transaction_code.description || "Lançamento").replace(/\s+/g, " ");
  const id = t.entry_reference || t.transaction_id || `${date}|${amt}|${desc}`;
  return { id: String(id), date: date.slice(0, 10), amount: round2(sign * Math.abs(amt)), desc, counterpart: who || "", currency: t.transaction_amount.currency || "", pending: t.status === "PDNG" };
}
function pickBalanceEB(list) {
  const order = ["CLBD", "ITBD", "XPCD", "ITAV", "CLAV", "OPBD", "PRCD"];
  const sorted = [...list].sort((a, b) => (order.indexOf(a.balance_type) + 1 || 99) - (order.indexOf(b.balance_type) + 1 || 99));
  const b = sorted[0];
  if (!b || !b.balance_amount) return null;
  return { amount: round2(Number(b.balance_amount.amount)), currency: b.balance_amount.currency, date: (b.reference_date || b.last_change_date_time || new Date().toISOString()).slice(0, 10), type: b.balance_type };
}
function normPluggy(t, isCard) {
  const amt = Number(t.amount);
  if (!isFinite(amt) || !t.date) return null;
  // DEBIT = saída da conta (ou compra no cartão); CREDIT = entrada (ou estorno/pagamento no cartão)
  const sign = t.type === "DEBIT" ? -1 : t.type === "CREDIT" ? 1 : (amt < 0 ? -1 : 1);
  const desc = String(t.description || t.descriptionRaw || "Lançamento").replace(/\s+/g, " ").trim();
  return { id: String(t.id), date: String(t.date).slice(0, 10), amount: round2(sign * Math.abs(amt)), desc, counterpart: t.merchant && t.merchant.name || "", currency: t.currencyCode || "BRL", pending: t.status === "PENDING", category: t.category || "" };
}

/* ---------- Enable Banking: JWT RS256 assinado com a chave da aplicação ---------- */
let EB_KEY = null, EB_KEY_SRC = null;
async function ebToken(env) {
  if (!env.EB_APP_ID || !env.EB_PRIVATE_KEY) throw httpError(501, "Enable Banking não configurado no servidor (EB_APP_ID e EB_PRIVATE_KEY)");
  if (!EB_KEY || EB_KEY_SRC !== env.EB_PRIVATE_KEY) {
    EB_KEY = await crypto.subtle.importKey("pkcs8", pemToDer(env.EB_PRIVATE_KEY), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    EB_KEY_SRC = env.EB_PRIVATE_KEY;
  }
  const iat = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: env.EB_APP_ID }));
  const claims = b64url(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat, exp: iat + 3600 }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", EB_KEY, new TextEncoder().encode(`${head}.${claims}`));
  return `${head}.${claims}.${b64url(new Uint8Array(sig))}`;
}
async function eb(env, method, path, body) {
  const res = await fetch(EB_API + path, {
    method,
    headers: { Authorization: `Bearer ${await ebToken(env)}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return readJson(res, "Enable Banking");
}

/* ---------- Pluggy: apiKey válida por 2 h, guardada em memória ---------- */
let PLUGGY_KEY = null, PLUGGY_EXP = 0;
async function pluggyKey(env, force) {
  if (!env.PLUGGY_CLIENT_ID || !env.PLUGGY_CLIENT_SECRET) throw httpError(501, "Pluggy não configurado no servidor (PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET)");
  if (!force && PLUGGY_KEY && Date.now() < PLUGGY_EXP) return PLUGGY_KEY;
  const res = await fetch(PLUGGY_API + "/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: env.PLUGGY_CLIENT_ID, clientSecret: env.PLUGGY_CLIENT_SECRET }) });
  const r = await readJson(res, "Pluggy");
  PLUGGY_KEY = r.apiKey; PLUGGY_EXP = Date.now() + 100 * 60e3;
  return PLUGGY_KEY;
}
async function pluggy(env, method, path, body, retried) {
  const res = await fetch(PLUGGY_API + path, {
    method,
    headers: { "X-API-KEY": await pluggyKey(env, retried), "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !retried) return pluggy(env, method, path, body, true);
  return readJson(res, "Pluggy");
}

/* ---------- login: valida o ID token do Firebase ---------- */
let JWKS = null, JWKS_EXP = 0;
async function verifyFirebase(auth, env) {
  const tok = (auth || "").replace(/^Bearer\s+/i, "");
  if (!tok) throw httpError(401, "faça login no app (token ausente)");
  const [h, p, s] = tok.split(".");
  if (!s) throw httpError(401, "token inválido");
  const head = JSON.parse(b64urlDecodeText(h)), claims = JSON.parse(b64urlDecodeText(p));
  const now = Math.floor(Date.now() / 1000);
  const proj = env.FIREBASE_PROJECT_ID;
  if (!proj) throw httpError(500, "FIREBASE_PROJECT_ID não configurado no servidor");
  if (head.alg !== "RS256") throw httpError(401, "token inválido (alg)");
  if (claims.aud !== proj || claims.iss !== `https://securetoken.google.com/${proj}`) throw httpError(401, "token de outro projeto");
  if (!(claims.exp > now) || claims.iat > now + 300) throw httpError(401, "sessão expirada; entre de novo");
  if (!JWKS || Date.now() > JWKS_EXP) {
    const r = await fetch(GOOGLE_JWKS);
    JWKS = (await r.json()).keys || [];
    JWKS_EXP = Date.now() + 3600e3;
  }
  const jwk = JWKS.find(k => k.kid === head.kid);
  if (!jwk) throw httpError(401, "chave do token desconhecida");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw httpError(401, "assinatura do token inválida");
  const allowed = String(env.ALLOWED_EMAILS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  const email = String(claims.email || "").toLowerCase();
  if (allowed.length && !(claims.email_verified && allowed.includes(email))) throw httpError(403, `a conta ${email || "?"} não está autorizada neste servidor`);
  return { uid: claims.user_id || claims.sub, email };
}

/* ---------- utilidades ---------- */
function corsHeaders(origin, env) {
  const list = String(env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim().replace(/\/$/, "")).filter(Boolean);
  const h = { "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin" };
  if (origin && list.includes(origin.replace(/\/$/, ""))) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
async function readJson(res, who) {
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const msg = data && (data.message || data.error || data.detail || data.raw) || res.statusText;
    throw httpError(res.status === 401 || res.status === 403 ? 502 : res.status, `${who}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`, data);
  }
  return data;
}
function httpError(status, message, detail) { const e = new Error(message); e.status = status; e.detail = detail; return e; }
function need(b, keys) { for (const k of keys) if (b[k] == null || b[k] === "") throw httpError(400, `campo obrigatório: ${k}`); }
function isoDay(d) { if (!d) return null; const x = d instanceof Date ? d : new Date(d); return isNaN(x) ? null : x.toISOString().slice(0, 10); }
function round2(n) { return Math.round(n * 100) / 100; }
function pemToDer(pem) {
  const b64 = String(pem).replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  if (/BEGIN RSA PRIVATE KEY/.test(pem)) throw httpError(500, "EB_PRIVATE_KEY está em formato PKCS#1; converta para PKCS#8 (BEGIN PRIVATE KEY)");
  const bin = atob(b64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
function b64url(data) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlDecodeText(s) { return new TextDecoder().decode(b64urlDecode(s)); }

export { normEB, normPluggy, pickBalanceEB, ebToken, verifyFirebase };
