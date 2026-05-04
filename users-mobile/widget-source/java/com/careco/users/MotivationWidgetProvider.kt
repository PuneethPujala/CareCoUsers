package com.careco.users

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.RemoteViews
import org.json.JSONObject

class MotivationWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) updateWidget(context, appWidgetManager, id)
    }

    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        updateWidget(context, appWidgetManager, appWidgetId)
    }

    companion object {
        private val TIPS = listOf(
            "Stay hydrated! Drinking 8 glasses of water daily helps manage blood pressure.",
            "A 30-minute walk daily can reduce heart disease risk by 35%.",
            "Quality sleep (7-9 hrs) helps regulate blood sugar and blood pressure.",
            "Eating 5 servings of fruits and vegetables daily boosts immunity.",
            "Practice deep breathing for 5 minutes to reduce stress hormones.",
            "Set reminders for your medications — consistency matters!",
            "Deep breathing exercises improve oxygen saturation levels.",
            "Get 15 minutes of sunlight daily for natural vitamin D.",
            "Reducing salt intake by 1 teaspoon can lower BP by 5-6 mmHg.",
            "Regular heart rate monitoring helps detect irregularities early.",
            "A Mediterranean diet is linked to 25% lower heart disease risk.",
            "Strength training twice a week improves bone density and metabolism.",
            "Social interaction reduces cognitive decline risk by 70%.",
            "Green tea contains antioxidants that support heart health.",
            "Laughing for 15 minutes a day improves blood vessel function."
        )

        fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val prefs = context.getSharedPreferences("CareCoWidgetPrefs", Context.MODE_PRIVATE)
            val rawData = prefs.getString("widget_data", null)
            val size = WidgetSizeHelper.getCategory(appWidgetManager, appWidgetId)

            val layoutId = when (size) {
                WidgetSizeHelper.SizeCategory.SMALL -> R.layout.motivation_small
                WidgetSizeHelper.SizeCategory.MEDIUM -> R.layout.motivation_medium
                WidgetSizeHelper.SizeCategory.LARGE -> R.layout.motivation_large
            }

            val views = RemoteViews(context.packageName, layoutId)

            val launchIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(
                context, 20, launchIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            ))

            if (rawData == null) {
                appWidgetManager.updateAppWidget(appWidgetId, views)
                return
            }

            try {
                val json = JSONObject(rawData)

                // Streak
                val streakCount = if (json.has("streak")) {
                    json.getJSONObject("streak").optInt("count", 0)
                } else 0

                if (size == WidgetSizeHelper.SizeCategory.SMALL) {
                    views.setTextViewText(R.id.widget_streak, "$streakCount")
                } else {
                    views.setTextViewText(R.id.widget_streak, "$streakCount-day streak")

                    // Adherence
                    val adherence = if (json.has("medicine")) {
                        json.getJSONObject("medicine").optInt("adherence", 0)
                    } else 0
                    views.setTextViewText(R.id.widget_adherence_pct, "$adherence%")
                    views.setProgressBar(R.id.widget_adherence_bar, 100, adherence, false)

                    // Premium days
                    val premiumDays = if (json.has("streak")) {
                        json.getJSONObject("streak").optInt("premiumDays", 0)
                    } else 0
                    views.setTextViewText(R.id.widget_premium_text, "Premium: $premiumDays days left")
                }

                // Daily tip (LARGE only)
                if (size == WidgetSizeHelper.SizeCategory.LARGE) {
                    val tipText = if (json.has("tip") && json.getString("tip").isNotEmpty()) {
                        json.getString("tip")
                    } else {
                        val dayIndex = ((System.currentTimeMillis() / 86400000) % TIPS.size).toInt()
                        TIPS[dayIndex]
                    }
                    views.setTextViewText(R.id.widget_tip_text, tipText)
                }
            } catch (_: Exception) {}

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
