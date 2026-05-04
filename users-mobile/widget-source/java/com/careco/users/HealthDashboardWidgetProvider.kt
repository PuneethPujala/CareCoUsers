package com.careco.users

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.RemoteViews
import org.json.JSONObject

class HealthDashboardWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) updateWidget(context, appWidgetManager, id)
    }

    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        updateWidget(context, appWidgetManager, appWidgetId)
    }

    companion object {
        fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val prefs = context.getSharedPreferences("CareCoWidgetPrefs", Context.MODE_PRIVATE)
            val rawData = prefs.getString("widget_data", null)
            val size = WidgetSizeHelper.getCategory(appWidgetManager, appWidgetId)

            val layoutId = when (size) {
                WidgetSizeHelper.SizeCategory.SMALL -> R.layout.health_dashboard_small
                WidgetSizeHelper.SizeCategory.MEDIUM -> R.layout.health_dashboard_medium
                WidgetSizeHelper.SizeCategory.LARGE -> R.layout.health_dashboard_large
            }

            val views = RemoteViews(context.packageName, layoutId)

            // Tap to open
            val launchIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(
                context, 10, launchIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            ))

            if (rawData == null) {
                appWidgetManager.updateAppWidget(appWidgetId, views)
                return
            }

            try {
                val json = JSONObject(rawData)

                // AI Status
                val aiLabel = if (json.has("ai")) {
                    json.getJSONObject("ai").optString("label", "—")
                } else "—"
                views.setTextViewText(R.id.widget_ai_badge, aiLabel)

                // Vitals
                if (json.has("vitals")) {
                    val vitals = json.getJSONObject("vitals")
                    val hr = vitals.optString("heart_rate", "—")
                    val bp = vitals.optString("bp", "—")
                    val o2 = vitals.optString("oxygen", "—")
                    val hyd = vitals.optString("hydration", "—")

                    if (size != WidgetSizeHelper.SizeCategory.SMALL) {
                        views.setTextViewText(R.id.vital_heart_rate, hr)
                        views.setTextViewText(R.id.vital_bp, bp)
                        views.setTextViewText(R.id.vital_oxygen, o2)
                        views.setTextViewText(R.id.vital_hydration, hyd)
                    }

                    if (size == WidgetSizeHelper.SizeCategory.SMALL) {
                        val statusText = if (vitals.optBoolean("logged", false)) "Vitals logged today ✓" else "No vitals logged"
                        views.setTextViewText(R.id.widget_ai_label, statusText)
                    }
                }

                // 7-day trend (LARGE only)
                if (size == WidgetSizeHelper.SizeCategory.LARGE && json.has("ai")) {
                    val aiObj = json.getJSONObject("ai")
                    if (aiObj.has("trend")) {
                        val trend = aiObj.getJSONArray("trend")
                        for (i in 0 until minOf(trend.length(), 7)) {
                            val trendId = context.resources.getIdentifier("trend_d${i + 1}", "id", context.packageName)
                            if (trendId != 0) {
                                views.setTextViewText(trendId, trend.optString(i, "—"))
                            }
                        }
                    }
                }
            } catch (_: Exception) {}

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
