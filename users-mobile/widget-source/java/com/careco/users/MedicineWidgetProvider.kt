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
            val prefs: SharedPreferences = context.getSharedPreferences("CareCoWidgetPrefs", Context.MODE_PRIVATE)
            val rawData = prefs.getString("widget_data", null) ?: prefs.getString("medicine_data", null)
            val size = WidgetSizeHelper.getCategory(appWidgetManager, appWidgetId)

            val layoutId = when (size) {
                WidgetSizeHelper.SizeCategory.SMALL -> R.layout.medicine_widget_small
                WidgetSizeHelper.SizeCategory.MEDIUM -> R.layout.medicine_widget
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

                if (size == WidgetSizeHelper.SizeCategory.LARGE) {
                    // Large layout: progress bar + slot cards
                    views.setProgressBar(R.id.widget_progress, 100, adherence, false)
                    views.setTextViewText(R.id.widget_progress_label, "$taken/$total taken")

                    // Populate slot cards from slots data
                    if (medJson.has("slots")) {
                        val slots = medJson.getJSONObject("slots")
                        for (slot in listOf("morning", "afternoon", "evening", "night")) {
                            if (slots.has(slot)) {
                                val slotArr = slots.getJSONArray(slot)
                                var slotTaken = 0
                                var slotTotal = slotArr.length()
                                val firstMedName = if (slotTotal > 0) slotArr.getJSONObject(0).optString("name", "") else ""
                                for (i in 0 until slotTotal) {
                                    if (slotArr.getJSONObject(i).optBoolean("taken", false)) slotTaken++
                                }
                                val countId = context.resources.getIdentifier("slot_${slot}_count", "id", context.packageName)
                                val medId = context.resources.getIdentifier("slot_${slot}_med", "id", context.packageName)
                                if (countId != 0) views.setTextViewText(countId, "$slotTaken/$slotTotal")
                                if (medId != 0) views.setTextViewText(medId, firstMedName)
                            }
                        }
                    }
                } else if (size == WidgetSizeHelper.SizeCategory.MEDIUM) {
                    // Medium layout: circle + details (original)
                    views.setProgressBar(R.id.widget_progress, 100, adherence, false)
                    views.setTextViewText(R.id.widget_progress_label, "$taken/$total taken today")

                    if (total == 0) {
                        showEmptyState(views, "No medicines scheduled today")
                    } else if (allDone) {
                        views.setViewVisibility(R.id.widget_next_section, View.GONE)
                        views.setViewVisibility(R.id.widget_done_section, View.VISIBLE)
                        views.setViewVisibility(R.id.widget_empty_section, View.GONE)
                    } else if (nextMed.isNotEmpty()) {
                        views.setViewVisibility(R.id.widget_next_section, View.VISIBLE)
                        views.setViewVisibility(R.id.widget_done_section, View.GONE)
                        views.setViewVisibility(R.id.widget_empty_section, View.GONE)
                        views.setTextViewText(R.id.widget_next_name, nextMed)
                        views.setTextViewText(R.id.widget_next_time, if (nextTime.isNotEmpty()) nextTime else "Scheduled")
                    } else {
                        showEmptyState(views, "Open CareMyMed to view")
                    }
                } else {
                    // Small layout: compact bar
                    if (total == 0) {
                        showEmptyState(views, "No medicines today")
                    } else if (allDone) {
                        views.setViewVisibility(R.id.widget_next_section, View.GONE)
                        views.setViewVisibility(R.id.widget_done_section, View.VISIBLE)
                        views.setViewVisibility(R.id.widget_empty_section, View.GONE)
                    } else if (nextMed.isNotEmpty()) {
                        views.setViewVisibility(R.id.widget_next_section, View.VISIBLE)
                        views.setViewVisibility(R.id.widget_done_section, View.GONE)
                        views.setViewVisibility(R.id.widget_empty_section, View.GONE)
                        views.setTextViewText(R.id.widget_next_name, nextMed)
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
