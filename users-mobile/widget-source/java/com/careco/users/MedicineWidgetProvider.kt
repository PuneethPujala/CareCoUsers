package com.careco.users

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

class MedicineWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        updateAppWidget(context, appWidgetManager, appWidgetId)
    }

    companion object {
        fun updateAppWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val prefs: SharedPreferences = context.getSharedPreferences("CareMyMedWidgetPrefs", Context.MODE_PRIVATE)
            val rawData = prefs.getString("widget_data", null) ?: prefs.getString("medicine_data", null)
            val size = WidgetSizeHelper.getCategory(appWidgetManager, appWidgetId)

            val layoutId = when (size) {
                WidgetSizeHelper.SizeCategory.SMALL -> R.layout.medicine_widget_small
                WidgetSizeHelper.SizeCategory.MEDIUM -> {
                    val options = appWidgetManager.getAppWidgetOptions(appWidgetId)
                    val minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
                    if (minWidth < 200) {
                        R.layout.medicine_widget_2x2
                    } else {
                        R.layout.medicine_widget
                    }
                }
                WidgetSizeHelper.SizeCategory.LARGE -> R.layout.medicine_widget_large
            }

            val views = RemoteViews(context.packageName, layoutId)

            // ── Tap-to-open intent ──
            val launchIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                context, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)

            if (rawData == null) {
                if (size != WidgetSizeHelper.SizeCategory.LARGE) {
                    showEmptyState(views, "Open CareMyMed to get started")
                }
                appWidgetManager.updateAppWidget(appWidgetId, views)
                return
            }

            try {
                val json = JSONObject(rawData)
                val medJson = if (json.has("medicine")) json.getJSONObject("medicine") else json
                val taken = medJson.optInt("taken", 0)
                val total = medJson.optInt("total", 0)
                val adherence = medJson.optInt("adherence", 0)
                val nextMed = medJson.optString("nextMed", "")
                val nextTime = medJson.optString("nextTime", "")
                val allDone = medJson.optBoolean("allDone", false)

                views.setTextViewText(R.id.widget_pct, "$adherence%")

                // Strip emojis from medication names to keep text clean and consistent
                val cleanNextMed = nextMed.replace(Regex("[\\uD83C-\\uDBFF\\uDC00-\\uDFFF]+"), "").trim()

                if (size == WidgetSizeHelper.SizeCategory.LARGE) {
                    // Large layout: progress bar + next-dose hero card
                    views.setProgressBar(R.id.widget_progress, 100, adherence, false)
                    views.setTextViewText(R.id.widget_pct, "$adherence%")
                    views.setTextViewText(R.id.widget_progress_label, "$taken of $total taken today")

                    if (total == 0) {
                        views.setViewVisibility(R.id.widget_next_section, View.GONE)
                        views.setViewVisibility(R.id.widget_done_section, View.GONE)
                        views.setViewVisibility(R.id.widget_empty_section, View.VISIBLE)
                        views.setImageViewResource(R.id.widget_empty_mascot, R.drawable.doctor_mascot)
                    } else if (allDone) {
                        views.setViewVisibility(R.id.widget_next_section, View.GONE)
                        views.setViewVisibility(R.id.widget_done_section, View.VISIBLE)
                        views.setViewVisibility(R.id.widget_empty_section, View.GONE)
                        views.setImageViewResource(R.id.widget_empty_mascot, R.drawable.doctor_mascot_celebration)
                    } else {
                        views.setViewVisibility(R.id.widget_next_section, View.VISIBLE)
                        views.setViewVisibility(R.id.widget_done_section, View.GONE)
                        views.setViewVisibility(R.id.widget_empty_section, View.GONE)
                        views.setTextViewText(R.id.widget_next_name, cleanNextMed)
                        views.setTextViewText(R.id.widget_next_time, if (nextTime.isNotEmpty()) nextTime else "Scheduled")
                        views.setImageViewResource(R.id.widget_empty_mascot, if (adherence >= 75) R.drawable.doctor_mascot_thinking else R.drawable.doctor_mascot)
                    }
                } else if (size == WidgetSizeHelper.SizeCategory.MEDIUM) {
                    // Medium layout: circle + details (original)
                    views.setProgressBar(R.id.widget_progress, 100, adherence, false)
                    views.setTextViewText(R.id.widget_progress_label, "$taken/$total taken today")

                    if (total == 0) {
                        views.setViewVisibility(R.id.widget_content, View.GONE)
                        views.setViewVisibility(R.id.widget_empty_state_container, View.VISIBLE)
                        views.setTextViewText(R.id.widget_empty_title, "All Clear! 🩺")
                        views.setTextViewText(R.id.widget_empty_subtitle, "No medicines scheduled today.")
                        views.setImageViewResource(R.id.widget_empty_mascot, R.drawable.doctor_mascot)
                    } else if (allDone) {
                        views.setViewVisibility(R.id.widget_content, View.GONE)
                        views.setViewVisibility(R.id.widget_empty_state_container, View.VISIBLE)
                        views.setTextViewText(R.id.widget_empty_title, "All Done! 🎉")
                        views.setTextViewText(R.id.widget_empty_subtitle, "Taken all medicines today.")
                        views.setImageViewResource(R.id.widget_empty_mascot, R.drawable.doctor_mascot_celebration)
                    } else {
                        views.setViewVisibility(R.id.widget_content, View.VISIBLE)
                        views.setViewVisibility(R.id.widget_empty_state_container, View.GONE)
                        if (cleanNextMed.isNotEmpty()) {
                            views.setViewVisibility(R.id.widget_next_section, View.VISIBLE)
                            views.setViewVisibility(R.id.widget_done_section, View.GONE)
                            views.setViewVisibility(R.id.widget_empty_section, View.GONE)
                            views.setTextViewText(R.id.widget_next_name, cleanNextMed)
                            views.setTextViewText(R.id.widget_next_time, if (nextTime.isNotEmpty()) nextTime else "Scheduled")
                        } else {
                            showEmptyState(views, "Open CareMyMed to view")
                        }
                    }
                } else {
                    // Small layout: compact bar
                    if (total == 0) {
                        showEmptyState(views, "No medicines today")
                    } else if (allDone) {
                        views.setViewVisibility(R.id.widget_next_section, View.GONE)
                        views.setViewVisibility(R.id.widget_done_section, View.VISIBLE)
                        views.setViewVisibility(R.id.widget_empty_section, View.GONE)
                    } else if (cleanNextMed.isNotEmpty()) {
                        views.setViewVisibility(R.id.widget_next_section, View.VISIBLE)
                        views.setViewVisibility(R.id.widget_done_section, View.GONE)
                        views.setViewVisibility(R.id.widget_empty_section, View.GONE)
                        views.setTextViewText(R.id.widget_next_name, cleanNextMed)
                        views.setTextViewText(R.id.widget_next_time, if (nextTime.isNotEmpty()) nextTime else "Scheduled")
                    } else {
                        showEmptyState(views, "Open CareMyMed")
                    }
                }
            } catch (e: Exception) {
                if (size != WidgetSizeHelper.SizeCategory.LARGE) {
                    showEmptyState(views, "Open CareMyMed to refresh")
                }
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        private fun showEmptyState(views: RemoteViews, message: String) {
            views.setViewVisibility(R.id.widget_next_section, View.GONE)
            views.setViewVisibility(R.id.widget_done_section, View.GONE)
            views.setViewVisibility(R.id.widget_empty_section, View.VISIBLE)
            views.setTextViewText(R.id.widget_empty_text, message)
        }
    }
}
