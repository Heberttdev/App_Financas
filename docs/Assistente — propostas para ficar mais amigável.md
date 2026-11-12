# Assistente — propostas para ficar mais amigável

Nov 1, 2026 · @Gatinhos da T.I

A melhor notícia do app está escondida: todas as parcelas terminam em 10/12/2026, mas o Assistente diz "9 meses" e "pode gastar hoje R$ 3,46". Ficar mais amigável começa por contar essa história certa, em frases, e só depois mexer no visual.

## O que o usuário sente hoje

Revisitei as quatro abas em 01/11/2026, em tela de celular (386 px), na versão publicada (`js/assistente.js` com 1.225 linhas). Várias correções da auditoria já entraram: acentos, despesas duplicadas riscadas, saldo positivo. O que segue é o que ainda pesa.

| Aba | O que aparece | Por que não é amigável |
| --- | --- | --- |
| Visão Geral | 6 cartões em caixa alta, todos com o mesmo peso | O usuário precisa juntar os números sozinho para saber se está bem |
| Visão Geral | "Pode gastar hoje R$ 3,46" é o maior destaque da tela | É o número mais desanimador e está errado: a Escola (R$ 520) ainda é contada duas vezes |
| Visão Geral | Alerta vermelho "86% comprometido… Risco de orçamento negativo" | Assusta com o saldo positivo e não diz o que fazer |
| Visão Geral | "educacao é a maior categoria… Considere renegociar ou eliminar primeiro" | Código cru e o conselho de "eliminar" a escola do filho |
| Visão Geral | "Insights da IA" | São regras fixas; o próprio código diz "geração local, sem API" |
| Visão Geral | Gráfico "Projeção 6 meses" com eixo R$ 0 · R$ 1 · R$ 1k · R$ 2k · R$ 2k | Rótulos repetidos e errados; não diz o que está sendo projetado |
| Orçamento | Duplicatas riscadas com "Já cadastrada como dívida — não contada em dobro." | Bom padrão, mas "Escola" não é reconhecida como "Escola de Anthony" |
| Orçamento | Renda, despesas, metas e lembretes num só formulário de 3 telas | Muda a renda aqui e o efeito só aparece em outra aba |
| Simulação | "Prazo estimado 9 meses · ago. de 2027" | Errado: a última parcela vence em 10/12/2026 |
| Simulação | Estratégias "Avalanche" e "Bola de Neve" | Servem para dívidas com juros e valor livre; aqui tudo são parcelas fixas |
| Simulação | "Gastado R$ 0,00" na Previsão do mês | É estimativa (ritmo × dias passados), não gasto real; amanhã mostrará R$ 3,46 "gastado" sem você gastar nada |
| Simulação | Controle "Valor extra por mês" vai até R$ 2.000 | A sobra do mês é R$ 303,68 |
| Chat IA | Quatro perguntas prontas genéricas e duas apresentações seguidas | Não partem da situação do usuário; não avisa que os valores vão para um serviço externo |

Os números que mudam a conversa, lidos dos dados do app:

```
Parcelas pendentes: 23 · novembro R$ 1.332,32 · dezembro R$ 1.183,86 · última em 10/12/2026 (Kimono)
Sobra de novembro hoje:            2.156,00 − 520,00 (Escola) − 1.332,32 = 303,68
Sobra sem a Escola em dobro:       2.156,00 − 1.332,32             = 823,68
"Pode gastar hoje" hoje:           (303,68 − 200,00 meta) ÷ 30 dias = R$ 3,46
"Pode gastar hoje" corrigido:      (823,68 − 200,00 meta) ÷ 30 dias = R$ 20,79
"Prazo 9 meses":                   2.516,18 ÷ 303,68 → 9 (soma as parcelas duas vezes)
```

## Princípios

