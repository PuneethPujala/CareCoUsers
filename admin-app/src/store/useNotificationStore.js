import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useNotificationStore = create(
    persist(
        (set, get) => ({
            notifications: [],
            unreadCount: 0,
            
            addNotification: (notification) => {
                const newNotification = {
                    id: Date.now().toString(),
                    date: new Date().toISOString(),
                    read: false,
                    ...notification
                };
                
                set((state) => ({
                    notifications: [newNotification, ...state.notifications].slice(0, 50), // Keep last 50
                    unreadCount: state.unreadCount + 1
                }));
            },
            
            markAsRead: (id) => {
                set((state) => ({
                    notifications: state.notifications.map(n => 
                        n.id === id ? { ...n, read: true } : n
                    ),
                    unreadCount: Math.max(0, state.unreadCount - 1)
                }));
            },
            
            markAllAsRead: () => {
                set((state) => ({
                    notifications: state.notifications.map(n => ({ ...n, read: true })),
                    unreadCount: 0
                }));
            },
            
            clearAll: () => {
                set({ notifications: [], unreadCount: 0 });
            }
        }),
        {
            name: 'caremymed-notifications-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
