package com.financas.dividas

import android.content.Context
import android.content.Intent
import android.net.Uri
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
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
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
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.FirebaseUser

import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.URL
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {

    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var progressBar: ProgressBar
    private lateinit var webView: WebView
    private lateinit var auth: FirebaseAuth
    private lateinit var googleSignInClient: GoogleSignInClient

    companion object {
        private const val RC_SIGN_IN = 9001
        private const val TAG = "FirebaseAuth"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        criarCanalNotificacao()
        installSplashScreen()
        super.onCreate(savedInstanceState)

        auth = FirebaseAuth.getInstance()

        // Configurar Google Sign-In
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(getString(R.string.default_web_client_id))
            .requestEmail()
            .build()

        googleSignInClient = GoogleSignIn.getClient(this, gso)

        setContentView(R.layout.activity_main)

        configurarWorkManager()

        supportActionBar?.hide()

        progressBar = findViewById(R.id.progressBar)
        webView = findViewById(R.id.webview)
        swipeRefresh = findViewById(R.id.swipeRefresh)

        swipeRefresh.setOnRefreshListener {
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

    private fun configurarWebView() {
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = true
        webView.settings.setSupportZoom(false)
        webView.settings.useWideViewPort = true
        webView.settings.loadWithOverviewMode = true
        webView.settings.javaScriptCanOpenWindowsAutomatically = true
        webView.settings.loadsImagesAutomatically = true

        // 🔑 Interface Android com nome "Android"
        webView.addJavascriptInterface(AndroidBridge(), "Android")

        webView.clearCache(true)
        webView.clearHistory()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url.toString()

                if (url.startsWith("https://financas-f371a.web.app") ||
                    url.startsWith("https://www.financas-f371a.web.app")) {
                    return false
                }

                try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    startActivity(intent)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
                return true
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                swipeRefresh.isRefreshing = false
                super.onPageFinished(view, url)
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
            android.util.Log.d(TAG, "🔑 signInWithGoogle chamado do JavaScript")
            val signInIntent = googleSignInClient.signInIntent
            startActivityForResult(signInIntent, RC_SIGN_IN)
        }

        @JavascriptInterface
        fun signOut() {
            android.util.Log.d(TAG, "🚪 signOut chamado do JavaScript")
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
            android.util.Log.d(TAG, "📱 UID salvo: $uid")
            getSharedPreferences("app", MODE_PRIVATE)
                .edit()
                .putString("uid", uid)
                .apply()
        }

        @JavascriptInterface
        fun mostrarNotificacao(titulo: String, mensagem: String) {
            android.util.Log.d(TAG, "🔔 Notificação: $titulo - $mensagem")
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
                android.util.Log.d(TAG, "✅ Login Google sucesso: ${account?.email}")

                account?.idToken?.let { idToken ->
                    firebaseAuthWithGoogle(idToken)
                } ?: run {
                    enviarErroJavaScript("Token do Google não encontrado")
                }

            } catch (e: ApiException) {
                android.util.Log.e(TAG, "❌ Erro no login Google", e)
                enviarErroJavaScript("Erro ao fazer login: ${e.message}")
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
                    android.util.Log.d(TAG, "✅ Firebase Auth sucesso: ${user?.email}")
                    enviarUsuarioJavaScript(user)
                } else {
                    android.util.Log.e(TAG, "❌ Firebase Auth falhou", task.exception)
                    enviarErroJavaScript("Erro na autenticação Firebase: ${task.exception?.message}")
                }
            }
    }

    // ============================================
    // VERIFICAR USUÁRIO LOGADO
    // ============================================
    private fun verificarUsuarioLogado() {
        val user = auth.currentUser
        if (user != null) {
            android.util.Log.d(TAG, "✅ Usuário já logado: ${user.email}")
            enviarUsuarioJavaScript(user)
        } else {
            android.util.Log.d(TAG, "ℹ️ Nenhum usuário logado")
        }
    }

    // ============================================
    // ⭐ FUNÇÃO PRINCIPAL - ENVIAR USUÁRIO PARA JS
    // ============================================
    private fun enviarUsuarioJavaScript(user: FirebaseUser?) {
        if (user == null) {
            // Limpar UID salvo quando usuário desloga
            getSharedPreferences("app", MODE_PRIVATE)
                .edit()
                .remove("uid")
                .apply()

            android.util.Log.d(TAG, "🗑️ UID removido do SharedPreferences")

            runOnUiThread {
                webView.evaluateJavascript(
                    "javascript:window.onAuthStateChanged(null)",
                    null
                )
            }
            return
        }

        // 💾 SALVAR UID PARA O WORKER USAR
        try {
            getSharedPreferences("app", MODE_PRIVATE)
                .edit()
                .putString("uid", user.uid)
                .apply()

            android.util.Log.d(TAG, "💾 UID salvo no SharedPreferences: ${user.uid}")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "❌ Erro ao salvar UID", e)
        }

        // 🔑 PEGAR O TOKEN ID DO USUÁRIO PARA ENVIAR AO JS
        user.getIdToken(true)
            .addOnCompleteListener { tokenTask ->
                if (tokenTask.isSuccessful) {
                    val idToken = tokenTask.result?.token ?: ""
                    android.util.Log.d(TAG, "🔑 Token obtido com sucesso")

                    // 📤 ENVIAR DADOS DO USUÁRIO + TOKEN PARA O JAVASCRIPT
                    try {
                        val jsonUser = JSONObject().apply {
                            put("uid", user.uid)
                            put("displayName", user.displayName ?: "")
                            put("email", user.email ?: "")
                            put("photoURL", user.photoUrl?.toString() ?: "")
                            put("providerId", user.providerId)
                            put("idToken", idToken)  // 🔑 ENVIANDO O TOKEN
                        }

                        val userJson = jsonUser.toString()
                        android.util.Log.d(TAG, "📤 Enviando usuário com token para JS: $userJson")

                        val escapedJson = userJson.replace("'", "\\'")

                        runOnUiThread {
                            webView.evaluateJavascript(
                                "javascript:window.onAuthStateChanged('$escapedJson')",
                                null
                            )
                        }

                    } catch (e: Exception) {
                        android.util.Log.e(TAG, "❌ Erro ao criar JSON do usuário", e)
                        enviarErroJavaScript("Erro ao processar dados do usuário")
                    }

                } else {
                    android.util.Log.e(TAG, "❌ Erro ao pegar token", tokenTask.exception)
                    // Tentar enviar sem token mesmo assim
                    enviarUsuarioSemToken(user)
                }
            }
    }

    // ============================================
    // FALLBACK - ENVIAR USUÁRIO SEM TOKEN
    // ============================================
    private fun enviarUsuarioSemToken(user: FirebaseUser) {
        try {
            val jsonUser = JSONObject().apply {
                put("uid", user.uid)
                put("displayName", user.displayName ?: "")
                put("email", user.email ?: "")
                put("photoURL", user.photoUrl?.toString() ?: "")
                put("providerId", user.providerId)
                put("idToken", "")  // Token vazio
            }

            val userJson = jsonUser.toString()
            android.util.Log.d(TAG, "📤 Enviando usuário sem token (fallback)")

            val escapedJson = userJson.replace("'", "\\'")

            runOnUiThread {
                webView.evaluateJavascript(
                    "javascript:window.onAuthStateChanged('$escapedJson')",
                    null
                )
            }

        } catch (e: Exception) {
            android.util.Log.e(TAG, "❌ Erro no fallback", e)
            enviarErroJavaScript("Erro ao processar dados do usuário")
        }
    }

    // ============================================
    // ENVIAR ERRO PARA O JAVASCRIPT
    // ============================================
    private fun enviarErroJavaScript(message: String) {
        android.util.Log.e(TAG, "❌ Enviando erro para JS: $message")
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
                val json = URL("https://financas-f371a.web.app/version.json").readText()
                val obj = JSONObject(json)
                val versionCodeServidor = obj.getInt("versionCode")
                val versionNameServidor = obj.getString("versionName")
                val apkUrl = obj.getString("apkUrl")

                val versionCodeLocal = packageManager.getPackageInfo(packageName, 0)
                    .longVersionCode.toInt()

                if (versionCodeServidor > versionCodeLocal) {
                    withContext(Dispatchers.Main) {
                        AlertDialog.Builder(this@MainActivity)
                            .setTitle("🔄 Nova versão disponível")
                            .setMessage("Versão $versionNameServidor disponível para download.")
                            .setCancelable(false)
                            .setPositiveButton("Atualizar") { _, _ ->
                                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl)))
                            }
                            .setNegativeButton("Depois", null)
                            .show()
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}