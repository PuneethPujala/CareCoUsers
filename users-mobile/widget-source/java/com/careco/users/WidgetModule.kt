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

    /**
     * All 5 widget provider classes that need update broadcasts.
     */
    private val widgetProviders = listOf(
        MedicineWidgetProvider::class.java,
        HealthDashboardWidgetProvider::class.java,
        MotivationWidgetProvider::class.java,
        CareTeamWidgetProvider::class.java,
        QuickGlanceWidgetProvider::class.java,
    )

    @ReactMethod
    fun setWidgetData(data: String) {
        val context = reactApplicationContext
        val prefs = context.getSharedPreferences("CareCoWidgetPrefs", Context.MODE_PRIVATE)
        prefs.edit()
            .putString("widget_data", data)
            .putString("medicine_data", data) // backward compat
            .apply()

        // Broadcast update to ALL widget providers
        val manager = AppWidgetManager.getInstance(context)
        for (provider in widgetProviders) {
            val ids = manager.getAppWidgetIds(ComponentName(context, provider))
            if (ids.isNotEmpty()) {
                val intent = Intent(context, provider)
                intent.action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                context.sendBroadcast(intent)
            }
        }
    }

    @ReactMethod
    fun clearWidgetData() {
        val context = reactApplicationContext
        val prefs = context.getSharedPreferences("CareCoWidgetPrefs", Context.MODE_PRIVATE)
        prefs.edit()
            .remove("widget_data")
            .remove("medicine_data")
            .apply()

        // Broadcast update to ALL widget providers (they'll show empty state)
        val manager = AppWidgetManager.getInstance(context)
        for (provider in widgetProviders) {
            val ids = manager.getAppWidgetIds(ComponentName(context, provider))
            if (ids.isNotEmpty()) {
                val intent = Intent(context, provider)
                intent.action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                context.sendBroadcast(intent)
            }
        }
    }
}