1. **Responder três perguntas antes de qualquer indicador:** quanto sobra este mês, quando eu fico livre das parcelas, o que faço agora.
2. **Frase antes do número.** "Sobram R$ 823,68 em novembro" em vez de "SALDO LIVRE/MÊS R$ 823,68". O número continua lá, mas já vem explicado.
3. **Conta certa vem antes de tela bonita.** Um número errado que assusta (R$ 3,46 por dia, 9 meses) desfaz qualquer melhoria visual.
4. **Tom de parceiro.** Comemorar progresso, alertar só quando houver uma ação possível, e nunca sugerir cortar escola, pensão ou moradia.
5. **Falar de parcelas, não de dívida rotativa.** O usuário tem compras parceladas com data marcada. Estratégias de quitação por juros não se aplicam e confundem.
6. **Uma coisa por aba.** Visão Geral responde, Orçamento configura, Planejamento mostra os próximos meses, Chat tira dúvidas. Nada repetido entre elas.

## Visão Geral

A aba vira um resumo de uma tela só, lido de cima para baixo como uma conversa. Os seis cartões de indicadores saem do topo; os números continuam disponíveis num bloco "Ver as contas" no fim.

1. **Sobra do mês, em frase.** "Em novembro sobram R$ 823,68" com uma barra que mostra de onde vem: renda R$ 2.156,00, parcelas R$ 1.332,32, meta R$ 200,00, livre R$ 623,68. Cor verde só se sobrar; âmbar se apertar.
2. **Quando acaba.** "Suas parcelas terminam em 10 de dezembro" com uma linha de novembro a janeiro e o valor de cada mês. É a notícia que motiva o usuário e hoje não aparece em lugar nenhum.
3. **Um próximo passo.** Um cartão único com botão: "Pensão vence em 05/11 · R$ 200,00 · Marcar como paga", ou "Guarde R$ 50 na reserva" quando não houver conta perto.
4. **Gasto do dia, como apoio.** "Até R$ 20,79 por dia sem mexer na meta", em texto menor. Deixa de ser o maior número da tela.
5. **Reserva de emergência.** A barra atual fica, com a frase "R$ 90 de R$ 300 · completa em 3 meses guardando R$ 70".
6. **Ver as contas** (fechado). Renda, despesas, parcelas e meta, para quem quer conferir.

&#91;embedded content: Visão Geral no celular · hoje × proposta\]

Os valores da proposta já contam a Escola uma vez só. O destaque passa do gasto diário para a sobra do mês e a data em que as parcelas acabam.

O que sai: o alerta de "86% comprometido" com saldo positivo, o rótulo "Insights da IA" para regras fixas, o conselho de renegociar a categoria Educação e o gráfico de projeção (ele vai para a aba de planejamento, corrigido).

## Orçamento

O formulário fica, mas passa a mostrar o resultado enquanto o usuário digita e para de depender do nome exato para achar duplicatas.

- **Resumo fixo no topo da aba.** Uma linha que acompanha a rolagem: "Renda R$ 2.156 − parcelas R$ 1.332 − despesas R$ 0 = sobra R$ 824". Cada campo alterado atualiza essa linha na hora, sem trocar de aba.
- **Pergunta ao adicionar despesa.** Ao tocar "+ Despesa", perguntar "Isso já está nas suas dívidas?" com a lista de dívidas ativas. A resposta grava o `dividaId`, que o código já lê mas nenhuma tela preenche hoje.
- **Sugestão para as despesas antigas.** Quando o nome de uma despesa estiver contido no nome de uma dívida ("Escola" em "Escola de Anthony"), mostrar "Parece ser a dívida Escola de Anthony. Vincular?" com Sim e Não, em vez de decidir sozinho.
- **Campos em reais.** "2156" vira "R$ 2.156,00" com teclado numérico (`inputmode="decimal"`).
- **Metas com sugestão.** Abaixo de "Meta de economia mensal", mostrar "Com a sobra atual, até R$ 400 por mês cabe sem apertar" (metade da sobra, arredondada).
- **Lembretes saem daqui.** Já existem em Configurações; manter só lá.
- **Despesas riscadas ficam juntas no fim**, numa linha recolhível "4 despesas já contadas nas dívidas". Hoje elas ocupam metade da lista em laranja.

