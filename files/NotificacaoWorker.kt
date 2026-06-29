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
import com.google.firebase.database.FirebaseDatabase
import java.text.NumberFormat
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.Locale
import java.util.concurrent.TimeUnit

class NotificacaoWorker(
    context: Context,
    params: WorkerParameters
) : Worker(context, params) {

    companion object {
        private const val CHANNEL_ID = "dividas_channel"
        private const val TAG = "NotificacaoWorker"
    }

    override fun doWork(): Result {
        android.util.Log.d(TAG, "Worker iniciado")

        val uid = applicationContext
            .getSharedPreferences("app", Context.MODE_PRIVATE)
            .getString("uid", null)

        if (uid == null) {
            android.util.Log.d(TAG, "UID não encontrado")
            return Result.success()
        }

        android.util.Log.d(TAG, "UID encontrado: $uid")

        criarCanalNotificacao()

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
            android.util.Log.e(TAG, "Erro ao buscar dívidas", e)
            return Result.retry()
        }

        android.util.Log.d(TAG, "Total de dívidas: ${snapshot.childrenCount}")

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

                        when {
                            dias == 1L -> Pair("Vence amanhã", "$nome\n$valorFormatado")
                            dias == 0L -> Pair("Vence hoje", "$nome\n$valorFormatado")
                            dias < 0L -> Pair("Atrasada", "$nome está atrasada há ${Math.abs(dias)} dia(s)\n$valorFormatado")
                            else -> null
                        }?.let { (titulo, mensagem) ->
                            mostrarNotificacao(titulo, mensagem)
                            notificacoesEnviadas++
                            android.util.Log.d(TAG, "Notificação enviada: $titulo")
                        }

                    } catch (e: Exception) {
                        android.util.Log.e(TAG, "Erro ao processar parcela", e)
                    }
                }
            }
        }

        android.util.Log.d(TAG, "Notificações enviadas: $notificacoesEnviadas")

        return Result.success()
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
                android.util.Log.w(TAG, "Sem permissão para notificações")
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