# 🤖 Módulo de Assistente IA (Groq + Cloudflare Worker)

Documentação técnica da integração de Inteligência Artificial para o aplicativo **Gerenciador de Dívidas**.

---

## 📌 Sumário
- [1. Visão Geral e Arquitetura](#1-visão-geral-e-arquitetura)
- [2. Segurança](#2-segurança)
- [3. O Cloudflare Worker (`worker/worker.js`)](#3-o-cloudflare-worker)
- [4. O Frontend (`web/`)](#4-o-frontend)
- [5. Fluxo de Dados e Contexto Financeiro](#5-fluxo-de-dados-e-contexto-financeiro)
- [6. Comandos de Manutenção (Wrangler)](#6-comandos-de-manutenção)

---

## 1. Visão Geral e Arquitetura

O assistente foi desenhado para oferecer consultas financeiras personalizadas em tempo real. Como a chave de API da Groq não pode ser exposta no navegador nem descompilada do APK Android, foi adotada uma arquitetura com **Cloudflare Worker como Serverless Proxy**.

```
[ App Web / WebView Android ]
            │
            ▼ (POST com contexto das dívidas)
[ Cloudflare Worker: groq-proxy ]
  - Injeta System Prompt
  - Insere Secret GROQ_API_KEY
            │
            ▼ (HTTPS para Groq Cloud)
[ Groq LPU Hardware ] (openai/gpt-oss-120b)
            │
            ▼ (Resposta em < 1s)
[ Retorno ao App ]
```

---

## 2. Segurança

* **Chave Oculta**: A chave de API (`gsk_...`) fica armazenada exclusivamente no cofre criptografado de Secrets do Cloudflare.
* **Preflight CORS**: O Worker responde adequadamente a requisições `OPTIONS` para permitir chamadas do Firebase Hosting (`*.web.app`) e do ambiente local.
* **Limitação de Payload**: O backend descarta requisições inválidas antes de onerar a API externa.

---

## 3. O Cloudflare Worker

* **Arquivo fonte**: `worker/worker.js`
* **Endpoint publicado**: `https://groq-proxy.bahiacruz0.workers.dev`
* **Modelos configurados**:
  * **Principal**: `openai/gpt-oss-120b` (modelo de 120B parâmetros veloz e de alto raciocínio).
  * **Fallback**: `qwen/qwen3.8-27b` (acionado se o principal estiver indisponível).

---

## 4. O Frontend

### HTML (`web/index.html`)
* **Botão da Aba**: Aba "Chat IA" inserida em `.assistente-tabs`.
* **Painel (`#painel-chat`)**: Contém botões de perguntas rápidas (chips), histórico com rolagem e input fixo com envio por tecla Enter.

### CSS (`web/css/style.css`)
* Balões com layout de chat moderno (`.chat-mensagem`, `.chat-balao`).
* Indicador de digitação com 3 pontos pulsantes (`@keyframes blink`).
* Suporte nativo ao modo escuro e responsividade mobile.

### JavaScript (`web/js/assistente.js`)
* **`coletarContextoFinanceiro()`**: Lê os dados em memória (renda, despesas, saldo diário e até 8 dívidas ativas) e gera um resumo compacto em texto.
* **`enviarMensagemChat()`**: Monta a requisição, adiciona indicador de "digitando...", chama o Worker e renderiza a resposta no chat.
* **`window.setWorkerUrl(url)`**: Permite alterar o endereço do Worker se necessário.

---

## 5. Fluxo de Dados e Contexto Financeiro

A cada mensagem, o app monta dinamicamente o seguinte contexto antes de acionar a IA:

```text
Contexto financeiro do usuário:
- Renda mensal total: R$ X.XXX,XX
- Despesas fixas: R$ X.XXX,XX
- Total em dívidas pendentes: R$ X.XXX,XX
- Parcelas mensais: R$ X.XXX,XX
- Saldo disponível estimado: R$ X.XXX,XX
- Gasto hoje: R$ X.XXX,XX

Dívidas em aberto:
* Nome da Dívida: R$ Valor -- Parcelas
```

---

## 6. Comandos de Manutenção

Para atualizar o Worker ou trocar a chave no futuro:

### Fazer novo Deploy do código
```powershell
cd C:\Users\heber\AndroidStudioProjects\GerenciadordeDvidas\worker
wrangler deploy worker.js --name groq-proxy --compatibility-date 2024-01-01
```

### Atualizar a Chave Groq
```powershell
cd C:\Users\heber\AndroidStudioProjects\GerenciadordeDvidas\worker
npx wrangler secret put GROQ_API_KEY --name groq-proxy
```
