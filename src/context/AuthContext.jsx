import React, { createContext, useState, useContext, useCallback } from 'react';

const AuthContext = createContext(null);

const VALID_ROLES = ['super_admin', 'org_admin', 'care_manager', 'caller', 'mentor', 'patient'];

const MOCK_NAMES = {
    super_admin: 'System Admin',
    org_admin: 'Org Admin',
    care_manager: 'Alice Manager',
    caller: 'Sarah Johnson',
    mentor: 'Jane Williams',
    patient: 'Robert Williams',
};

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [selectedRole, setSelectedRole] = useState(null);

    const login = useCallback(async (role, credentials) => {
        if (!VALID_ROLES.includes(role)) throw new Error('Invalid role');
        await new Promise(r => setTimeout(r, 600));
        setSelectedRole(role);
        setUser({
            id: 'mock-user-' + role,
            name: MOCK_NAMES[role] || 'User',
            email: credentials?.email || `${role}@careconnect.com`,
            role,
        });
    }, []);

    const signup = useCallback(async (role, details) => {
        if (!VALID_ROLES.includes(role)) throw new Error('Invalid role');
        await new Promise(r => setTimeout(r, 800));
        setSelectedRole(role);
        setUser({
            id: 'new-user-' + Date.now(),
            name: details?.name || 'New User',
            email: details?.email || `${role}@careconnect.com`,
            role,
        });
    }, []);

    const logout = useCallback(() => {
        setUser(null);
        setSelectedRole(null);
    }, []);

    return (
        <AuthContext.Provider value={{ user, selectedRole, isAuthenticated: !!user, login, signup, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
};