## Simulação → Próximos meses

Trocar o nome para "Próximos meses" e mostrar o calendário real das parcelas, que já está nos dados, em vez de um prazo estimado por divisão.

- **Calendário mês a mês.** Uma linha por mês até a última parcela e mais um: novembro R$ 1.332,32, dezembro R$ 1.183,86, janeiro R$ 0. Tocar num mês abre as contas daquele mês. Substitui "Prazo estimado" e "Previsão quitação".
- **Sobra por mês ao lado.** Novembro R$ 823,68, dezembro R$ 972,14, janeiro em diante a renda inteira menos as despesas fixas. É a resposta para "quando vou ter folga?".
- **Projeção corrigida.** O gráfico atual soma R$ 303,68 todo mês por 6 meses, mesmo depois que as parcelas acabam. Ele passa a usar a sobra de cada mês do calendário, com título "Quanto você pode juntar até maio" e eixo em reais inteiros.
- **Sai "Avalanche / Bola de Neve".** Com parcelas fixas e sem juros cadastrados, a ordem de pagamento não muda nada. Se um dia o app aceitar juros ou antecipação com desconto, a estratégia volta para essas dívidas.
- **"E se eu pagar mais?" vira "E se eu guardar mais?"** O controle vai de R$ 0 até a sobra do mês, e responde "Guardando R$ 150 por mês, sua reserva fica completa em dezembro".
- **Sai "Gastado".** O app não registra gastos; o valor é inventado a partir do ritmo. Fica só o orçamento do dia, sem barra de "consumido".
- **"Suas dívidas" só com as ativas.** Hoje a lista tem 27 itens, 14 já quitados, e o valor de cada um não diz se é total, parcela ou restante.

## Chat IA

O chat já tem a base certa (perguntas prontas e saudação). O ganho está em partir da situação do usuário e em ser transparente sobre os dados.

- **Perguntas prontas geradas dos dados**, trocadas a cada visita: "Como me organizar para dezembro?", "Quanto guardar até completar a reserva?", "O que fazer com a folga de janeiro?". Hoje são fixas e duas não se aplicam ("O que pagar primeiro?", "Como renegociar?").
- **Uma apresentação só.** Tirar o parágrafo "Converse com a inteligência artificial…" e deixar a saudação do assistente, mais curta: "Oi, Hebert! Vi suas 23 parcelas e sua renda. Em que posso ajudar?".
- **Aviso de dados em uma linha.** Sob o campo: "Seus valores são enviados para gerar a resposta. Não substitui um consultor." O chat envia os dados para um serviço externo e hoje não diz isso.
- **Estado de "pensando".** Três pontos animados na bolha enquanto a resposta não chega, e o botão de enviar desativado. Não enviei mensagens no teste, então confirme se isso já existe.
- **Respostas com ação.** Quando a resposta citar uma conta ou a reserva, um botão abaixo leva até ela ("Abrir Pensão", "Ajustar meta").
- **Nome do assistente.** "Chat IA" na aba e "assistente financeiro inteligente" na fala; escolher um nome curto e usar nos dois lugares.

## Texto e tom

Rótulos em caixa alta viram frases em caixa normal; alertas dizem o que fazer; nada culpa o usuário.

