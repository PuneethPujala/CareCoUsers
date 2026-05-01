package com.careco.users

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WidgetModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "WidgetModule"
    }

    @ReactMethod
    fun setWidgetData(data: String) {
        val context = reactApplicationContext
        val prefs = context.getSharedPreferences("CareCoWidgetPrefs", Context.MODE_PRIVATE)
        prefs.edit().putString("medicine_data", data).apply()

        // Trigger widget update
        val intent = Intent(context, MedicineWidgetProvider::class.java)
        intent.action = AppWidgetManager.ACTION_APPWIDGET_UPDATE

        val ids = AppWidgetManager.getInstance(context)
            .getAppWidgetIds(ComponentName(context, MedicineWidgetProvider::class.java))

        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        context.sendBroadcast(intent)
    }

    @ReactMethod
    fun clearWidgetData() {
        val context = reactApplicationContext
        val prefs = context.getSharedPreferences("CareCoWidgetPrefs", Context.MODE_PRIVATE)
        prefs.edit().remove("medicine_data").apply()

        val intent = Intent(context, MedicineWidgetProvider::class.java)
        intent.action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
        val ids = AppWidgetManager.getInstance(context)
            .getAppWidgetIds(ComponentName(context, MedicineWidgetProvider::class.java))
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        context.sendBroadcast(intent)
    }
}
