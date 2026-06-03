import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';
import { apiService } from '../lib/api';
import AlertManager from './AlertManager';

/**
 * Shows a clean options dialog for profile pictures.
 * Deprecated: Use AvatarSelectModal instead for a premium bottom-sheet UI.
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

    AlertManager.alert(
        'Profile Picture',
        'Upload a profile photo to make your care account recognizable.',
        options
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
export const handleAvatarPicker = async (sourceType, userId, currentAvatarUrl, bucketName = 'avatars', isPatient = true) => {
    try {
        // 1. Request appropriate permission
        if (sourceType === 'camera') {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                AlertManager.alert('Permission Denied', 'Camera permission is required to take a photo.');
                return null;
            }
        } else {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                AlertManager.alert('Permission Denied', 'Library permission is required to choose a photo.');
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

        // 3. Compress and resize using expo-image-manipulator to 512x512 @ 0.7 quality with base64 export
        const manipulated = await ImageManipulator.manipulateAsync(
            selectedUri,
            [{ resize: { width: 512, height: 512 } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );

        if (!manipulated.base64) {
            throw new Error('Failed to extract base64 from image');
        }

        // 4. Send base64 to server-side secure upload endpoint
        let publicUrl = null;
        if (isPatient) {
            const uploadRes = await apiService.patients.uploadAvatar({
                file_base64: manipulated.base64,
                content_type: 'image/jpeg'
            });
            publicUrl = uploadRes.data.avatar_url;
        } else {
            const uploadRes = await apiService.auth.uploadAvatar({
                file_base64: manipulated.base64,
                content_type: 'image/jpeg'
            });
            publicUrl = uploadRes.data.avatarUrl;
        }

        return publicUrl;
    } catch (error) {
        console.error('Avatar upload pipeline failed:', error);
        AlertManager.alert('Upload Failed', 'An error occurred while uploading your profile picture.');
        return null;
    }
};

/**
 * Launches the camera or library without native cropping to get the raw image URI.
 */
export const pickRawImage = async (sourceType) => {
    try {
        if (sourceType === 'camera') {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                AlertManager.alert('Permission Denied', 'Camera permission is required to take a photo.');
                return null;
            }
        } else {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                AlertManager.alert('Permission Denied', 'Library permission is required to choose a photo.');
                return null;
            }
        }

        const pickerOptions = {
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 1,
        };

        const result = sourceType === 'camera'
            ? await ImagePicker.launchCameraAsync(pickerOptions)
            : await ImagePicker.launchImageLibraryAsync(pickerOptions);

        if (result.canceled || !result.assets || result.assets.length === 0) {
            return null;
        }

        return result.assets[0].uri;
    } catch (error) {
        console.error('Failed to pick raw image:', error);
        AlertManager.alert('Error', 'Failed to select image.');
        return null;
    }
};

/**
 * Uploads a cropped base64 avatar image to the backend.
 */
export const uploadCroppedAvatar = async (croppedBase64, isPatient = true) => {
    try {
        let publicUrl = null;
        if (isPatient) {
            const uploadRes = await apiService.patients.uploadAvatar({
                file_base64: croppedBase64,
                content_type: 'image/jpeg'
            });
            publicUrl = uploadRes.data.avatar_url;
        } else {
            const uploadRes = await apiService.auth.uploadAvatar({
                file_base64: croppedBase64,
                content_type: 'image/jpeg'
            });
            publicUrl = uploadRes.data.avatarUrl;
        }
        return publicUrl;
    } catch (error) {
        console.error('Avatar upload failed:', error);
        AlertManager.alert('Upload Failed', 'An error occurred while uploading your profile picture.');
        return null;
    }
};

