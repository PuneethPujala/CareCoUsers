package com.careco.users

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

class MedicineWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        fun updateAppWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val prefs: SharedPreferences = context.getSharedPreferences("CareCoWidgetPrefs", Context.MODE_PRIVATE)
            val rawData = prefs.getString("medicine_data", null)

            val views = RemoteViews(context.packageName, R.layout.medicine_widget)

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
                // ── Empty / not logged in state ──
                showEmptyState(views, "Open CareMyMed to get started")
                appWidgetManager.updateAppWidget(appWidgetId, views)
                return
            }

            try {
                val json = JSONObject(rawData)
                val taken = json.optInt("taken", 0)
                val total = json.optInt("total", 0)
                val adherence = json.optInt("adherence", 0)
                val nextMed = json.optString("nextMed", "")
                val nextTime = json.optString("nextTime", "")
                val greeting = json.optString("greeting", "Hello")
                val allDone = json.optBoolean("allDone", false)

                // ── Percentage badge ──
                views.setTextViewText(R.id.widget_pct, "$adherence%")

                // ── Progress bar ──
                views.setProgressBar(R.id.widget_progress, 100, adherence, false)
                views.setTextViewText(R.id.widget_progress_label, "$taken/$total taken today")

                // ── Toggle sections ──
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

            } catch (e: Exception) {
                showEmptyState(views, "Open CareMyMed to refresh")
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
