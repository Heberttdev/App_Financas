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
        let mesFiltroRelatorio = null,
          graficoInstance = null,
          graficoCategoriasInstance = null;
        let listenersAtivos = [],
          formularioModificado = false;
        let filtroDividasAtual = "todas";
        let isLoading = false;

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
          d ? d.split("-").reverse().join("/") : "-";
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
        const formatarMoeda = (v) =>
          Number(v).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          });

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

        window.alternarTema = () => {
          const escuro = raiz.classList.toggle("dark-mode");
          raiz.classList.toggle("light-mode", !escuro);
          localStorage.setItem("tema", escuro ? "dark" : "light");
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
          showLoading("Criando conta...");
          try {
            const uc = await auth.createUserWithEmailAndPassword(e, s);
            await uc.user.updateProfile({ displayName: n });
            await db
              .ref("usuarios/" + uc.user.uid + "/perfil")
              .set({ nome: n, email: e, criadoEm: agoraISO() });
            hideLoading();
            alert("Conta criada! Faça login.");
            window.toggleAuthForm("login");
            document.getElementById("loginEmail").value = e;
          } catch (er) {
            hideLoading();
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
          showLoading("Entrando...");
          try {
            await auth.signInWithEmailAndPassword(e, s);
            hideLoading();
          } catch (er) {
            hideLoading();
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
            sessionStorage.removeItem("userLoggedIn");
            sessionStorage.removeItem("userEmail");
            sessionStorage.removeItem("userUid");
            return;
          }

          try {
            const userData =
              typeof userJson === "string" ? JSON.parse(userJson) : userJson;
            console.log(
              "✅ Usuário recebido do Android:",
              userData.email,
              "UID:",
              userData.uid,
            );

            // Salvar estado
            sessionStorage.setItem("userLoggedIn", "true");
            sessionStorage.setItem("userEmail", userData.email);
            sessionStorage.setItem("userUid", userData.uid);

            // 🔑 Autenticar no Firebase Web SDK
            if (userData.idToken && userData.idToken.length > 0) {
              console.log("🔑 Autenticando no Firebase Web SDK com token...");

              const credential = firebase.auth.GoogleAuthProvider.credential(
                userData.idToken,
                null,
              );

              firebase
                .auth()
                .signInWithCredential(credential)
                .then((result) => {
                  console.log(
                    "✅ Firebase Web SDK autenticado:",
                    result.user.email,
                  );
                  // O onAuthStateChanged do Firebase vai disparar
                })
                .catch((error) => {
                  console.error(
                    "❌ Erro ao autenticar no Firebase Web:",
                    error,
                  );
                  // Fallback: usar dados do Android
                  usarDadosDoAndroid(userData);
                });
            } else {
              // Sem token, usar dados do Android
              console.log("⚠️ Sem token, usando dados do Android diretamente");
              usarDadosDoAndroid(userData);
            }
          } catch (error) {
            console.error("❌ Erro ao processar dados do usuário:", error);
          }
        };

        // ============================================
        // FALLBACK - USAR DADOS DO ANDROID
        // ============================================
        function usarDadosDoAndroid(userData) {
          console.log("📱 Usando dados do Android como fallback");

          const user = {
            uid: userData.uid,
            displayName: userData.displayName || userData.email,
            email: userData.email,
            photoURL: userData.photoURL || "",
          };

          if (window.Android) {
            Android.salvarUid(userData.uid);
          }

          // Forçar o Firebase Auth a reconhecer o usuário
          // Isso é um fallback para quando o token não funciona
          if (typeof firebase !== "undefined" && firebase.auth) {
            firebase
              .auth()
              .updateCurrentUser(user)
              .then(() => {
                console.log("✅ Firebase Auth atualizado com dados do Android");
              })
              .catch((error) => {
                console.warn(
                  "⚠️ Não foi possível atualizar o Firebase Auth:",
                  error,
                );
              });
          }

          mostrarApp(user);
        }

        // ============================================
        // FUNÇÃO PARA MOSTRAR UI DO USUÁRIO
        // ============================================
        function mostrarUIUsuario(userData) {
          console.log("🔄 Mostrando UI para:", userData.email);

          // Atualizar nome
          const nomeEl = document.getElementById("nomeUsuario");
          if (nomeEl) {
            nomeEl.textContent = userData.displayName || userData.email;
          }

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
          ].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.classList.remove("active");
          });
          document.getElementById("authScreen").classList.add("active");
          const navBottom = document.querySelector(".nav-bottom");
          if (navBottom) navBottom.style.display = "none";
          const fab = document.getElementById("fabNovaDivida");
          if (fab) fab.classList.remove("visivel");
        }
        window.mostrarTelaAuth = mostrarTelaAuth;

        function mostrarApp(user) {
          console.log("Mostrando app para:", user.email);

          if (!user || !user.uid) {
            console.error("Usuário inválido!");
            return;
          }

          currentUser = user;

          // Esconder tela de login
          const authScreen = document.getElementById("authScreen");
          const mainScreen = document.getElementById("mainScreen");

          if (authScreen) authScreen.classList.remove("active");
          if (mainScreen) mainScreen.classList.add("active");

          const nomeEl = document.getElementById("nomeUsuario");
          if (nomeEl) nomeEl.textContent = user.displayName || user.email;

          // Mostrar nav bottom
          const navBottom = document.querySelector(".nav-bottom");
          if (navBottom) navBottom.style.display = "flex";

          // Mostrar FAB
          const fab = document.getElementById("fabNovaDivida");
          if (fab) fab.classList.add("visivel");

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
                <i data-lucide="${passo.icone}" style="width:30px;height:30px;stroke:white;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"></i>
              </div>
              <h3>${passo.titulo}</h3>
              <p>${passo.texto}</p>
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

        function verificarParcelasVencendo() {
          if (!window.Android) return;

          const hoje = new Date();

          dividas.forEach((divida) => {
            if (!divida.parcelas) return;

            divida.parcelas.forEach((parcela) => {
              if (parcela.status !== "pendente") return;

              const vencimento = new Date(parcela.vencimento);

              const diffDias = Math.ceil(
                (vencimento - hoje) / (1000 * 60 * 60 * 24),
              );

              if (diffDias === 3) {
                Android.mostrarNotificacao(
                  "Parcela vencendo",
                  `${divida.nome} vence em 3 dias`,
                );
              }
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
              console.log("✅ Dividas carregadas:", dividas.length);

              isLoading = false;

              // Atualizar UI
              atualizarDashboard();

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

        function mostrarSkeletonDashboard() {
          const resumo = document.getElementById("resumoCards");
          if (!resumo) return;

          const cardSkeleton = `
            <div class="skeleton-card">
              <div class="skeleton skeleton-line curta"></div>
              <div class="skeleton skeleton-line larga" style="height:22px;margin-top:6px"></div>
            </div>`;

          resumo.innerHTML = `<div class="skeleton-resumo-cards">${cardSkeleton.repeat(4)}</div>`;

          const proxima = document.getElementById("proximaContaCard");
          if (proxima) {
            proxima.innerHTML = `
              <div class="skeleton-card">
                <div class="skeleton skeleton-line curta"></div>
                <div class="skeleton skeleton-line media" style="height:18px;margin-top:8px"></div>
                <div class="skeleton skeleton-line larga" style="height:16px"></div>
              </div>`;
          }
        }
        async function salvarDividasNoBanco() {
          if (!currentUser) return;
          const d = {};
          dividas.forEach((x) => {
            d[x.id] = x;
          });
          try {
            await db.ref("usuarios/" + currentUser.uid + "/dividas").set(d);
            console.log("Dados salvos com sucesso");
          } catch (error) {
            console.error("Erro ao salvar:", error);
            alert("Erro ao salvar. Verifique as regras do banco de dados.");
          }
        }

        // Navegação
        window.navegar = (t) => {
          [
            "mainScreen",
            "dividasScreen",
            "adicionarScreen",
            "relatoriosScreen",
          ].forEach((id) =>
            document.getElementById(id).classList.remove("active"),
          );
          document
            .querySelectorAll(".nav-item")
            .forEach((el) => el.classList.remove("active"));

          // FAB visível nas telas onde faz sentido adicionar
          const fab = document.getElementById("fabNovaDivida");
          if (fab) {
            fab.classList.toggle("visivel", t === "dashboard" || t === "dividas");
          }

          if (t === "dashboard") {
            document.getElementById("mainScreen").classList.add("active");
            document
              .querySelector('.nav-item[data-tela="dashboard"]')
              .classList.add("active");
            atualizarDashboard();
          } else if (t === "adicionar") {
            document.getElementById("adicionarScreen").classList.add("active");
            document
              .querySelector('.nav-item[data-tela="adicionar"]')
              .classList.add("active");
          } else if (t === "relatorios") {
            document.getElementById("relatoriosScreen").classList.add("active");
            document
              .querySelector('.nav-item[data-tela="relatorios"]')
              .classList.add("active");
            aplicarFiltroPeriodo();
          } else if (t === "dividas") {
            document.getElementById("dividasScreen").classList.add("active");
            document
              .querySelector('.nav-item[data-tela="dividas"]')
              ?.classList.add("active");
            atualizarDashboard();
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

          if (eid) {
            const idx = dividas.findIndex((d) => d.id === eid);
            if (idx !== -1)
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
            document
              .getElementById("adicionarScreen")
              .removeAttribute("data-editing-id");
          } else {
            dividas.push({
              id: Date.now().toString(),
              nome,
              categoria: cat,
              valorTotal: vt,
              parcelada: parc,
              numParcelas: np,
              parcelas: ps,
              observacao: obs,
              criadoEm: agoraISO(),
            });
          }

          setBtnLoading(btn, true);
          await salvarDividasNoBanco();
          setBtnLoading(btn, false);
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

          // remove localmente e re-renderiza imediatamente
          dividas = dividas.filter((d) => d.id !== id);
          atualizarDashboard();

          let cancelado = false;
          let timer;

          const container = document.querySelector(".toast-container");
          const el = document.createElement("div");
          el.className = "toast-undo";
          el.innerHTML = `
            <span>Dívida "<strong>${dividaRemovida.nome}</strong>" removida</span>
            <button class="toast-undo-btn">Desfazer</button>
          `;

          el.querySelector(".toast-undo-btn").onclick = () => {
            cancelado = true;
            clearTimeout(timer);
            dividas.push(dividaRemovida);
            dividas.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
            atualizarDashboard();
            el.remove();
          };

          container.appendChild(el);

          timer = setTimeout(async () => {
            el.remove();
            if (!cancelado) {
              await salvarDividasNoBanco();
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
              await salvarDividasNoBanco();
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

          const resumo = document.getElementById("resumoDividas");

          if (resumo) {
            resumo.innerHTML = `
        <div class="card" style="margin-bottom:15px">
           <h3>
  <i data-lucide="bar-chart-2" class="icon icon-sm"></i>
  Resumo
</h3>

            ${vencidas} vencidas<br>
            ${alerta} próximas do vencimento<br>
            ${ok} em dia
        </div>
    `;
            if (window.lucide) lucide.createIcons();
          }

          if (!dividas) dividas = [];
          let tp = 0,
            tpg = 0,
            qp = 0,
            tg = 0;
          dividas.forEach((d) => {
            tg += d.valorTotal || 0;
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

          const maiorDivida = [...dividas].sort(
            (a, b) => (b.valorTotal || 0) - (a.valorTotal || 0),
          )[0];

          document.getElementById("resumoFinanceiroConteudo").innerHTML = `
    <div style="margin-top:10px">

        <div style="margin-bottom:8px">
            Total: <strong>${formatarMoeda(tg)}</strong>
        </div>

        <div style="margin-bottom:8px">
            Pago: <strong style="color:var(--success)">
                ${formatarMoeda(tpg)}
            </strong>
        </div>

        <div style="margin-bottom:12px">
            Falta: <strong style="color:var(--danger)">
                ${formatarMoeda(tp)}
            </strong>
        </div>

        ${
          maiorDivida
            ? `
            <div style="
                border-top:1px solid var(--border-light);
                padding-top:10px;
            ">
                <span style="display:flex;align-items:center;gap:6px;color:var(--text-secondary);font-size:13px">
                    <i data-lucide="trophy" class="icon icon-sm"></i> Maior dívida
                </span>

                <div style="
                    font-size:18px;
                    font-weight:bold;
                    margin-top:4px;
                ">
                    ${maiorDivida.nome}
                </div>

                <div style="color:var(--warning)">
                    ${formatarMoeda(maiorDivida.valorTotal || 0)}
                </div>
            </div>
            `
            : ""
        }

    </div>
`;
          if (window.lucide) lucide.createIcons();
          const proximas = [];

          dividas.forEach((d) => {
            d.parcelas?.forEach((p) => {
              if (p.status === "pendente") {
                proximas.push({
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
          if (proxima) {
            document.getElementById("proximaContaCard").innerHTML = `
        <div class="card-proxima">
            <div class="titulo">
                <i data-lucide="flame" class="icon icon-sm"></i> Próximo Vencimento
            </div>

            <h2>${proxima.nome}</h2>

            <div class="valor">
                ${formatarMoeda(proxima.valor)}
            </div>

            <small style="display:flex;align-items:center;gap:4px">
                <i data-lucide="calendar" class="icon icon-sm"></i> ${formatarData(proxima.vencimento)}
            </small>
        </div>
    `;
            if (window.lucide) lucide.createIcons();
          }

          const percentual = tg > 0 ? ((tpg / tg) * 100).toFixed(0) : 0;

          document.getElementById("progressoGeral").innerHTML = `
<div class="card">

   <h3>
    <i data-lucide="target" class="icon icon-sm"></i>
    Progresso Geral
</h3>

    <div class="progresso-barra">
        <div
            class="progresso-preenchimento"
            style="width:${percentual}%">
        </div>
    </div>

    <div style="margin-top:10px">
        ${formatarMoeda(tpg)}
    </div>

    <small>
        de ${formatarMoeda(tg)}
    </small>

    <div style="margin-top:8px;font-weight:bold">
        ${percentual}% quitado
    </div>

</div>
`;
          if (window.lucide) lucide.createIcons();

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
    <div class="card">
        <h3>
            <i data-lucide="wallet" class="icon icon-sm"></i>
            Total
        </h3>
        <div class="valor">${formatarMoeda(tg)}</div>
    </div>

    <div class="card">
        <h3>
            <i data-lucide="clock" class="icon icon-sm"></i>
            Pendente
        </h3>
        <div class="valor" style="color:var(--danger)">
            ${formatarMoeda(tp)}
        </div>
    </div>

    <div class="card">
        <h3>
            <i data-lucide="badge-check" class="icon icon-sm"></i>
            Pago
        </h3>
        <div class="valor" style="color:var(--success)">
            ${formatarMoeda(tpg)}
        </div>
    </div>

    <div class="card">
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
                    '<span class="status-amanha"><i data-lucide="clock" class="icon icon-sm"></i>Vence Amanhã</span>';
                } else {
                  statusVencimento =
                    '<span class="status-emdia"><i data-lucide="check-circle" class="icon icon-sm"></i>Em Dia</span>';
                }
              }
              return `<div class="divida-card ${getClasseVencimento(d)}" id="card-${d.id}">

                        <div class="divida-cabecalho" onclick="window.toggleExpansao('${d.id}')">
                            <div class="info">
                                <span class="nome">${d.nome}</span>
                               <span class="progresso">
    ${formatarMoeda(d.valorTotal || 0)}
    •
    ${pg}/${tot} pagas
</span>
${
  d.parcelas?.find((p) => p.status === "pendente")
    ? `<span class="progresso">
      ${getTextoVencimento(
        d.parcelas.find((p) => p.status === "pendente").vencimento,
      )}
   </span>`
    : ""
}
                               ${getCatBadge(d.categoria)}
${statusVencimento}
                                ${d.observacao ? `<span class="observacao-texto">${d.observacao.substring(0, 60)}${d.observacao.length > 60 ? "..." : ""}</span>` : ""}
                                <div class="progresso-barra"><div class="progresso-preenchimento" style="width:${pr}%"></div></div>
                            </div>
                            <div style="display:flex;align-items:center;gap:8px;">

    ${
      d.parcelas?.find((p) => p.status === "pendente")
        ? `
      <button
    class="btn-sm btn-success"
    onclick="
        event.stopPropagation();
        window.pagarParcela(
            '${d.id}',
            '${d.parcelas.find((p) => p.status === "pendente").id}'
        )
    ">
    <i data-lucide="check" class="icon icon-sm"></i>
</button>
      `
        : ""
    }

    <div class="acoes-cabecalho" onclick="event.stopPropagation()">

       <button class="btn-sm btn-outline"
    onclick="window.editarDivida('${d.id}')">
    <i data-lucide="pencil" class="icon icon-sm"></i>
</button>

        <button class="btn-sm btn-danger"
    onclick="window.excluirDivida('${d.id}')">
    <i data-lucide="trash-2" class="icon icon-sm"></i>
</button>

    </div>

    <span class="seta-expandir"><i data-lucide="chevron-down" class="icon icon-sm"></i></span>

</div>
                        </div>
                        <div class="parcelas-container">
                            ${(d.parcelas || [])
                              .map(
                                (p) => `<div class="parcela-linha">
                                <div class="parcela-descricao">
                                    <span class="parcela-status"><i data-lucide="${p.status === "pago" ? "check-circle" : "circle-dashed"}" class="icon icon-sm"></i></span>
                                    <span>${p.numero}ª <span class="parcela-vencimento">${formatarData(p.vencimento)}</span></span>
                                    ${p.pagoEm ? `<span class="parcela-historico">Pago: ${formatarDataHora(p.pagoEm)}</span>` : ""}
                                    <strong>${formatarMoeda(p.valor || 0)}</strong>
                                </div>
                                <button class="btn-sm ${p.status === "pendente" ? "btn-success" : "btn-warning"}"
    onclick="event.stopPropagation();window.pagarParcela('${d.id}','${p.id}')"
    style="width:auto;padding:0 12px;gap:6px">

    ${
      p.status === "pendente"
        ? '<i data-lucide="check-circle" class="icon icon-sm"></i> Pagar'
        : '<i data-lucide="rotate-ccw" class="icon icon-sm"></i> Reabrir'
    }</button>
                            </div>`,
                              )
                              .join("")}
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
              .slice(0, 5)
              .map(
                (v) => `
            <div class="vencimento-item">

                <div class="vencimento-info">
                    <span class="vencimento-nome">
                        ${v.nome}
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
          const card = document.getElementById(`card-${id}`);

          if (card) {
            card.classList.toggle("expandido");
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
            .querySelectorAll("#filtrosRelatorio .filtro-btn")
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
          if (!l.length) {
            c.innerHTML =
              '<div class="mensagem-vazia"><i data-lucide="search-x" class="icon icon-lg"></i>Nenhuma dívida encontrada para os filtros selecionados.</div>';
          } else {
            c.innerHTML = l
              .map(
                (d) => `<div class="divida-card" id="card-${d.id}">
                        <div class="divida-cabecalho" onclick="window.toggleExpansao('${d.id}')">
                            <div class="info"><span class="nome">${d.nome}</span>${getCatBadge(d.categoria)}</div>
                            <span class="seta-expandir"><i data-lucide="chevron-down" class="icon icon-sm"></i></span>
                        </div>
                        <div class="parcelas-container">
                            ${d.parcelas
                              .map(
                                (p) => `<div class="parcela-linha">
                                <span>${p.numero}ª ${formatarData(p.vencimento)}</span>
                                ${p.pagoEm ? `<span class="parcela-historico">Pago: ${formatarDataHora(p.pagoEm)}</span>` : ""}
                                <strong>${formatarMoeda(p.valor || 0)}</strong>
                                <span><i data-lucide="${p.status === "pago" ? "check-circle" : "circle-dashed"}" class="icon icon-sm"></i></span>
                            </div>`,
                              )
                              .join("")}
                        </div>
                    </div>`,
              )
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

          const ranking = [...d]
            .sort((a, b) => (b.valorTotal || 0) - (a.valorTotal || 0))
            .slice(0, 5);

          document.getElementById("rankingDividas").innerHTML = `
<div class="card" style="margin-bottom:15px">

    <h2> Maiores Dívidas</h2>

    ${ranking
      .map(
        (x, i) => `
        <div style="
            display:flex;
            justify-content:space-between;
            margin-top:10px;
        ">
            <span>${i + 1}º ${x.nome}</span>
            <strong>${formatarMoeda(x.valorTotal || 0)}</strong>
        </div>
      `,
      )
      .join("")}

</div>
`;

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

          graficoInstance = new Chart(ctx, {
            type: "doughnut",
            data: {
              labels: ["Pendentes", "Pagas"],
              datasets: [
                { data: [pnd, pag], backgroundColor: ["#d93025", "#34a853"] },
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

        function atualizarGraficoCategorias(d) {
          const ctx = document
            .getElementById("graficoCategorias")
            ?.getContext("2d");
          if (!ctx) return;
          if (graficoCategoriasInstance) graficoCategoriasInstance.destroy();

          const coresPorCategoria = {
            cartao: "#1565c0",
            emprestimo: "#c62828",
            boleto: "#6a1b9a",
            assinatura: "#2e7d32",
            educacao: "#3949ab",
            saude: "#c62828",
            moradia: "#2e7d32",
            transporte: "#ef6c00",
            alimentacao: "#f9a825",
            lazer: "#7b1fa2",
            imposto: "#455a64",
            outros: "#e65100",
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
          if (!e) return alert("Digite seu email.");
          setBtnLoading(btn, true);
          try {
            await auth.sendPasswordResetEmail(e);
            alert("Email enviado! Verifique sua caixa de entrada.");
            window.fecharModalRecuperacao();
          } catch (er) {
            alert(
              "Erro ao enviar email. Verifique se o email está correto.",
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

        // ============================================
// FUNÇÃO LOGOUT
// ============================================
window.logout = async function() {
  console.log("🚪 Logout chamado");
  
  if (!confirm("Deseja realmente sair?")) {
    return;
  }
  
  showLoading("Saindo...");
  
  try {
    // 1. Limpar listeners do Firebase
    if (typeof limparListeners === 'function') {
      limparListeners();
    }
    
    // 2. Deslogar do Firebase
    if (firebase && firebase.auth) {
      await firebase.auth().signOut();
    }
    
    // 3. Notificar o Android (se estiver no app)
    if (typeof Android !== 'undefined' && Android) {
      try {
        Android.signOut();
      } catch (e) {
        console.warn("Erro ao notificar Android:", e);
      }
    }
    
    // 4. Limpar dados locais
    currentUser = null;
    dividas = [];
    sessionStorage.clear();
    
    // 5. Esconder loading
    hideLoading();
    
    // 6. Mostrar tela de login
    mostrarTelaAuth();
    
    // 7. Esconder navegação inferior
    const navBottom = document.querySelector(".nav-bottom");
    if (navBottom) navBottom.style.display = "none";
    
    console.log("✅ Logout realizado com sucesso!");
    
  } catch (error) {
    console.error("❌ Erro durante logout:", error);
    hideLoading();
    
    // Fallback: limpar tudo manualmente
    currentUser = null;
    dividas = [];
    sessionStorage.clear();
    mostrarTelaAuth();
    
    const navBottom = document.querySelector(".nav-bottom");
    if (navBottom) navBottom.style.display = "none";
  }
};

// ============================================
// CONTROLE DE TELAS (ESCOPO GLOBAL)
// ============================================
// mostrarTelaAuth e mostrarApp já são expostas em window
// nas suas definições originais, dentro da IIFE acima.

// ============================================
// FUNÇÃO SIMPLES DE NAVEGAÇÃO
// ============================================
window.irPara = function(tela) {
  console.log("🧭 Indo para:", tela);
  
  // Esconder todas as telas do menu
  ['mainScreen', 'dividasScreen', 'adicionarScreen', 'relatoriosScreen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('active');
      el.style.display = 'none';
    }
  });
  
  // Mostrar a tela selecionada
  const targetId = {
    'dashboard': 'mainScreen',
    'dividas': 'dividasScreen',
    'adicionar': 'adicionarScreen',
    'relatorios': 'relatoriosScreen'
  }[tela];
  
  const target = document.getElementById(targetId);
  if (target) {
    target.classList.add('active');
    target.style.display = 'flex';
  }
  
  // Atualizar menu
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.remove('active');
  });
  const navItem = document.querySelector(`.nav-item[data-tela="${tela}"]`);
  if (navItem) {
    navItem.classList.add('active');
  }
  
  // Atualizar conteúdo
  if (tela === 'dashboard' || tela === 'dividas') {
    if (typeof atualizarDashboard === 'function') {
      setTimeout(atualizarDashboard, 100);
    }
  }
};

        // Init
        auth.onAuthStateChanged((user) => {
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
            mostrarTelaAuth();
          }

          hideLoading();
        });

        window.onload = () => {
          document.getElementById("dataVencimento").value = hojeStr();
          showLoading("Conectando ao Firebase...");
          // Timeout de segurança para o loading inicial
          setTimeout(() => {
            hideLoading();
          }, 8000);
          verificarAtualizacaoApp();
        };

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
            "position:fixed;top:0;left:0;right:0;z-index:3000;background:var(--gradient);color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;";
          banner.innerHTML = `
            <span style="display:flex;align-items:center;gap:6px"><i data-lucide="rocket" class="icon icon-sm"></i>Nova versão ${versionName} disponível</span>
            <button style="background:#fff;color:var(--primary);border:none;border-radius:8px;padding:6px 12px;font-weight:600;font-size:12px;cursor:pointer">Atualizar</button>
          `;
          banner.querySelector("button").onclick = () => {
            window.open(apkUrl, "_blank");
          };
          document.body.prepend(banner);
          if (window.lucide) lucide.createIcons();
        }
      })();