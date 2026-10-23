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

  function totalDespesasFixas() {
    return (orcamento.despesas || []).reduce((s, d) => s + (d.valor || 0), 0);
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

  // parcela mensal media pendente (proxima de cada divida)
  function parcelaMensalTotal() {
    const _div3 = window.getDividas ? window.getDividas() : [];
    return _div3.reduce((s, d) => {
      const p = (d.parcelas || []).find((p) => p.status === "pendente");
      return s + (p ? p.valor || 0 : 0);
    }, 0);
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

  // meses para quitar todas as dividas com o ritmo atual
  function mesesParaQuitacao(extraMensal = 0) {
    const disponivel = Math.max(0, saldoDisponivel()) + extraMensal;
    const total = totalDividasPendentes();
    if (disponivel <= 0 || total <= 0) return null;
    return Math.ceil(total / disponivel);
  }

  // projecao de saldo para os proximos N meses
  function projecao(meses = 6) {
    const hoje = new Date();
    const resultado = [];
    let saldoAcumulado = orcamento.reservaAtual || 0;
    for (let i = 0; i < meses; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i + 1, 1);
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      saldoAcumulado += Math.max(0, saldoDisponivel());
      resultado.push({ label, valor: saldoAcumulado });
    }
    return resultado;
  }

  function previsaoFimMes() {
    const hoje = new Date();
    const diaAtual = hoje.getDate();
    const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const diasPassados = diaAtual - 1;
    const gastoDiario = gastoHoje();
    const gastado = gastoDiario * diasPassados;
    const restante = saldoAposEconomia() - gastado;
    return { gastado, restante, percentual: Math.round((gastado / Math.max(1, saldoAposEconomia())) * 100) };
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
          <div class="indicador-sub">sem comprometer o orcamento</div>
        </div>
      </div>

      <div class="indicador-card">
        <div class="indicador-label">Saldo livre/mes</div>
        <div class="indicador-valor" style="color:${saldo >= 0 ? "var(--success)" : "var(--danger)"}">${formatarMoeda(saldo)}</div>
        <div class="indicador-sub">apos despesas e dividas</div>
      </div>

      <div class="indicador-card">
        <div class="indicador-label">Renda total</div>
        <div class="indicador-valor">${formatarMoeda(renda)}</div>
        <div class="indicador-sub">${pct}% comprometido</div>
      </div>

      <div class="indicador-card">
        <div class="indicador-label">Despesas fixas</div>
        <div class="indicador-valor" style="color:var(--warning)">${formatarMoeda(desp)}</div>
        <div class="indicador-sub">${(orcamento.despesas || []).length} categorias</div>
      </div>

      <div class="indicador-card">
        <div class="indicador-label">Parcelas/mes</div>
        <div class="indicador-valor" style="color:var(--danger)">${formatarMoeda(parc)}</div>
        <div class="indicador-sub">${totalParcelas()} pendentes no total</div>
      </div>

      <div class="indicador-card">
        <div class="indicador-label">Meta economia</div>
        <div class="indicador-valor" style="color:var(--primary)">${formatarMoeda(orcamento.metaEconomia || 0)}</div>
        <div class="indicador-sub">por mes</div>
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
      acoes.push({ icone: "shield-check", titulo: "Faça um aporte para a reserva", texto: `Separe cerca de ${formatarMoeda(aporte)} este mês antes de buscar maior rentabilidade.`, urgente: false });
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
    el.innerHTML = gerarPlanoAcao().map((acao) => `
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
        ${meses ? ` &bull; Previsao: <strong>${meses} meses</strong>` : ""}
      </div>
    `;
  }

  // ─── Insights da IA (geracao local, sem API) ───────────────────────────────

  function gerarInsights() {
    const insights = [];
    const saldo = saldoDisponivel();
    const renda = totalRenda();
    const desp = totalDespesasFixas();
    const parc = parcelaMensalTotal();
    const comprometido = desp + parc;
    const pct = renda > 0 ? (comprometido / renda) * 100 : 0;
    const meses = mesesParaQuitacao();

    if (renda === 0) {
      insights.push({
        tipo: "info",
        icone: "info",
        titulo: "Configure sua renda",
        texto: "Acesse a aba Orcamento e informe sua renda mensal para receber insights personalizados.",
      });
    } else {
      if (pct > 80) {
        insights.push({
          tipo: "alerta",
          icone: "alert-triangle",
          titulo: "Alto comprometimento de renda",
          texto: `${Math.round(pct)}% da sua renda ja esta comprometida com despesas fixas e parcelas. Risco de orcamento negativo.`,
        });
      } else if (pct > 60) {
        insights.push({
          tipo: "info",
          icone: "info",
          titulo: "Atencao ao comprometimento",
          texto: `${Math.round(pct)}% da sua renda comprometida. Tente manter abaixo de 60% para ter folga financeira.`,
        });
      }

      if (saldo < 0) {
        insights.push({
          tipo: "alerta",
          icone: "alert-circle",
          titulo: "Orcamento negativo",
          texto: `Suas despesas e parcelas superam sua renda em ${formatarMoeda(Math.abs(saldo))}. E necessario cortar gastos imediatamente.`,
        });
      } else if (saldo < renda * 0.1) {
        insights.push({
          tipo: "alerta",
          icone: "alert-triangle",
          titulo: "Margem muito pequena",
          texto: `Voce tem apenas ${formatarMoeda(saldo)} de saldo livre. Qualquer gasto imprevisto pode comprometer o mes.`,
        });
      }

      if (meses !== null) {
        if (meses <= 3) {
          insights.push({
            tipo: "meta",
            icone: "trophy",
            titulo: "Proximo de quitar as dividas",
            texto: `Mantendo o ritmo atual, voce quita todas as dividas em aproximadamente ${meses} mes(es). Otimo momento para acelerar!`,
          });
        } else if (meses <= 12) {
          insights.push({
            tipo: "dica",
            icone: "trending-up",
            titulo: `${meses} meses para zerar as dividas`,
            texto: `Adicionar ${formatarMoeda(parcelaMensalTotal() * 0.2)} a mais nas parcelas pode reduzir esse prazo em ate 20%.`,
          });
        } else {
          insights.push({
            tipo: "info",
            icone: "clock",
            titulo: `Prazo estimado: ${meses} meses`,
            texto: `Considere usar a estrategia avalanche: pague primeiro a divida com maior juros para economizar no longo prazo.`,
          });
        }
      }

      const economia = orcamento.metaEconomia || 0;
      if (economia === 0 && saldo > 0) {
        insights.push({
          tipo: "dica",
          icone: "piggy-bank",
          titulo: "Defina uma meta de economia",
          texto: `Voce tem ${formatarMoeda(saldo)} de saldo livre. Estabelecer uma meta mensal garante progresso consistente.`,
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
          const nomes = {
            cartao: "Cartao de credito",
            emprestimo: "Emprestimos",
            boleto: "Boletos",
            assinatura: "Assinaturas",
            outros: "Outros",
          };
          insights.push({
            tipo: "info",
            icone: "pie-chart",
            titulo: `${nomes[top[0]] || top[0]} e a maior categoria`,
            texto: `${formatarMoeda(top[1])} concentrados nessa categoria. Considere renegociar ou eliminar primeiro.`,
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
              callback: (v) =>
                "R$ " +
                Math.round(v / 1000) +
                (v >= 1000 || v <= -1000 ? "k" : ""),
            },
          },
        },
      },
    });
  }

  // ─── Simulacao ─────────────────────────────────────────────────────────────

  let estrategiaAtual = "avalanche";

  window.selecionarEstrategia = (tipo, btn) => {
    estrategiaAtual = tipo;
    document.querySelectorAll("#btn-avalanche, #btn-bola").forEach((b) => b.classList.remove("ativo"));
    btn.classList.add("ativo");
    renderEstrategia();
  };

  // ordena dividas pela estrategia escolhida
  function dividasOrdenadas(tipo) {
    const divs = (window.getDividas ? window.getDividas() : []).filter(
      (d) => d.parcelas?.some((p) => p.status === "pendente")
    );
    if (tipo === "avalanche") {
      // maior valor total pendente primeiro (proxy de maior impacto financeiro)
      return [...divs].sort((a, b) => {
        const va = a.parcelas.filter((p) => p.status === "pendente").reduce((s, p) => s + (p.valor || 0), 0);
        const vb = b.parcelas.filter((p) => p.status === "pendente").reduce((s, p) => s + (p.valor || 0), 0);
        return vb - va;
      });
    } else {
      // menor valor total pendente primeiro (bola de neve)
      return [...divs].sort((a, b) => {
        const va = a.parcelas.filter((p) => p.status === "pendente").reduce((s, p) => s + (p.valor || 0), 0);
        const vb = b.parcelas.filter((p) => p.status === "pendente").reduce((s, p) => s + (p.valor || 0), 0);
        return va - vb;
      });
    }
  }

  function renderSimulacao() {
    const total = totalDividasPendentes();
    const disp = saldoDisponivel();
    const meses = mesesParaQuitacao(0);
    const el = document.getElementById("simulacao-resultado");
    if (!el) return;

    const renda = totalRenda();
    if (total === 0 && renda === 0) {
      el.innerHTML = `
        <div style="text-align:center;padding:24px 16px;color:var(--text-secondary)">
          <i data-lucide="calculator" style="width:40px;height:40px;stroke:currentColor;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;margin-bottom:8px;opacity:.4"></i>
          <div style="font-weight:700;font-size:15px;color:var(--text);margin-bottom:4px">Simulacao indisponivel</div>
          <div style="font-size:13px;line-height:1.5">
            Para ver a simulacao, preencha:<br>
            <strong>1.</strong> Sua renda mensal na aba Orcamento<br>
            <strong>2.</strong> Pelo menos uma divida ativa
          </div>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    if (total === 0) {
      el.innerHTML = `
        <div style="text-align:center;padding:20px;color:var(--success)">
          <i data-lucide="party-popper" style="width:40px;height:40px;stroke:currentColor;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;margin-bottom:8px"></i>
          <div style="font-weight:700;font-size:16px">Sem dividas pendentes!</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">Continue assim!</div>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const dataQuitacao = new Date();
    dataQuitacao.setMonth(dataQuitacao.getMonth() + (meses || 0));
    const pct = disp > 0 ? Math.min(100, Math.round((disp / Math.max(1, total)) * 100 * (meses || 1) / (meses || 1))) : 0;

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="indicador-card">
          <div class="indicador-label">Total pendente</div>
          <div class="indicador-valor" style="font-size:16px;color:var(--danger)">${formatarMoeda(total)}</div>
        </div>
        <div class="indicador-card">
          <div class="indicador-label">Disponivel/mes</div>
          <div class="indicador-valor" style="font-size:16px;color:${disp >= 0 ? "var(--success)" : "var(--danger)"}">${formatarMoeda(disp)}</div>
        </div>
        <div class="indicador-card ${meses && meses <= 6 ? "positivo" : meses && meses <= 18 ? "" : "alerta"}">
          <div class="indicador-label">Prazo estimado</div>
          <div class="indicador-valor" style="font-size:16px">${meses ? meses + " meses" : "—"}</div>
        </div>
        <div class="indicador-card">
          <div class="indicador-label">Previsao quitacao</div>
          <div class="indicador-valor" style="font-size:13px;font-weight:700">${meses ? dataQuitacao.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : "—"}</div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();

    renderRanking();
    renderEstrategia();
    renderSimulacaoExtra(0);
    renderPrevisaoMes();
  }

  function renderRanking() {
    const el = document.getElementById("simulacao-ranking");
    if (!el) return;
    const divs = window.getDividas ? window.getDividas() : [];
    if (!divs.length) { el.innerHTML = ""; return; }

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

  function renderEstrategia() {
    const el = document.getElementById("simulacao-estrategia");
    if (!el) return;
    const ord = dividasOrdenadas(estrategiaAtual);
    if (!ord.length) {
      el.innerHTML = `<p style="color:var(--text-secondary);font-size:13px">Nenhuma divida pendente.</p>`;
      return;
    }

    const descricao = estrategiaAtual === "avalanche"
      ? "Pague primeiro as dividas de maior valor — reduz o montante total mais rapido."
      : "Pague primeiro as dividas menores — elimina contas rapido e da motivacao.";

    el.innerHTML = `
      <div class="insight-card tipo-info" style="margin-bottom:12px">
        <div class="insight-icone"><i data-lucide="info" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"></i></div>
        <div class="insight-texto">${descricao}</div>
      </div>
      ${ord.map((d, i) => {
        const pendVal = (d.parcelas || []).filter((p) => p.status === "pendente").reduce((s, p) => s + (p.valor || 0), 0);
        const proxima = (d.parcelas || []).find((p) => p.status === "pendente");
        return `
          <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border-light)">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--gradient);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0">${i + 1}</div>
            <div style="flex:1">
              <div style="font-weight:700">${escapeHtml(d.nome)}</div>
              ${proxima ? `<div style="font-size:12px;color:var(--text-secondary)">Proxima: ${new Date(proxima.vencimento + "T00:00:00").toLocaleDateString("pt-BR")}</div>` : ""}
            </div>
            <div style="font-weight:700;color:var(--danger)">${formatarMoeda(pendVal)}</div>
          </div>`;
      }).join("")}`;
    if (window.lucide) lucide.createIcons();
  }

  window.recalcularSimulacao = (extra = 0) => {
    renderSimulacaoExtra(parseFloat(extra) || 0);
  };

  function atualizarSliderMax() {
    const slider = document.getElementById("extraQuitacaoSlider");
    if (!slider) return;
    const total = totalDividasPendentes();
    const novoMax = Math.max(2000, Math.ceil(total / 6 / 50) * 50);
    slider.max = novoMax;
    const labelMax = slider.parentElement?.querySelector("span:last-child");
    if (labelMax) labelMax.textContent = formatarMoeda(novoMax);
  }

  function renderSimulacaoExtra(extra) {
    const el = document.getElementById("simulacao-extra");
    if (!el) return;
    if (!extra || extra <= 0) {
      el.innerHTML = `<p style="color:var(--text-secondary);font-size:13px;text-align:center">Mova o slider para ver o impacto de um pagamento extra.</p>`;
      return;
    }
    const mesesSem = mesesParaQuitacao(0);
    const mesesCom = mesesParaQuitacao(extra);
    const ganho = (mesesSem || 0) - (mesesCom || 0);
    const economia = extra * ganho;

    el.innerHTML = `
      <div class="card" style="padding:14px">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px">
          <span style="color:var(--text-secondary)">Sem extra</span>
          <strong>${mesesSem ? mesesSem + " meses" : "—"}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:14px">
          <span style="color:var(--text-secondary)">Com + ${formatarMoeda(extra)}/mes</span>
          <strong style="color:var(--success)">${mesesCom ? mesesCom + " meses" : "—"}</strong>
        </div>
        ${ganho > 0 ? `
          <div style="background:var(--success-soft);border-radius:10px;padding:12px;text-align:center">
            <div style="color:var(--success);font-weight:700;font-size:15px">-${ganho} meses de divida</div>
            ${economia > 0 ? `<div style="color:var(--text-secondary);font-size:12px;margin-top:4px">Economia de ~${formatarMoeda(economia)} em juros e tempo</div>` : ""}
          </div>` : `<div style="color:var(--text-secondary);font-size:13px;text-align:center">Aumente o valor para ver impacto significativo.</div>`}
      </div>`;
  }

  function renderPrevisaoMes() {
    const el = document.getElementById("previsao-mes");
    if (!el) return;
    const { gastado, restante, percentual } = previsaoFimMes();
    const hoje = new Date();
    const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const diasRestantes = diasNoMes - hoje.getDate();
    const ritmo = gastoHoje();
    const negativo = restante < 0;

    el.innerHTML = `
      <div style="margin-bottom:12px">
        <div class="progresso-label">
          <span>Consumido este mes</span>
          <span style="color:${percentual > 80 || negativo ? "var(--danger)" : "var(--text-secondary)"}">${percentual}%</span>
        </div>
        <div class="progresso-barra">
          <div class="progresso-preenchimento" style="width:${Math.min(100, percentual)}%;background:${percentual > 80 || negativo ? "var(--danger)" : "var(--gradient)"}"></div>
        </div>
      </div>
      ${negativo ? `
        <div style="background:var(--danger-soft);border:1px solid color-mix(in srgb, var(--danger) 25%, transparent);border-radius:10px;padding:10px 12px;margin-bottom:10px;display:flex;align-items:center;gap:8px;font-size:13px;color:var(--danger);font-weight:600">
          <i data-lucide="alert-triangle" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0"></i>
          Saldo negativo no mes! Reveja suas despesas.
        </div>` : ""}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="indicador-card">
          <div class="indicador-label">Gastado</div>
          <div class="indicador-valor" style="font-size:15px;color:var(--warning)">${formatarMoeda(gastado)}</div>
        </div>
        <div class="indicador-card ${restante >= 0 ? "positivo" : "alerta"}">
          <div class="indicador-label">Restante</div>
          <div class="indicador-valor" style="font-size:15px;color:${restante >= 0 ? "var(--success)" : "var(--danger)"}">${formatarMoeda(restante)}</div>
        </div>
        <div class="indicador-card">
          <div class="indicador-label">Ritmo diario</div>
          <div class="indicador-valor" style="font-size:15px">${formatarMoeda(ritmo)}</div>
        </div>
        <div class="indicador-card">
          <div class="indicador-label">Dias restantes</div>
          <div class="indicador-valor" style="font-size:15px">${diasRestantes}</div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
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
    debounceSalvar();
  };

  function renderizarDespesas() {
    const lista = document.getElementById("despesas-lista");
    if (!lista) return;
    const desp = orcamento.despesas || [];
    if (desp.length === 0) {
      lista.innerHTML = `<p style="color:var(--text-secondary);font-size:13px;padding:8px 0">Nenhuma despesa cadastrada.</p>`;
      return;
    }
    lista.innerHTML = `
      <div class="card" style="padding:12px 16px">
        ${desp
          .map(
            (d, i) => `
          <div class="despesa-item">
            <div>
              <div class="despesa-nome">${escapeHtml(d.nome)}</div>
              <div class="despesa-cat">${escapeHtml(d.categoria || "")}</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <span class="despesa-valor">${formatarMoeda(d.valor)}</span>
              <button onclick="removerDespesa(${i})" style="background:none;border:none;color:var(--danger);cursor:pointer;padding:4px;display:flex">
                <i data-lucide="x" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"></i>
              </button>
            </div>
          </div>`
          )
          .join("")}
      </div>`;
    if (window.lucide) lucide.createIcons();
  }

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

  window.adicionarDespesa = () => {
    document.getElementById("despesaNome").value = "";
    document.getElementById("despesaValor").value = "";
    document.getElementById("despesaCategoria").value = "";
    document.getElementById("modalDespesa").style.display = "flex";
    setTimeout(() => document.getElementById("despesaNome").focus(), 100);
  };

  window.confirmarDespesa = () => {
    const nome = document.getElementById("despesaNome").value.trim();
    const valor = parseFloat(document.getElementById("despesaValor").value);
    const categoria = document.getElementById("despesaCategoria").value;
    if (!nome || isNaN(valor) || valor <= 0) return;
    (orcamento.despesas = orcamento.despesas || []).push({ nome, valor, categoria });
    document.getElementById("modalDespesa").style.display = "none";
    persistirOrcamento();
    renderizarDespesas();
    renderTudo();
  };

  window.removerDespesa = (i) => {
    const desp = orcamento.despesas || [];
    const nome = desp[i]?.nome || "esta despesa";
    if (!confirm(`Excluir "${nome}"?`)) return;
    orcamento.despesas.splice(i, 1);
    persistirOrcamento();
    renderizarDespesas();
    renderTudo();
  };

  window.adicionarRendaExtra = () => {
    (orcamento.rendasExtras = orcamento.rendasExtras || []).push({ nome: "", valor: 0 });
    renderizarRendasExtras();
  };

  window.editarRendaExtra = (i, campo, valor) => {
    orcamento.rendasExtras[i][campo] = valor;
    persistirOrcamento();
    renderTudo();
  };

  window.removerRendaExtra = (i) => {
    const extras = orcamento.rendasExtras || [];
    const nome = extras[i]?.nome || "esta renda";
    if (!confirm(`Excluir "${nome}"?`)) return;
    orcamento.rendasExtras.splice(i, 1);
    persistirOrcamento();
    renderizarRendasExtras();
    renderTudo();
  };

  // ─── Tabs ──────────────────────────────────────────────────────────────────

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
            <div style="font-size:13px">Carregando simulacao...</div>
          </div>`;
      }
      setTimeout(() => {
        renderSimulacao();
        atualizarSliderMax();
      }, 100);
    }
    if (tab === "visao") renderTudo();
    if (tab === "chat" && window.lucide) lucide.createIcons();
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
    renderIndicadores();
    renderPlanoAcao();
    renderReserva();
    renderInsights();
    const detalhes = document.querySelector(".assistente-detalhes");
    if (detalhes && !detalhes.dataset.graficoListener) {
      detalhes.addEventListener("toggle", () => {
        if (detalhes.open) renderGraficoProjecao();
      });
      detalhes.dataset.graficoListener = "true";
    }
    if (detalhes?.open) renderGraficoProjecao();
  }

  window.iniciarAssistente = async () => {
    await carregarOrcamento();
    carregarPreferenciaNotificacao();
    renderTudo();
  };
})();