| Hoje | Proposta |
| --- | --- |
| PODE GASTAR HOJE R$ 3,46 · sem comprometer o orçamento | Até R$ 20,79 por dia sem mexer na sua meta |
| SALDO LIVRE/MÊS R$ 303,68 · após despesas e dívidas | Em novembro sobram R$ 823,68 depois das parcelas |
| RENDA TOTAL · 86% comprometido | 62% da renda vai para parcelas este mês |
| Alerta: Alto comprometimento de renda · Risco de orçamento negativo | (só aparece se a sobra ficar negativa) Este mês falta R$ X. Veja o que dá para adiar |
| Dica: 9 meses para zerar as dívidas | Suas parcelas terminam em 10 de dezembro |
| Adicionar R$ 266,46 a mais nas parcelas pode reduzir esse prazo em até 20% | (sai; as parcelas têm data fixa) |
| Info: educacao é a maior categoria… Considere renegociar ou eliminar primeiro | Educação é seu maior gasto parcelado (R$ 3.715,00 no total) |
| Insights da IA | Para você |
| Prazo estimado · Previsão quitação ago. de 2027 | Última parcela: 10/12/2026 |
| GASTADO R$ 0,00 · RITMO DIARIO R$ 3,46 | Orçamento do dia: R$ 20,79 |
| E SE EU PAGAR MAIS? · Valor extra por mes | E se eu guardar mais? |
| Faça um aporte para a reserva · antes de buscar maior rentabilidade | Guarde R$ 70 este mês e sua reserva fica completa em janeiro |
| Olá! Sou seu assistente financeiro inteligente. Já consigo consultar… | Oi, Hebert! Vi suas 23 parcelas e sua renda. Em que posso ajudar? |

Os valores "Proposta" já contam a Escola uma vez só. A porcentagem é 1.332,32 ÷ 2.156,00 = 61,8%.

## Ordem de implementação

Primeiro as contas, depois o texto, por último o layout. Os três primeiros itens mudam os números que o usuário vê hoje e cabem em uma tarde. Linhas de `js/assistente.js` na versão de 01/11/2026.

1. **Prazo real das parcelas.** `mesesParaQuitacao` (180–185) divide o total pendente pela sobra, que já desconta as parcelas. Trocar por: data da última parcela pendente, lida de `getDividas()`. Usado em `renderSimulacao` e `gerarInsights` (407).
2. **Vincular a Escola.** `dividaVinculadaDespesa` (108–118) compara o nome exato. Acrescentar a sugestão de vínculo quando um nome contém o outro, e gravar `despesa.dividaId` na resposta (`adicionarDespesa`, `confirmarDespesa`).
3. **Eixo do gráfico.** Callback do eixo y (551–554): `Math.round(v / 1000)` gera "R$ 1" e "R$ 2k" repetido. Usar `formatarMoeda(v)` sem centavos.
4. **Projeção por mês.** `projecao` (188–199) soma `saldoDisponivel()` igual em todo mês. Calcular a sobra de cada mês com as parcelas que vencem nele.
5. **Tirar o "Gastado".** `previsaoFimMes` (201–210) inventa o gasto como ritmo × dias passados. Remover `gastado` e o percentual; `renderPrevisaoMes` (790) mostra só o orçamento do dia.
6. **Limite do controle.** `atualizarSliderMax` (750–758) usa `Math.max(2000, …)`. Usar a sobra do mês como máximo e redirecionar o cálculo para a reserva.
7. **Textos dos insights.** `gerarInsights` (345–466): só alertar se a sobra for negativa; tirar o "até 20%" (408) e o "renegociar ou eliminar" (458); mapear `educacao` para "Educação" (457); renomear o título "Insights da IA" em `index.html`.
8. **Nova Visão Geral.** `renderIndicadores` (214–271) e `renderPlanoAcao` (306): montar os blocos na ordem do mockup; os seis cartões vão para um `<details>` "Ver as contas".
9. **Orçamento com resumo ao vivo.** `renderizarDespesas` (884) e `salvarOrcamento` (876): linha de resumo fixa no topo; duplicatas agrupadas no fim; lembretes saem do painel em `index.html`.
10. **Próximos meses.** `renderSimulacao` (595–677): calendário por mês; `renderEstrategia` (712) e `selecionarEstrategia` (566) saem; renomear a aba `tab-simulacao` em `index.html`.
11. **Chat.** `enviarPerguntaChip` e o HTML das perguntas em `index.html`: perguntas geradas dos dados; aviso de dados sob o campo; uma saudação só.

Depois do item 2, conferir na Visão Geral: a sobra de novembro deve mostrar R$ 823,68 e o orçamento do dia R$ 20,79 (no dia 1º).
