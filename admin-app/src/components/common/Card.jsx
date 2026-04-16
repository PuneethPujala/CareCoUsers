import React from 'react';
import { View } from 'react-native';

export default function Card({ children, className }) {
    return (
        <View className={`bg-white rounded-2xl p-4 shadow-sm border border-gray-100 ${className}`}>
            {children}
        </View>
    );
}
