package com.financas.dividas

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.database.FirebaseDatabase
import java.text.NumberFormat
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class NotificacaoWorker(
    context: Context,
    params: WorkerParameters
) : Worker(context, params) {

    companion object {
        private const val CHANNEL_ID = "dividas_channel"
        private const val TAG = "NotificacaoWorker"
    }

    override fun doWork(): Result {
        val masterKey = MasterKey.Builder(applicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        val encryptedPrefs = EncryptedSharedPreferences.create(
            applicationContext,
            "secure_app",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )

        val uid = encryptedPrefs.getString("uid", null)
        val antecedencia = encryptedPrefs
            .getInt("antecedencia_notificacao_dias", 1)
            .coerceIn(0, 7)

        if (uid == null) {
            return Result.success()
        }

        criarCanalNotificacao()

        if (aguardarUsuarioAutenticado(uid) == null) {
            return Result.retry()
        }

        val snapshot = try {
            Tasks.await(
                FirebaseDatabase.getInstance()
                    .getReference("usuarios")
                    .child(uid)
                    .child("dividas")
                    .get(),
                30,
                TimeUnit.SECONDS
            )
        } catch (e: Exception) {
            return Result.retry()
        }

        val hoje = LocalDate.now()
        var notificacoesEnviadas = 0

        snapshot.children.forEach { divida ->
            val nome = divida.child("nome").getValue(String::class.java) ?: "Dívida"
            val parcelas = divida.child("parcelas")

            parcelas.children.forEach { parcela ->
                val status = parcela.child("status").getValue(String::class.java)
                val vencimento = parcela.child("vencimento").getValue(String::class.java)
                val valor = parcela.child("valor").getValue(Double::class.java) ?: 0.0

                if (status == "pendente" && vencimento != null) {
                    try {
                        val dataVencimento = LocalDate.parse(vencimento)
                        val dias = ChronoUnit.DAYS.between(hoje, dataVencimento)
                        val valorFormatado = NumberFormat.getCurrencyInstance(Locale("pt", "BR"))
                            .format(valor)

                        val aviso = when {
                            dias < 0L -> Pair("Atrasada", "$nome está atrasada há ${Math.abs(dias)} dia(s)\n$valorFormatado")
                            dias == 0L -> Pair("Vence hoje", "$nome\n$valorFormatado")
                            dias <= antecedencia -> Pair("Vence em $dias dia(s)", "$nome\n$valorFormatado")
                            else -> null
                        }

                        val chaveNotificacao = "notificacao_${divida.key}_${parcela.key}_$hoje"
                        if (aviso != null && !encryptedPrefs.getBoolean(chaveNotificacao, false)) {
                            mostrarNotificacao(aviso.first, aviso.second)
                            encryptedPrefs.edit().putBoolean(chaveNotificacao, true).apply()
                            notificacoesEnviadas++
                        }

                    } catch (e: Exception) {
                        // erro silencioso
                    }
                }
            }
        }

        return Result.success()
    }

    private fun aguardarUsuarioAutenticado(uid: String): FirebaseUser? {
        val auth = FirebaseAuth.getInstance()
        if (auth.currentUser?.uid == uid) return auth.currentUser

        val latch = CountDownLatch(1)
        var usuario: FirebaseUser? = null

        val listener = FirebaseAuth.AuthStateListener { a ->
            if (a.currentUser?.uid == uid) {
                usuario = a.currentUser
                latch.countDown()
            }
        }

        auth.addAuthStateListener(listener)
        try {
            latch.await(15, TimeUnit.SECONDS)
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
        } finally {
            auth.removeAuthStateListener(listener)
        }

        return usuario
    }

    private fun criarCanalNotificacao() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Lembretes Financeiros",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notificações do Gerenciador de Dívidas"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 300, 500)
            }

            val manager = applicationContext.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun mostrarNotificacao(titulo: String, texto: String) {
        // Verificar permissão para Android 13+
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            val hasPermission = ContextCompat.checkSelfPermission(
                applicationContext,
                android.Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED

            if (!hasPermission) {
                return
            }
        }

        val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(titulo)
            .setContentText(texto)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setStyle(NotificationCompat.BigTextStyle().bigText(texto))
            .build()

        val manager = applicationContext.getSystemService(NotificationManager::class.java)
        manager.notify(System.currentTimeMillis().toInt(), notification)
    }
}
