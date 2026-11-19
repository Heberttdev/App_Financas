# Relatórios — propostas para uma tela enxuta

Nov 3, 2026 · @Gatinhos da T.I

A tela de Relatórios ocupa 6,7 telas de rolagem no celular e quase tudo nela já existe no Dashboard ou em Dívidas. A proposta reduz para uma tela e meia, com um mês por vez e um gráfico que nenhuma outra tela tem: quanto você pagou e quanto falta pagar, mês a mês.

## O que a tela mostra hoje

Revisitei Relatórios em 03/11/2026, em tela de celular (386 px), com 29 dívidas e 89 parcelas cadastradas. Os blocos, de cima para baixo:

| Bloco | O que mostra | Problema |
| --- | --- | --- |
| Filtros | Todas / Pendentes / Pagas + seletor de mês "--------- de ----" + botão × | Dois controles para recortar a mesma coisa; o seletor vazio aparece como traços |
| Próximo foco | "Priorize Pensão: R$ 200,00 · Vencimento em 05/11/2026" | Repete a "Próxima conta" do Dashboard |
| Pendente / Pago | R$ 2.866,18 e R$ 7.091,17 | Repete os cartões do Dashboard |
| Progresso | "59 de 89 parcelas pagas" e, ao lado, "89 parcelas • 66%" | O mesmo dado duas vezes no mesmo cartão |
| Distribuição por Categoria | Pizza com 6 fatias e legenda, sem valores nem porcentagens | Não dá para ler quanto é cada fatia; ignora os filtros (abaixo) |
| Ver ranking das dívidas | Fechado; 3 maiores e "Ver todas as dívidas (26)" | Escondido; o "26" são as restantes, ao lado de "29 dívidas" logo abaixo |
| Detalhamento | 29 cartões de dívida, aberto, "4/6 pagas no filtro" | Cópia da tela Dívidas; é o que faz a tela ter 6,7 rolagens |
| (invisível) | `canvas#graficoDividas` com `display:none` | Gráfico desenhado e escondido a cada atualização |

O erro que mais confunde: a pizza não obedece aos filtros. Ela soma o valor total de cada dívida, pago e pendente, em qualquer recorte.

```
Filtro "Todas":     resumo R$ 9.957,35  · pizza soma R$ 9.957,35  ✓
Filtro "Pendentes": resumo R$ 2.866,18  · pizza soma R$ 7.972,69  (Educação 3.715 = total da dívida)
Mês novembro:      resumo R$ 1.332,32  · pizza soma R$ 7.622,69  (Educação 3.715 de novo)
```

O que a tela não mostra em lugar nenhum, e os dados já têm: a história mês a mês.

```
Pago por mês:      jun 630,33 · jul 2.063,33 · ago 1.419,80 · set 1.488,80 · out 1.488,91  = 7.091,17
A pagar por mês:   nov 1.332,32 · dez 1.283,86 · jan 100,00 · fev 50,00 · mar 50,00 · abr 50,00 = 2.866,18
```

## O que fica, o que sai

A regra: Relatórios só mostra o que nenhuma outra tela mostra. Contas a pagar ficam no Dashboard; a lista de dívidas fica em Dívidas.

| Bloco hoje | Decisão | Para onde vai |
| --- | --- | --- |
| Todas / Pendentes / Pagas | Sai | O mês já separa pago de a pagar |
| Seletor de mês + × | Muda | Vira "‹ Novembro 2026 ›" com setas; um toque no nome volta para "Tudo" |
| Próximo foco | Sai | Já está no Dashboard como "Próxima conta" |
| Pendente / Pago | Junta | Uma frase no topo do mês: "R$ 1.332,32 em 13 parcelas · nenhuma paga ainda" |
| Progresso "59 de 89" + "89 parcelas • 66%" | Junta | Uma barra só, dentro da frase do topo |
| Pizza por categoria | Muda | Barras horizontais ordenadas, com valor e %, obedecendo ao mês escolhido |
| Ranking (fechado) | Junta | As barras já ordenam; as 3 maiores contas do mês aparecem abertas abaixo |
| Detalhamento (29 cartões) | Sai | Um link "Ver todas em Dívidas" |
| `canvas#graficoDividas` escondido | Sai | Código morto |
| — | Entra | Gráfico "Mês a mês": pago e a pagar, de junho a abril |

