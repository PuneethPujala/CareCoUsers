package com.careco.users

import android.appwidget.AppWidgetManager
import android.os.Bundle

/**
 * WidgetSizeHelper — Shared utility for adaptive widget sizing.
 *
 * Determines the widget size category (SMALL / MEDIUM / LARGE) based on
 * the current widget dimensions reported by AppWidgetManager.
 */
object WidgetSizeHelper {

    enum class SizeCategory { SMALL, MEDIUM, LARGE }

    /**
     * Determine the size category from widget options.
     *
     * @param options The widget options bundle from AppWidgetManager.getAppWidgetOptions()
     * @return The SizeCategory based on minWidth/minHeight thresholds.
     */
    fun getCategory(options: Bundle): SizeCategory {
        val minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
        val minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0)

        return when {
            minWidth > 350 || minHeight > 220 -> SizeCategory.LARGE
            minWidth >= 200 || minHeight >= 120 -> SizeCategory.MEDIUM
            else -> SizeCategory.SMALL
        }
    }

    /**
     * Convenience method to get category directly from AppWidgetManager.
     */
    fun getCategory(appWidgetManager: AppWidgetManager, appWidgetId: Int): SizeCategory {
        val options = appWidgetManager.getAppWidgetOptions(appWidgetId)
        return getCategory(options)
    }
}
