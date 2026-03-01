import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { supabase, auth, handleAuthError } from '../lib/supabase';
import { apiService, handleApiError } from '../lib/api';

const AuthContext = createContext(null);

const VALID_ROLES = ['super_admin', 'org_admin', 'care_manager', 'caretaker', 'caller', 'mentor', 'patient_mentor', 'patient'];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Flag to skip the next onAuthStateChange profile fetch
  // (because signIn already set the profile from the backend response)
  const skipNextFetchRef = useRef(false);

  // ─── Initialization ────
  // On mount, check for existing session. If there's one, we DON'T fetch
  // the profile here — the auth state listener will handle it.
  useEffect(() => {
    const init = async () => {
      try {
        const session = await auth.getCurrentSession();
        if (session?.user) {
          setUser(session.user);
          // Attempt to load profile for existing session
          try {
            const response = await apiService.auth.getProfile();
            setProfile(response.data.profile);
            setMustChangePassword(response.data.profile.mustChangePassword || false);
          } catch {
            // Session is stale or backend unreachable — force clean sign out
            await auth.signOut().catch(() => { });
            setUser(null);
            setProfile(null);
          }
        }
      } catch {
        // No session — that's fine, user will see login
      } finally {
        setInitializing(false);
      }
    };

    init();
  }, []);
  // Keep a ref of current profile for use inside the listener (avoids dependency)
  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  // ─── Auth State Listener ────
  // Only fetch profile when auth changes AND signIn didn't already set it.
  useEffect(() => {
    const { data: { subscription } } = auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setMustChangePassword(false);
        return;
      }

      if (session?.user) {
        setUser(session.user);

        // If signIn already set the profile, skip the redundant fetch
        if (skipNextFetchRef.current) {
          skipNextFetchRef.current = false;
          return;
        }

        // Only fetch if we don't already have a profile
        if (!profileRef.current) {
          try {
            const response = await apiService.auth.getProfile();
            setProfile(response.data.profile);
            setMustChangePassword(response.data.profile.mustChangePassword || false);
          } catch {
            // Don't clear profile here — it might have been set by signIn
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ─── Sign Up ────
  const signUp = useCallback(async (email, password, fullName, role, additionalData = {}) => {
    setLoading(true);
    try {
      if (!VALID_ROLES.includes(role)) {
        throw new Error('Invalid role selected');
      }

      const authData = await auth.signUp(email, password, {
        data: { full_name: fullName, role, ...additionalData }
      });

      if (authData.session) {
        try {
          await apiService.auth.register({
            supabaseUid: authData.user.id, email, fullName, role, ...additionalData
          });
        } catch (profileError) {
          console.warn('Failed to create profile:', profileError?.message);
        }
      }

      return {
        user: authData.user,
        session: authData.session,
        needsEmailVerification: !authData.session
      };
    } catch (error) {
      throw handleAuthError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Sign In (backend-validated with role) ────
  const signIn = useCallback(async (email, password, role) => {
    setLoading(true);
    try {
      // Call backend which validates role against MongoDB, then authenticates
      const response = await apiService.auth.login({ email, password, role });
      const { session, profile: profileData } = response.data;

      // Set profile BEFORE setting session (so the listener skips the fetch)
      setProfile(profileData);
      setMustChangePassword(profileData.mustChangePassword || false);
      skipNextFetchRef.current = true;

      // Set the Supabase session (triggers onAuthStateChange -> SIGNED_IN)
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

      setLoading(false);
      return response.data;
    } catch (error) {
      setLoading(false);
      const serverMsg = error?.response?.data?.error;
      const err = new Error(serverMsg || error?.message || 'Login failed');
      err.code = error?.response?.data?.code;
      throw err;
    }
  }, []);

  // ─── Sign Out ────
  const signOut = useCallback(async () => {
    try {
      await auth.signOut();
    } catch {
      // Force clear even if Supabase signOut fails
    }
    setUser(null);
    setProfile(null);
    setMustChangePassword(false);
  }, []);

  // ─── Other Auth Methods ────
  const signInWithOAuth = useCallback(async (provider, options = {}) => {
    setLoading(true);
    try {
      return await auth.signInWithOAuth(provider, options);
    } catch (error) {
      throw handleAuthError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  const resetPassword = useCallback(async (email) => {
    try { await auth.resetPassword(email); }
    catch (error) { throw handleAuthError(error); }
  }, []);

  const updatePassword = useCallback(async (newPassword) => {
    try { await auth.updatePassword(newPassword); }
    catch (error) { throw handleAuthError(error); }
  }, []);

  const updateProfile = useCallback(async (profileData) => {
    try {
      const response = await apiService.auth.updateProfile(profileData);
      setProfile(response.data.profile);
      return response.data.profile;
    } catch (error) { throw handleApiError(error); }
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    try {
      const response = await apiService.auth.changePassword({ currentPassword, newPassword });
      await auth.signOut();
      setUser(null);
      setProfile(null);
      setMustChangePassword(false);
      return response.data;
    } catch (error) { throw handleApiError(error); }
  }, []);

  const createUser = useCallback(async (email, fullName, role, organizationId) => {
    try {
      const response = await apiService.auth.createUser({ email, fullName, role, organizationId });
      return response.data;
    } catch (error) { throw handleApiError(error); }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const response = await apiService.auth.getProfile();
      setProfile(response.data.profile);
      return response.data.profile;
    } catch (error) { throw handleApiError(error); }
  }, []);

  const hasRole = useCallback((role) => profile?.role === role, [profile]);
  const hasAnyRole = useCallback((roles) => roles.includes(profile?.role), [profile]);

  const hasPermission = useCallback((resource, action) => {
    if (!profile) return false;
    if (profile.role === 'super_admin') return true;
    const rolePermissions = {
      'org_admin': ['organization', 'care_managers', 'caretakers', 'patients', 'reports'],
      'care_manager': ['caretakers', 'patients', 'medications', 'call_logs', 'reports'],
      'caretaker': ['patients', 'call_logs'],
      'caller': ['patients', 'call_logs'],
      'mentor': ['patients', 'medications', 'health_journal'],
      'patient_mentor': ['patients', 'medications', 'health_journal'],
      'patient': ['patients', 'medications', 'call_logs']
    };
    return rolePermissions[profile.role]?.includes(resource) || false;
  }, [profile]);

  const displayName = profile?.fullName || user?.user_metadata?.full_name || user?.email || 'User';
  const isAuthenticated = !!user && !!profile;
  const isEmailVerified = user?.email_confirmed_at || profile?.emailVerified || false;
  const organizationId = profile?.organizationId;

  const value = {
    user, profile, loading, initializing,
    isAuthenticated, isEmailVerified, displayName, organizationId, mustChangePassword,
    signUp, signIn, signInWithOAuth, signOut,
    resetPassword, updatePassword, updateProfile, refreshProfile,
    changePassword, createUser,
    hasRole, hasAnyRole, hasPermission,
    VALID_ROLES,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
