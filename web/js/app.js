(function () {
        const firebaseConfig = {
          apiKey: "AIzaSyD3MwFrcuEIMMU4iXo51x6jG8y_2saRdmA",
          authDomain: "financas-f371a.firebaseapp.com",
          databaseURL: "https://financas-f371a-default-rtdb.firebaseio.com",
          projectId: "financas-f371a",
          storageBucket: "financas-f371a.firebasestorage.app",
          messagingSenderId: "293588515495",
          appId: "1:293588515495:web:4c92aa7e5d2ca29f5f7982",
        };

        firebase.initializeApp(firebaseConfig);

        const auth = firebase.auth();
        const db = firebase.database();

        auth
          .getRedirectResult()
          .then((result) => {
            console.log("Redirect:", result);

            if (result.user) {
              console.log("Logado:", result.user.email);
            }
          })
          .catch((error) => {
            console.error(error);
          });

        let currentUser = null,
          dividas = [],
          filtroAtualRelatorio = "todas";
        window.getCurrentUser = () => currentUser;
        window.getDividas = () => dividas;
        let mesFiltroRelatorio = null,
          graficoInstance = null,
          graficoCategoriasInstance = null;
        let listenersAtivos = [],
          formularioModificado = false;
        let filtroDividasAtual = "todas";
        let isLoading = false;
        // true enquanto cadastrar/login tratam uma conta de email ainda não confirmada
        let verificandoEmail = false;

        const hojeStr = () => new Date().toISOString().split("T")[0];

        let debounceBuscaTimer = null;
        window.buscarComDebounce = () => {
          clearTimeout(debounceBuscaTimer);
          debounceBuscaTimer = setTimeout(() => {
            atualizarDashboard();
          }, 250);
        };
        const agoraISO = () => new Date().toISOString();
        const formatarData = (d) =>
          d ? escapeHtml(String(d).split("-").reverse().join("/")) : "-";
        const formatarDataHora = (iso) =>
          iso
            ? new Date(iso).toLocaleDateString("pt-BR") +
              " " +
              new Date(iso).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "-";
        const adicionarMeses = (d, m) => {
          if (!d) return "";
          const dt = new Date(d + "T00:00:00");
          dt.setMonth(dt.getMonth() + m);
          return dt.toISOString().split("T")[0];
        };
        // Lê um token de cor do CSS (respeita modo claro/escuro); usado nos gráficos
        const corTema = (nome) =>
          getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
        window.corTema = corTema;
        const aplicarTemaGraficos = () => {
          if (!window.Chart) return;
          Chart.defaults.color = corTema("--text-secondary");
          Chart.defaults.borderColor = corTema("--border");
        };
        window.aplicarTemaGraficos = aplicarTemaGraficos;

        const formatarMoeda = (v) =>
          Number(v).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          });
        window.formatarMoeda = formatarMoeda;

        function escapeHtml(str) {
          if (!str) return "";
          return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
        }

        // Argumento de função JS dentro de atributo onclick: string JS válida + escape HTML
        const jsArg = (v) => escapeHtml(JSON.stringify(String(v ?? "")));

        function verificarAutenticacao() {
          if (!currentUser) {
            document.querySelector(".nav-bottom").style.display = "none";

            mostrarTela("loginScreen");

            return;
          }

          document.querySelector(".nav-bottom").style.display = "flex";

          mostrarTela("mainScreen");
        }

        function showLoading(t = "Carregando...") {
          document.getElementById("loadingOverlay").style.display = "flex";
          document.getElementById("loadingText").textContent = t;
        }
        function hideLoading() {
          document.getElementById("loadingOverlay").style.display = "none";
        }

        function atualizarStatusConexao() {
          const el = document.getElementById("conexaoStatus");
          if (!el) return;
          if (navigator.onLine) {
            if (!el.hidden) {
              el.textContent = "Conexão restaurada. Sincronizando...";
              el.classList.add("online");
              setTimeout(() => { el.hidden = true; }, 2200);
            }
          } else {
            el.hidden = false;
            el.classList.remove("online");
            el.textContent = "Sem conexão. Suas alterações podem não ser salvas.";
          }
        }

        window.addEventListener("online", atualizarStatusConexao);
        window.addEventListener("offline", atualizarStatusConexao);
        atualizarStatusConexao();

        window.abrirConfiguracoes = () => {
          const modal = document.getElementById("modalConfiguracoes");
          if (!modal) return;
          modal.style.display = "flex";
          window.carregarPreferenciaNotificacao?.();
          if (window.lucide) lucide.createIcons();
        };

        window.fecharConfiguracoes = () => {
          const modal = document.getElementById("modalConfiguracoes");
          if (modal) modal.style.display = "none";
        };

        function atualizarStatusSincronizacao(texto, tipo = "") {
          const el = document.getElementById("syncStatus");
          if (!el) return;
          el.hidden = !texto;
          el.className = `sync-status ${tipo}`;
          el.textContent = texto;
          if (texto && tipo === "sucesso") {
            setTimeout(() => { el.hidden = true; }, 1800);
          }
        }

        function chaveFilaOffline() {
          return currentUser ? `filaSync_${currentUser.uid}` : null;
        }

        function chaveCacheDividas() {
          return currentUser ? `cacheDividas_${currentUser.uid}` : null;
        }

        function salvarCacheDividas() {
          const chave = chaveCacheDividas();
          if (chave) localStorage.setItem(chave, JSON.stringify(dividas));
        }

        function carregarCacheDividas() {
          const chave = chaveCacheDividas();
          if (!chave) return [];
          try {
            return JSON.parse(localStorage.getItem(chave) || "[]");
          } catch {
            return [];
          }
        }

        function lerFilaOffline() {
          const chave = chaveFilaOffline();
          if (!chave) return [];
          try {
            return JSON.parse(localStorage.getItem(chave) || "[]");
          } catch {
            return [];
          }
        }

        function enfileirarOperacaoOffline(operacao) {
          const chave = chaveFilaOffline();
          if (!chave) return;
          const fila = lerFilaOffline();
          const mesmaOperacao = fila.findIndex(
            (item) => item.id === operacao.id,
          );
          if (mesmaOperacao >= 0) fila[mesmaOperacao] = operacao;
          else fila.push(operacao);
          localStorage.setItem(chave, JSON.stringify(fila));
          atualizarStatusSincronizacao("Aguardando conexão");
        }

        async function sincronizarFilaOffline() {
          const ref = refDividas();
          const chave = chaveFilaOffline();
          if (!ref || !chave || !navigator.onLine) return;
          const fila = lerFilaOffline();
          if (!fila.length) return;
          atualizarStatusSincronizacao("Sincronizando...");
          try {
            for (const operacao of fila) {
              if (operacao.tipo === "remove") {
                await ref.child(String(operacao.id)).remove();
              } else {
                await ref.child(String(operacao.id)).set(operacao.divida);
              }
            }
            localStorage.removeItem(chave);
            atualizarStatusSincronizacao("Sincronizado", "sucesso");
            carregarDividasRealtime();
          } catch (error) {
            console.error("Erro ao sincronizar fila offline:", error);
            atualizarStatusSincronizacao("Falha na sincronização", "erro");
          }
        }

        window.addEventListener("online", sincronizarFilaOffline);
        function limparListeners() {
          listenersAtivos.forEach((r) => {
            try {
              r.off();
            } catch (e) {}
          });
          listenersAtivos = [];
        }
        function setBtnLoading(btn, l) {
          if (l) {
            btn.classList.add("loading");
            btn.disabled = true;
          } else {
            btn.classList.remove("loading");
            btn.disabled = false;
          }
        }

        // Tema
        const temaSalvo = localStorage.getItem("tema");
        const prefereEscuro = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const raiz = document.documentElement;

        if (temaSalvo === "dark" || (!temaSalvo && prefereEscuro)) {
          raiz.classList.add("dark-mode");
          raiz.classList.remove("light-mode");
        } else if (temaSalvo === "light") {
          raiz.classList.add("light-mode");
          raiz.classList.remove("dark-mode");
        }

        // No app Android, as barras do sistema acompanham o tema do site
        const sincronizarBarrasAndroid = () => {
          if (!window.Android || typeof Android.definirTemaBarras !== "function") return;
          const escuro =
            raiz.classList.contains("dark-mode") ||
            (!raiz.classList.contains("light-mode") && prefereEscuro);
          try { Android.definirTemaBarras(escuro); } catch (e) {}
        };
        sincronizarBarrasAndroid();

        window.alternarTema = () => {
          const escuro = raiz.classList.toggle("dark-mode");
          raiz.classList.toggle("light-mode", !escuro);
          localStorage.setItem("tema", escuro ? "dark" : "light");
          sincronizarBarrasAndroid();
          if (document.getElementById("relatoriosScreen").classList.contains("active"))
            aplicarFiltroPeriodo();
          if (window.lucide) lucide.createIcons();
        };

        // Auth
        window.toggleAuthForm = (f) => {
          document.getElementById("loginForm").style.display =
            f === "login" ? "flex" : "none";
          document.getElementById("cadastroForm").style.display =
            f === "cadastro" ? "flex" : "none";
          document.getElementById("loginErro").textContent = "";
          document.getElementById("cadErro").textContent = "";
        };

        window.cadastrar = async () => {
          const n = document.getElementById("cadNome").value.trim();
          const e = document.getElementById("cadEmail").value.trim();
          const s = document.getElementById("cadSenha").value;
          const btn = document.getElementById("btnCadastrar");
          const erroEl = document.getElementById("cadErro");

          if (!n || !e || !s) {
            erroEl.textContent = "Preencha todos os campos.";
            return;
          }
          if (s.length < 6) {
            erroEl.textContent = "Senha: mínimo 6 caracteres.";
            return;
          }

          setBtnLoading(btn, true);
          erroEl.textContent = "";
          try {
            // Conta só acessa dados depois de confirmar o email (regras do RTDB exigem email_verified)
            verificandoEmail = true;
            const uc = await auth.createUserWithEmailAndPassword(e, s);
            await uc.user.updateProfile({ displayName: n });
            await uc.user.sendEmailVerification();
            await auth.signOut();
            verificandoEmail = false;
            mostrarToast("Conta criada! Confirme pelo link enviado ao seu email e depois faça login.", "sucesso");
            window.toggleAuthForm("login");
            document.getElementById("loginEmail").value = e;
          } catch (er) {
            verificandoEmail = false;
            if (er.code === "auth/email-already-in-use")
              erroEl.textContent = "Email já cadastrado.";
            else if (er.code === "auth/invalid-email")
              erroEl.textContent = "Email inválido.";
            else erroEl.textContent = "Erro ao criar conta. Tente novamente.";
          }
          setBtnLoading(btn, false);
        };

        window.login = async () => {
          const e = document.getElementById("loginEmail").value.trim();
          const s = document.getElementById("loginSenha").value;
          const btn = document.getElementById("btnLogin");
          const erroEl = document.getElementById("loginErro");

          if (!e || !s) {
            erroEl.textContent = "Preencha email e senha.";
            return;
          }

          setBtnLoading(btn, true);
          erroEl.textContent = "";
          try {
            verificandoEmail = true;
            const uc = await auth.signInWithEmailAndPassword(e, s);
            if (!uc.user.emailVerified) {
              await uc.user.sendEmailVerification().catch(() => {});
              await auth.signOut();
              erroEl.textContent =
                "Confirme seu email antes de entrar. Reenviamos o link de confirmação.";
            }
            verificandoEmail = false;
          } catch (er) {
            verificandoEmail = false;
            if (
              er.code === "auth/user-not-found" ||
              er.code === "auth/invalid-credential"
            )
              erroEl.textContent = "Email ou senha incorretos.";
            else if (er.code === "auth/too-many-requests")
              erroEl.textContent = "Muitas tentativas. Aguarde.";
            else erroEl.textContent = "Erro ao entrar. Tente novamente.";
          }
          setBtnLoading(btn, false);
        };

        // ============================================
        // FUNÇÃO DE LOGIN COM GOOGLE
        // ============================================
        window.loginComGoogle = function () {
          console.log("Iniciando login Google nativo");

          try {
            // Verificar se estamos no Android
            if (typeof Android !== "undefined" && Android) {
              console.log("✅ Chamando login nativo Android");
              Android.signInWithGoogle();
            } else {
              console.log("Usando fallback Popup");
              const provider = new firebase.auth.GoogleAuthProvider();
              auth.signInWithPopup(provider).catch((error) => {
                console.error("Erro fallback:", error);
                document.getElementById("loginErro").textContent =
                  "Erro ao entrar com Google. Tente novamente.";
              });
            }
          } catch (error) {
            console.error("Erro ao iniciar login:", error);
            document.getElementById("loginErro").textContent =
              "Erro ao iniciar autenticação.";
          }
        };

        // ============================================
        // CALLBACK DO ANDROID - RECEBE USUÁRIO + TOKEN
        // ============================================
        window.onAuthStateChanged = function (userJson) {
          console.log("📱 Login nativo concluído:", userJson);

          if (!userJson || userJson === "null" || userJson === "undefined") {
            console.log("Usuário deslogado");
            if (window.limparChatAssistente) window.limparChatAssistente();
            sessionStorage.removeItem("userLoggedIn");
            sessionStorage.removeItem("userEmail");
            sessionStorage.removeItem("userUid");
            return;
          }

          try {
            const userData =
              typeof userJson === "string" ? JSON.parse(userJson) : userJson;

            sessionStorage.setItem("userLoggedIn", "true");
            sessionStorage.setItem("userEmail", userData.email);
            sessionStorage.setItem("userUid", userData.uid);

            usarDadosDoAndroid(userData);
          } catch (error) {
            console.error("Erro ao processar dados do usuario:", error);
          }
        };

        // ============================================
        // FALLBACK - USAR DADOS DO ANDROID
        // ============================================
        function usarDadosDoAndroid(userData) {
          if (window.Android) Android.salvarUid(userData.uid);

          // O banco só aceita a sessão do SDK web; o app é aberto por auth.onAuthStateChanged
          // depois que window.onGoogleIdToken autentica o SDK. Sem isso, a leitura é negada.
          if (auth.currentUser) return;
          setTimeout(() => {
            if (auth.currentUser) return;
            const erroEl = document.getElementById("loginErro");
            if (erroEl)
              erroEl.textContent =
                "Não foi possível sincronizar sua conta. Atualize o aplicativo para a versão mais recente e entre novamente.";
          }, 8000);
        }

        // Chamado pelo app Android com o ID token do Google do login nativo
        window.onGoogleIdToken = function (googleIdToken) {
          if (auth.currentUser || typeof googleIdToken !== "string") return;
          const credential = firebase.auth.GoogleAuthProvider.credential(googleIdToken);
          auth.signInWithCredential(credential).catch((er) => {
            console.error("Erro ao autenticar sessão web:", er);
            const erroEl = document.getElementById("loginErro");
            if (erroEl) erroEl.textContent = "Erro ao entrar. Tente novamente.";
          });
        };

        function atualizarSaudacao(user) {
          const nome = (user && (user.displayName || user.email || "").trim()) || "você";
          const h = new Date().getHours();
          let periodo = "Boa noite";
          if (h < 12) periodo = "Bom dia";
          else if (h < 18) periodo = "Boa tarde";
          const el = document.getElementById("saudacaoPessoa");
          if (el) el.textContent = `${periodo}, ${nome}`;
          atualizarAvatar(user, nome);
        }

        // Foto da conta Google; sem foto (ou se falhar), mostra as iniciais
        function atualizarAvatar(user, nome) {
          const foto = document.getElementById("fotoUsuario");
          const iniciais = document.getElementById("iniciaisUsuario");
          if (!foto || !iniciais) return;
          const mostrarIniciais = () => {
            const partes = String(nome || "").split(/[\s@.]+/).filter(Boolean);
            iniciais.textContent =
              ((partes[0] || "?")[0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
            foto.hidden = true;
            iniciais.hidden = false;
          };
          const url = user && typeof user.photoURL === "string" ? user.photoURL : "";
          if (!/^https:\/\//.test(url)) return mostrarIniciais();
          foto.onerror = mostrarIniciais;
          foto.onload = () => { foto.hidden = false; iniciais.hidden = true; };
          foto.src = url;
        }

        // ============================================
        // FUNÇÃO PARA MOSTRAR UI DO USUÁRIO
        // ============================================
        function mostrarUIUsuario(userData) {
          console.log("🔄 Mostrando UI para:", userData.email);

          // Atualizar saudação
          atualizarSaudacao(userData);

          // Trocar telas
          const authScreen = document.getElementById("authScreen");
          const mainScreen = document.getElementById("mainScreen");
          if (authScreen && mainScreen) {
            authScreen.classList.remove("active");
            mainScreen.classList.add("active");
          }

          // Recarregar dados do dashboard
          if (typeof atualizarDashboard === "function") {
            setTimeout(atualizarDashboard, 500);
          }

          // Mostrar nav bottom
          const navBottom = document.querySelector(".nav-bottom");
          if (navBottom) {
            navBottom.style.display = "flex";
          }
          if (typeof esconderBootSkeleton === "function") esconderBootSkeleton();
        }

        // ============================================
        // CALLBACK DE ERRO
        // ============================================
        window.onAuthError = function (errorMessage) {
          console.error("❌ Erro no login Android:", errorMessage);
          const erroEl = document.getElementById("loginErro");
          if (erroEl) {
            erroEl.textContent =
              "Erro na autenticação: " + (errorMessage || "Tente novamente");
          }
        };

        // ============================================
        // VERIFICAR SESSÃO AO CARREGAR A PÁGINA
        // ============================================
        window.addEventListener("load", function () {
          // Se estava logado, restaurar
          if (sessionStorage.getItem("userLoggedIn") === "true") {
            const email = sessionStorage.getItem("userEmail");
            if (email) {
              console.log("🔄 Restaurando sessão:", email);
              firebase.auth().onAuthStateChanged(function (user) {
                if (user) {
                  mostrarUIUsuario(user);
                }
              });
            }
          }
        });
        function mostrarTelaAuth() {
          [
            "authScreen",
            "mainScreen",
            "adicionarScreen",
            "relatoriosScreen",
            "dividasScreen",
            "assistenteScreen",
          ].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.classList.remove("active");
          });
          document.getElementById("authScreen").classList.add("active");
          const navBottom = document.querySelector(".nav-bottom");
          if (navBottom) navBottom.style.display = "none";
          const fab = document.getElementById("fabNovaDivida");
          if (fab) fab.classList.remove("visivel");
          esconderBootSkeleton();
        }
        window.mostrarTelaAuth = mostrarTelaAuth;

        function mostrarApp(user) {
          console.log("Mostrando app para:", user.email);

          if (!user || !user.uid) {
            console.error("Usuário inválido!");
            return;
          }

          currentUser = user;
          sincronizarFilaOffline();

          // Esconder tela de login
          const authScreen = document.getElementById("authScreen");
          const mainScreen = document.getElementById("mainScreen");

          if (authScreen) authScreen.classList.remove("active");
          if (mainScreen) mainScreen.classList.add("active");

          atualizarSaudacao(user);

          // Mostrar nav bottom
          const navBottom = document.querySelector(".nav-bottom");
          if (navBottom) navBottom.style.display = "flex";

          // Mostrar FAB
          const fab = document.getElementById("fabNovaDivida");
          if (fab) fab.classList.add("visivel");

          esconderBootSkeleton();

          // delay para a sessão do Firebase sincronizar antes de buscar dados
          setTimeout(() => {
            console.log("Carregando dados do Firebase para UID:", user.uid);
            carregarDividasRealtime();
          }, 800);

          // Navegar para dashboard
          window.navegar("dashboard");

          if (!localStorage.getItem("onboardingVisto")) {
            setTimeout(() => mostrarOnboarding(), 600);
          }
        }
        window.mostrarApp = mostrarApp;

        const passosOnboarding = [
          {
            icone: "wallet",
            titulo: "Bem-vindo ao Gerenciador de Dívidas",
            texto: "Controle suas dívidas, parcelas e vencimentos em um só lugar.",
          },
          {
            icone: "plus-circle",
            titulo: "Adicione suas dívidas",
            texto: "Toque no botão + para cadastrar cartões, empréstimos, boletos e mais.",
          },
          {
            icone: "check-circle",
            titulo: "Marque como pago",
            texto: "Abra uma dívida e toque em Pagar para marcar parcelas como quitadas.",
          },
          {
            icone: "bar-chart-3",
            titulo: "Acompanhe seu progresso",
            texto: "Veja relatórios e gráficos para entender para onde vai seu dinheiro.",
          },
        ];
        let passoOnboardingAtual = 0;

        function mostrarOnboarding() {
          passoOnboardingAtual = 0;
          renderizarPassoOnboarding();
          document.getElementById("onboardingOverlay").style.display = "flex";
        }

        function renderizarPassoOnboarding() {
          const passo = passosOnboarding[passoOnboardingAtual];
          const ultimoPasso = passoOnboardingAtual === passosOnboarding.length - 1;

          document.getElementById("onboardingOverlay").innerHTML = `
            <div class="onboarding-card">
              <div class="onboarding-icone">
                <i data-lucide="${escapeHtml(passo.icone)}" style="width:30px;height:30px;stroke:white;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"></i>
              </div>
              <h3>${escapeHtml(passo.titulo)}</h3>
              <p>${escapeHtml(passo.texto)}</p>
              <div class="onboarding-dots">
                ${passosOnboarding
                  .map(
                    (_, i) =>
                      `<span class="onboarding-dot ${i === passoOnboardingAtual ? "ativo" : ""}"></span>`,
                  )
                  .join("")}
              </div>
              <div class="onboarding-acoes">
                <button class="btn-outline" onclick="window.fecharOnboarding()">Pular</button>
                <button class="btn" onclick="window.avancarOnboarding()">${ultimoPasso ? "Começar" : "Próximo"}</button>
              </div>
            </div>
          `;
          if (window.lucide) lucide.createIcons();
        }

        window.avancarOnboarding = () => {
          if (passoOnboardingAtual < passosOnboarding.length - 1) {
            passoOnboardingAtual++;
            renderizarPassoOnboarding();
          } else {
            window.fecharOnboarding();
          }
        };

        window.fecharOnboarding = () => {
          document.getElementById("onboardingOverlay").style.display = "none";
          localStorage.setItem("onboardingVisto", "1");
        };

        let parcelasNotificadas = new Set();
        function verificarParcelasVencendo() {
          if (!window.Android) return;

          const hoje = new Date();
          hoje.setHours(0, 0, 0, 0);

          dividas.forEach((divida) => {
            if (!divida.parcelas) return;

            divida.parcelas.forEach((parcela) => {
              if (parcela.status !== "pendente") return;

              const vencimento = new Date(parcela.vencimento);
              vencimento.setHours(0, 0, 0, 0);

              const diffDias = Math.round(
                (vencimento - hoje) / (1000 * 60 * 60 * 24),
              );

              let titulo = null, mensagem = null;
              if (diffDias === 3) {
                titulo = "Parcela vencendo";
                mensagem = `${divida.nome} vence em 3 dias`;
              } else if (diffDias === 1) {
                titulo = "Parcela vence amanha";
                mensagem = `${divida.nome} vence amanha`;
              } else if (diffDias === 0) {
                titulo = "Parcela vence hoje";
                mensagem = `${divida.nome} vence hoje`;
              } else if (diffDias < 0) {
                titulo = "Parcela atrasada";
                mensagem = `${divida.nome} esta atrasada ha ${Math.abs(diffDias)} dia(s)`;
              }

              if (!titulo) return;

              const chave = `${divida.id}-${parcela.id}-${diffDias}`;
              if (parcelasNotificadas.has(chave)) return;
              parcelasNotificadas.add(chave);

              Android.mostrarNotificacao(titulo, mensagem);
            });
          });
        }

        // ============================================
        // CARREGAR DÍVIDAS (COM VERIFICAÇÃO)
        // ============================================
        function carregarDividasRealtime() {
          if (!currentUser || !currentUser.uid) {
            console.error(
              "❌ carregarDividasRealtime: currentUser ou UID inválido!",
            );
            return;
          }

          if (!navigator.onLine) {
            dividas = carregarCacheDividas();
            atualizarStatusSincronizacao("Modo offline");
            atualizarDashboard();
            return;
          }

          console.log("🔍 Carregando dados para UID:", currentUser.uid);

          // Verificar se já está carregando para evitar duplicação
          if (isLoading) {
            console.log("⏳ Já está carregando, ignorando...");
            return;
          }

          isLoading = true;

          const ref = db.ref("usuarios/" + currentUser.uid + "/dividas");
          console.log("📁 Caminho:", ref.toString());

          limparListeners();
          mostrarSkeletonDashboard();

          // Timeout de segurança
          const timeout = setTimeout(() => {
            console.warn("⏰ Timeout ao carregar dados");
            isLoading = false;
          }, 15000);

          const listener = ref.on(
            "value",
            (snapshot) => {
              clearTimeout(timeout);
              console.log("📦 Snapshot recebido!");
              console.log("🔢 Número de filhos:", snapshot.numChildren());

              const data = snapshot.val();
              dividas = data ? Object.values(data) : [];
              salvarCacheDividas();
              console.log("✅ Dividas carregadas:", dividas.length);

              isLoading = false;

              // Atualizar UI
              atualizarDashboard();
              verificarParcelasVencendo();

              if (
                document
                  .getElementById("relatoriosScreen")
                  .classList.contains("active")
              ) {
                aplicarFiltroPeriodo();
              }
            },
            (error) => {
              clearTimeout(timeout);
              console.error("❌ Erro no listener:", error);
              isLoading = false;

              // Sem permissão não adianta repetir: a sessão é inválida, volta para o login
              if (error && /permission/i.test(error.code || error.message || "")) {
                dividas = carregarCacheDividas();
                atualizarDashboard();
                mostrarToast("Sessão expirada. Entre novamente.", "erro");
                window.logout();
                return;
              }

              // Tentar recarregar após erro
              setTimeout(() => {
                if (currentUser) {
                  console.log("🔄 Tentando recarregar dados...");
                  carregarDividasRealtime();
                }
              }, 5000);
            },
          );

          listenersAtivos.push(ref);
        }

        function esconderBootSkeleton() {
          const boot = document.getElementById("bootSkeleton");
          if (!boot || boot.classList.contains("oculto")) return;
          boot.classList.add("oculto");
          setTimeout(() => boot.remove(), 400);
        }
        window.esconderBootSkeleton = esconderBootSkeleton;
        // Segurança: nunca prender o usuário no skeleton
        setTimeout(esconderBootSkeleton, 9000);

        function mostrarSkeletonDashboard() {
          const resumo = document.getElementById("resumoCards");
          if (resumo) {
            const cardSkeleton = `
            <div class="skeleton-card">
              <div class="skeleton skeleton-line curta"></div>
              <div class="skeleton skeleton-line larga" style="height:22px;margin-top:6px"></div>
            </div>`;

            resumo.innerHTML = `<div class="skeleton-resumo-cards">${cardSkeleton.repeat(4)}</div>`;
          }

          const proxima = document.getElementById("proximaContaCard");
          if (proxima) {
            proxima.innerHTML = `
              <div class="skeleton skeleton-line larga" style="height:44px;border-radius:10px;margin:10px 0 12px"></div>`;
          }

          const prog = document.getElementById("proxProgresso");
          if (prog) {
            prog.innerHTML = `
              <div class="skeleton skeleton-line larga" style="height:10px;border-radius:10px;margin:4px 0 10px"></div>
              <div class="skeleton skeleton-line curta" style="height:12px;margin-bottom:12px"></div>`;
          }

          const venc = document.getElementById("listaProximosVencimentos");
          if (venc) {
            venc.innerHTML = `
              <div class="skeleton skeleton-line larga" style="height:14px;margin-bottom:10px"></div>
              <div class="skeleton skeleton-line media" style="height:14px;margin-bottom:10px"></div>
              <div class="skeleton skeleton-line curta" style="height:14px"></div>`;
          }

          const lista = document.getElementById("listaDividas");
          if (lista) {
            const itemSkeleton = `
              <div class="skeleton-divida-card">
                <div class="skeleton-divida-info">
                  <div class="skeleton skeleton-line larga"></div>
                  <div class="skeleton skeleton-line media"></div>
                  <div class="skeleton skeleton-line curta" style="height:8px"></div>
                </div>
                <div class="skeleton-divida-valor">
                  <div class="skeleton skeleton-line curta" style="width:70px;height:16px;margin-bottom:0"></div>
                  <div class="skeleton skeleton-line curta" style="width:50px;margin-bottom:0"></div>
                </div>
              </div>`;
            lista.innerHTML = itemSkeleton.repeat(3);
          }
        }
        function refDividas() {
          return currentUser
            ? db.ref("usuarios/" + currentUser.uid + "/dividas")
            : null;
        }

        async function salvarDividaNoBanco(divida) {
          const ref = refDividas();
          if (!ref || !divida?.id) return false;
          if (!navigator.onLine) {
            enfileirarOperacaoOffline({ tipo: "set", id: divida.id, divida });
            salvarCacheDividas();
            return true;
          }
          try {
            atualizarStatusSincronizacao("Salvando...");
            await ref.child(String(divida.id)).set(divida);
            atualizarStatusSincronizacao("Salvo", "sucesso");
            return true;
          } catch (error) {
            console.error("Erro ao salvar dívida:", error);
            mostrarToast("Não foi possível salvar. Tente novamente.", "erro");
            atualizarStatusSincronizacao("Falha ao salvar", "erro");
            return false;
          }
        }

        async function removerDividaNoBanco(id) {
          const ref = refDividas();
          if (!ref || !id) return false;
          if (!navigator.onLine) {
            enfileirarOperacaoOffline({ tipo: "remove", id });
            salvarCacheDividas();
            return true;
          }
          try {
            atualizarStatusSincronizacao("Excluindo...");
            await ref.child(String(id)).remove();
            atualizarStatusSincronizacao("Excluído", "sucesso");
            return true;
          } catch (error) {
            console.error("Erro ao excluir dívida:", error);
            mostrarToast("Não foi possível excluir. Tente novamente.", "erro");
            atualizarStatusSincronizacao("Falha ao excluir", "erro");
            return false;
          }
        }

        // Navegação
        window.navegar = (t) => {
          [
            "mainScreen",
            "dividasScreen",
            "adicionarScreen",
            "relatoriosScreen",
            "assistenteScreen",
          ].forEach((id) =>
            document.getElementById(id).classList.remove("active"),
          );
          document.querySelectorAll(".nav-item").forEach((el) => {
            el.classList.remove("active");
            el.removeAttribute("aria-current");
          });

          const fab = document.getElementById("fabNovaDivida");
          if (fab) {
            fab.classList.toggle("visivel", t === "dashboard" || t === "dividas");
          }

          if (t === "dashboard") {
            document.getElementById("mainScreen").classList.add("active");
            document.querySelector('.nav-item[data-tela="dashboard"]').classList.add("active");
            document.querySelector('.nav-item[data-tela="dashboard"]').setAttribute("aria-current", "page");
            atualizarDashboard();
          } else if (t === "adicionar") {
            document.getElementById("adicionarScreen").classList.add("active");
            document.querySelector('.nav-item[data-tela="adicionar"]')?.classList.add("active");
          } else if (t === "relatorios") {
            document.getElementById("relatoriosScreen").classList.add("active");
            document.querySelector('.nav-item[data-tela="relatorios"]').classList.add("active");
            document.querySelector('.nav-item[data-tela="relatorios"]').setAttribute("aria-current", "page");
            aplicarFiltroPeriodo();
          } else if (t === "dividas") {
            document.getElementById("dividasScreen").classList.add("active");
            document.querySelector('.nav-item[data-tela="dividas"]')?.classList.add("active");
            document.querySelector('.nav-item[data-tela="dividas"]')?.setAttribute("aria-current", "page");
            atualizarDashboard();
          } else if (t === "assistente") {
            document.getElementById("assistenteScreen").classList.add("active");
            document.querySelector('.nav-item[data-tela="assistente"]')?.classList.add("active");
            document.querySelector('.nav-item[data-tela="assistente"]')?.setAttribute("aria-current", "page");
            if (typeof iniciarAssistente === "function") iniciarAssistente();
          }
        };

        window.voltarParaDashboard = () => {
          if (formularioModificado && !confirm("Sair sem salvar?")) return;
          formularioModificado = false;
          window.navegar("dashboard");
        };

        // Formulário
        window.abrirNovaDivida = () => {
          if (formularioModificado && !confirm("Sair sem salvar?")) return;
          limparForm();
          window.navegar("adicionar");
        };

        function limparForm() {
          document.getElementById("nomeDivida").value = "";
          document.getElementById("categoriaDivida").value = "cartao";
          document.getElementById("valorTotal").value = "";
          document.getElementById("parceladaCheck").checked = false;
          window.toggleParcelamento();
          document.getElementById("numParcelas").value = 2;
          document.getElementById("valorParcela").value = "";
          document.getElementById("dataVencimento").value = hojeStr();
          document.getElementById("observacaoDivida").value = "";
          document.getElementById("statusDivida").value = "pendente";
          document
            .getElementById("adicionarScreen")
            .removeAttribute("data-editing-id");
          ["grupoNome", "grupoValor", "grupoParcelas", "grupoData"].forEach(
            (id) => marcarErro(id, false),
          );
          formularioModificado = false;
        }

        window.toggleParcelamento = () => {
          document.getElementById("parcelamentoFields").style.display =
            document.getElementById("parceladaCheck").checked
              ? "block"
              : "none";
          calcularValorParcela();
        };

        window.calcularValorParcela = () => {
          if (!document.getElementById("parceladaCheck").checked) return;
          const vt = parseFloat(document.getElementById("valorTotal").value);
          const np =
            parseInt(document.getElementById("numParcelas").value) || 1;
          if (!isNaN(vt) && vt > 0 && np > 1)
            document.getElementById("valorParcela").value = (vt / np).toFixed(
              2,
            );
        };

        function marcarErro(idGrupo, comErro) {
          const grupo = document.getElementById(idGrupo);
          if (grupo) grupo.classList.toggle("com-erro", comErro);
        }

        window.adicionarDivida = async () => {
          const nome = document.getElementById("nomeDivida").value.trim();
          const cat = document.getElementById("categoriaDivida").value;
          const vt = parseFloat(document.getElementById("valorTotal").value);
          const parc = document.getElementById("parceladaCheck").checked;
          const np =
            parseInt(document.getElementById("numParcelas").value) || 1;
          const dbv = document.getElementById("dataVencimento").value;
          const obs = document.getElementById("observacaoDivida").value.trim();
          const st = document.getElementById("statusDivida").value;

          const nomeInvalido = !nome;
          const valorInvalido = isNaN(vt) || vt <= 0;
          const parcelasInvalidas = parc && np < 2;
          const dataInvalida = !dbv;

          marcarErro("grupoNome", nomeInvalido);
          marcarErro("grupoValor", valorInvalido);
          marcarErro("grupoParcelas", parcelasInvalidas);
          marcarErro("grupoData", dataInvalida);

          if (nomeInvalido || valorInvalido || parcelasInvalidas || dataInvalida) {
            const primeiroComErro = document.querySelector(".form-group.com-erro");
            if (primeiroComErro) {
              primeiroComErro.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            return;
          }

          let vp = parc
            ? parseFloat(document.getElementById("valorParcela").value) ||
              vt / np
            : vt;
          let ps = [];
          for (let i = 0; i < (parc ? np : 1); i++) {
            ps.push({
              id: Date.now().toString() + "_" + i,
              numero: i + 1,
              vencimento: adicionarMeses(dbv, i),
              valor: vp,
              status: st === "pago" ? "pago" : "pendente",
              pagoEm: st === "pago" ? agoraISO() : null,
            });
          }

          const btn = document.getElementById("btnSalvarDivida");
          const eid = document
            .getElementById("adicionarScreen")
            .getAttribute("data-editing-id");

          let dividaAtual;
          if (eid) {
            const idx = dividas.findIndex((d) => d.id === eid);
            if (idx !== -1) {
              dividas[idx] = {
                ...dividas[idx],
                nome,
                categoria: cat,
                valorTotal: vt,
                parcelada: parc,
                numParcelas: np,
                parcelas: ps,
                observacao: obs,
              };
              dividaAtual = dividas[idx];
            }
            document
              .getElementById("adicionarScreen")
              .removeAttribute("data-editing-id");
          } else {
            dividaAtual = {
              id: Date.now().toString(),
              nome,
              categoria: cat,
              valorTotal: vt,
              parcelada: parc,
              numParcelas: np,
              parcelas: ps,
              observacao: obs,
              criadoEm: agoraISO(),
            };
            dividas.push(dividaAtual);
          }

          setBtnLoading(btn, true);
          const salvo = await salvarDividaNoBanco(dividaAtual);
          setBtnLoading(btn, false);
          if (!salvo) return;
          formularioModificado = false;
          window.navegar("dashboard");
        };

        window.editarDivida = (id) => {
          const d = dividas.find((d) => d.id === id);
          if (!d) return;
          document.getElementById("nomeDivida").value = d.nome;
          document.getElementById("categoriaDivida").value =
            d.categoria || "outros";
          document.getElementById("valorTotal").value = d.valorTotal;
          document.getElementById("parceladaCheck").checked = d.parcelada;
          window.toggleParcelamento();
          if (d.parcelada) {
            document.getElementById("numParcelas").value = d.numParcelas;
            document.getElementById("valorParcela").value =
              d.parcelas[0]?.valor || "";
          }
          document.getElementById("dataVencimento").value =
            d.parcelas[0]?.vencimento || hojeStr();
          document.getElementById("observacaoDivida").value =
            d.observacao || "";
          document.getElementById("statusDivida").value = d.parcelas?.every(
            (p) => p.status === "pago",
          )
            ? "pago"
            : "pendente";
          document
            .getElementById("adicionarScreen")
            .setAttribute("data-editing-id", id);
          formularioModificado = false;
          window.navegar("adicionar");
        };

        window.excluirDivida = (id) => {
          const dividaRemovida = dividas.find((d) => d.id === id);
          if (!dividaRemovida) return;

          if (!confirm(`Tem certeza que deseja excluir "${dividaRemovida.nome}"?`)) return;

          // remove localmente e re-renderiza imediatamente
          dividas = dividas.filter((d) => d.id !== id);
          atualizarDashboard();

          let cancelado = false;
          let timer;

          const container = document.querySelector(".toast-container");
          const el = document.createElement("div");
          el.className = "toast-undo";
          el.innerHTML = `
            <span>Divida "<strong>${escapeHtml(dividaRemovida.nome)}</strong>" removida</span>
            <button class="toast-undo-btn">Desfazer</button>
          `;

          el.querySelector(".toast-undo-btn").onclick = () => {
            cancelado = true;
            clearTimeout(timer);
            dividas.push(dividaRemovida);
            dividas.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
            atualizarDashboard();
            salvarDividaNoBanco(dividaRemovida);
            el.remove();
          };

          container.appendChild(el);

          timer = setTimeout(async () => {
            el.remove();
            if (!cancelado) {
              const removida = await removerDividaNoBanco(id);
              if (!removida) {
                dividas.push(dividaRemovida);
                dividas.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
                atualizarDashboard();
              }
            }
          }, 5000);
        };

        function mostrarToast(mensagem, tipo = "info") {          const container = document.querySelector(".toast-container");
          if (!container) return;

          const el = document.createElement("div");
          el.className = `toast ${tipo}`;
          el.textContent = mensagem;
          container.appendChild(el);

          setTimeout(() => el.remove(), 3000);
        }

        window.pagarParcela = async (did, pid) => {
          const d = dividas.find((d) => d.id === did);
          if (d) {
            const p = d.parcelas.find((p) => p.id === pid);
            if (p) {
              p.status = p.status === "pago" ? "pendente" : "pago";
              p.pagoEm = p.status === "pago" ? agoraISO() : null;
              const ficouPago = p.status === "pago";
              await salvarDividaNoBanco(d);
              atualizarDashboard();
              mostrarToast(
                ficouPago ? "Parcela paga!" : "Parcela reaberta",
                ficouPago ? "sucesso" : "info",
              );
            }
          }
        };

        // Dashboard
        function getCatBadge(c) {
          const m = {
            cartao: ["credit-card", "Cartão", "categoria-cartao"],
            emprestimo: ["landmark", "Empréstimo", "categoria-emprestimo"],
            boleto: ["file-text", "Boleto", "categoria-boleto"],
            assinatura: ["refresh-cw", "Assinatura", "categoria-assinatura"],
            educacao: ["graduation-cap", "Educação", "categoria-educacao"],
            saude: ["heart-pulse", "Saúde", "categoria-saude"],
            moradia: ["home", "Moradia", "categoria-moradia"],
            transporte: ["car", "Transporte", "categoria-transporte"],
            alimentacao: ["utensils", "Alimentação", "categoria-alimentacao"],
            lazer: ["gamepad-2", "Lazer", "categoria-lazer"],
            imposto: ["receipt", "Impostos", "categoria-imposto"],
            outros: ["bookmark", "Outros", "categoria-outros"],
          };

          const [icon, nm, cl] = m[c] || m["outros"];

          return `<span class="categoria-badge ${cl}"><i data-lucide="${icon}" class="icon icon-sm"></i>${nm}</span>`;
        }

        function ordenarDividas(l) {
          const o = document.getElementById("ordenacaoSelect")?.value || "nome";
          return [...l].sort((a, b) => {
            switch (o) {
              case "valor-maior":
                return (b.valorTotal || 0) - (a.valorTotal || 0);
              case "valor-menor":
                return (a.valorTotal || 0) - (b.valorTotal || 0);
              case "data":
                return (a.parcelas?.[0]?.vencimento || "").localeCompare(
                  b.parcelas?.[0]?.vencimento || "",
                );
              case "status":
                return (
                  (b.parcelas?.filter((p) => p.status === "pendente").length ||
                    0) -
                  (a.parcelas?.filter((p) => p.status === "pendente").length ||
                    0)
                );
              default:
                return (a.nome || "").localeCompare(b.nome || "");
            }
          });
        }

        function getClasseVencimento(divida) {
          const pendente = divida.parcelas?.find(
            (p) => p.status === "pendente",
          );

          if (!pendente) return "divida-ok";

          const hoje = new Date();
          const venc = new Date(pendente.vencimento);

          const diff = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24));

          if (diff < 0) return "divida-vencida";

          if (diff <= 3) return "divida-alerta";

          return "divida-ok";
        }
        function getTextoVencimento(data) {
          const hoje = new Date();
          const venc = new Date(data);

          const diff = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24));

          if (diff < 0) return `Vencida há ${Math.abs(diff)} dia(s)`;

          if (diff === 0) return "Vence hoje";

          if (diff === 1) return "Vence amanhã";

          return `Faltam ${diff} dias`;
        }

        // filtro de dívidas

        window.filtrarDividas = (tipo, btn) => {
          filtroDividasAtual = tipo;

          document
            .querySelectorAll(".filtro-divida")
            .forEach((b) => b.classList.remove("ativo"));

          btn.classList.add("ativo");

          atualizarDashboard();
        };

        function atualizarDashboard() {
          let vencidas = 0;
          let alerta = 0;
          let ok = 0;

          let parcelasVencidas = 0;
          let valorVencido = 0;

          dividas.forEach((d) => {
            const pendente = d.parcelas?.find((p) => p.status === "pendente");

            if (!pendente) {
              ok++;
              return;
            }

            const dias = Math.ceil(
              (new Date(pendente.vencimento) - new Date()) /
                (1000 * 60 * 60 * 24),
            );

            if (dias < 0) vencidas++;
            else if (dias <= 3) alerta++;
            else ok++;
          });

          let cTodas = 0, cVencidas = 0, cProximas = 0, cQuitadas = 0;
          const hojeContador = new Date();
          (dividas || []).forEach((d) => {
            const temPendente = d.parcelas?.some((p) => p.status === "pendente");
            const todasPagas = d.parcelas?.length > 0 && d.parcelas?.every((p) => p.status === "pago");
            if (todasPagas) cQuitadas++;
            if (temPendente) cTodas++;

            const temVencida = d.parcelas?.some(
              (p) => p.status === "pendente" && new Date(p.vencimento) < hojeContador,
            );
            if (temVencida) cVencidas++;

            const temProxima = d.parcelas?.some((p) => {
              if (p.status !== "pendente") return false;
              const dias = Math.ceil(
                (new Date(p.vencimento) - hojeContador) / (1000 * 60 * 60 * 24),
              );
              return dias >= 0 && dias <= 7;
            });
            if (temProxima) cProximas++;
          });

          const elCTodas = document.getElementById("count-todas");
          if (elCTodas) elCTodas.textContent = cTodas;
          const elCVencidas = document.getElementById("count-vencidas");
          if (elCVencidas) elCVencidas.textContent = cVencidas;
          const elCProximas = document.getElementById("count-proximas");
          if (elCProximas) elCProximas.textContent = cProximas;
          const elCQuitadas = document.getElementById("count-quitadas");
          if (elCQuitadas) elCQuitadas.textContent = cQuitadas;

          const resumo = document.getElementById("resumoDividas");
          if (resumo) {
            resumo.innerHTML = "";
          }

          if (!dividas) dividas = [];
          let tp = 0,
            tpg = 0,
            qp = 0,
            tg = 0;
          dividas.forEach((d) => {
            const totalParcelas = (d.parcelas || []).reduce(
              (s, p) => s + (p.valor || 0),
              0,
            );
            tg += totalParcelas || d.valorTotal || 0;
            d.parcelas?.forEach((p) => {
              if (p.status === "pendente") {
                const hoje = new Date();

                const vencimento = new Date(p.vencimento);

                const dias = Math.ceil(
                  (vencimento - hoje) / (1000 * 60 * 60 * 24),
                );

                if (dias < 0) {
                  parcelasVencidas++;
                  valorVencido += p.valor || 0;
                }
              }

              if (p.status === "pago") tpg += p.valor || 0;
              else {
                tp += p.valor || 0;
                qp++;
              }
            });
          });

          const alertaEl = document.getElementById("alertaDividas");

          if (alertaEl) {
            if (parcelasVencidas > 0) {
              alertaEl.innerHTML = `
            <div class="card-alerta">
                <h3><i data-lucide="flame" class="icon icon-sm"></i> Atenção</h3>

                <p>${parcelasVencidas} parcela(s) vencida(s)</p>

                <p>
                    <strong>
                        ${formatarMoeda(valorVencido)}
                    </strong>
                    em atraso
                </p>
            </div>
        `;
              if (window.lucide) lucide.createIcons();
            } else {
              alertaEl.innerHTML = "";
            }
          }

          const proximas = [];

          dividas.forEach((d) => {
            d.parcelas?.forEach((p) => {
              if (p.status === "pendente") {
                proximas.push({
                  dividaId: d.id,
                  parcelaId: p.id,
                  nome: d.nome,
                  valor: p.valor,
                  vencimento: p.vencimento,
                });
              }
            });
          });

          proximas.sort(
            (a, b) => new Date(a.vencimento) - new Date(b.vencimento),
          );

          const proxima = proximas[0];
          const proxDest = document.getElementById("proximaContaCard");
          if (proxDest) {
            proxDest.innerHTML = proxima
              ? `
        <div class="prox-destaque">
            <div class="prox-destaque-titulo">
                <i data-lucide="flame" class="icon icon-sm"></i> Próxima conta
            </div>

            <div class="prox-destaque-linha">
                <div class="prox-destaque-nome">
                    <strong>${escapeHtml(proxima.nome)}</strong>

                    <small>
                        <i data-lucide="calendar" class="icon icon-sm"></i> ${formatarData(proxima.vencimento)}
                    </small>
                </div>

                <strong class="prox-destaque-valor">
                    ${formatarMoeda(proxima.valor)}
                </strong>
            </div>
            <button class="btn-proxima-acao" type="button" onclick="event.stopPropagation();window.pagarParcela(${jsArg(proxima.dividaId)},${jsArg(proxima.parcelaId)})">
                <i data-lucide="check-circle" class="icon icon-sm"></i> Marcar como paga
            </button>
        </div>`
              : "";
            if (window.lucide) lucide.createIcons();
          }

          const percentual = tg > 0 ? ((tpg / tg) * 100).toFixed(0) : 0;

          const progBox = document.getElementById("proxProgresso");
          if (progBox) {
            progBox.innerHTML = (dividas || []).length
              ? `
        <div class="progresso-barra">
            <div class="progresso-preenchimento" style="width:${percentual}%"></div>
        </div>

        <div class="prox-progresso-texto">
            <span>${percentual}% quitado</span>
            <span>falta ${formatarMoeda(tp)}</span>
        </div>`
              : "";
            if (window.lucide) lucide.createIcons();
          }

          const pendentes = [];

          dividas.forEach((d) => {
            (d.parcelas || []).forEach((p) => {
              if (p.status === "pendente") {
                pendentes.push({
                  nome: d.nome,
                  valor: p.valor,
                  vencimento: p.vencimento,
                });
              }
            });
          });

          pendentes.sort(
            (a, b) => new Date(a.vencimento) - new Date(b.vencimento),
          );

          document.getElementById("resumoCards").innerHTML = `
    <div class="card dashboard-kpi dashboard-kpi-total">
        <h3>
            <i data-lucide="wallet" class="icon icon-sm"></i>
            Total
        </h3>
        <div class="valor">${formatarMoeda(tg)}</div>
    </div>

    <div class="card dashboard-kpi dashboard-kpi-pendente">
        <h3>
            <i data-lucide="clock" class="icon icon-sm"></i>
            Pendente
        </h3>
        <div class="valor" style="color:var(--danger)">
            ${formatarMoeda(tp)}
        </div>
    </div>

    <div class="card dashboard-kpi dashboard-kpi-pago">
        <h3>
            <i data-lucide="badge-check" class="icon icon-sm"></i>
            Pago
        </h3>
        <div class="valor" style="color:var(--success)">
            ${formatarMoeda(tpg)}
        </div>
    </div>

    <div class="card dashboard-kpi dashboard-kpi-parcelas">
        <h3>
            <i data-lucide="layers" class="icon icon-sm"></i>
            Parcelas
        </h3>
        <div class="valor">${qp} pend.</div>
    </div>
`;
          if (window.lucide) lucide.createIcons();

          const termo = (
            document.getElementById("buscaDivida")?.value || ""
          ).toLowerCase();

          const c = document.getElementById("listaDividas");

          if (!c) return;
          let ord = ordenarDividas(dividas).filter((d) =>
            d.nome.toLowerCase().includes(termo),
          );
          const hoje = new Date();

          if (filtroDividasAtual === "vencidas") {
            ord = ord.filter((d) =>
              d.parcelas?.some(
                (p) => p.status === "pendente" && new Date(p.vencimento) < hoje,
              ),
            );
          } else if (filtroDividasAtual === "proximas") {
            ord = ord.filter((d) =>
              d.parcelas?.some((p) => {
                if (p.status !== "pendente") return false;

                const dias = Math.ceil(
                  (new Date(p.vencimento) - hoje) / (1000 * 60 * 60 * 24),
                );

                return dias >= 0 && dias <= 7;
              }),
            );
          } else if (filtroDividasAtual === "quitadas") {
            ord = ord.filter((d) =>
              d.parcelas?.every((p) => p.status === "pago"),
            );
          } else {
            // "todas" — oculta completamente quitadas
            ord = ord.filter((d) =>
              d.parcelas?.some((p) => p.status === "pendente"),
            );
          }

          if (!ord.length) {
            c.innerHTML = `
              <div class="estado-vazio">
                <div class="estado-vazio-icone">
                  <i data-lucide="inbox" style="width:36px;height:36px;stroke:currentColor;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round"></i>
                </div>
                <h3>Nenhuma dívida aqui</h3>
                <p>Adicione sua primeira dívida para começar a controlar suas finanças.</p>
                <button class="btn" onclick="abrirNovaDivida()">
                  <i data-lucide="plus" class="icon icon-sm"></i> Adicionar dívida
                </button>
              </div>`;
            if (window.lucide) lucide.createIcons();
            return;
          }

          c.innerHTML = ord
            .map((d) => {
              const pg =
                d.parcelas?.filter((p) => p.status === "pago").length || 0;
              const tot = d.parcelas?.length || 0;
              const pr = tot > 0 ? (pg / tot) * 100 : 0;
              const proximaParcela = d.parcelas?.find(
                (p) => p.status === "pendente",
              );

              let statusVencimento = "";

              if (proximaParcela) {
                const hoje = new Date();
                hoje.setHours(0, 0, 0, 0);

                const venc = new Date(proximaParcela.vencimento);
                venc.setHours(0, 0, 0, 0);

                const diff = Math.floor((venc - hoje) / (1000 * 60 * 60 * 24));

                if (diff < 0) {
                  statusVencimento =
                    '<span class="status-atrasada"><i data-lucide="alert-triangle" class="icon icon-sm"></i>Atrasada</span>';
                } else if (diff === 0) {
                  statusVencimento =
                    '<span class="status-hoje"><i data-lucide="alert-circle" class="icon icon-sm"></i>Vence Hoje</span>';
                } else if (diff === 1) {
                  statusVencimento =
                    '<span class="status-amanha"><i data-lucide="clock" class="icon icon-sm"></i>Vence Amanha</span>';
                } else {
                  statusVencimento =
                    '<span class="status-emdia"><i data-lucide="check-circle" class="icon icon-sm"></i>Em Dia</span>';
                }
              }
              const safeNome = escapeHtml(d.nome);
              const safeObs = d.observacao ? escapeHtml(d.observacao.substring(0, 60)) : "";
              const obsSuffix = d.observacao && d.observacao.length > 60 ? "..." : "";
              const textoVenc = proximaParcela ? getTextoVencimento(proximaParcela.vencimento) : "";

              return `<div class="divida-card ${getClasseVencimento(d)}" id="card-${escapeHtml(d.id)}">

                        <div class="divida-cabecalho" role="button" tabindex="0" aria-expanded="false" aria-controls="parcelas-${escapeHtml(d.id)}" onclick="window.toggleExpansao(${jsArg(d.id)})" onkeydown="if(event.key === 'Enter' || event.key === ' '){event.preventDefault();window.toggleExpansao(${jsArg(d.id)})}">
                            <div class="divida-info-col">
                                <div class="divida-nome-linha">
                                  <span class="nome">${safeNome}</span>
                                  ${getCatBadge(d.categoria)}
                                </div>
                                <div class="divida-meta-linha">
                                  <span class="divida-meta-texto">${pg}/${tot} pagas</span>
                                  ${textoVenc ? `<span class="divida-meta-sep">•</span><span class="divida-meta-texto">${textoVenc}</span>` : ""}
                                </div>
                                ${safeObs ? `<span class="observacao-texto">${safeObs}${obsSuffix}</span>` : ""}
                                <div class="progresso-barra"><div class="progresso-preenchimento" style="width:${pr}%"></div></div>
                            </div>

                            <div class="divida-valor-col">
                                <span class="valor-destaque">${formatarMoeda(d.valorTotal || 0)}</span>
                                <div class="divida-status-linha">
                                  ${statusVencimento}
                                  <span class="seta-expandir"><i data-lucide="chevron-down" class="icon icon-sm"></i></span>
                                </div>
                            </div>
                        </div>

                        <div class="parcelas-container" id="parcelas-${escapeHtml(d.id)}">
                                <div class="parcelas-titulo">
                                    <span>Parcelas</span>
                                    <span>${pg}/${tot} pagas (${pr.toFixed(0)}%)</span>
                                </div>
                                ${(d.parcelas || [])
                                  .map(
                                    (p) => `<div class="parcela-linha">
                                <div class="parcela-descricao">
                                    <span class="parcela-status"><i data-lucide="${p.status === "pago" ? "check-circle" : "circle-dashed"}" class="icon icon-sm"></i></span>
                                    <span class="parcela-identificacao">
                                      <strong>${escapeHtml(String(p.numero))}ª parcela</strong>
                                      <span class="parcela-vencimento">Vence em ${formatarData(p.vencimento)}</span>
                                    ${p.pagoEm ? `<span class="parcela-historico">Pago: ${formatarDataHora(p.pagoEm)}</span>` : ""}
                                    </span>
                                    <strong class="parcela-valor">${formatarMoeda(p.valor || 0)}</strong>
                                </div>
                                <button class="parcela-acao btn-sm ${p.status === "pendente" ? "btn-success" : "btn-warning"}"
    aria-label="${p.status === "pendente" ? "Pagar" : "Reabrir"} parcela ${escapeHtml(String(p.numero))}"
    onclick="event.stopPropagation();window.pagarParcela(${jsArg(d.id)},${jsArg(p.id)})"
    >
    ${
      p.status === "pendente"
        ? '<i data-lucide="check-circle" class="icon icon-sm"></i> Pagar'
        : '<i data-lucide="rotate-ccw" class="icon icon-sm"></i> Reabrir'
    }</button>
                            </div>`,
                              )
                              .join("")}

                                <div class="divida-rodape-acoes">
                                    <button class="btn-sm btn-outline"
                                        aria-label="Editar ${safeNome}"
                                        onclick="event.stopPropagation();window.editarDivida(${jsArg(d.id)})">
                                        <i data-lucide="pencil" class="icon icon-sm"></i> Editar
                                    </button>
                                    <button class="btn-sm btn-outline btn-perigo"
                                        aria-label="Excluir ${safeNome}"
                                        onclick="event.stopPropagation();window.excluirDivida(${jsArg(d.id)})">
                                        <i data-lucide="trash-2" class="icon icon-sm"></i> Excluir
                                    </button>
                                </div>
                        </div>
                    </div>`;
            })
            .join("");
          if (window.lucide) lucide.createIcons();

          const proximasVencimentos = [];

          dividas.forEach((d) => {
            (d.parcelas || []).forEach((p) => {
              if (p.status === "pendente") {
                proximasVencimentos.push({
                  nome: d.nome,
                  valor: p.valor || 0,
                  vencimento: p.vencimento,
                });
              }
            });
          });

          proximasVencimentos.sort(
            (a, b) => new Date(a.vencimento) - new Date(b.vencimento),
          );

          const lista = document.getElementById("listaProximosVencimentos");

          if (proximasVencimentos.length === 0) {
            lista.innerHTML = `
        <div style="text-align:center;padding:15px;display:flex;flex-direction:column;align-items:center;gap:8px">
            <i data-lucide="party-popper" class="icon"></i>
            Nenhuma conta pendente
        </div>
    `;
          } else {
            lista.innerHTML = proximas
              .slice(1, 6)
              .map(
                (v) => `
            <div class="vencimento-item">

                <div class="vencimento-info">
                    <span class="vencimento-nome">
                        ${escapeHtml(v.nome)}
                    </span>

                    <span class="vencimento-data">
                        ${formatarData(v.vencimento)}
                    </span>
                </div>

                <span class="vencimento-valor">
                    ${formatarMoeda(v.valor)}
                </span>

            </div>
         `,
              )
              .join("");
          }
          if (window.lucide) lucide.createIcons();

          document.querySelectorAll(".card").forEach((card) => {
            card.style.transform = "scale(1.03)";

            setTimeout(() => {
              card.style.transform = "scale(1)";
            }, 200);
          });
        }

        function getPrioridadeDivida(divida) {
          const pendente = divida.parcelas?.find(
            (p) => p.status === "pendente",
          );

          if (!pendente) return 9999;

          const hoje = new Date();
          const venc = new Date(pendente.vencimento);

          return venc - hoje;
        }

        const ord = dividas.sort(
          (a, b) => getPrioridadeDivida(a) - getPrioridadeDivida(b),
        );

        window.toggleExpansao = (id) => {
            const card =
              document.getElementById(`card-${id}`) ||
              document.getElementById(`card-relatorio-${id}`);

          if (card) {
            const expandido = card.classList.toggle("expandido");
            card
              .querySelector(".divida-cabecalho")
              ?.setAttribute("aria-expanded", String(expandido));
          }
        };
        // Relatórios
        window.aplicarFiltroPeriodo = () => {
          mesFiltroRelatorio =
            document.getElementById("filtroMes").value || null;
          const b = document.querySelector(
            `.filtro-btn[data-filtro="${filtroAtualRelatorio}"]`,
          );
          window.filtrarRelatorio(filtroAtualRelatorio, b);
        };

        window.limparFiltroPeriodo = () => {
          document.getElementById("filtroMes").value = "";
          mesFiltroRelatorio = null;
          aplicarFiltroPeriodo();
        };

        window.filtrarRelatorio = (f, b) => {
          filtroAtualRelatorio = f;
          document
            .querySelectorAll(".filtros-relatorio .filtro-btn")
            .forEach((x) => x.classList.remove("ativo"));
          if (b) b.classList.add("ativo");

          let l = dividas
            .map((d) => ({
              ...d,
              parcelas: (d.parcelas || []).filter((p) => {
                if (f !== "todas" && p.status !== f) return false;
                if (
                  mesFiltroRelatorio &&
                  p.vencimento?.substring(0, 7) !== mesFiltroRelatorio
                )
                  return false;
                return true;
              }),
            }))
            .filter((d) => d.parcelas.length > 0);

          const c = document.getElementById("listaRelatorio");
          const resultado = document.getElementById("relatorioResultado");
          if (resultado) {
            resultado.textContent = `${l.length} ${l.length === 1 ? "dívida" : "dívidas"}`;
          }
          if (!l.length) {
            c.innerHTML =
              '<div class="mensagem-vazia"><i data-lucide="search-x" class="icon icon-lg"></i>Nenhuma dívida encontrada para os filtros selecionados.</div>';
          } else {
            c.innerHTML = l
              .map((d) => {
                const totalVal = d.parcelas.reduce((s, p) => s + (p.valor || 0), 0);
                const pagasCount = d.parcelas.filter((p) => p.status === "pago").length;
                return `<div class="divida-card" id="card-relatorio-${escapeHtml(d.id)}">
                        <div class="divida-cabecalho" role="button" tabindex="0" aria-expanded="false" aria-controls="parcelas-relatorio-${escapeHtml(d.id)}" onclick="window.toggleExpansao(${jsArg(d.id)})" onkeydown="if(event.key === 'Enter' || event.key === ' '){event.preventDefault();window.toggleExpansao(${jsArg(d.id)})}">
                            <div class="divida-info-col">
                              <div class="divida-nome-linha">
                                <span class="nome">${escapeHtml(d.nome)}</span>
                                ${getCatBadge(d.categoria)}
                              </div>
                              <div class="divida-meta-linha">
                                <span class="divida-meta-texto">${pagasCount}/${d.parcelas.length} pagas no filtro</span>
                              </div>
                            </div>
                            <div class="divida-valor-col">
                              <span class="valor-destaque">${formatarMoeda(totalVal)}</span>
                              <div class="divida-status-linha">
                                <span class="seta-expandir"><i data-lucide="chevron-down" class="icon icon-sm"></i></span>
                              </div>
                            </div>
                        </div>
                        <div class="parcelas-container" id="parcelas-relatorio-${escapeHtml(d.id)}">
                            <div class="parcelas-titulo">
                                <span>Parcelas do filtro</span>
                                <span>${pagasCount}/${d.parcelas.length} pagas</span>
                            </div>
                            ${d.parcelas
                              .map(
                                (p) => `<div class="parcela-linha">
                                <div class="parcela-descricao">
                                  <span class="parcela-status"><i data-lucide="${p.status === "pago" ? "check-circle" : "circle-dashed"}" class="icon icon-sm"></i></span>
                                  <span class="parcela-identificacao">
                                    <strong>${escapeHtml(String(p.numero))}ª parcela</strong>
                                    <span class="parcela-vencimento">Vence em ${formatarData(p.vencimento)}</span>
                                    ${p.pagoEm ? `<span class="parcela-historico">Pago: ${formatarDataHora(p.pagoEm)}</span>` : ""}
                                  </span>
                                  <strong class="parcela-valor">${formatarMoeda(p.valor || 0)}</strong>
                                </div>
                            </div>`,
                              )
                              .join("")}
                        </div>
                    </div>`;
              })
              .join("");
          }
          if (window.lucide) lucide.createIcons();
          atualizarGrafico(l);
        };

        function atualizarGrafico(d) {
          let totalParcelas = 0;
          let parcelasPagas = 0;

          d.forEach((x) => {
            x.parcelas.forEach((p) => {
              totalParcelas++;

              if (p.status === "pago") {
                parcelasPagas++;
              }
            });
          });

          const percentual =
            totalParcelas > 0
              ? Math.round((parcelasPagas / totalParcelas) * 100)
              : 0;

          document.getElementById("barraQuitacao").style.width =
            percentual + "%";

          document.getElementById("textoQuitacao").textContent =
            percentual + "% quitado";

          document.getElementById("relParcelas").textContent = totalParcelas;

          document.getElementById("relPercentual").textContent =
            percentual + "%";

          const proximoFoco = d
            .flatMap((x) => x.parcelas)
            .filter((p) => p.status === "pendente")
            .sort((a, b) => new Date(a.vencimento) - new Date(b.vencimento))[0];
          const foco = document.getElementById("relatorioFoco");
          if (foco) {
            foco.innerHTML = proximoFoco
              ? `<div class="relatorio-foco-icone"><i data-lucide="target" class="icon"></i></div>
                 <div class="relatorio-foco-conteudo"><span class="eyebrow">PRÓXIMO FOCO</span><strong>Priorize ${formatarMoeda(proximoFoco.valor || 0)}</strong><span>Vencimento em ${formatarData(proximoFoco.vencimento)}</span></div>`
              : `<div class="relatorio-foco-icone"><i data-lucide="circle-check" class="icon"></i></div><div class="relatorio-foco-conteudo"><span class="eyebrow">TUDO EM DIA</span><strong>Nenhuma parcela pendente neste filtro</strong><span>Continue acompanhando seu progresso.</span></div>`;
            if (window.lucide) lucide.createIcons();
          }

          const rankingTotal = [...d]
            .map((x) => ({
              ...x,
              valorFiltrado: x.parcelas.reduce((s, p) => s + (p.valor || 0), 0),
            }))
            .sort((a, b) => b.valorFiltrado - a.valorFiltrado);
          const rankingTop = rankingTotal.slice(0, 3);
          const rankingResto = rankingTotal.slice(3);

          const rankLinha = (x, i) => `
        <div class="rank-linha">
            <span class="rank-pos">${i + 1}</span>
            <span class="rank-nome">${escapeHtml(x.nome)}</span>
            <strong>${formatarMoeda(x.valorFiltrado || 0)}</strong>
        </div>`;

          const rankingEl = document.getElementById("rankingDividas");
          if (!d.length) {
            rankingEl.innerHTML = "";
          } else {
          rankingEl.innerHTML = `
<div class="card" style="margin-bottom:15px">

    <h2>Maiores valores no filtro</h2>

    ${rankingTop.map(rankLinha).join("")}

    ${
      rankingResto.length
        ? `<div id="rankingExtra" style="display:none">${rankingResto
            .map(rankLinha)
            .join("")}</div>
        <button class="btn-ranking-todas" type="button" id="btnRankingExtra" onclick="window.toggleRankingExtra()">
            Ver todas as dívidas (${rankingResto.length})
        </button>`
        : ""
    }

</div>
`;
          }
          if (window.lucide) lucide.createIcons();

          const ctx = document
            .getElementById("graficoDividas")
            ?.getContext("2d");
          if (!ctx) return;
          if (graficoInstance) graficoInstance.destroy();
          let pnd = 0;
          let pag = 0;

          d.forEach((x) =>
            x.parcelas.forEach((p) =>
              p.status === "pago"
                ? (pag += p.valor || 0)
                : (pnd += p.valor || 0),
            ),
          );

          document.getElementById("relPendente").textContent =
            formatarMoeda(pnd);

          document.getElementById("relPago").textContent = formatarMoeda(pag);

          if (window.aplicarTemaGraficos) window.aplicarTemaGraficos();

          aplicarTemaGraficos();
          graficoInstance = new Chart(ctx, {
            type: "doughnut",
            data: {
              labels: ["Pendentes", "Pagas"],
              datasets: [
                { data: [pnd, pag], backgroundColor: [corTema("--danger"), corTema("--success")], borderColor: corTema("--bg-card") },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { position: "bottom" } },
            },
          });

          atualizarGraficoCategorias(d);
        }

        window.toggleRankingExtra = () => {
          const box = document.getElementById("rankingExtra");
          const btn = document.getElementById("btnRankingExtra");
          if (!box) return;
          const aberto = box.style.display !== "none";
          box.style.display = aberto ? "none" : "";
          const total = box.children.length;
          if (btn) btn.textContent = aberto ? `Ver todas as dívidas (${total})` : "Mostrar menos";
        };

        function atualizarGraficoCategorias(d) {
          const ctx = document
            .getElementById("graficoCategorias")
            ?.getContext("2d");
          if (!ctx) return;
          if (graficoCategoriasInstance) graficoCategoriasInstance.destroy();

          // Paleta categórica equilibrada (Tableau 10): uma cor distinta por categoria
          const coresPorCategoria = {
            cartao: "#4E79A7",
            emprestimo: "#E15759",
            boleto: "#B07AA1",
            assinatura: "#76B7B2",
            educacao: "#59A14F",
            saude: "#FF9DA7",
            moradia: "#9C755F",
            transporte: "#F28E2B",
            alimentacao: "#EDC948",
            lazer: "#8CD17D",
            imposto: "#BAB0AC",
            outros: "#79706E",
          };

          const nomesPorCategoria = {
            cartao: "Cartão",
            emprestimo: "Empréstimo",
            boleto: "Boleto",
            assinatura: "Assinatura",
            educacao: "Educação",
            saude: "Saúde",
            moradia: "Moradia",
            transporte: "Transporte",
            alimentacao: "Alimentação",
            lazer: "Lazer",
            imposto: "Impostos",
            outros: "Outros",
          };

          const totaisPorCategoria = {};
          d.forEach((divida) => {
            const cat = divida.categoria || "outros";
            totaisPorCategoria[cat] =
              (totaisPorCategoria[cat] || 0) + (divida.valorTotal || 0);
          });

          const categoriasComValor = Object.keys(totaisPorCategoria).filter(
            (cat) => totaisPorCategoria[cat] > 0,
          );

          if (!categoriasComValor.length) return;

          if (window.aplicarTemaGraficos) window.aplicarTemaGraficos();

          aplicarTemaGraficos();
          graficoCategoriasInstance = new Chart(ctx, {
            type: "pie",
            data: {
              labels: categoriasComValor.map(
                (cat) => nomesPorCategoria[cat] || cat,
              ),
              datasets: [
                {
                  data: categoriasComValor.map((cat) => totaisPorCategoria[cat]),
                  backgroundColor: categoriasComValor.map(
                    (cat) => coresPorCategoria[cat] || "#999",
                  ),
                  borderColor: corTema("--bg-card"),
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } } },
            },
          });
        }

        // Modal Recuperação
        window.abrirModalRecuperacao = () => {
          document.getElementById("modalRecuperacao").style.display = "flex";
        };
        window.fecharModalRecuperacao = () => {
          document.getElementById("modalRecuperacao").style.display = "none";
        };
        window.recuperarSenha = async () => {
          const e = document.getElementById("recEmail").value.trim();
          const btn = document.getElementById("btnRecuperar");
          if (!e) { mostrarToast("Digite seu email.", "erro"); return; }
          setBtnLoading(btn, true);
          try {
            await auth.sendPasswordResetEmail(e);
            mostrarToast("Email enviado! Verifique sua caixa de entrada.", "sucesso");
            window.fecharModalRecuperacao();
          } catch (er) {
            mostrarToast(
              "Erro ao enviar email. Verifique se o email esta correto.",
              "erro"
            );
          }
          setBtnLoading(btn, false);
        };

        function gerarResumoDividas() {
          if (!dividas.length) return "Nenhuma dívida cadastrada.";
          let txt = "Resumo das dívidas:\n";
          dividas.forEach((d) => {
            const pend =
              d.parcelas?.filter((p) => p.status === "pendente").length || 0;
            const pago =
              d.parcelas?.filter((p) => p.status === "pago").length || 0;
            const total = d.parcelas?.length || 0;
            txt += `- ${d.nome} (${d.categoria}): ${formatarMoeda(d.valorTotal || 0)} - ${pago}/${total} pagas, ${pend} pendentes\n`;
            d.parcelas?.forEach((p) => {
              if (p.status === "pendente")
                txt += `  • ${p.numero}ª parcela: ${formatarMoeda(p.valor || 0)} vence ${formatarData(p.vencimento)}\n`;
            });
          });
          return txt;
        }

