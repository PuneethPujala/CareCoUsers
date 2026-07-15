import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

/**
 * BottomSheetProvider — Root-level provider for @gorhom/bottom-sheet.
 *
 * Wraps the app with BottomSheetModalProvider so that bottom sheets
 * can render above all other content. Must be placed inside
 * GestureHandlerRootView (which is already configured in the app).
 *
 * Usage: Wrap the root navigator content with this component.
 */
export default function BottomSheetProvider({ children }) {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <BottomSheetModalProvider>
                {children}
            </BottomSheetModalProvider>
        </GestureHandlerRootView>
    );
}
