/**
 * Cloudflare Worker — Proxy Seguro para Groq API
 * Formato: Service Worker (compatível com o editor do Dashboard)
 *
 * Secret obrigatório:
 *   GROQ_API_KEY — sua chave da Groq (https://console.groq.com)
 *
 * Binding opcional (recomendado):
 *   CHAT_KV — KV namespace usado para a cota diária por usuário.
 *   Sem ele, a cota fica só na memória do isolate (melhor esforço).
 *
 * Toda requisição precisa de "Authorization: Bearer <Firebase ID token>".
 */

const PROJECT_ID = "financas-f371a";
const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const ORIGENS_PERMITIDAS = [
  "https://financas-f371a.web.app",
  "https://financas-f371a.firebaseapp.com",
];

const MODELO_PRINCIPAL = "openai/gpt-oss-120b";
const MODELO_FALLBACK = "qwen/qwen3.8-27b";

const LIMITE_DIARIO = 30;
const MAX_CONTEXTO = 6000;
const MAX_MENSAGENS = 10;
const MAX_CONTEUDO = 2000;

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
  if (ORIGENS_PERMITIDAS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(request, obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

// ─── Verificação do Firebase ID token ────────────────────────────────────────

let jwksCache = { keys: null, expira: 0 };

async function obterChavesGoogle() {
  if (jwksCache.keys && Date.now() < jwksCache.expira) return jwksCache.keys;
  const resp = await fetch(JWKS_URL);
  if (!resp.ok) throw new Error("Falha ao baixar chaves do Google");
  const data = await resp.json();
  const m = /max-age=(\d+)/.exec(resp.headers.get("Cache-Control") || "");
  jwksCache = {
    keys: data.keys,
    expira: Date.now() + (m ? Number(m[1]) : 3600) * 1000,
  };
  return data.keys;
}

function base64UrlParaBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64UrlParaJson(s) {
  return JSON.parse(new TextDecoder().decode(base64UrlParaBytes(s)));
}

// Retorna o uid do usuário se o token for válido, ou null.
async function verificarIdToken(token) {
  const partes = token.split(".");
  if (partes.length !== 3) return null;

  let header, payload;
  try {
    header = base64UrlParaJson(partes[0]);
    payload = base64UrlParaJson(partes[1]);
  } catch (e) {
    return null;
  }

  if (header.alg !== "RS256" || !header.kid) return null;

  const agora = Math.floor(Date.now() / 1000);
  if (payload.aud !== PROJECT_ID) return null;
  if (payload.iss !== "https://securetoken.google.com/" + PROJECT_ID) return null;
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) return null;
  // Contas com email não confirmado não usam a cota: impede criar contas em massa para gastar a Groq
  if (payload.email_verified !== true) return null;
  if (!(payload.exp > agora)) return null;
  if (!(payload.iat <= agora + 300)) return null;
  if (!(payload.auth_time <= agora + 300)) return null;

  const jwk = (await obterChavesGoogle()).find((k) => k.kid === header.kid);
  if (!jwk) return null;

  const chave = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valido = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    chave,
    base64UrlParaBytes(partes[2]),
    new TextEncoder().encode(partes[0] + "." + partes[1])
  );
  return valido ? payload.sub : null;
}

// ─── Cota diária por usuário ─────────────────────────────────────────────────

const cotaMemoria = new Map();

async function consumirCota(uid) {
  const dia = new Date().toISOString().slice(0, 10);
  const chave = "cota:" + uid + ":" + dia;

  if (typeof CHAT_KV !== "undefined") {
    const atual = Number(await CHAT_KV.get(chave)) || 0;
    if (atual >= LIMITE_DIARIO) return false;
    await CHAT_KV.put(chave, String(atual + 1), { expirationTtl: 172800 });
    return true;
  }

  if (cotaMemoria.size > 5000) cotaMemoria.clear();
  const atual = cotaMemoria.get(chave) || 0;
  if (atual >= LIMITE_DIARIO) return false;
  cotaMemoria.set(chave, atual + 1);
  return true;
}

// ─── Validação do corpo ──────────────────────────────────────────────────────

function sanitizarHistorico(historico) {
  if (!Array.isArray(historico)) return [];
  return historico
    .slice(-MAX_MENSAGENS)
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTEUDO) }));
}

async function chamarGroq(apiKey, modelo, messages) {
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelo,
      messages: messages,
      temperature: 0.65,
      max_tokens: 512,
    }),
  });
}

// ─── Handler ─────────────────────────────────────────────────────────────────

async function handleRequest(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request) });
  }

  if (request.method !== "POST") {
    return json(request, { error: "Use POST." }, 405);
  }

  const apiKey = typeof GROQ_API_KEY !== "undefined" ? GROQ_API_KEY : "";
  if (!apiKey) {
    console.error("GROQ_API_KEY nao configurada");
    return json(request, { error: "Servico indisponivel." }, 500);
  }

  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    return json(request, { error: "Faca login para usar o assistente." }, 401);
  }

  let uid;
  try {
    uid = await verificarIdToken(token);
  } catch (e) {
    console.error("Erro ao verificar token:", e.message);
    return json(request, { error: "Servico indisponivel." }, 503);
  }
  if (!uid) {
    return json(request, { error: "Sessao invalida. Faca login novamente." }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json(request, { error: "Body invalido. Envie JSON." }, 400);
  }

  if (typeof body.contexto !== "string" || !body.contexto.trim()) {
    return json(request, { error: "Envie { contexto, historico }." }, 400);
  }

  const userMessages = sanitizarHistorico(body.historico);
  if (userMessages.length === 0) {
    return json(request, { error: "Historico de mensagens vazio." }, 400);
  }

  if (!(await consumirCota(uid))) {
    return json(
      request,
      { error: "Limite diario de mensagens atingido. Tente amanha." },
      429
    );
  }

  const systemContent =
    "Voce e o Assistente Financeiro Inteligente do app Gerenciador de Dividas.\n" +
    "Responda com empatia, clareza e conselhos praticos para ajudar o usuario a sair do endividamento.\n" +
    "Formate as respostas com paragrafos curtos ou listas simples para leitura rapida no celular.\n" +
    "Maximo de 200 palavras, a menos que o usuario peca explicacao aprofundada.\n" +
    "Sempre priorize: dividas com juros altos > dividas com risco de corte de servico > outras.\n\n" +
    body.contexto.slice(0, MAX_CONTEXTO);

  const messages = [{ role: "system", content: systemContent }].concat(userMessages);

  try {
    let groqResp = await chamarGroq(apiKey, MODELO_PRINCIPAL, messages);
    if (!groqResp.ok) {
      groqResp = await chamarGroq(apiKey, MODELO_FALLBACK, messages);
    }

    if (!groqResp.ok) {
      console.error("Groq API erro:", groqResp.status, await groqResp.text());
      return json(request, { error: "Assistente indisponivel no momento." }, 502);
    }

    const data = await groqResp.json();
    const resposta =
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
        ? data.choices[0].message.content
        : "Desculpe, nao consegui gerar uma resposta agora.";

    return json(request, { resposta: resposta, modelo: data.model });
  } catch (err) {
    console.error("Erro interno:", err.message);
    return json(request, { error: "Erro interno." }, 500);
  }
}