Resultado: de 8 blocos para 4 (seletor, resumo do mês, mês a mês, categorias + maiores contas).

## A tela proposta

Quatro blocos, nesta ordem. Tudo abaixo do seletor obedece ao mês escolhido.

1. **Seletor de mês.** "‹ Novembro 2026 ›", abrindo no mês atual. Uma opção "Tudo" no fim mostra o total desde o início.
2. **Resumo do mês em uma frase.** "R$ 1.332,32 em 13 parcelas" e, embaixo, uma barra com o pago e uma linha "R$ 0,00 pago · R$ 1.332,32 falta". Em "Tudo": "R$ 9.957,35 em 89 parcelas · 66% pago".
3. **Mês a mês.** Uma barra por mês, de junho de 2026 a abril de 2027: meses passados em cor cheia (pago), meses futuros em contorno (a pagar), o mês escolhido destacado. Tocar numa barra troca o mês do seletor. É o único lugar do app que mostra a queda: de R$ 1.283,86 em dezembro para R$ 100,00 em janeiro.
4. **Categorias e maiores contas.** Barras horizontais ordenadas ("Educação R$ 605,00 · 45%"), calculadas com as parcelas do mês, e logo abaixo as 3 maiores contas do mês com o link "Ver todas em Dívidas".

&#91;embedded content: Relatórios no celular · hoje × proposta\]

As barras do mês a mês usam os valores reais do app: pagos de junho a outubro pelo mês do pagamento, a pagar de novembro a abril pelo vencimento.

No celular, os blocos 1 a 3 cabem na primeira tela; o bloco 4 fica a meia rolagem.

## Texto

| Hoje | Proposta |
| --- | --- |
| PRÓXIMO FOCO · Priorize Pensão: R$ 200,00 | (sai; está no Dashboard) |
| PENDENTE R$ 2.866,18 · PAGO R$ 7.091,17 | R$ 1.332,32 em 13 parcelas · R$ 0,00 pago |
| 59 de 89 parcelas pagas · 89 parcelas • 66% | 59 de 89 parcelas pagas (só em "Tudo") |
| Distribuição por Categoria | Por categoria |
| Ver ranking das dívidas · Maiores valores no filtro | Maiores contas de novembro |
| Ver todas as dívidas (26) | Ver todas em Dívidas |
| LISTA · Detalhamento · 29 dívidas | (sai) |
| 4/6 pagas no filtro | (sai com o Detalhamento) |
| --------- de ---- | ‹ Novembro 2026 › |

Nomes de mês por extenso e com maiúscula no seletor; abreviados em minúsculas no gráfico ("jun", "jul").

## Ordem de implementação

Primeiro o que corrige números, depois o que remove, por último o que é novo. Linhas de `js/app.js` (2.511 linhas) e `index.html` (842) na versão de 03/11/2026.

