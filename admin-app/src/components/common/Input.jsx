import React from 'react';
import { View, TextInput, Text } from 'react-native';

export default function Input({ label, error, ...props }) {
    return (
        <View className="mb-4">
            {label && <Text className="text-sm font-medium text-gray-700 mb-1.5">{label}</Text>}
            <TextInput
                className={`w-full px-4 py-3 bg-white border rounded-xl text-gray-900 ${error ? 'border-red-500' : 'border-gray-200 focus:border-blue-500'}`}
                placeholderTextColor="#9CA3AF"
                {...props}
            />
            {error && <Text className="text-xs text-red-500 mt-1">{error}</Text>}
        </View>
    );
}
