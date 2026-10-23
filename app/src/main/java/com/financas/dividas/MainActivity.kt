package com.financas.dividas

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceError
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager

import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.FirebaseUser

import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.URL
import java.util.concurrent.TimeUnit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class MainActivity : AppCompatActivity() {

    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var progressBar: ProgressBar
    private lateinit var webView: WebView
    private lateinit var skeletonOverlay: View
    private var skeletonAnimator: android.animation.ObjectAnimator? = null
    private lateinit var auth: FirebaseAuth
    private lateinit var googleSignInClient: GoogleSignInClient

    private val permissaoNotificacaoLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { concedida ->
        if (BuildConfig.DEBUG) android.util.Log.d(TAG, "Permissao concedida: $concedida")
    }

    companion object {
        private const val RC_SIGN_IN = 9001
        private const val TAG = "FirebaseAuth"
        private const val PREFS_NAME = "secure_app"
        private const val ALLOWED_HOST = "financas-f371a.web.app"
        private const val APK_URL_PREFIX = "https://github.com/Heberttdev/App_Financas/releases/download/"
    }

    // URL da página principal atual; a ponte JS só responde quando ela é do nosso domínio
    @Volatile
    private var urlAtual: Uri? = null

    private fun origemPermitida(): Boolean {
        val url = urlAtual ?: return false
        return url.scheme == "https" && (url.host == ALLOWED_HOST || url.host == "www.$ALLOWED_HOST")
    }

    private fun getEncryptedPrefs(): android.content.SharedPreferences {
        val masterKey = MasterKey.Builder(this)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        return EncryptedSharedPreferences.create(
            this,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    private fun solicitarPermissaoNotificacao() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val concedida = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED

            if (!concedida) {
                permissaoNotificacaoLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        criarCanalNotificacao()
        installSplashScreen()
        super.onCreate(savedInstanceState)

        solicitarPermissaoNotificacao()

        auth = FirebaseAuth.getInstance()

        // Configurar Google Sign-In
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(getString(R.string.default_web_client_id))
            .requestEmail()
            .build()

        googleSignInClient = GoogleSignIn.getClient(this, gso)

        setContentView(R.layout.activity_main)

        configurarBarrasDoSistema()

        configurarWorkManager()

        supportActionBar?.hide()

        progressBar = findViewById(R.id.progressBar)
        webView = findViewById(R.id.webview)
        swipeRefresh = findViewById(R.id.swipeRefresh)
        skeletonOverlay = findViewById(R.id.skeletonOverlay)

        mostrarSkeleton()

        swipeRefresh.setOnRefreshListener {
            mostrarSkeleton()
            webView.reload()
        }

        configurarWebView()

        webView.loadUrl("https://financas-f371a.web.app")
        verificarAtualizacao()

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        finish()
                    }
                }
            }
        )
    }

    // ============================================
    // BARRAS DO SISTEMA (Android 15 desenha o app por baixo delas)
    // ============================================
    private fun configurarBarrasDoSistema() {
        // Mesmo comportamento em todas as versões: o app desenha atrás das barras e aplica o recuo abaixo
        enableEdgeToEdge()
        val raiz = findViewById<View>(R.id.raiz)
        // O conteúdo fica entre a barra de status, a barra de navegação e o teclado
        ViewCompat.setOnApplyWindowInsetsListener(raiz) { v, insets ->
            val barras = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val teclado = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(barras.left, barras.top, barras.right, maxOf(barras.bottom, teclado.bottom))
            WindowInsetsCompat.CONSUMED
        }
        val noturno = (resources.configuration.uiMode and
            android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
            android.content.res.Configuration.UI_MODE_NIGHT_YES
        aplicarTemaBarras(noturno)
    }

    // Ícones escuros nas barras quando o app está claro, e claros quando está escuro
    private fun aplicarTemaBarras(escuro: Boolean) {
        val controle = WindowCompat.getInsetsController(window, window.decorView)
        controle.isAppearanceLightStatusBars = !escuro
        controle.isAppearanceLightNavigationBars = !escuro
        findViewById<View>(R.id.raiz)?.setBackgroundColor(
            android.graphics.Color.parseColor(if (escuro) "#0F141A" else "#F6F7F9")
        )
    }

    private fun mostrarSkeleton() {
        if (!::skeletonOverlay.isInitialized) return
        skeletonOverlay.visibility = View.VISIBLE
        skeletonOverlay.alpha = 1f
        if (skeletonAnimator == null) {
            skeletonAnimator = android.animation.ObjectAnimator.ofFloat(
                skeletonOverlay, View.ALPHA, 1f, 0.55f, 1f
            ).apply {
                duration = 1100
                repeatCount = android.animation.ValueAnimator.INFINITE
                repeatMode = android.animation.ValueAnimator.REVERSE
            }
        }
        if (skeletonAnimator?.isRunning != true) skeletonAnimator?.start()
    }

    private fun esconderSkeleton() {
        if (!::skeletonOverlay.isInitialized) return
        if (skeletonOverlay.visibility != View.VISIBLE) return
        skeletonAnimator?.cancel()
        skeletonOverlay.animate()
            .alpha(0f)
            .setDuration(250)
            .withEndAction { skeletonOverlay.visibility = View.GONE }
            .start()
    }

    private fun configurarWebView() {
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.setSupportZoom(false)
        webView.settings.useWideViewPort = true
        webView.settings.loadWithOverviewMode = true
        webView.settings.loadsImagesAutomatically = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.settings.javaScriptCanOpenWindowsAutomatically = false

        // 🔑 Interface Android com nome "Android"
        webView.addJavascriptInterface(AndroidBridge(), "Android")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url
                val host = url?.host ?: return true

                if (host == ALLOWED_HOST || host == "www.$ALLOWED_HOST") {
                    return false
                }

                try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url.toString()))
                    startActivity(intent)
                } catch (e: Exception) {
                    if (BuildConfig.DEBUG) e.printStackTrace()
                }
                return true
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                urlAtual = url?.let { Uri.parse(it) }
                super.onPageStarted(view, url, favicon)
                mostrarSkeleton()
            }

            override fun doUpdateVisitedHistory(view: WebView?, url: String?, isReload: Boolean) {
                urlAtual = url?.let { Uri.parse(it) }
                super.doUpdateVisitedHistory(view, url, isReload)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                swipeRefresh.isRefreshing = false
                super.onPageFinished(view, url)
                // Pequeno delay para o boot skeleton web assumir sem flash branco
                webView.postDelayed({ esconderSkeleton() }, 400)
                verificarUsuarioLogado()
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    view?.loadData(
                        """
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta charset="UTF-8">
                            <style>
                                body{
                                    font-family: Arial;
                                    display:flex;
                                    justify-content:center;
                                    align-items:center;
                                    height:100vh;
                                    margin:0;
                                    text-align:center;
                                    padding:20px;
                                    background:#f5f5f5;
                                }
                                .box{
                                    max-width:350px;
                                }
                                h2{
                                    color:#d32f2f;
                                }
                            </style>
                        </head>
                        <body>
                            <div class="box">
                                <h2>📶 Sem conexão</h2>
                                <p>Não foi possível acessar o sistema.</p>
                                <p>Verifique sua internet e tente novamente.</p>
                            </div>
                        </body>
                        </html>
                        """.trimIndent(),
                        "text/html",
                        "UTF-8"
                    )
                    esconderSkeleton()
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.progress = newProgress
                progressBar.visibility = if (newProgress < 100) View.VISIBLE else View.GONE
                super.onProgressChanged(view, newProgress)
            }
        }
    }

    // ============================================
    // INTERFACE JAVASCRIPT - ANDROID BRIDGE
    // ============================================
    inner class AndroidBridge {

        @JavascriptInterface
        fun signInWithGoogle() {
            if (!origemPermitida()) return
            if (BuildConfig.DEBUG) android.util.Log.d(TAG, "signInWithGoogle chamado")
            val signInIntent = googleSignInClient.signInIntent
            startActivityForResult(signInIntent, RC_SIGN_IN)
        }

        @JavascriptInterface
        fun signOut() {
            if (!origemPermitida()) return
            if (BuildConfig.DEBUG) android.util.Log.d(TAG, "signOut chamado")
            auth.signOut()
            googleSignInClient.signOut().addOnCompleteListener {
                runOnUiThread {
                    webView.evaluateJavascript(
                        "javascript:window.onAuthStateChanged(null)",
                        null
                    )
                }
            }
        }

        @JavascriptInterface
        fun salvarUid(uid: String) {
            if (!origemPermitida()) return
            if (BuildConfig.DEBUG) android.util.Log.d(TAG, "UID salvo")
            getEncryptedPrefs()
                .edit()
                .putString("uid", uid)
                .apply()
        }

        @JavascriptInterface
        fun salvarAntecedenciaNotificacao(dias: Int) {
            if (!origemPermitida()) return
            val valorSeguro = dias.coerceIn(0, 7)
            getEncryptedPrefs()
                .edit()
                .putInt("antecedencia_notificacao_dias", valorSeguro)
                .apply()
        }

        @JavascriptInterface
        fun getAntecedenciaNotificacao(): Int {
            return getEncryptedPrefs().getInt("antecedencia_notificacao_dias", 1)
        }

        @JavascriptInterface
        fun mostrarNotificacao(titulo: String, mensagem: String) {
            if (!origemPermitida()) return
            if (BuildConfig.DEBUG) android.util.Log.d(TAG, "Notificacao: $titulo")
            criarCanalNotificacao()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val temPermissao = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
                if (!temPermissao) return
            }

            val notification = androidx.core.app.NotificationCompat.Builder(
                this@MainActivity,
                "dividas_channel"
            )
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(titulo)
                .setContentText(mensagem)
                .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setStyle(
                    androidx.core.app.NotificationCompat.BigTextStyle().bigText(mensagem)
                )
                .build()

            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            manager.notify(System.currentTimeMillis().toInt(), notification)
        }

        // Firebase ID token para o Worker do assistente; roda na thread da ponte, então pode bloquear
        @JavascriptInterface
        fun getIdToken(): String {
            if (!origemPermitida()) return ""
            val user = auth.currentUser ?: return ""
            return try {
                Tasks.await(user.getIdToken(false), 10, TimeUnit.SECONDS).token ?: ""
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) android.util.Log.e(TAG, "Erro ao obter ID token", e)
                ""
            }
        }

        // O site avisa quando o tema muda (o usuário pode escolher diferente do sistema)
        @JavascriptInterface
        fun definirTemaBarras(escuro: Boolean) {
            if (!origemPermitida()) return
            runOnUiThread { aplicarTemaBarras(escuro) }
        }

        @JavascriptInterface
        fun getVersionCode(): Int {
            return packageManager.getPackageInfo(packageName, 0).longVersionCode.toInt()
        }
    }

    // ============================================
    // PROCESSAR RESULTADO DO LOGIN
    // ============================================
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode == RC_SIGN_IN) {
            try {
                val task = GoogleSignIn.getSignedInAccountFromIntent(data)
                val account = task.getResult(ApiException::class.java)
                if (BuildConfig.DEBUG) android.util.Log.d(TAG, "Login Google OK")

                account?.idToken?.let { idToken ->
                    firebaseAuthWithGoogle(idToken)
                    // O site também precisa da sessão Google para ler o banco (regras exigem auth)
                    enviarGoogleTokenJavaScript(idToken)
                } ?: run {
                    enviarErroJavaScript("Token do Google nao encontrado")
                }

            } catch (e: ApiException) {
                if (BuildConfig.DEBUG) android.util.Log.e(TAG, "Erro no login", e)
                enviarErroJavaScript("Erro ao fazer login")
            }
        }
    }

    // ============================================
    // AUTENTICAR NO FIREBASE
    // ============================================
    private fun firebaseAuthWithGoogle(idToken: String) {
        val credential = GoogleAuthProvider.getCredential(idToken, null)

        auth.signInWithCredential(credential)
            .addOnCompleteListener(this) { task ->
                if (task.isSuccessful) {
                    val user = auth.currentUser
                    enviarUsuarioJavaScript(user)
                } else {
                    enviarErroJavaScript("Erro na autenticacao Firebase")
                }
            }
    }

    // ============================================
    // VERIFICAR USUÁRIO LOGADO
    // ============================================
    private fun verificarUsuarioLogado() {
        val user = auth.currentUser
        if (user != null) {
            if (BuildConfig.DEBUG) android.util.Log.d(TAG, "Usuario logado")
            enviarUsuarioJavaScript(user)
            // Renova a sessão do site caso ele não tenha uma (ex.: primeiro uso após atualizar)
            googleSignInClient.silentSignIn().addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    task.result?.idToken?.let { enviarGoogleTokenJavaScript(it) }
                }
            }
        }
    }

    // ============================================
    // ENTREGAR TOKEN GOOGLE AO SITE (Web SDK)
    // ============================================
    private fun enviarGoogleTokenJavaScript(googleIdToken: String) {
        // JWT só tem caracteres base64url e pontos; qualquer outra coisa é descartada
        if (!Regex("^[A-Za-z0-9_.-]+$").matches(googleIdToken)) return
        runOnUiThread {
            if (!origemPermitida()) return@runOnUiThread
            webView.evaluateJavascript(
                "window.onGoogleIdToken && window.onGoogleIdToken('$googleIdToken')",
                null
            )
        }
    }

    // ============================================
    // ⭐ FUNÇÃO PRINCIPAL - ENVIAR USUÁRIO PARA JS
    // ============================================
    private fun enviarUsuarioJavaScript(user: FirebaseUser?) {
        if (user == null) {
            getEncryptedPrefs()
                .edit()
                .remove("uid")
                .apply()

            runOnUiThread {
                webView.evaluateJavascript(
                    "javascript:window.onAuthStateChanged(null)",
                    null
                )
            }
            return
        }

        try {
            getEncryptedPrefs()
                .edit()
                .putString("uid", user.uid)
                .apply()
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) android.util.Log.e(TAG, "Erro ao salvar UID", e)
        }

        user.getIdToken(true)
            .addOnCompleteListener { tokenTask ->
                try {
                    val jsonUser = JSONObject().apply {
                        put("uid", user.uid)
                        put("displayName", user.displayName ?: "")
                        put("email", user.email ?: "")
                        put("photoURL", user.photoUrl?.toString() ?: "")
                        put("providerId", user.providerId)
                    }

                    val escapedJson = jsonUser.toString().replace("'", "\\'")

                    runOnUiThread {
                        webView.evaluateJavascript(
                            "javascript:window.onAuthStateChanged('$escapedJson')",
                            null
                        )
                    }
                } catch (e: Exception) {
                    enviarErroJavaScript("Erro ao processar dados do usuario")
                }
            }
    }

    // ============================================
    // FALLBACK - ENVIAR USUÁRIO SEM TOKEN
    // ============================================
    // ============================================
    // ENVIAR ERRO PARA O JAVASCRIPT
    // ============================================
    private fun enviarErroJavaScript(message: String) {
        if (BuildConfig.DEBUG) android.util.Log.e(TAG, "Erro JS: $message")
        val escapedMessage = message.replace("'", "\\'")
        runOnUiThread {
            webView.evaluateJavascript(
                "javascript:window.onAuthError('$escapedMessage')",
                null
            )
        }
    }

    // ============================================
    // WORKMANAGER PARA NOTIFICAÇÕES
    // ============================================
    private fun configurarWorkManager() {
        val workRequest = PeriodicWorkRequestBuilder<NotificacaoWorker>(
            15,
            TimeUnit.MINUTES
        ).build()

        WorkManager.getInstance(this)
            .enqueueUniquePeriodicWork(
                "verificar_dividas",
                ExistingPeriodicWorkPolicy.UPDATE,
                workRequest
            )

        val teste = OneTimeWorkRequestBuilder<NotificacaoWorker>()
            .setInitialDelay(5, TimeUnit.SECONDS)
            .build()

        WorkManager.getInstance(this)
            .enqueue(teste)
    }

    // ============================================
    // CANAL DE NOTIFICAÇÃO
    // ============================================
    private fun criarCanalNotificacao() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = android.app.NotificationChannel(
                "dividas_channel",
                "Lembretes de Dívidas",
                android.app.NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notificações de vencimento de dívidas"
            }

            val manager = getSystemService(android.app.NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    // ============================================
    // VERIFICAR ATUALIZAÇÃO
    // ============================================
    private fun verificarAtualizacao() {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val url = URL("https://financas-f371a.web.app/version.json")
                val connection = url.openConnection()
                connection.connectTimeout = 10000
                connection.readTimeout = 10000
                val json = connection.getInputStream().bufferedReader().use { it.readText() }
                val obj = JSONObject(json)
                val versionCodeServidor = obj.getInt("versionCode")
                val versionNameServidor = obj.getString("versionName")
                val apkUrl = obj.getString("apkUrl")

                if (!apkUrl.startsWith(APK_URL_PREFIX)) {
                    if (BuildConfig.DEBUG) android.util.Log.w(TAG, "URL de APK insegura")
                    return@launch
                }

                val versionCodeLocal = packageManager.getPackageInfo(packageName, 0)
                    .longVersionCode.toInt()

                if (versionCodeServidor > versionCodeLocal) {
                    withContext(Dispatchers.Main) {
                        AlertDialog.Builder(this@MainActivity)
                            .setTitle("Nova versao disponivel")
                            .setMessage("Versao $versionNameServidor disponivel para download.")
                            .setCancelable(false)
                            .setPositiveButton("Atualizar") { _, _ ->
                                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl)))
                            }
                            .setNegativeButton("Depois", null)
                            .show()
                    }
                }
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) e.printStackTrace()
            }
        }
    }
}