1. **Pizza obedece ao filtro.** `atualizarGraficoCategorias` (2286): a linha 2328 soma `divida.valorTotal`. Somar o `valor` das parcelas que passaram pelo filtro de status e de mês, como já faz o resumo.
2. **Tirar o gráfico escondido.** `index.html` 608 (`canvas#graficoDividas`) e o trecho de `atualizarGrafico` que o desenha (2225–2260).
3. **Tirar o Detalhamento.** `index.html` 625 em diante e o bloco de `filtrarRelatorio` (2054) que monta os cartões (2082–2097). No lugar, um botão que chama `navegar('dividas')`.
4. **Tirar Próximo foco.** `index.html` 570 (`#relatorioFoco`) e `atualizarGrafico` 2167–2177.
5. **Juntar resumo e progresso.** Os cartões Pendente/Pago e `#textoQuitacao` / `#barraQuitacao` (`index.html` 594–602) viram uma frase com uma barra, preenchida em `atualizarGrafico` (2150–2165).
6. **Seletor de mês com setas.** `index.html` 558 (`#filtroMes`) e `aplicarFiltroPeriodo` (2039) / `limparFiltroPeriodo` (2048): botões ‹ › que somam ou subtraem um mês, valor inicial = mês atual. Os botões Todas / Pendentes / Pagas e `filtroAtualRelatorio` saem.
7. **Pizza vira barras.** Em `atualizarGraficoCategorias`, trocar o `new Chart` tipo pizza por barras horizontais (`indexAxis: 'y'`) ordenadas, com valor e % no rótulo. O ranking fechado (`index.html` 620–623, `toggleRankingExtra` 2276) vira as 3 maiores contas abertas.
8. **Gráfico mês a mês.** Novo `canvas` logo abaixo do resumo. Agrupar parcelas por mês: pagas pelo mês de `pagoEm` (ou `vencimento` se faltar), pendentes pelo mês de `vencimento`. Toque numa barra chama o seletor de mês.

Depois do item 1, conferir com o filtro em novembro: a soma das fatias deve ser R$ 1.332,32.

## Conferência de 19/11/2026

Os oito itens estão no ar e funcionando; o acabamento do gráfico mês a mês entrou na 2ª rodada. Conferido no app publicado em Nov 19, 2026, em tela de celular, só navegando (nada foi pago ou editado). A tela caiu de 6,7 para cerca de 2,5 rolagens.

| Nº | Item | Status | O que vi |
| --- | --- | --- | --- |
| 1 | Pizza obedece ao filtro | Feito | Categorias somam o mesmo que o resumo: novembro R$ 1.617,52, dezembro R$ 1.856,33, janeiro R$ 534,47, Tudo R$ 11.435,46 |
| 2 | Tirar o gráfico escondido | Feito | `canvas#graficoDividas` não existe mais |
| 3 | Tirar o Detalhamento | Feito | Os cartões saíram; no lugar, "Ver todas em Dívidas" |
| 4 | Tirar Próximo foco | Feito | `#relatorioFoco` não existe mais |
| 5 | Juntar resumo e progresso | Feito | "R$ 1.617,52 em 15 parcelas · R$ 1.617,52 pago · R$ 0,00 falta · 15 de 15 pagas" |
| 6 | Seletor de mês com setas | Feito | Setas, "Tudo" e volta ao mês atual funcionam; botões com `aria-label` |
| 7 | Pizza vira barras | Feito | 5 categorias com valor e %; ranking virou "Maiores contas de novembro" aberto |
| 8 | Gráfico mês a mês | Feito | Dados certos, toque numa barra troca o mês; legenda, cor e rótulos ajustados na 2ª rodada |

Ajustes que faltam no item 8:

- **Legenda.** O gráfico usa verde (pago), azul (mês escolhido) e contorno vermelho (a pagar), mas `legend.display` está desligado.
- **Cor dos meses futuros.** O contorno vermelho (`#EE7D74`) parece alerta; o proposto era contorno na mesma cor do pago.
- **Rótulos de mês.** No celular aparecem só meses alternados e inclinados (jun, ago, out…). Usar `autoSkip: false`, `maxRotation: 0` e fonte menor.

**2ª rodada (19/11/2026, tarde): tudo feito.** Legenda ligada com "Pago", "A pagar" e "Mês escolhido"; meses futuros com contorno verde (`#62BB8C`) em vez de vermelho; todos os 11 meses aparecem retos no eixo (`autoSkip: false`, `maxRotation: 0`, fonte 10).
