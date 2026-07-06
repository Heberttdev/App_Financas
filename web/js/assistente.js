// Assistente Financeiro Inteligente
// Depende de: firebase (db, currentUser), dividas, formatarMoeda definidos em app.js

(function () {
  let orcamento = {
    rendaMensal: 0,
    rendasExtras: [],
    despesas: [],
    metaEconomia: 0,
    metaReserva: 0,
    reservaAtual: 0,
  };

  let graficoProjecaoInstance = null;

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
    document.getElementById("assistente-insights").innerHTML = insights
      .map(
        (i) => `
      <div class="insight-card tipo-${i.tipo}">
        <div class="insight-icone">
          <i data-lucide="${i.icone}" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"></i>
        </div>
        <div class="insight-texto">
          <strong>${i.titulo}</strong>${i.texto}
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
    graficoProjecaoInstance = new Chart(canvas, {
      type: "line",
      data: {
        labels: dados.map((d) => d.label),
        datasets: [
          {
            label: "Saldo acumulado",
            data: dados.map((d) => d.valor),
            borderColor: "#6c7bff",
            backgroundColor: "rgba(108,123,255,0.1)",
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: "#6c7bff",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
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

  function renderSimulacao() {
    const meses = mesesParaQuitacao(0);
    const total = totalDividasPendentes();
    const disp = saldoDisponivel();

    const el = document.getElementById("simulacao-resultado");
    if (!el) return;

    if (total === 0) {
      el.innerHTML = `<p style="color:var(--success);font-weight:700">Nenhuma divida pendente!</p>`;
      return;
    }
    if (disp <= 0) {
      el.innerHTML = `<p style="color:var(--danger)">Saldo disponivel negativo. Nao e possivel simular quitacao.</p>`;
      return;
    }

    const dataQuitacao = new Date();
    dataQuitacao.setMonth(dataQuitacao.getMonth() + (meses || 0));

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--text-secondary);font-size:13px">Total pendente</span>
          <strong style="color:var(--danger)">${formatarMoeda(total)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--text-secondary);font-size:13px">Disponivel/mes para dividas</span>
          <strong>${formatarMoeda(disp)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--text-secondary);font-size:13px">Prazo estimado</span>
          <strong style="color:var(--primary)">${meses ? meses + " meses" : "-"}</strong>
        </div>
        ${
          meses
            ? `<div style="display:flex;justify-content:space-between">
          <span style="color:var(--text-secondary);font-size:13px">Previsao de quitacao</span>
          <strong>${dataQuitacao.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</strong>
        </div>`
            : ""
        }
      </div>`;

    renderSimulacaoExtra();
    renderPrevisaoMes();
  }

  window.recalcularSimulacao = () => {
    renderSimulacaoExtra();
  };

  function renderSimulacaoExtra() {
    const el = document.getElementById("simulacao-extra");
    if (!el) return;
    const extra = parseFloat(document.getElementById("extraQuitacao")?.value) || 0;
    if (extra <= 0) {
      el.innerHTML = `<p style="color:var(--text-secondary);font-size:13px">Informe um valor extra acima para ver o impacto.</p>`;
      return;
    }
    const mesesSem = mesesParaQuitacao(0);
    const mesesCom = mesesParaQuitacao(extra);
    const ganho = (mesesSem || 0) - (mesesCom || 0);
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;justify-content:space-between;font-size:14px">
          <span style="color:var(--text-secondary)">Sem extra</span>
          <strong>${mesesSem ? mesesSem + " meses" : "-"}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:14px">
          <span style="color:var(--text-secondary)">Com extra de ${formatarMoeda(extra)}/mes</span>
          <strong style="color:var(--success)">${mesesCom ? mesesCom + " meses" : "-"}</strong>
        </div>
        ${ganho > 0 ? `<div style="background:rgba(34,197,94,.12);border-radius:10px;padding:10px;text-align:center;color:var(--success);font-weight:700">Voce eliminaria ${ganho} mes(es) de divida!</div>` : ""}
      </div>`;
  }

  function renderPrevisaoMes() {
    const el = document.getElementById("previsao-mes");
    if (!el) return;
    const { gastado, restante, percentual } = previsaoFimMes();
    el.innerHTML = `
      <div style="margin-bottom:10px">
        <div class="progresso-label">
          <span>Gasto ate hoje</span>
          <span>${percentual}%</span>
        </div>
        <div class="progresso-barra">
          <div class="progresso-preenchimento" style="width:${Math.min(100, percentual)}%;background:${percentual > 80 ? "var(--danger)" : "var(--gradient)"}"></div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:14px">
        <span style="color:var(--text-secondary)">Gastado este mes</span>
        <strong style="color:var(--warning)">${formatarMoeda(gastado)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:14px;margin-top:6px">
        <span style="color:var(--text-secondary)">Restante ate fim do mes</span>
        <strong style="color:${restante >= 0 ? "var(--success)" : "var(--danger)"}">${formatarMoeda(restante)}</strong>
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

  window.salvarOrcamento = () => {
    orcamento.rendaMensal = parseFloat(document.getElementById("rendaMensal")?.value) || 0;
    orcamento.metaEconomia = parseFloat(document.getElementById("metaEconomia")?.value) || 0;
    orcamento.metaReserva = parseFloat(document.getElementById("metaReserva")?.value) || 0;
    orcamento.reservaAtual = parseFloat(document.getElementById("reservaAtual")?.value) || 0;
    persistirOrcamento();
    renderTudo();
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
              <div class="despesa-nome">${d.nome}</div>
              <div class="despesa-cat">${d.categoria || ""}</div>
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
        <input type="text" value="${r.nome}" placeholder="Descricao"
          style="flex:2;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--input-bg);color:var(--text);font-size:14px"
          onchange="editarRendaExtra(${i},'nome',this.value)">
        <input type="number" value="${r.valor}" placeholder="Valor"
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
    orcamento.rendasExtras.splice(i, 1);
    persistirOrcamento();
    renderizarRendasExtras();
    renderTudo();
  };

  // ─── Tabs ──────────────────────────────────────────────────────────────────

  window.abrirTabAssistente = (tab, btn) => {
    document.querySelectorAll(".assistente-tab").forEach((b) => b.classList.remove("ativo"));
    document.querySelectorAll(".assistente-painel").forEach((p) => p.classList.remove("ativo"));
    btn.classList.add("ativo");
    document.getElementById("painel-" + tab)?.classList.add("ativo");
    if (tab === "simulacao") renderSimulacao();
  };

  // ─── Entry point ───────────────────────────────────────────────────────────

  function renderTudo() {
    renderIndicadores();
    renderReserva();
    renderInsights();
    renderGraficoProjecao();
  }

  window.iniciarAssistente = async () => {
    await carregarOrcamento();
    renderTudo();
  };
})();