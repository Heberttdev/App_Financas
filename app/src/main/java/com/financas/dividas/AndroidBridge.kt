package com.financas.dividas

import android.content.Context
import android.util.Log
import android.webkit.JavascriptInterface

class AndroidBridge(
    private val context: Context
) {

    @JavascriptInterface
    fun salvarUid(uid: String) {

        context.getSharedPreferences(
            "app",
            Context.MODE_PRIVATE
        )
            .edit()
            .putString("uid", uid)
            .apply()

        Log.d(
            "DIVIDAS",
            "UID salvo: $uid"
        )
    }

    @JavascriptInterface
    fun obterUid(): String {

        return context
            .getSharedPreferences(
                "app",
                Context.MODE_PRIVATE
            )
            .getString("uid", "") ?: ""

    }

}