window.logout = async function() {
  limparListeners();
  currentUser = null;
  dividas = [];
  parcelasNotificadas = new Set();
  sessionStorage.clear();
  if (window.limparChatAssistente) window.limparChatAssistente();

  try {
    await firebase.auth().signOut();
  } catch (e) {}

  if (typeof Android !== 'undefined' && Android) {
    try { Android.signOut(); } catch (e) {}
  }

  mostrarTelaAuth();
};

// ============================================
// CONTROLE DE TELAS (ESCOPO GLOBAL)
// ============================================
// mostrarTelaAuth e mostrarApp já são expostas em window
// nas suas definições originais, dentro da IIFE acima.

// ============================================
// NAVEGACAO UNIFICADA (apenas navegar)
// ============================================

        // Init
        auth.onAuthStateChanged((user) => {
          if (user && !user.emailVerified) {
            // Email não confirmado: não abre o app (sessão antiga é encerrada)
            if (!verificandoEmail) auth.signOut();
            hideLoading();
            return;
          }
          if (user) {
            if (window.Android) {
              Android.salvarUid(user.uid);
            }

            currentUser = user;
            mostrarApp(user);
          } else {
            currentUser = null;
            dividas = [];
            limparListeners();
            if (window.limparChatAssistente) window.limparChatAssistente();
            mostrarTelaAuth();
          }

          hideLoading();
        });

        window.onload = () => {
          document.getElementById("dataVencimento").value = hojeStr();
          // Firebase conecta em background — sem overlay na tela de auth
          verificarAtualizacaoApp();
        };

        // Mesma restrição do app nativo (MainActivity.APK_URL_PREFIX)
        const APK_URL_PREFIX = "https://github.com/Heberttdev/App_Financas/releases/download/";

        function verificarAtualizacaoApp() {
          if (!window.Android || typeof window.Android.getVersionCode !== "function") return;

          fetch("/version.json")
            .then((r) => r.json())
            .then((dados) => {
              const versaoLocal = window.Android.getVersionCode();
              if (dados.versionCode > versaoLocal) {
                mostrarBannerAtualizacao(dados.versionName, dados.apkUrl);
              }
            })
            .catch(() => {});
        }

        function mostrarBannerAtualizacao(versionName, apkUrl) {
          const banner = document.createElement("div");
          banner.style.cssText =
            "position:fixed;top:0;left:0;right:0;z-index:3000;background:var(--gradient);color:#fff;padding-top:calc(12px + env(safe-area-inset-top));padding-bottom:12px;padding-left:16px;padding-right:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;";
          banner.innerHTML = `
            <span style="display:flex;align-items:center;gap:6px"><i data-lucide="rocket" class="icon icon-sm"></i>Nova versao ${escapeHtml(versionName)} disponivel</span>
            <button style="background:#fff;color:var(--primary);border:none;border-radius:8px;padding:6px 12px;font-weight:600;font-size:12px;cursor:pointer">Atualizar</button>
          `;
          banner.querySelector("button").onclick = () => {
            if (typeof apkUrl !== "string" || !apkUrl.startsWith(APK_URL_PREFIX)) return;
            window.open(apkUrl, "_blank");
          };
          document.body.prepend(banner);
          if (window.lucide) lucide.createIcons();
        }
      })();
