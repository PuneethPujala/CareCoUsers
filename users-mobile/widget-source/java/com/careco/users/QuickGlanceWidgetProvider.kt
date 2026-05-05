package com.careco.users

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class QuickGlanceWidgetProvider : AppWidgetProvider() {

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
                WidgetSizeHelper.SizeCategory.SMALL -> R.layout.quick_glance_small
                WidgetSizeHelper.SizeCategory.MEDIUM -> R.layout.quick_glance_medium
                WidgetSizeHelper.SizeCategory.LARGE -> R.layout.quick_glance_large
            }

            val views = RemoteViews(context.packageName, layoutId)

            val launchIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(
                context, 40, launchIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            ))

            // Greeting
            val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
            val greeting = when {
                hour < 12 -> "Good Morning"
                hour < 17 -> "Good Afternoon"
                else -> "Good Evening"
            }
            views.setTextViewText(R.id.widget_greeting, greeting)

            // Date (medium & large)
            if (size != WidgetSizeHelper.SizeCategory.SMALL) {
                try {
                    val dateStr = SimpleDateFormat("EEEE, d MMMM", Locale.getDefault()).format(Date())
                    views.setTextViewText(R.id.widget_date, dateStr)
                } catch (_: Exception) {}
            }

            if (rawData == null) {
                views.setTextViewText(R.id.widget_pct, "—")
                if (size == WidgetSizeHelper.SizeCategory.SMALL) {
                    views.setTextViewText(R.id.widget_sub, "Open CareMyMed")
                }
                appWidgetManager.updateAppWidget(appWidgetId, views)
                return
            }

            try {
                val json = JSONObject(rawData)

                // Medicine data
                val medJson = if (json.has("medicine")) json.getJSONObject("medicine") else null
                val taken = medJson?.optInt("taken", 0) ?: 0
                val total = medJson?.optInt("total", 0) ?: 0
                val adherence = medJson?.optInt("adherence", 0) ?: 0
                val nextMed = medJson?.optString("nextMed", "") ?: ""
                val nextTime = medJson?.optString("nextTime", "") ?: ""

                views.setTextViewText(R.id.widget_pct, "$adherence%")
                views.setProgressBar(R.id.widget_progress, 100, adherence, false)

                if (size == WidgetSizeHelper.SizeCategory.SMALL) {
                    views.setTextViewText(R.id.widget_sub, "$taken/$total meds taken")
                } else {
                    views.setTextViewText(R.id.widget_med_summary, "$taken/$total meds taken")

                    val nextText = if (nextMed.isNotEmpty()) {
                        "Next: $nextMed${if (nextTime.isNotEmpty()) " · $nextTime" else ""}"
                    } else if (taken == total && total > 0) {
                        "All done today! 🎉"
                    } else {
                        "No meds scheduled"
                    }
                    views.setTextViewText(R.id.widget_next_med, nextText)
                }

                // Vitals (medium & large)
                if (size != WidgetSizeHelper.SizeCategory.SMALL && json.has("vitals")) {
                    val vitals = json.getJSONObject("vitals")
                    views.setTextViewText(R.id.widget_hr_val, vitals.optString("heart_rate", "—"))
                    views.setTextViewText(R.id.widget_bp_val, vitals.optString("bp", "—"))
                    views.setTextViewText(R.id.widget_o2_val, vitals.optString("oxygen", "—"))
                }

                // Streak (medium & large)
                val streak = if (json.has("streak")) json.getJSONObject("streak").optInt("count", 0) else 0
                if (size == WidgetSizeHelper.SizeCategory.MEDIUM) {
                    views.setTextViewText(R.id.widget_streak_val, "$streak")
                }

                // Large extras
                if (size == WidgetSizeHelper.SizeCategory.LARGE) {
                    views.setTextViewText(R.id.widget_streak_val, "$streak")

                    val premiumDays = if (json.has("streak")) json.getJSONObject("streak").optInt("premiumDays", 0) else 0
                    views.setTextViewText(R.id.widget_premium_val, "$premiumDays")

                    // AI badge
                    val aiLabel = if (json.has("ai")) json.getJSONObject("ai").optString("label", "—") else "—"
                    views.setTextViewText(R.id.widget_ai_badge, aiLabel)

                    views.setTextViewText(R.id.widget_med_summary, "$taken/$total")
                }
            } catch (_: Exception) {}

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
