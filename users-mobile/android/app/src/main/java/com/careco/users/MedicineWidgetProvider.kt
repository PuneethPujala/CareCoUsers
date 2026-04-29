package com.careco.users

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.SharedPreferences
import android.widget.RemoteViews

class MedicineWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        fun updateAppWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val prefs: SharedPreferences = context.getSharedPreferences("CareCoWidgetPrefs", Context.MODE_PRIVATE)
            val medicineText = prefs.getString("medicine_list", "Log in to view today's medicines.")

            val views = RemoteViews(context.packageName, R.layout.medicine_widget)
            views.setTextViewText(R.id.widget_medicine_list, medicineText)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
