package com.careco.users

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

class CareTeamWidgetProvider : AppWidgetProvider() {

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
                WidgetSizeHelper.SizeCategory.SMALL -> R.layout.care_team_small
                else -> R.layout.care_team_medium
            }

            val views = RemoteViews(context.packageName, layoutId)

            val launchIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(
                context, 30, launchIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            ))

            if (rawData == null) {
                appWidgetManager.updateAppWidget(appWidgetId, views)
                return
            }

            try {
                val json = JSONObject(rawData)

                if (json.has("careTeam")) {
                    val ct = json.getJSONObject("careTeam")
                    val callerName = ct.optString("callerName", "")

                    if (callerName.isNotEmpty()) {
                        views.setTextViewText(R.id.widget_caller_name, callerName)
                        views.setTextViewText(R.id.widget_caller_avatar, callerName.substring(0, 1))
                        views.setTextViewText(R.id.widget_caller_role, "Your Care Caller")

                        // Show verified badge in medium
                        if (size != WidgetSizeHelper.SizeCategory.SMALL) {
                            try {
                                views.setViewVisibility(R.id.widget_caller_verified, View.VISIBLE)
                            } catch (_: Exception) {}
                        }

                        // Set call intent if phone available
                        val phone = ct.optString("callerPhone", "")
                        if (phone.isNotEmpty()) {
                            val callIntent = Intent(Intent.ACTION_DIAL).apply {
                                data = android.net.Uri.parse("tel:$phone")
                            }
                            views.setOnClickPendingIntent(R.id.widget_call_btn, PendingIntent.getActivity(
                                context, 31, callIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                            ))
                        }
                    } else {
                        views.setTextViewText(R.id.widget_caller_name, "No caller assigned")
                        views.setTextViewText(R.id.widget_caller_role, "Open app to view")
                    }

                    // Appointment info (medium only)
                    if (size != WidgetSizeHelper.SizeCategory.SMALL) {
                        val appointment = ct.optString("nextAppointment", "")
                        views.setTextViewText(R.id.widget_appointment,
                            if (appointment.isNotEmpty()) appointment else "No appointments scheduled")
                    }
                }
            } catch (_: Exception) {}

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
