/**
 * Cloudflare Worker — Proxy Seguro para Groq API
 * Formato: Service Worker (compatível com o editor do Dashboard)
 *
 * Variável de ambiente obrigatória (Secret):
 *   GROQ_API_KEY — sua chave da Groq (https://console.groq.com)
 */

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = typeof GROQ_API_KEY !== "undefined" ? GROQ_API_KEY : "";
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "GROQ_API_KEY nao configurada nos Secrets do Worker." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (request.method === "GET") {
    try {
      const respModels = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: "Bearer " + apiKey }
      });
      const dataModels = await respModels.json();
      return new Response(JSON.stringify(dataModels), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Use POST ou GET." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Body invalido. Envie JSON." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Suporte a dois formatos:
  // Novo:   { contexto: string, historico: [{role, content}] }
  // Legado: { messages: [{role, content}], contextoFinanceiro: object }
  var systemContent = "";
  var userMessages = [];

  if (body.contexto) {
    systemContent =
      "Voce e o Assistente Financeiro Inteligente do app Gerenciador de Dividas.\n" +
      "Responda com empatia, clareza e conselhos praticos para ajudar o usuario a sair do endividamento.\n" +
      "Formate as respostas com paragrafos curtos ou listas simples para leitura rapida no celular.\n" +
      "Maximo de 200 palavras, a menos que o usuario peca explicacao aprofundada.\n" +
      "Sempre priorize: dividas com juros altos > dividas com risco de corte de servico > outras.\n\n" +
      body.contexto;
    userMessages = Array.isArray(body.historico) ? body.historico : [];
  } else if (Array.isArray(body.messages)) {
    var ctx = body.contextoFinanceiro || {};
    systemContent =
      "Voce e o Assistente Financeiro Inteligente do app Gerenciador de Dividas.\n" +
      "Renda: R$ " + Number(ctx.rendaTotal || 0).toFixed(2) + "\n" +
      "Despesas fixas: R$ " + Number(ctx.despesasFixas || 0).toFixed(2) + "\n" +
      "Total de dividas: R$ " + Number(ctx.totalDividas || 0).toFixed(2) + "\n" +
      "Saldo disponivel: R$ " + Number(ctx.saldoDisponivel || 0).toFixed(2);
    userMessages = body.messages;
  } else {
    return new Response(
      JSON.stringify({ error: "Envie { contexto, historico } ou { messages }." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (userMessages.length === 0) {
    return new Response(
      JSON.stringify({ error: "Historico de mensagens vazio." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    var messages = [{ role: "system", content: systemContent }].concat(userMessages);

    var modeloDesejado = body.model || "openai/gpt-oss-120b";

    var groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modeloDesejado,
        messages: messages,
        temperature: 0.65,
        max_tokens: 2048,
        reasoning_effort: "low",
      }),
    });

    if (!groqResp.ok && !body.model) {
      // Fallback para qwen se o modelo principal falhar
      groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "qwen/qwen3.8-27b",
          messages: messages,
          temperature: 0.65,
          max_tokens: 512,
        }),
      });
    }

    if (!groqResp.ok) {
      var txt = await groqResp.text();
      return new Response(
        JSON.stringify({ error: "Groq API erro: " + txt }),
        { status: groqResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    var data = await groqResp.json();
    var resposta =
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
        ? data.choices[0].message.content
        : "Desculpe, nao consegui gerar uma resposta agora.";

    return new Response(
      JSON.stringify({ resposta: resposta, modelo: data.model }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Erro interno: " + err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
