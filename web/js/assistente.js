// Assistente Financeiro Inteligente
// Depende de: firebase (db, currentUser), dividas, formatarMoeda definidos em app.js

(function () {
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  let orcamento = {
    rendaMensal: 0,
    rendasExtras: [],
    despesas: [],
    metaEconomia: 0,
    metaReserva: 0,
    reservaAtual: 0,
  };

  let graficoProjecaoInstance = null;

  let debounceSalvarTimer = null;
  function debounceSalvar() {
    clearTimeout(debounceSalvarTimer);
    debounceSalvarTimer = setTimeout(() => {
      persistirOrcamento();
      renderTudo();
      renderOrcamentoUI();
      mostrarToastSalvo();
    }, 800);
  }

  function mostrarToastSalvo() {
    let toast = document.getElementById("toastOrcamento");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toastOrcamento";
      toast.className = "toast sucesso";
      toast.textContent = "Salvo!";
      document.querySelector(".toast-container")?.appendChild(toast);
    }
    toast.style.opacity = "1";
    toast.style.display = "block";
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => { toast.style.display = "none"; }, 300);
    }, 1500);
  }

  // ─── Firebase ──────────────────────────────────────────────────────────────

  async function carregarOrcamento() {
    const _cu1 = window.getCurrentUser && window.getCurrentUser();
    if (!_cu1) return;
    const snap = await firebase
      .database()
      .ref("usuarios/" + _cu1.uid + "/orcamento")
      .get();
    if (snap.exists()) {
      orcamento = Object.assign(orcamento, snap.val());
    }
    preencherFormulario();
    renderizarDespesas();
    renderizarRendasExtras();
    renderOrcamentoUI();
  }

  async function persistirOrcamento() {
    const _cu2 = window.getCurrentUser && window.getCurrentUser();
    if (!_cu2) return;
    await firebase
      .database()
      .ref("usuarios/" + _cu2.uid + "/orcamento")
      .set(orcamento);
  }

  // ─── Calculos ──────────────────────────────────────────────────────────────

  function totalRenda() {
    const extras = (orcamento.rendasExtras || []).reduce(
      (s, r) => s + (r.valor || 0),
      0
    );
    return (orcamento.rendaMensal || 0) + extras;
  }

  // achado 02: normaliza nome para comparar (sem acento, minusculo, sem espaco extra)
  function normalizarNome(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  // dividas ativas = tem ao menos uma parcela pendente
  function dividasAtivas() {
    const _d = window.getDividas ? window.getDividas() : [];
    return _d.filter((d) =>
      (d.parcelas || []).some((p) => p.status === "pendente"),
    );
  }

  // despesa fixa que ja esta cadastrada como divida ativa (por vinculo ou por nome)
  function dividaVinculadaDespesa(despesa) {
    if (!despesa) return null;
    const ativas = dividasAtivas();
    if (despesa.dividaId) {
      const porId = ativas.find((d) => d.id === despesa.dividaId);
      if (porId) return porId;
    }
    const alvo = normalizarNome(despesa.nome);
    if (!alvo) return null;
    // 1) nome igual; 2) um nome contido no outro ("Escola" em "Escola de Anthony")
    const exato = ativas.find((d) => normalizarNome(d.nome) === alvo);
    if (exato) return exato;
    if (alvo.length < 4) return null;
    return (
      ativas.find((d) => {
        const n = normalizarNome(d.nome);
        return n && n.length >= 4 && (n.includes(alvo) || alvo.includes(n));
      }) || null
    );
  }

  function despesaDuplicada(despesa) {
    return !!dividaVinculadaDespesa(despesa);
  }

  function totalDespesasFixas() {
    // exclui despesas que ja contam como divida ativa, para nao somar duas vezes
    return (orcamento.despesas || []).reduce(
      (s, d) => s + (despesaDuplicada(d) ? 0 : d.valor || 0),
      0,
    );
  }

  function totalDividasPendentes() {
    const _div1 = window.getDividas ? window.getDividas() : [];
    return _div1.reduce((s, d) => {
      const pendentes = (d.parcelas || []).filter((p) => p.status === "pendente");
      return s + pendentes.reduce((ps, p) => ps + (p.valor || 0), 0);
    }, 0);
  }

  function totalParcelas() {
    const _div2 = window.getDividas ? window.getDividas() : [];
    return _div2.reduce(
      (s, d) =>
        s + (d.parcelas || []).filter((p) => p.status === "pendente").length,
      0
    );
  }

  // parcelas do mes atual (pagas e pendentes): o que o mes compromete da renda
  function parcelaMensalTotal() {
    const hoje = new Date();
    return parcelasDoMes(hoje.getFullYear(), hoje.getMonth());
  }

  function saldoDisponivel() {
    return totalRenda() - totalDespesasFixas() - parcelaMensalTotal();
  }

  function saldoAposEconomia() {
    return saldoDisponivel() - (orcamento.metaEconomia || 0);
  }

  function gastoHoje() {
    const hoje = new Date();
    const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const diasRestantes = diasNoMes - hoje.getDate() + 1;
    const livre = Math.max(0, saldoAposEconomia());
    return livre / diasRestantes;
  }

  function percentualReserva() {
    if (!orcamento.metaReserva || orcamento.metaReserva <= 0) return 0;
    return Math.min(100, ((orcamento.reservaAtual || 0) / orcamento.metaReserva) * 100);
  }

  // data de vencimento da ultima parcela pendente = fim real das parcelas
  function ultimaParcelaPendente() {
    const divs = window.getDividas ? window.getDividas() : [];
    let max = null;
    divs.forEach((d) =>
      (d.parcelas || []).forEach((p) => {
        if (p.status !== "pendente" || !p.vencimento) return;
        const dt = new Date(p.vencimento + "T00:00:00");
        if (!max || dt > max) max = dt;
      }),
    );
    return max;
  }

  // soma das parcelas que vencem em um mes especifico. No mes atual (ou passado)
  // entram tambem as ja pagas, pois sairam da renda deste mes; nos futuros, so as pendentes.
  function parcelasDoMes(ano, mes) {
    const divs = window.getDividas ? window.getDividas() : [];
    const hoje = new Date();
    const incluirPagas = ano * 12 + mes <= hoje.getFullYear() * 12 + hoje.getMonth();
    let soma = 0;
    divs.forEach((d) =>
      (d.parcelas || []).forEach((p) => {
        if (!p.vencimento) return;
        if (p.status !== "pendente" && !(incluirPagas && p.status === "pago")) return;
        const pv = new Date(p.vencimento + "T00:00:00");
        if (pv.getFullYear() === ano && pv.getMonth() === mes) soma += p.valor || 0;
      }),
    );
    return soma;
  }

  // sobra real de um mes especifico = renda - despesas fixas - parcelas que vencem nele - meta
  function sobraDoMes(ano, mes) {
    return totalRenda() - totalDespesasFixas() - parcelasDoMes(ano, mes) - (orcamento.metaEconomia || 0);
  }

  // lista dos proximos meses ate a ultima parcela (+ 1 mes de folga)
  function calendarioProximosMeses() {
    const hoje = new Date();
    const fim = ultimaParcelaPendente();
    const limite = fim
      ? new Date(fim.getFullYear(), fim.getMonth() + 1, 1)
      : new Date(hoje.getFullYear(), hoje.getMonth() + 2, 1);
    const meses = [];
    const cur = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    let guard = 0;
    while (cur <= limite && guard < 36) {
      const ano = cur.getFullYear();
      const mes = cur.getMonth();
      meses.push({
        data: new Date(ano, mes, 1),
        parcelas: parcelasDoMes(ano, mes),
        sobra: totalRenda() - totalDespesasFixas() - parcelasDoMes(ano, mes),
      });
      cur.setMonth(cur.getMonth() + 1);
      guard++;
    }
    return meses;
  }

  // projecao de quanto da para juntar nos proximos N meses, usando a sobra real de cada mes
  function projecao(meses = 6) {
    const hoje = new Date();
    const resultado = [];
    let saldoAcumulado = orcamento.reservaAtual || 0;
    for (let i = 0; i < meses; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      const sobra = sobraDoMes(d.getFullYear(), d.getMonth());
      saldoAcumulado += Math.max(0, sobra);
      resultado.push({ label, valor: saldoAcumulado, sobra });
    }
    return resultado;
  }

  // ─── Visao Geral (resumo em frases) ──────────────────────────────────────────

  function nomeMes(d) {
    return d.toLocaleDateString("pt-BR", { month: "long" });
  }

  // 1. Sobra do mes, em frase, com barra mostrando de onde vem
  function renderSobraMes() {
    const el = document.getElementById("visao-sobra");
    if (!el) return;
    const renda = totalRenda();
    const desp = totalDespesasFixas();
    const parc = parcelaMensalTotal();
    const meta = orcamento.metaEconomia || 0;
    const sobra = renda - desp - parc; // saldo disponivel do mes
    const livre = sobra - meta;
    const mes = nomeMes(new Date());

    if (renda <= 0) {
      el.innerHTML = `
        <div class="card" style="padding:16px">
          <div style="font-size:16px;font-weight:700;margin-bottom:4px">Vamos começar pela sua renda</div>
          <div style="font-size:13px;color:var(--text-secondary)">Informe sua renda mensal na aba Orçamento para ver quanto sobra.</div>
        </div>`;
      return;
    }

    const cor = sobra >= 0 ? "var(--success)" : "var(--danger)";
    const seg = (v, c) =>
      v > 0 ? `<div style="width:${(v / renda) * 100}%;background:${c};height:100%"></div>` : "";

    el.innerHTML = `
      <div class="card" style="padding:16px">
        <div style="font-size:14px;color:var(--text-secondary)">Em ${mes} ${sobra >= 0 ? "sobram" : "faltam"}</div>
        <div style="font-size:28px;font-weight:800;color:${cor};line-height:1.1;margin:2px 0 12px">${formatarMoeda(Math.abs(sobra))}</div>
        <div style="display:flex;height:10px;border-radius:6px;overflow:hidden;background:var(--border-light)">
          ${seg(parc, "var(--danger)")}
          ${seg(desp, "var(--warning)")}
          ${seg(Math.max(0, meta), "var(--primary)")}
          ${seg(Math.max(0, livre), "var(--success)")}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:10px;font-size:12px;color:var(--text-secondary)">
          <span><b style="color:var(--text)">${formatarMoeda(renda)}</b> renda</span>
          ${parc > 0 ? `<span style="color:var(--danger)">− ${formatarMoeda(parc)} parcelas</span>` : ""}
          ${desp > 0 ? `<span style="color:var(--warning)">− ${formatarMoeda(desp)} despesas</span>` : ""}
          ${meta > 0 ? `<span style="color:var(--primary)">− ${formatarMoeda(meta)} meta</span>` : ""}
          <span style="color:var(--success)">= ${formatarMoeda(livre)} livre</span>
        </div>
      </div>`;
  }

  // 2. Quando as parcelas acabam + linha dos proximos meses
  function renderFimParcelas() {
    const el = document.getElementById("visao-fim");
    if (!el) return;
    const fim = ultimaParcelaPendente();
    if (!fim) { el.innerHTML = ""; return; }

    const todosMeses = calendarioProximosMeses().filter((m) => m.parcelas > 0);
    const meses = todosMeses.slice(0, 3);
    const restantes = todosMeses.length - meses.length;
    const linha = meses
      .map(
        (m) => `
      <div style="flex:1;min-width:0;text-align:center;padding:8px 4px;background:var(--bg-card);border:1px solid var(--border-light);border-radius:10px">
        <div style="font-size:11px;color:var(--text-secondary);text-transform:capitalize">${m.data.toLocaleDateString("pt-BR", { month: "short" })}</div>
        <div style="font-size:13px;font-weight:700">${formatarMoeda(m.parcelas)}</div>
      </div>`,
      )
      .join("") +
      (restantes > 0
        ? `<div style="flex:0 0 auto;display:flex;align-items:center;justify-content:center;padding:8px 10px;background:var(--bg-card);border:1px solid var(--border-light);border-radius:10px;font-size:13px;font-weight:700;color:var(--text-secondary)" title="Mais ${restantes} ${restantes === 1 ? "mês" : "meses"} com parcelas">+${restantes}</div>`
        : "");

    el.innerHTML = `
      <div class="card" style="padding:16px">
        <div style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;margin-bottom:10px">
          <i data-lucide="calendar-check" class="icon icon-sm" style="color:var(--success)"></i>
          Suas parcelas terminam em ${fim.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}
        </div>
        <div style="display:flex;gap:8px">${linha}</div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  }

  // 4. Gasto do dia, como apoio (texto menor, sem ser o maior numero da tela)
  function renderGastoDia() {
    const el = document.getElementById("visao-gastodia");
    if (!el) return;
    const ritmo = gastoHoje();
    if (totalRenda() <= 0) { el.innerHTML = ""; return; }
    el.innerHTML = `
      <div style="text-align:center;font-size:13px;color:var(--text-secondary)">
        <i data-lucide="coins" class="icon icon-sm" style="vertical-align:-3px"></i>
        Até <b style="color:var(--text)">${formatarMoeda(Math.max(0, ritmo))}</b> por dia sem mexer na sua meta
      </div>`;
    if (window.lucide) lucide.createIcons();
  }

  // ─── Render Indicadores ────────────────────────────────────────────────────

  function renderIndicadores() {
    const hoje = gastoHoje();
    const saldo = saldoDisponivel();
    const renda = totalRenda();
    const desp = totalDespesasFixas();
    const parc = parcelaMensalTotal();
    const comprometido = desp + parc;
    const pct = renda > 0 ? Math.round((comprometido / renda) * 100) : 0;

    let classeHoje = "positivo";
    if (hoje <= 0) classeHoje = "alerta";
    else if (hoje < 50) classeHoje = "";

    document.getElementById("assistente-indicadores").innerHTML = `
      <div class="indicador-card destaque ${classeHoje}">
        <div class="indicador-icone">
          <i data-lucide="coins" style="width:22px;height:22px;stroke:white;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"></i>
        </div>
        <div>
          <div class="indicador-label">Pode gastar hoje</div>
          <div class="indicador-valor">${formatarMoeda(Math.max(0, hoje))}</div>
          <div class="indicador-sub">sem comprometer o orçamento</div>
        </div>
      </div>

      <div class="indicador-card">
        <div class="indicador-label">Saldo livre/mês</div>
        <div class="indicador-valor" style="color:${saldo >= 0 ? "var(--success)" : "var(--danger)"}">${formatarMoeda(saldo)}</div>
        <div class="indicador-sub">após despesas e dívidas</div>
      </div>

      <div class="indicador-card">
        <div class="indicador-label">Renda total</div>
        <div class="indicador-valor">${formatarMoeda(renda)}</div>
        <div class="indicador-sub">${pct}% comprometido</div>
      </div>

      <div class="indicador-card">
        <div class="indicador-label">Despesas fixas</div>
        <div class="indicador-valor" style="color:var(--warning)">${formatarMoeda(desp)}</div>
        <div class="indicador-sub">${(() => {
          const n = (orcamento.despesas || []).filter((d) => !despesaDuplicada(d)).length;
          if (n === 0) return (orcamento.despesas || []).length ? "Nenhuma fora das dívidas" : "Nenhuma cadastrada";
          return `${n} ${n === 1 ? "categoria" : "categorias"}`;
        })()}</div>
      </div>

      <div class="indicador-card">
        <div class="indicador-label">Parcelas/mês</div>
        <div class="indicador-valor" style="color:var(--danger)">${formatarMoeda(parc)}</div>
        <div class="indicador-sub">${totalParcelas()} pendentes no total</div>
      </div>

      <div class="indicador-card">
        <div class="indicador-label">Meta economia</div>
        <div class="indicador-valor" style="color:var(--primary)">${formatarMoeda(orcamento.metaEconomia || 0)}</div>
        <div class="indicador-sub">por mês</div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }

  function gerarPlanoAcao() {
    const acoes = [];
    const divs = window.getDividas ? window.getDividas() : [];
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const atrasadas = divs.flatMap((d) => (d.parcelas || []).map((p) => ({ ...p, nome: d.nome })))
      .filter((p) => p.status === "pendente" && new Date(p.vencimento) < hoje);
    const saldo = saldoDisponivel();
    const renda = totalRenda();
    const reservaAtual = orcamento.reservaAtual || 0;
    const metaReserva = orcamento.metaReserva || 0;

    if (!renda) {
      acoes.push({ icone: "wallet", titulo: "Informe sua renda mensal", texto: "Com esse dado o Assistente calcula sua margem real e evita recomendações genéricas.", urgente: false });
    }
    if (atrasadas.length) {
      const total = atrasadas.reduce((s, p) => s + (p.valor || 0), 0);
      acoes.push({ icone: "alert-triangle", titulo: `Regularize ${atrasadas.length} parcela(s) atrasada(s)`, texto: `${formatarMoeda(total)} em atraso. Priorize negociar juros antes de investir qualquer sobra.`, urgente: true });
    }
    if (saldo < 0) {
      acoes.push({ icone: "scissors", titulo: "Reequilibre o orçamento", texto: `Faltam ${formatarMoeda(Math.abs(saldo))} para fechar o mês. Pause gastos não essenciais e revise despesas fixas.`, urgente: true });
    } else if (saldo > 0 && metaReserva > reservaAtual) {
      const aporte = Math.min(saldo, Math.max(50, (metaReserva - reservaAtual) / 6));
      acoes.push({ icone: "shield-check", titulo: "Faça um aporte para a reserva", texto: `Separe cerca de ${formatarMoeda(aporte)} este mês para a reserva.`, urgente: false });
    }
    if (saldo > 0 && !atrasadas.length && metaReserva <= reservaAtual) {
      acoes.push({ icone: "trending-up", titulo: "Faça o dinheiro parado trabalhar", texto: "Depois da reserva e das dívidas caras, compare opções de baixo risco, liquidez e rentabilidade líquida.", urgente: false });
    }
    if (!acoes.length) {
      acoes.push({ icone: "check-circle", titulo: "Continue no ritmo atual", texto: "Não há alertas críticos. Revise o orçamento semanalmente e mantenha seus vencimentos em dia.", urgente: false });
    }
    return acoes.slice(0, 3);
  }

  function renderPlanoAcao() {
    const el = document.getElementById("assistente-acoes");
    if (!el) return;
    // um proximo passo so: o primeiro (mais urgente) da lista
    el.innerHTML = gerarPlanoAcao().slice(0, 1).map((acao) => `
      <div class="acao-financeira ${acao.urgente ? "urgente" : ""}">
        <div class="acao-financeira-icone"><i data-lucide="${escapeHtml(acao.icone)}" class="icon icon-sm"></i></div>
        <div><strong>${escapeHtml(acao.titulo)}</strong><span>${escapeHtml(acao.texto)}</span></div>
      </div>`).join("");
    if (window.lucide) lucide.createIcons();
  }

  function renderReserva() {
    const pct = percentualReserva();
    const atual = orcamento.reservaAtual || 0;
    const meta = orcamento.metaReserva || 0;
    const falta = Math.max(0, meta - atual);
    const meses =
      meta > 0 && saldoDisponivel() > 0
        ? Math.ceil(falta / Math.max(1, saldoDisponivel() * 0.3))
        : null;

    document.getElementById("assistente-reserva").innerHTML = `
      <div class="progresso-label">
        <span>${formatarMoeda(atual)} acumulados</span>
        <span>${Math.round(pct)}%</span>
      </div>
      <div class="progresso-barra">
        <div class="progresso-preenchimento" style="width:${pct}%"></div>
      </div>
      <div style="margin-top:10px;font-size:13px;color:var(--text-secondary)">
        Meta: <strong style="color:var(--text)">${formatarMoeda(meta)}</strong>
        ${falta > 0 ? ` &bull; Faltam <strong style="color:var(--danger)">${formatarMoeda(falta)}</strong>` : " &bull; <strong style='color:var(--success)'>Meta atingida!</strong>"}
        ${meses ? ` &bull; Previsão: <strong>${meses} meses</strong>` : ""}
      </div>
    `;
  }

  // ─── Insights da IA (geracao local, sem API) ───────────────────────────────

  function gerarInsights() {
    const insights = [];
    const saldo = saldoDisponivel();
    const renda = totalRenda();
    if (renda === 0) {
      insights.push({
        tipo: "info",
        icone: "info",
        titulo: "Configure sua renda",
        texto: "Acesse a aba Orçamento e informe sua renda mensal para receber insights personalizados.",
      });
    } else {
      // Alertar so quando ha acao possivel: sobra do mes negativa
      if (saldo < 0) {
        insights.push({
          tipo: "alerta",
          icone: "alert-circle",
          titulo: "Este mês falta fechar a conta",
          texto: `Suas despesas e parcelas superam a renda em ${formatarMoeda(Math.abs(saldo))}. Veja o que dá para adiar na aba Orçamento.`,
        });
      }

      // Parcelas tem data fixa: mostrar quando terminam, nao um prazo estimado
      const fim = ultimaParcelaPendente();
      if (fim) {
        insights.push({
          tipo: "meta",
          icone: "calendar-check",
          titulo: "Quando suas parcelas terminam",
          texto: `A última parcela vence em ${fim.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}.`,
        });
      }

      const economia = orcamento.metaEconomia || 0;
      if (economia === 0 && saldo > 0) {
        insights.push({
          tipo: "dica",
          icone: "piggy-bank",
          titulo: "Defina uma meta de economia",
          texto: `Você tem ${formatarMoeda(saldo)} de saldo livre. Estabelecer uma meta mensal garante progresso consistente.`,
        });
      }

      if (saldo > 0 && (orcamento.metaReserva || 0) <= (orcamento.reservaAtual || 0)) {
        insights.push({
          tipo: "dica",
          icone: "line-chart",
          titulo: "Rentabilize com segurança",
          texto: "Com as contas em dia, priorize uma reserva de liquidez e baixo risco. Compare sempre custos, prazo, resgate e rentabilidade líquida; desconfie de retorno alto garantido.",
        });
      }

      const _div4 = window.getDividas ? window.getDividas() : [];
      if (_div4.length > 0) {
        const catContagem = {};
        _div4.forEach((d) => {
          catContagem[d.categoria || "outros"] = (catContagem[d.categoria || "outros"] || 0) + (d.valorTotal || 0);
        });
        const top = Object.entries(catContagem).sort((a, b) => b[1] - a[1])[0];
        if (top) {
          const nome = window.rotuloCategoria ? window.rotuloCategoria(top[0]) : top[0];
          insights.push({
            tipo: "info",
            icone: "pie-chart",
            titulo: `${nome} é seu maior gasto parcelado`,
            texto: `${formatarMoeda(top[1])} no total nessa categoria.`,
          });
        }
      }
    }

    return insights;
  }

  function renderInsights() {
    const insights = gerarInsights();
    const tipoLabels = {
      alerta: "Alerta",
      dica: "Dica",
      info: "Info",
      meta: "Meta"
    };
    document.getElementById("assistente-insights").innerHTML = insights
      .map(
        (i) => `
      <div class="insight-card tipo-${escapeHtml(i.tipo)}">
        <div class="insight-icone">
          <i data-lucide="${escapeHtml(i.icone)}" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"></i>
        </div>
        <div class="insight-texto">
          <strong>${escapeHtml(tipoLabels[i.tipo] || "")}: ${escapeHtml(i.titulo)}</strong>${escapeHtml(i.texto)}
        </div>
      </div>`
      )
      .join("");
    if (window.lucide) lucide.createIcons();
  }

  // ─── Grafico de projecao ───────────────────────────────────────────────────

  function renderGraficoProjecao() {
    const canvas = document.getElementById("graficoProjecao");
    if (!canvas) return;
    if (graficoProjecaoInstance) graficoProjecaoInstance.destroy();

    const dados = projecao(6);
    // achado 20: resumo acessivel do grafico de projecao
    if (dados.length) {
      const resumo = dados
        .map((d) => `${d.label}: ${formatarMoeda(d.valor)}`)
        .join("; ");
      canvas.setAttribute("role", "img");
      canvas.setAttribute(
        "aria-label",
        `Se guardar toda a sobra, nos próximos ${dados.length} meses. ${resumo}.`,
      );
    }
    if (window.aplicarTemaGraficos) window.aplicarTemaGraficos();
    graficoProjecaoInstance = new Chart(canvas, {
      type: "line",
      data: {
        labels: dados.map((d) => d.label),
        datasets: [
          {
            label: "Saldo acumulado",
            data: dados.map((d) => d.valor),
            borderColor: window.corTema ? corTema("--primary") : "#1F4E79",
            backgroundColor: window.corTema ? corTema("--primary") + "22" : "rgba(31,78,121,0.13)",
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: window.corTema ? corTema("--primary") : "#1F4E79",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: "index"
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(0,0,0,0.8)",
            titleFont: { size: 12 },
            bodyFont: { size: 13, weight: "700" },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => " " + formatarMoeda(ctx.parsed.y)
            }
          }
        },
        scales: {
          y: {
            ticks: {
              callback: (v) => "R$ " + Math.round(v).toLocaleString("pt-BR"),
            },
          },
        },
      },
    });
  }

  // ─── Proximos meses ──────────────────────────────────────────────────────────

  function renderSimulacao() {
    const total = totalDividasPendentes();
    const el = document.getElementById("simulacao-resultado");
    if (!el) return;
    const renda = totalRenda();

    if (renda === 0) {
      el.innerHTML = `
        <div style="text-align:center;padding:24px 16px;color:var(--text-secondary)">
          <i data-lucide="calendar-days" style="width:40px;height:40px;stroke:currentColor;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;margin-bottom:8px;opacity:.4"></i>
          <div style="font-weight:700;font-size:15px;color:var(--text);margin-bottom:4px">Falta a sua renda</div>
          <div style="font-size:13px;line-height:1.5">Informe sua renda mensal na aba Orçamento para ver os próximos meses.</div>
        </div>`;
      if (window.lucide) lucide.createIcons();
      renderRanking();
      renderSimulacaoExtra(0);
      return;
    }

    if (total === 0) {
      el.innerHTML = `
        <div style="text-align:center;padding:20px;color:var(--success)">
          <i data-lucide="party-popper" style="width:40px;height:40px;stroke:currentColor;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;margin-bottom:8px"></i>
          <div style="font-weight:700;font-size:16px">Sem parcelas pendentes!</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">A renda inteira fica livre para suas metas.</div>
        </div>`;
      if (window.lucide) lucide.createIcons();
      renderRanking();
      renderSimulacaoExtra(0);
      return;
    }

    // Calendario real: uma linha por mes ate a ultima parcela (+1), com parcelas e sobra
    const meses = calendarioProximosMeses();
    el.innerHTML = meses
      .map((m) => {
        const sobraCor = m.sobra >= 0 ? "var(--success)" : "var(--danger)";
        const nomeMesCal = `${m.data.toLocaleDateString("pt-BR", { month: "long" })} ${m.data.getFullYear()}`;
        return `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid var(--border-light)">
          <div style="text-transform:capitalize;font-weight:700;font-size:14px;min-width:92px">${nomeMesCal}</div>
          <div style="text-align:right">
            <div style="font-size:12px;color:var(--text-secondary)">${m.parcelas > 0 ? "parcelas " + formatarMoeda(m.parcelas) : "sem parcelas"}</div>
            <div style="font-weight:700;color:${sobraCor}">sobra ${formatarMoeda(m.sobra)}</div>
          </div>
        </div>`;
      })
      .join("");
    if (window.lucide) lucide.createIcons();

    renderGraficoProjecao();
    renderRanking();
    renderSimulacaoExtra(0);
  }

  function renderRanking() {
    const el = document.getElementById("simulacao-ranking");
    if (!el) return;
    // so dividas ativas (com parcela pendente); quitadas nao poluem a lista
    const divs = dividasAtivas();
    if (!divs.length) {
      el.innerHTML = `<p style="color:var(--text-secondary);font-size:13px">Nenhuma dívida ativa.</p>`;
      return;
    }

    el.innerHTML = divs.map((d) => {
      const total = (d.parcelas || []).length;
      const pagas = (d.parcelas || []).filter((p) => p.status === "pago").length;
      const pct = total > 0 ? Math.round((pagas / total) * 100) : 0;
      const pendVal = (d.parcelas || []).filter((p) => p.status === "pendente").reduce((s, p) => s + (p.valor || 0), 0);
      const quitada = pagas === total;

      return `
        <div class="card" style="margin-bottom:10px;padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div>
              <div style="font-weight:700;font-size:15px">${escapeHtml(d.nome)}</div>
              <div style="font-size:12px;color:var(--text-secondary)">${pagas}/${total} parcelas pagas</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700;color:${quitada ? "var(--success)" : "var(--danger)"}">
                ${quitada ? "Quitada" : formatarMoeda(pendVal)}
              </div>
              <div style="font-size:11px;color:var(--text-secondary)">${pct}% pago</div>
            </div>
          </div>
          <div class="progresso-barra" style="height:6px">
            <div class="progresso-preenchimento" style="width:${pct}%;background:${quitada ? "var(--success)" : "var(--gradient)"}"></div>
          </div>
        </div>`;
    }).join("");
  }

  window.recalcularSimulacao = (extra = 0) => {
    renderSimulacaoExtra(parseFloat(extra) || 0);
  };

  function atualizarSliderMax() {
    const slider = document.getElementById("extraQuitacaoSlider");
    if (!slider) return;
    // o teto do controle e a sobra real do mes, nao um valor fixo de R$ 2.000
    const novoMax = Math.max(50, Math.ceil(Math.max(0, saldoDisponivel()) / 50) * 50);
    slider.max = novoMax;
    const labelMax = slider.parentElement?.querySelector("span:last-child");
    if (labelMax) labelMax.textContent = formatarMoeda(novoMax);
  }

  function renderSimulacaoExtra(extra) {
    const el = document.getElementById("simulacao-extra");
    if (!el) return;
    if (!extra || extra <= 0) {
      el.innerHTML = `<p style="color:var(--text-secondary);font-size:13px;text-align:center">Mova o controle para ver em quanto tempo sua reserva fica completa.</p>`;
      return;
    }

    const atual = orcamento.reservaAtual || 0;
    const meta = orcamento.metaReserva || 0;
    const falta = Math.max(0, meta - atual);

    if (meta <= 0) {
      el.innerHTML = `
        <div class="card" style="padding:14px;text-align:center;font-size:13px;color:var(--text-secondary)">
          Defina uma reserva desejada na aba Orçamento para ver quando ela fica completa guardando ${formatarMoeda(extra)} por mês.
        </div>`;
      return;
    }
    if (falta <= 0) {
      el.innerHTML = `
        <div class="card" style="padding:14px;text-align:center">
          <div style="color:var(--success);font-weight:700;font-size:15px">Sua reserva já está completa!</div>
          <div style="color:var(--text-secondary);font-size:12px;margin-top:4px">Guarde os ${formatarMoeda(extra)} para suas próximas metas.</div>
        </div>`;
      return;
    }

    const mesesParaCompletar = Math.ceil(falta / extra);
    const alvo = new Date();
    alvo.setMonth(alvo.getMonth() + mesesParaCompletar);
    const nomeAlvo = alvo.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    el.innerHTML = `
      <div class="card" style="padding:14px">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px">
          <span style="color:var(--text-secondary)">Falta para a reserva</span>
          <strong>${formatarMoeda(falta)}</strong>
        </div>
        <div style="background:var(--success-soft);border-radius:10px;padding:12px;text-align:center">
          <div style="color:var(--success);font-weight:700;font-size:15px">Completa em ${nomeAlvo}</div>
          <div style="color:var(--text-secondary);font-size:12px;margin-top:4px">Guardando ${formatarMoeda(extra)} por mês (${mesesParaCompletar} ${mesesParaCompletar === 1 ? "mês" : "meses"})</div>
        </div>
      </div>`;
  }

  // ─── Orcamento form ────────────────────────────────────────────────────────

  function preencherFormulario() {
    const rm = document.getElementById("rendaMensal");
    const me = document.getElementById("metaEconomia");
    const mr = document.getElementById("metaReserva");
    const ra = document.getElementById("reservaAtual");
    if (rm) rm.value = orcamento.rendaMensal || "";
    if (me) me.value = orcamento.metaEconomia || "";
    if (mr) mr.value = orcamento.metaReserva || "";
    if (ra) ra.value = orcamento.reservaAtual || "";
  }

  function carregarPreferenciaNotificacao() {
    const select = document.getElementById("antecedenciaNotificacao");
    let valor = localStorage.getItem("antecedenciaNotificacao") || "1";
    if (window.Android && typeof window.Android.getAntecedenciaNotificacao === "function") {
      valor = String(window.Android.getAntecedenciaNotificacao());
    }
    valor = ["0", "1", "3", "7"].includes(valor) ? valor : "1";
    if (select) select.value = valor;
    const configSelect = document.getElementById("configAntecedenciaNotificacao");
    if (configSelect) configSelect.value = valor;
  }

  window.salvarPreferenciaNotificacao = (valor) => {
    const dias = [0, 1, 3, 7].includes(Number(valor)) ? Number(valor) : 1;
    localStorage.setItem("antecedenciaNotificacao", String(dias));
    const assistenteSelect = document.getElementById("antecedenciaNotificacao");
    const configSelect = document.getElementById("configAntecedenciaNotificacao");
    if (assistenteSelect) assistenteSelect.value = String(dias);
    if (configSelect) configSelect.value = String(dias);
    if (window.Android && typeof window.Android.salvarAntecedenciaNotificacao === "function") {
      window.Android.salvarAntecedenciaNotificacao(dias);
    }
    if (window.mostrarToast) window.mostrarToast("Preferência de lembrete salva", "sucesso");
  };

  window.carregarPreferenciaNotificacao = carregarPreferenciaNotificacao;

  window.salvarOrcamento = () => {
    orcamento.rendaMensal = parseFloat(document.getElementById("rendaMensal")?.value) || 0;
    orcamento.metaEconomia = parseFloat(document.getElementById("metaEconomia")?.value) || 0;
    orcamento.metaReserva = parseFloat(document.getElementById("metaReserva")?.value) || 0;
    orcamento.reservaAtual = parseFloat(document.getElementById("reservaAtual")?.value) || 0;
    renderOrcamentoUI(); // resumo atualiza na hora; persistencia vai no debounce
    debounceSalvar();
  };

  // resumo que acompanha a rolagem da aba Orcamento e atualiza ao digitar
  function renderResumoOrcamento() {
    const el = document.getElementById("orcamento-resumo");
    if (!el) return;
    const renda = totalRenda();
    const parc = parcelaMensalTotal();
    const desp = totalDespesasFixas();
    const sobra = renda - parc - desp;
    const cor = sobra >= 0 ? "var(--success)" : "var(--danger)";
    el.innerHTML = `
      <span style="color:var(--text-secondary)">Renda <b style="color:var(--text)">${formatarMoeda(renda)}</b></span>
      <span style="color:var(--text-secondary)"> − parcelas ${formatarMoeda(parc)}</span>
      <span style="color:var(--text-secondary)"> − despesas ${formatarMoeda(desp)}</span>
      <b style="color:${cor}"> = sobra ${formatarMoeda(sobra)}</b>`;
  }

  // sugestao de meta de economia = metade da sobra, arredondada
  function renderMetaSugestao() {
    const el = document.getElementById("metaSugestao");
    if (!el) return;
    const sobra = saldoDisponivel();
    if (sobra <= 0) { el.textContent = ""; return; }
    const sugestao = Math.floor(sobra / 2 / 10) * 10;
    el.textContent = sugestao > 0
      ? `Com a sobra atual, até ${formatarMoeda(sugestao)} por mês cabe sem apertar.`
      : "";
  }

  function renderOrcamentoUI() {
    renderResumoOrcamento();
    renderMetaSugestao();
  }

  function renderizarDespesas() {
    const lista = document.getElementById("despesas-lista");
    if (!lista) return;
    const desp = orcamento.despesas || [];
    if (desp.length === 0) {
      lista.innerHTML = `<p style="color:var(--text-secondary);font-size:13px;padding:8px 0">Nenhuma despesa cadastrada.</p>`;
      return;
    }

    const itens = desp.map((d, i) => ({ d, i, divida: dividaVinculadaDespesa(d) }));
    const normais = itens.filter((x) => !x.divida);
    const duplicadas = itens.filter((x) => x.divida);
    const rotulo = (d) => escapeHtml(window.rotuloCategoria ? window.rotuloCategoria(d.categoria) : d.categoria || "");
    const btnRemover = (i) => `
      <button onclick="removerDespesa(${i})" style="background:none;border:none;color:var(--danger);cursor:pointer;padding:4px;display:flex">
        <i data-lucide="x" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"></i>
      </button>`;

    const linhaNormal = ({ d, i }) => `
      <div class="despesa-item">
        <div>
          <div class="despesa-nome">${escapeHtml(d.nome)}</div>
          <div class="despesa-cat">${rotulo(d)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="despesa-valor">${formatarMoeda(d.valor)}</span>
          ${btnRemover(i)}
        </div>
      </div>`;

    const linhaDup = ({ d, i, divida }) => {
      // casou por nome mas ainda nao gravou o vinculo: sugerir em vez de decidir sozinho
      const sugerir = !d.dividaId;
      const aviso = sugerir
        ? `<div style="font-size:12px;margin-top:4px;color:var(--text-secondary)">Parece ser a dívida <b style="color:var(--text)">${escapeHtml(divida.nome)}</b>. <button type="button" onclick="vincularDespesa(${i},'${escapeHtml(divida.id)}')" style="background:none;border:none;color:var(--primary);cursor:pointer;padding:0;font:inherit;text-decoration:underline">Vincular</button></div>`
        : `<div class="despesa-aviso" style="color:var(--warning,#e3a54e);font-size:12px;margin-top:4px">Já cadastrada como dívida — não contada em dobro.</div>`;
      return `
      <div class="despesa-item">
        <div>
          <div class="despesa-nome">${escapeHtml(d.nome)}</div>
          <div class="despesa-cat">${rotulo(d)}</div>
          ${aviso}
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="despesa-valor" style="text-decoration:line-through;opacity:.6">${formatarMoeda(d.valor)}</span>
          ${btnRemover(i)}
        </div>
      </div>`;
    };

    lista.innerHTML = `
      <div class="card" style="padding:12px 16px">
        ${normais.map(linhaNormal).join("")}
        ${duplicadas.length ? `
          <details style="margin-top:8px">
            <summary style="cursor:pointer;font-size:13px;color:var(--text-secondary);padding:6px 0">${duplicadas.length} ${duplicadas.length === 1 ? "despesa já contada" : "despesas já contadas"} nas dívidas</summary>
            ${duplicadas.map(linhaDup).join("")}
          </details>` : ""}
      </div>`;
    if (window.lucide) lucide.createIcons();
  }

  window.vincularDespesa = (i, dividaId) => {
    if (!orcamento.despesas || !orcamento.despesas[i]) return;
    orcamento.despesas[i].dividaId = dividaId;
    persistirOrcamento();
    renderizarDespesas();
    renderOrcamentoUI();
    renderTudo();
  };

  function renderizarRendasExtras() {
    const lista = document.getElementById("rendas-extras-lista");
    if (!lista) return;
    const extras = orcamento.rendasExtras || [];
    if (extras.length === 0) { lista.innerHTML = ""; return; }
    lista.innerHTML = extras
      .map(
        (r, i) => `
      <div style="display:flex;gap:8px;align-items:center">
        <input type="text" value="${escapeHtml(r.nome)}" placeholder="Descricao"
          style="flex:2;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--input-bg);color:var(--text);font-size:14px"
          onchange="editarRendaExtra(${i},'nome',this.value)">
        <input type="number" value="${escapeHtml(String(r.valor ?? ''))}" placeholder="Valor"
          style="flex:1;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--input-bg);color:var(--text);font-size:14px"
          onchange="editarRendaExtra(${i},'valor',parseFloat(this.value)||0)">
        <button onclick="removerRendaExtra(${i})" style="background:none;border:none;color:var(--danger);cursor:pointer;padding:4px;display:flex">
          <i data-lucide="x" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"></i>
        </button>
      </div>`
      )
      .join("");
    if (window.lucide) lucide.createIcons();
  }

  // monta o seletor "Isso ja esta nas suas dividas?" com as dividas ativas
  function preencherVinculoDespesa() {
    const sel = document.getElementById("despesaVinculo");
    if (!sel) return;
    const ativas = dividasAtivas();
    sel.innerHTML =
      `<option value="">Não, é uma despesa à parte</option>` +
      ativas.map((d) => `<option value="${escapeHtml(d.id)}">Sim — ${escapeHtml(d.nome)}</option>`).join("");
  }

  window.adicionarDespesa = () => {
    document.getElementById("despesaNome").value = "";
    document.getElementById("despesaValor").value = "";
    document.getElementById("despesaCategoria").value = "";
    preencherVinculoDespesa();
    document.getElementById("modalDespesa").style.display = "flex";
    setTimeout(() => document.getElementById("despesaNome").focus(), 100);
  };

  window.confirmarDespesa = () => {
    const nome = document.getElementById("despesaNome").value.trim();
    const valor = parseFloat(document.getElementById("despesaValor").value);
    const categoria = document.getElementById("despesaCategoria").value;
    const dividaId = document.getElementById("despesaVinculo")?.value || "";
    if (!nome || isNaN(valor) || valor <= 0) return;
    const nova = { nome, valor, categoria };
    if (dividaId) nova.dividaId = dividaId;
    (orcamento.despesas = orcamento.despesas || []).push(nova);
    document.getElementById("modalDespesa").style.display = "none";
    persistirOrcamento();
    renderizarDespesas();
    renderOrcamentoUI();
    renderTudo();
  };

  window.removerDespesa = (i) => {
    const desp = orcamento.despesas || [];
    const nome = desp[i]?.nome || "esta despesa";
    if (!confirm(`Excluir "${nome}"?`)) return;
    orcamento.despesas.splice(i, 1);
    persistirOrcamento();
    renderizarDespesas();
    renderOrcamentoUI();
    renderTudo();
  };

  window.adicionarRendaExtra = () => {
    (orcamento.rendasExtras = orcamento.rendasExtras || []).push({ nome: "", valor: 0 });
    renderizarRendasExtras();
  };

  window.editarRendaExtra = (i, campo, valor) => {
    orcamento.rendasExtras[i][campo] = valor;
    persistirOrcamento();
    renderOrcamentoUI();
    renderTudo();
  };

  window.removerRendaExtra = (i) => {
    const extras = orcamento.rendasExtras || [];
    const nome = extras[i]?.nome || "esta renda";
    if (!confirm(`Excluir "${nome}"?`)) return;
    orcamento.rendasExtras.splice(i, 1);
    persistirOrcamento();
    renderizarRendasExtras();
    renderOrcamentoUI();
    renderTudo();
  };

  // ─── Tabs ──────────────────────────────────────────────────────────────────

  // achado 12: atalho para a aba Orcamento a partir da Simulacao
  window.irParaOrcamento = () => {
    const btn = document.getElementById("tab-orcamento");
    if (btn) window.abrirTabAssistente("orcamento", btn);
  };

  window.abrirTabAssistente = (tab, btn) => {
    document.querySelectorAll(".assistente-tab").forEach((b) => {
      b.classList.remove("ativo");
      b.setAttribute("aria-selected", "false");
    });
    document.querySelectorAll(".assistente-painel").forEach((p) => p.classList.remove("ativo"));
    btn.classList.add("ativo");
    btn.setAttribute("aria-selected", "true");
    document.getElementById("painel-" + tab)?.classList.add("ativo");
    if (tab === "simulacao") {
      const el = document.getElementById("simulacao-resultado");
      if (el) {
        el.innerHTML = `
          <div style="text-align:center;padding:24px;color:var(--text-secondary)">
            <div class="spinner" style="width:28px;height:28px;margin:0 auto 8px"></div>
            <div style="font-size:13px">Carregando próximos meses...</div>
          </div>`;
      }
      setTimeout(() => {
        renderSimulacao();
        atualizarSliderMax();
      }, 100);
    }
    if (tab === "orcamento") renderOrcamentoUI();
    if (tab === "visao") renderTudo();
    if (tab === "chat") {
      renderChatPerguntas();
      personalizarSaudacaoChat();
      if (window.lucide) lucide.createIcons();
    }
  };


  // --- Chat IA (Groq via Cloudflare Worker) ---

  // URL fixa: o ID token do usuário só pode ir para o nosso Worker
  const WORKER_URL = 'https://groq-proxy.bahiacruz0.workers.dev';
  let historicoMensagensChat = [];

  try { localStorage.removeItem('groq_worker_url'); } catch (e) {}

  function getWorkerUrl() {
    return WORKER_URL;
  }

  // Chamado no logout/troca de conta: a conversa não pode passar para o próximo usuário
  window.limparChatAssistente = () => {
    historicoMensagensChat = [];
    const c = document.getElementById('chatMensagens');
    if (c) c.innerHTML = '';
  };

  // perguntas prontas geradas dos dados reais, trocadas conforme a situacao
  function gerarPerguntasChat() {
    const perguntas = [];
    const hoje = new Date();
    const proxMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
    const nomeProxMes = proxMes.toLocaleDateString("pt-BR", { month: "long" });
    const sobra = saldoDisponivel();
    const faltaReserva = Math.max(0, (orcamento.metaReserva || 0) - (orcamento.reservaAtual || 0));
    const fim = ultimaParcelaPendente();

    perguntas.push(`Como me organizar para ${nomeProxMes}?`);
    if (faltaReserva > 0) perguntas.push("Quanto guardar para completar a reserva?");
    if (sobra > 0) perguntas.push("O que fazer com a minha folga do mês?");
    if (fim) perguntas.push("Como me preparo para quando as parcelas acabarem?");
    if (perguntas.length < 3) perguntas.push("Como montar minha reserva de emergência?");
    return perguntas.slice(0, 4);
  }

  function renderChatPerguntas() {
    const el = document.getElementById("chatPerguntas");
    if (!el) return;
    el.innerHTML = gerarPerguntasChat()
      .map(
        (q) =>
          `<button class="chip" type="button" onclick="window.enviarPerguntaChip('${q.replace(/'/g, "\\'")}')">${escapeHtml(q)}</button>`,
      )
      .join("");
  }

  function personalizarSaudacaoChat() {
    const el = document.getElementById("chatSaudacao");
    if (!el) return;
    const u = window.getCurrentUser && window.getCurrentUser();
    const nome = u && u.displayName ? u.displayName.trim().split(/\s+/)[0] : "";
    const parc = totalParcelas();
    const saud = nome ? `Oi, ${escapeHtml(nome)}! ` : "Oi! ";
    const vi = parc > 0 ? `Vi suas ${parc} parcelas e sua renda. ` : "";
    el.innerHTML = `${saud}${vi}Em que posso ajudar?`;
  }

  function coletarContextoFinanceiro() {
    const renda = totalRenda();
    const despesas = totalDespesasFixas();
    const dividas = totalDividasPendentes();
    const parcelas = parcelaMensalTotal();
    const saldo = saldoDisponivel();
    const gasto = gastoHoje();

    const fmt = (v) => typeof window.formatarMoeda === 'function'
      ? window.formatarMoeda(v)
      : 'R$ ' + v.toFixed(2);

    const listaDiv = (window.getDividas ? window.getDividas() : [])
      .filter(d => d.status !== 'paga')
      .slice(0, 8)
      .map(d => {
        const nome = d.nome || d.descricao || 'Divida';
        const val = fmt(d.valorTotal || d.valor || 0);
        const parc = d.parcelas ? ' -- ' + d.parcelas + 'x' : '';
        return '* ' + nome + ': ' + val + parc;
      })
      .join('\n');

    return [
      'Contexto financeiro do usuario:',
      '- Renda mensal total: ' + fmt(renda),
      '- Despesas fixas: ' + fmt(despesas),
      '- Total em dividas pendentes: ' + fmt(dividas),
      '- Parcelas mensais: ' + fmt(parcelas),
      '- Saldo disponivel estimado: ' + fmt(saldo),
      '- Gasto hoje: ' + fmt(gasto),
      '',
      'Dividas em aberto:',
      listaDiv || 'Nenhuma divida cadastrada.'
    ].join('\n');
  }

  function rolarChatParaFim() {
    const c = document.getElementById('chatMensagens');
    if (c) c.scrollTop = c.scrollHeight;
  }

  function adicionarMensagemNaTela(texto, autor) {
    const container = document.getElementById('chatMensagens');
    if (!container) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'chat-mensagem ' + autor;

    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.innerHTML = autor === 'assistente'
      ? '<i data-lucide="bot" class="icon icon-sm"></i>'
      : '<i data-lucide="user" class="icon icon-sm"></i>';

    const balao = document.createElement('div');
    balao.className = 'chat-balao';
    balao.innerHTML = escapeHtml(texto)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

    wrapper.appendChild(avatar);
    wrapper.appendChild(balao);
    container.appendChild(wrapper);

    if (window.lucide) lucide.createIcons({ nodes: [avatar] });
    rolarChatParaFim();
    return balao;
  }

  // Firebase ID token para o Worker: SDK web, ou o login nativo do app Android
  async function obterIdToken() {
    const u = window.firebase && firebase.auth().currentUser;
    if (u) return u.getIdToken();
    if (window.Android && typeof Android.getIdToken === 'function') {
      return Android.getIdToken() || null;
    }
    return null;
  }

  window.enviarPerguntaChip = (texto) => {
    const input = document.getElementById('chatInput');
    if (input) { input.value = texto; input.focus(); }
    window.enviarMensagemChat();
  };

  window.enviarMensagemChat = async () => {
    const workerUrl = getWorkerUrl();
    const input = document.getElementById('chatInput');
    const btnEnviar = document.getElementById('btnEnviarChat');
    if (!input) return;

    const mensagem = input.value.trim();
    if (!mensagem) return;

    adicionarMensagemNaTela(mensagem, 'usuario');
    input.value = '';
    if (btnEnviar) btnEnviar.disabled = true;

    historicoMensagensChat.push({ role: 'user', content: mensagem });

    // Indicador de digitacao
    const container = document.getElementById('chatMensagens');
    const typing = document.createElement('div');
    typing.className = 'chat-mensagem assistente chat-typing';
    const dot = '<span style="width:7px;height:7px;border-radius:50%;background:var(--text-secondary);display:inline-block"></span>';
    typing.innerHTML =
      '<div class="chat-avatar"><i data-lucide="bot" class="icon icon-sm"></i></div>' +
      '<div class="chat-balao" style="display:flex;gap:5px;align-items:center">' + dot + dot + dot + '</div>';
    if (container) container.appendChild(typing);
    if (window.lucide) lucide.createIcons({ nodes: [typing] });
    rolarChatParaFim();

    try {
      const idToken = await obterIdToken();
      if (!idToken) throw new Error('Faca login novamente para usar o assistente.');

      const contexto = coletarContextoFinanceiro();
      const resp = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + idToken,
        },
        body: JSON.stringify({
          contexto: contexto,
          historico: historicoMensagensChat.slice(-10),
        }),
      });

      if (container && typing.parentNode === container) container.removeChild(typing);

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error || 'HTTP ' + resp.status);
      }

      const data = await resp.json();
      const resposta = data.resposta || data.content || 'Nao obtive resposta.';
      adicionarMensagemNaTela(resposta, 'assistente');
      historicoMensagensChat.push({ role: 'assistant', content: resposta });

    } catch (err) {
      if (container && typing.parentNode === container) container.removeChild(typing);
      adicionarMensagemNaTela(
        'Erro ao conectar: ' + err.message + '\n\nVerifique a URL do Worker.',
        'assistente'
      );
      console.error('[Chat IA]', err);
    } finally {
      if (btnEnviar) btnEnviar.disabled = false;
      if (input) input.focus();
    }
  };

  // ─── Entry point ───────────────────────────────────────────────────────────

  function renderTudo() {
    renderSobraMes();
    renderFimParcelas();
    renderPlanoAcao();
    renderGastoDia();
    renderReserva();
    renderIndicadores();
    renderInsights();
  }

  window.iniciarAssistente = async () => {
    await carregarOrcamento();
    carregarPreferenciaNotificacao();
    renderTudo();
    renderChatPerguntas();
    personalizarSaudacaoChat();
  };
})();
