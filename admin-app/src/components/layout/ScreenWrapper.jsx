import React from 'react';
import { View, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ScreenWrapper({ children, className }) {
    return (
        <SafeAreaView className={`flex-1 bg-gray-50 ${className}`} edges={['top', 'left', 'right']}>
            <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
            {children}
        </SafeAreaView>
    );
}
