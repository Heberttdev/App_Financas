# Gerenciador de Dívidas — Auditoria UX/UI

Oct 27, 2026 · @Gatinhos da T.I

O app é bem construído na base (contraste, alvos de toque, abas acessíveis), mas tem dois defeitos que mexem com o dinheiro do usuário: editar uma dívida apaga o histórico de pagamentos, e o Assistente conta cinco contas duas vezes e mostra déficit onde há sobra.

## Escopo e método

- **App:** [financas-f371a.web.app](https://financas-f371a.web.app/), conta já logada (Hebert Carlos), dados reais: 27 dívidas, 82 parcelas.
- **Telas:** Dashboard, Dívidas (filtros, busca, card expandido), Nova Dívida, Assistente (Visão Geral, Orçamento, Simulação, Chat IA), Relatórios, Configurações.
- **Viewports:** 1358×602 (notebook) e 386×596 (celular, via iframe do mesmo app). Temas escuro e claro.
- **Medição:** contraste WCAG por elemento, alvos de toque, nomes acessíveis, foco por Tab real, leitura de todo o texto visível e do código público `app.js` e `assistente.js` para achar a origem de cada número.
- **Somente leitura.** Nada foi pago, reaberto, editado ou excluído. O bug de edição (achado 01) foi confirmado no código, não reproduzido, para não apagar seus pagamentos.
- **Não verificado:** o app Android, as respostas do Chat IA, e se os lembretes funcionam no navegador.

## Resumo

| Severidade | Achados | O que significa |
| --- | --- | --- |
| Crítico | 2 | Perde dados ou dá um número financeiro errado |
| Maior | 12 | A tarefa sai, mas com confusão ou desconfiança |
| Acessibilidade | 9 | Falha medida contra um critério WCAG 2.2 |
| Nota | 6 | Texto, acentos e consistência de nomes |

O que já está bom: zero falhas de contraste no tema escuro em 330 textos medidos, alvos de toque com 44 px de altura quase em todo lugar, abas do Assistente com ARIA correto, validação por campo no formulário e um "Desfazer" depois de excluir. A maior parte do trabalho é de lógica e texto, não de redesenho.

## Críticos

### 01 · Editar uma dívida apaga o histórico de pagamentos

Corrigir só o nome de "Pensão" (5 de 7 pagas) e salvar zera as 5 parcelas pagas e as datas de pagamento. O usuário perde o registro sem aviso nenhum.

Ao abrir a edição, o campo Status recebe "Pago" só se *todas* as parcelas estiverem pagas; senão "Pendente". Ao salvar, `adicionarDivida` recria a lista de parcelas do zero com esse status único e grava por cima da antiga.

```
editarDivida:   statusDivida = parcelas.every(p => p.status == "pago") ? "pago" : "pendente"
adicionarDivida: for (i < np) ps.push({ id: Date.now()+"_"+i, status: st, pagoEm: st=="pago" ? agora : null })
                 dividas[idx] = { ...dividas[idx], ..., parcelas: ps }
```

**Correção:** na edição, preservar `status` e `pagoEm` de cada parcela existente pelo número; só gerar parcelas novas quando o número aumentar. Esconder o campo Status ao editar. Testar numa dívida descartável antes de liberar.

### 02 · O Assistente conta cinco contas duas vezes e mostra um déficit que não existe

Escola, Reforço, Aluguel, Luz e Internet estão cadastradas como dívida *e* como despesa fixa. O Assistente soma as duas, diz que o mês fecha em -R$ 37,32, "102% comprometido" e "Pode gastar hoje R$ 0,00". Sem a duplicação a sobra é cerca de R$ 823,68.

| Conta | Despesa fixa | Parcela de novembro |
| --- | --- | --- |
| Escola / Escola de Anthony | R$ 520,00 | R$ 520,00 |
| Reforço | R$ 85,00 | R$ 85,00 |
| Aluguel | R$ 200,00 | R$ 200,00 |
| Luz | R$ 26,00 | R$ 25,00 |
| Internet | R$ 30,00 | R$ 30,00 |

```
Renda 2.156,00 − Despesas fixas 861,00 − Parcelas/mês 1.332,32 = −37,32   (o que o app mostra)
Renda 2.156,00 − Parcelas/mês 1.332,32                         = +823,68  (sem a duplicação)
```

O erro se espalha: a Simulação mostra "Prazo estimado —", o "Restante" do mês vira -R$ 237,32 e o Chat IA recebe os mesmos números.

**Correção:** deixar marcar uma despesa fixa como "já é uma dívida" (ou vincular as duas) e excluí-la da soma; enquanto isso, avisar quando um nome e valor de despesa batem com uma dívida ativa.

## Maiores

### 03 · "Reabrir" é o botão mais chamativo do card e apaga a data do pagamento

No card expandido, cada parcela paga tem um botão laranja cheio "Reabrir", com o mesmo peso do verde "Pagar". Um toque sem querer desfaz o pagamento sem confirmação nem "Desfazer", e a data original some.

```
Reabrir  bg rgb(227,165,78)  92×44   →  pagarParcela(): p.pagoEm = null
Pensão expandida: 5 botões "Reabrir" + 2 "Pagar" + Editar + Excluir
```

**Correção:** "Reabrir" como link discreto ou dentro de um menu "⋯"; toast com "Desfazer" que restaura o `pagoEm` antigo.

### 04 · Duas telas dão porcentagens diferentes para "quitado"

Dashboard diz **74% quitado**; Relatórios diz **72% quitado**. Um é por valor, o outro por número de parcelas, e nenhum diz qual.

```
Dashboard:  7.091,17 / 9.607,35 = 73,8%  → "74% quitado"
Relatórios: 59 / 82 parcelas    = 72,0%  → "72% quitado"
```

**Correção:** usar a mesma base nos dois (valor é o que o usuário sente) ou rotular: "74% do valor pago" / "59 de 82 parcelas".

### 05 · "Todas" não são todas

O filtro mostra **Todas 13** ao lado de **Quitadas 14**. "Todas" exclui as quitadas, então o maior número aparece no filtro menor.

**Correção:** renomear para "Ativas 13" ou fazer "Todas" contar 27.

### 06 · Lista vazia manda "adicione sua primeira dívida" para quem tem 27

O filtro Vencidas (0) e uma busca sem resultado mostram o mesmo texto de boas-vindas, com botão "Adicionar dívida". Zero vencidas é uma boa notícia tratada como conta nova.

```
"Nenhuma dívida aqui" · "Adicione sua primeira dívida para começar a controlar suas finanças."
```

**Correção:** três estados: conta nova (o atual), filtro vazio ("Nenhuma conta vencida. Tudo em dia.") e busca vazia ("Nada encontrado para 'xyz'" + botão Limpar busca).

### 07 · O mesmo número sem rótulo significa coisas diferentes em cada tela

Luz aparece como **R$ 150,00** em Dívidas (total), **R$ 50,00** na Simulação (restante) e **R$ 25,00** no Dashboard (parcela). Nenhum valor diz o que é.

**Correção:** rotular em todo lugar: "R$ 25/mês · faltam R$ 50 de R$ 150". No card de Dívidas, o valor que importa é a próxima parcela.

### 08 · O botão "+" cobre "Marcar como paga" no celular

A 386 px de largura o botão flutuante fica em cima do lado direito da ação principal do Dashboard. Um toque ali abre "Nova dívida" em vez de pagar. Em Dívidas ele cobre o valor dos cards.

```
FAB 52×52 em (299,456)  ×  "Marcar como paga" (35,467)–(336,509)  → sobreposição 37×41 px
```

**Correção:** `padding-bottom` no conteúdo igual à altura do FAB + margem, ou esconder o FAB ao rolar para baixo.

### 09 · As telas abrem já roladas para baixo

Ao trocar de aba, a rolagem da tela anterior é mantida. O Assistente abriu em 312 px e os Relatórios em 222 px, com título e abas fora da vista.

**Correção:** `window.scrollTo(0, 0)` ao trocar de tela.

### 10 · O formulário de edição se chama "Nova Dívida" e aceita valor negativo

O título fixo "Nova Dívida" aparece também ao editar. "Valor Parcela" é somente leitura e calculado do total, o que está certo. Mas "Valor Total" é `type=number` sem `min=0` nem `inputmode=decimal`.

**Correção:** título "Editar dívida" e botão "Salvar alterações" ao editar; `inputmode="decimal"` e `min="0.01"`.

### 11 · Só a primeira conta do Dashboard tem ação

"Pensão" tem "Marcar como paga"; as cinco linhas abaixo (Escola, Spotify, Luz, Amazon, Reforço) não são clicáveis. Para pagar a segunda é preciso ir em Dívidas, achar e expandir o card.

**Correção:** linhas tocáveis que abrem a dívida, ou um botão de check em cada uma.

### 12 · A Simulação mostra "—" sem explicar por quê

"Prazo estimado" e "Previsão quitação" ficam como "—" quando o saldo mensal é negativo (hoje, por causa do achado 02). O usuário não sabe o que fazer.

**Correção:** "Não dá para estimar: seu saldo do mês está negativo. Revise o Orçamento." com link para a aba.

### 13 · No celular, o filtro "Quitadas" fica fora da tela sem sinal de que há mais

Os chips rolam na horizontal; "Vencendo" é cortado no meio e "Quitadas" termina em 536 px numa tela de 386 px. Não há degradê nem seta.

**Correção:** chips menores que caibam em uma linha, ou degradê na borda direita.

### 29 · O aviso "Sair sem salvar?" nunca aparece

A variável `formularioModificado` começa `false` e nenhuma linha do app a muda para `true`. O `confirm("Sair sem salvar?")` é código morto: sair do formulário pelo botão voltar, pela barra inferior ou pelo "+" descarta o que foi digitado sem aviso. Além disso, a barra inferior chama `navegar()` direto, sem passar pela checagem.

```
app.js:39   let formularioModificado = false      ← único valor que recebe, fora resets para false
app.js:985  if (formularioModificado && !confirm("Sair sem salvar?")) return
index.html:830–842  nav-item onclick="navegar('…')"  ← não checa nada
```

**Correção:** marcar `formularioModificado = true` num listener `input` do formulário e fazer a barra inferior passar pela mesma checagem quando a tela ativa for o formulário.

## Acessibilidade

O modal de Configurações é o pior ponto: com ele aberto, Tab leva o foco para "Sair" atrás dele, e um Enter desloga o usuário.

| Nº | Onde | Medição | Critério WCAG 2.2 | Correção |
| --- | --- | --- | --- | --- |
| 14 | Modal Configurações | sem `role=dialog` nem `aria-modal`; foco fica no botão que abriu; Tab vai para "Sair" fora do modal; Esc não fecha | 2.4.3, 4.1.2 | `<dialog>` com `showModal()`, foco no título, Esc fecha, foco volta ao botão |
| 15 | Anel de foco, todo o app | `--primary` misturado a 45% sobre `rgb(15,20,26)` = **2,47:1** (precisa 3:1) | 1.4.11 | cor sólida, sem `color-mix` a 45% |
| 16 | Tema claro | "Em Dia" 11 px **4,30:1** (13 ocorrências); "Marcar como paga" 13 px **4,43:1** (precisa 4,5:1) | 1.4.3 | escurecer o verde `rgb(46,125,79)` um tom |
| 17 | Busca de Dívidas e campo do Chat | só placeholder ("Buscar", "Pergunte algo…"), sem `label` nem `aria-label` | 4.1.2, 3.3.2 | `aria-label` em ambos |
| 18 | Chips Todas / Vencidas / Vencendo / Quitadas | nenhum tem `aria-pressed`; leitor de tela não diz qual está ativo | 4.1.2 | `aria-pressed="true"` no ativo |
| 19 | Erros do formulário Nova Dívida | mensagem visível existe, mas `marcarErro` só troca uma classe; sem `aria-invalid` nem `aria-describedby` | 3.3.1 | ligar o `span.form-erro-texto` ao campo |
| 20 | Gráficos de Relatórios | 2 `canvas` sem `role=img` nem `aria-label`; a pizza não mostra valores nem % | 1.1.1 | `aria-label` com o resumo + valores na legenda |
| 21 | Respostas do Chat IA | nenhuma região `aria-live` no painel | 4.1.3 | `role="log"` na lista de mensagens |
| 22 | Campo do Chat | a 602 px de altura o campo fica em y=570–616, sob a barra inferior (533–602) | 2.4.11 | campo fixo acima da barra |

## Notas de texto e consistência

- **23 · Acentos faltando**, quase todos no Assistente: "orcamento", "apos despesas e dividas", "por mes", "DISPONIVEL/MES", "PREVISAO QUITACAO", "SUAS DIVIDAS", "Proxima:", e no toast "Divida ... removida" e "Verifique se o email esta correto". A categoria da despesa fixa aparece como código cru: "educacao", "moradia".
- **24 · Um nome por coisa.** "Dashboard" (inglês) no meio de tudo em português; "Dívidas" na aba e "Minhas Dívidas" no título; "Pagar", "Marcar como paga" e "Quitadas" para a mesma ação; "Visão Geral" é o nome de uma aba do Assistente e de uma seção da Simulação; "Em Dia" em Title Case; "23 pend." abreviado com espaço sobrando.
- **25 · "Consultoria com IA (Groq)"** expõe o fornecedor; o usuário não precisa saber, e trocar de modelo vira mudança de texto.
- **26 · "Priorize R$ 200,00"** em Relatórios não diz qual conta. Deveria ser "Priorize a Pensão: R$ 200,00 em 05/11".
- **27 · Configurações repetidas.** O tema está no topo e no modal; o lembrete está no modal e na aba Orçamento. O modal fica só com cópias. A preferência de lembrete fica só no `localStorage` do navegador; quem agenda o aviso é o app Android (`window.Android`). A tela web deveria dizer isso.
- **28 · Detalhes de comportamento.** Excluir usa o `confirm()` nativo do navegador e ainda mostra "Desfazer" (duas travas para a mesma ação). O botão de tema do app não atualiza a `theme-color`, que segue só o tema do sistema, então a barra do celular pode ficar clara com o app escuro.

## O que funciona

- **Contraste no tema escuro:** 0 falhas em 330 textos nas 5 telas. No claro, só os dois verdes do achado 16.
- **Alvos de toque:** nas 5 telas, só a caixa "Parcelada" fica abaixo de 24 px (22×48), e o texto ao lado também marca a caixa; os botões de parcela têm 92×44 px.
- **Abas do Assistente:** `role=tab` com `aria-selected` certo nas quatro.
- **Validação do formulário:** erro por campo com texto claro ("Informe um valor maior que zero.") e rolagem até o primeiro erro.
- **Exclusão:** toast com "Desfazer". É o padrão a copiar para "Reabrir" (achado 03).
- **Somas do Dashboard batem:** Pendente 2.516,18 + Pago 7.091,17 = Total 9.607,35; 23 parcelas pendentes iguais no Dashboard e no Assistente.
- **Sem erros de console** durante toda a navegação; sem rolagem horizontal em nenhuma tela; `lang="pt-BR"` definido.
- **Hierarquia do Dashboard:** "Próxima conta" destacada com data e valor é a decisão certa para um app de contas.

## Onde corrigir

Cada achado mapeado no código publicado em 27/10/2026 (`js/app.js` 2.294 linhas, `js/assistente.js` 1.150, `index.html` 857, `css/style.css` 3.530). Os números de linha mudam com qualquer edição; o nome da função é a referência estável.

| Nº | Arquivo e linhas | Função ou seletor | O que mudar |
| --- | --- | --- | --- |
| 01 | `js/app.js` 1041–1131, 1133–1161 | `adicionarDivida`, `editarDivida` | Em 1069–1084 o loop recria `ps` com `status: st` para todas; em 1102 grava `parcelas: ps` por cima. Ao editar, copiar `status`, `pagoEm` e `id` da parcela antiga de mesmo `numero`. Em 1151–1152, deixar de definir `statusDivida` |
| 02 | `js/assistente.js` 90–92, 112–122 | `totalDespesasFixas`, `parcelaMensalTotal`, `saldoDisponivel` | `saldoDisponivel` soma as duas sem filtro. Excluir de `totalDespesasFixas` a despesa que tiver vínculo com uma dívida ativa (campo novo `dividaId` em `orcamento.despesas`) |
| 03 | `js/app.js` 1719–1727, 1220–1237 · `css/style.css` 417 | botão `parcela-acao` com `btn-warning`, `pagarParcela` | Trocar `btn-warning` por um estilo de link; em `pagarParcela`, guardar o `pagoEm` antigo e oferecer "Desfazer" no toast |
| 04 | `js/app.js` 1505 e 1955–1964 | `atualizarDashboard` (por valor), `atualizarGrafico` (por parcelas) | Usar a mesma fórmula nos dois, ou mudar o texto de 1516 e 1964 para dizer a base |
| 05 | `js/app.js` 1358–1364, 1614–1618 · `index.html` 374 | contador `cTodas`, filtro `todas` | Renomear o chip para "Ativas" em `index.html` 374, ou contar todas em 1364 e não filtrar em 1616 |
| 06 | `js/app.js` 1621–1632 | estado vazio em `atualizarDashboard` | Escolher o texto por `filtroDividasAtual` e pelo termo de busca; só mostrar "primeira dívida" quando `dividas.length === 0` |
| 07 | `js/app.js` 1694, 1795 · `js/assistente.js` 632–640 | card de Dívidas (`d.valorTotal`), lista do Dashboard, ranking da Simulação | Rótulo junto de cada valor: "total", "por mês", "falta" |
| 08 | `css/style.css` 159–173, 1664–1692 | `.screen` `padding-bottom: 90px`; `.fab` `bottom: calc(76px + …)` | O FAB termina 128 px acima da base e o conteúdo só reserva 90 px. Subir o `padding-bottom` de `.screen` para cerca de 140 px nas telas com FAB |
| 09 | `js/app.js` 938–983 | `navegar` | Acrescentar `window.scrollTo(0, 0)` no fim |
| 10 | `index.html` 419, 455 · `js/app.js` 1133–1161 | título do formulário, `#valorTotal` | Em `editarDivida`, trocar o título e o texto de `#btnSalvarDivida`; em 455, `min="0.01" inputmode="decimal"` |
| 11 | `js/app.js` 1782–1797 | `.vencimento-item` em `atualizarDashboard` | Tornar a linha um `button` que abre a dívida, ou pôr um botão de check que chama `pagarParcela` |
| 12 | `js/assistente.js` 548–600, 142–149 | `renderSimulacao`, `mesesParaQuitacao` | Quando `disp <= 0`, mostrar a frase explicativa com link para a aba Orçamento em vez de "—" |
| 13 | `css/style.css` 846–851 | `.filtros-dividas` | `flex-wrap: wrap` abaixo de 420 px, ou `mask-image` com degradê na borda direita |
| 14 | `index.html` 61–89 · `js/app.js` 145–156 | `#modalConfiguracoes`, `abrirConfiguracoes`, `fecharConfiguracoes` | `role="dialog" aria-modal="true" aria-labelledby` no `div.modal`; ao abrir, focar o título; listener de `Escape`; ao fechar, devolver o foco a `index.html` 279 |
| 15 | `css/style.css` 120–127, 798, 1048 | `:focus-visible` | Trocar `color-mix(… 45%, transparent)` por `var(--primary)` sólido |
| 16 | `css/style.css` 15, 1309–1316, 1341, 2545 | `--success` do tema claro, `.status-emdia`, `.btn-proxima-acao` | Escurecer `--success` claro de `#2E7D4F` para algo como `#276B43` (5,47:1 no fundo do selo, 5,63:1 no botão) |
| 17 | `index.html` 352–353, 816 | `#buscaDivida`, `#chatInput` | `aria-label="Buscar dívidas"` e `aria-label="Mensagem para o assistente"` |
| 18 | `index.html` 374–407 · `js/app.js` 1320–1327 | `.filtro-divida`, `filtrarDividas` | Pôr `aria-pressed` no HTML e alternar em 1325–1327 junto com a classe `ativo` |
| 19 | `js/app.js` 1036–1039 | `marcarErro` | Também definir `aria-invalid` no campo e `aria-describedby` apontando para o `span.form-erro-texto` |
| 20 | `index.html` 594, 602, 673 · `js/app.js` 2051, 2133 · `js/assistente.js` 462 | `#graficoDividas`, `#graficoCategorias`, `#graficoProjecao` | `role="img"` e `aria-label` com o resumo, atualizado a cada `new Chart` |
| 21 | `index.html` 806 | `#chatMensagens` | `role="log" aria-live="polite"` |
| 22 | `index.html` 806–816 | `#chatMensagens` e linha do `#chatInput` | Tornar a linha do campo `position: sticky; bottom` acima da barra, ou reduzir o `min-height: 260px` |
| 23 | `js/assistente.js` 197, 202, 204, 228, 362, 369, 558, 573, 591, 599, 650, 655–656, 671, 712, 736 · `index.html` 783–785 · `js/app.js` 1180, 2175 | textos do Assistente e toasts | Corrigir acentos; em `js/assistente.js` 833 trocar `d.categoria` pelo rótulo do mapa de `js/app.js` 2107 |
| 24 | `index.html` 270, 340 · `js/app.js` 1498, 1575, 1669 | títulos, "Marcar como paga", "pend.", "Em Dia" | Escolher um termo por conceito e aplicar nesses pontos |
| 25 | `index.html` 794 | título do Chat IA | Tirar "(Groq)" |
| 26 | `js/app.js` 1979 | `proximoFoco` em `atualizarGrafico` | Incluir o nome da dívida antes do valor |
| 27 | `index.html` 61–89, 725–726 · `js/assistente.js` 794–803 | modal, `salvarPreferenciaNotificacao` | Manter o lembrete num lugar só; sem `window.Android`, mostrar "Lembretes funcionam no app Android" |
| 28 | `js/app.js` 1163–1178, 281–289 · `index.html` 21–22 | `excluirDivida`, `alternarTema`, `<meta name="theme-color">` | Tirar o `confirm()` e manter só o "Desfazer"; em `alternarTema`, atualizar a `theme-color` |
| 29 | `js/app.js` 39, 984–995 · `index.html` 830–842 | `formularioModificado`, `voltarParaDashboard`, `.nav-item` | Listener `input` no formulário que marca `true`; a barra inferior passa pela mesma checagem |

## Por onde começar

Ordenado por impacto dividido por esforço. Os quatro primeiros cabem num dia e eliminam os dois riscos de dinheiro e a maior confusão de números.

1. **01 · Preservar parcelas pagas ao editar.** Uma função, risco de perda de dados. No mesmo formulário, ligar o aviso "Sair sem salvar?" (29).
2. **09 · `scrollTo(0,0)` ao trocar de tela.** Uma linha.
3. **05 · "Todas" → "Ativas".** Uma palavra.
4. **02 · Tirar as despesas fixas duplicadas da conta.** Primeiro o aviso de duplicata; depois o vínculo despesa ↔ dívida.
5. **03 · Rebaixar "Reabrir" e dar "Desfazer".** Reusa o toast que a exclusão já tem.
6. **04 e 07 · Uma base para "% quitado" e rótulos nos valores.**
7. **08 · Espaço embaixo do conteúdo para o FAB.** CSS.
8. **06 e 12 · Estados vazios e o "—" da Simulação com texto que diz o que fazer.**
9. **14 a 22 · Acessibilidade.** O modal (14) e o anel de foco (15) primeiro; o resto são atributos.
10. **23 a 28 · Acentos e nomes.** Uma revisão de texto em `assistente.js`.

Depois de corrigir o 01, vale uma passada de teste em todos os fluxos que gravam (pagar, reabrir, editar, excluir) numa conta de teste, já que esta auditoria não executou nenhum deles.
