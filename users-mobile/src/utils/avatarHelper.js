import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';

/**
 * Shows a clean options dialog for profile pictures.
 */
export const showAvatarActionSheet = (currentAvatarUrl, onSelectSource, onRemove) => {
    const options = [
        { text: '📷 Take Photo', onPress: () => onSelectSource('camera') },
        { text: '🖼 Choose from Gallery', onPress: () => onSelectSource('library') },
    ];

    if (currentAvatarUrl) {
        options.push({ text: '🗑 Remove Photo', onPress: onRemove, style: 'destructive' });
    }

    options.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert(
        'Profile Picture',
        'Upload a profile photo to make your care account recognizable.',
        options,
        { cancelable: true }
    );
};

/**
 * Deletes an old avatar from Supabase Storage by extracting its filepath from the URL.
 */
export const deleteOldAvatar = async (url, bucketName = 'avatars') => {
    if (!url) return;
    try {
        const marker = `/public/${bucketName}/`;
        const index = url.indexOf(marker);
        if (index !== -1) {
            const filePath = decodeURIComponent(url.substring(index + marker.length));
            const { error } = await supabase.storage.from(bucketName).remove([filePath]);
            if (error) {
                console.warn('Failed to delete old avatar file from Supabase storage:', error.message);
            }
        }
    } catch (e) {
        console.warn('Failed to delete old avatar from Supabase:', e);
    }
};

/**
 * Handles picking an image from camera/library, manipulating it, and uploading it to Supabase.
 * Returns the public URL, or null if cancelled/failed.
 */
export const handleAvatarPicker = async (sourceType, userId, currentAvatarUrl, bucketName = 'avatars') => {
    try {
        // 1. Request appropriate permission
        if (sourceType === 'camera') {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Camera permission is required to take a photo.');
                return null;
            }
        } else {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Library permission is required to choose a photo.');
                return null;
            }
        }

        // 2. Launch Image Picker with square crop editing
        const pickerOptions = {
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 1,
        };

        const result = sourceType === 'camera'
            ? await ImagePicker.launchCameraAsync(pickerOptions)
            : await ImagePicker.launchImageLibraryAsync(pickerOptions);

        if (result.canceled || !result.assets || result.assets.length === 0) {
            return null;
        }

        const selectedUri = result.assets[0].uri;

        // 3. Compress and resize using expo-image-manipulator to 512x512 @ 0.7 quality
        const manipulated = await ImageManipulator.manipulateAsync(
            selectedUri,
            [{ resize: { width: 512, height: 512 } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );

        // 4. Fetch the file blob
        const response = await fetch(manipulated.uri);
        const blob = await response.blob();

        // 5. Generate secure unique path: avatars/{userId}/{timestamp}.jpg
        const fileName = `${userId}/${Date.now()}.jpg`;

        // 6. Upload to Supabase bucket
        const { error: uploadError } = await supabase.storage
            .from(bucketName)
            .upload(fileName, blob, {
                contentType: 'image/jpeg',
                upsert: true,
            });

        if (uploadError) {
            throw uploadError;
        }

        // 7. Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from(bucketName)
            .getPublicUrl(fileName);

        // 8. Delete old avatar if present
        if (currentAvatarUrl) {
            await deleteOldAvatar(currentAvatarUrl, bucketName);
        }

        return publicUrl;
    } catch (error) {
        console.error('Avatar upload pipeline failed:', error);
        Alert.alert('Upload Failed', 'An error occurred while uploading your profile picture.');
        return null;
    }
};
