import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';

export default function Button({ title, onPress, variant = 'primary', size = 'md', isLoading, disabled, className, icon }) {
    const baseStyle = "rounded-xl items-center justify-center flex-row";
    const variants = {
        primary: "bg-blue-600 active:bg-blue-700",
        secondary: "bg-gray-100 active:bg-gray-200",
        outline: "bg-transparent border border-gray-200 active:bg-gray-50",
        danger: "bg-red-50 active:bg-red-100",
        ghost: "bg-transparent active:bg-gray-50"
    };
    const sizes = {
        sm: "px-3 py-2",
        md: "px-4 py-3",
        lg: "px-6 py-4"
    };
    const textStyles = {
        primary: "text-white font-bold",
        secondary: "text-gray-900 font-bold",
        outline: "text-gray-700 font-medium",
        danger: "text-red-600 font-medium",
        ghost: "text-gray-600 font-medium"
    };

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled || isLoading}
            className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${disabled ? 'opacity-50' : ''} ${className}`}
        >
            {isLoading ? (
                <ActivityIndicator color={variant === 'primary' ? 'white' : 'gray'} />
            ) : (
                <>
                    {icon}
                    <Text className={`${textStyles[variant]} text-center ${icon ? 'ml-2' : ''}`}>{title}</Text>
                </>
            )}
        </TouchableOpacity>
    );
}
