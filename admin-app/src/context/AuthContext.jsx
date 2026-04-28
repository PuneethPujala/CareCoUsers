import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { supabase, auth, handleAuthError } from '../lib/supabase';
import { apiService, handleApiError } from '../lib/api';

const AuthContext = createContext(null);

// Admin portal only allows these roles
const ADMIN_ROLES = ['super_admin', 'org_admin', 'care_manager', 'caretaker', 'caller'];
const VALID_ROLES = ['super_admin', 'org_admin', 'care_manager', 'caretaker', 'caller', 'mentor', 'patient_mentor', 'patient'];
const PHONE_REQUIRED_ROLES = ['org_admin', 'care_manager', 'caller'];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [mustVerifyPhone, setMustVerifyPhone] = useState(false);

  const skipNextFetchRef = useRef(false);

  // ─── Initialization ────
  // Restore existing session on mount (keeps user logged in across refreshes)
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
           await auth.signOut().catch(() => {});
        }

        if (session?.user) {
          setUser(session.user);
          // Fetch profile from backend with a 4s timeout
          try {
            const response = await Promise.race([
              apiService.auth.getProfile(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
            ]);
            const prof = response.data.profile;
            if (!ADMIN_ROLES.includes(prof.role)) {
              await auth.signOut().catch(() => {});
              setUser(null);
              setProfile(null);
              return;
            }
            setProfile(prof);
            setMustChangePassword(prof.mustChangePassword || false);
            setMustVerifyPhone(PHONE_REQUIRED_ROLES.includes(prof.role) && !prof.phoneVerified);
            skipNextFetchRef.current = true;
          } catch {
            // Profile fetch failed or timed out — clear session so user re-logs
            await auth.signOut().catch(() => {});
            setUser(null);
            setProfile(null);
          }
        }
      } catch {
        // No session — user will see landing page
      } finally {
        setInitializing(false);
      }
    };
    init();
  }, []);

  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  // ─── Auth State Listener ────
  useEffect(() => {
    const { data: { subscription } } = auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setMustChangePassword(false);
        setMustVerifyPhone(false);
        return;
      }

      if (session?.user) {
        setUser(session.user);

        if (skipNextFetchRef.current) {
          skipNextFetchRef.current = false;
          return;
        }

        if (!profileRef.current) {
          try {
            const response = await apiService.auth.getProfile();
            const prof = response.data.profile;
            // Only allow admin roles
            if (!ADMIN_ROLES.includes(prof.role)) {
              await auth.signOut().catch(() => { });
              setUser(null);
              setProfile(null);
              return;
            }
            setProfile(prof);
            setMustChangePassword(prof.mustChangePassword || false);
            setMustVerifyPhone(PHONE_REQUIRED_ROLES.includes(prof.role) && !prof.phoneVerified);
          } catch {
            // Don't clear profile here
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ─── Sign In (admin-portal specific: auto-detect role from MongoDB) ────
  const signIn = useCallback(async (email, password) => {
    try {
      // Step 1: Ask backend to detect the user's role from MongoDB
      const detectRes = await apiService.auth.detectRole({ email });
      const detectedRole = detectRes.data.role;

      if (!detectedRole) {
        throw new Error('No account found with this email.');
      }

      // Step 2: Verify it's an admin role
      if (!ADMIN_ROLES.includes(detectedRole)) {
        throw new Error(
          `Access denied. The role "${detectedRole}" is not permitted on the Admin Portal. ` +
          'Only Super Admin, Org Admin, Care Manager, Caretaker, and Caller roles can access this portal.'
        );
      }

      // Step 3: Login with detected role via existing backend
      const response = await apiService.auth.login({ email, password, role: detectedRole });
      const { session, profile: profileData } = response.data;

      // Set profile BEFORE setting session
      setProfile(profileData);
      setMustChangePassword(profileData.mustChangePassword || false);
      setMustVerifyPhone(PHONE_REQUIRED_ROLES.includes(profileData.role) && !profileData.phoneVerified);
      skipNextFetchRef.current = true;

      // Set Supabase session
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

      return response.data;
    } catch (error) {
      const serverMsg = error?.response?.data?.error;
      const err = new Error(serverMsg || error?.message || 'Login failed. Invalid credentials.');
      err.code = error?.response?.data?.code;
      throw err;
    }
  }, []);

  // ─── Sign In with Google ────
  // Accepts pre-fetched { session, profile } data from the useGoogleAuth hook in LoginScreen
  const signInWithGoogle = useCallback(async (googleData) => {
    try {
      if (!googleData) return null;

      const { session, profile: profileData } = googleData;

      // Set profile BEFORE setting session (same pattern as signIn)
      setProfile(profileData);
      setMustChangePassword(profileData.mustChangePassword || false);
      setMustVerifyPhone(PHONE_REQUIRED_ROLES.includes(profileData.role) && !profileData.phoneVerified);
      skipNextFetchRef.current = true;

      // Set Supabase session
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

      return googleData;
    } catch (error) {
      const serverMsg = error?.response?.data?.error;
      const err = new Error(serverMsg || error?.message || 'Google sign-in failed.');
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
    setMustVerifyPhone(false);
  }, []);

  // ─── Other Auth Methods (kept for compatibility) ────
  const signUp = useCallback(async (email, password, fullName, role, additionalData = {}) => {
    setLoading(true);
    try {
      if (!VALID_ROLES.includes(role)) throw new Error('Invalid role selected');
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
      return { user: authData.user, session: authData.session, needsEmailVerification: !authData.session };
    } catch (error) { throw handleAuthError(error); }
    finally { setLoading(false); }
  }, []);

  const signInWithOAuth = useCallback(async (provider, options = {}) => {
    setLoading(true);
    try { return await auth.signInWithOAuth(provider, options); }
    catch (error) { throw handleAuthError(error); }
    finally { setLoading(false); }
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
      // Password change in Supabase invalidates current token → auto-logout
      await auth.signOut().catch(() => {});
      setUser(null);
      setProfile(null);
      setMustChangePassword(false);
      setMustVerifyPhone(false);
      return response.data;
    } catch (error) {
      const parsed = handleApiError(error);
      const err = new Error(parsed.message || 'Failed to change password');
      err.code = parsed.code;
      throw err;
    }
  }, []);

  const createUser = useCallback(async (email, fullName, role, organizationId) => {
    try {
      const response = await apiService.auth.createUser({ email, fullName, role, organizationId });
      return response.data;
    } catch (error) {
      const parsed = handleApiError(error);
      const err = new Error(parsed.message || 'Failed to create user');
      err.code = parsed.code;
      throw err;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const response = await apiService.auth.getProfile();
      const prof = response.data.profile;
      setProfile(prof);
      setMustChangePassword(prof.mustChangePassword || false);
      setMustVerifyPhone(PHONE_REQUIRED_ROLES.includes(prof.role) && !prof.phoneVerified);
      return prof;
    } catch (error) { throw handleApiError(error); }
  }, []);

  // Direct state updater — no server call needed, avoids caching issues
  const markPhoneVerified = useCallback(() => {
    setMustVerifyPhone(false);
    setProfile(prev => prev ? { ...prev, phoneVerified: true } : prev);
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
    isAuthenticated, isEmailVerified, displayName, organizationId, mustChangePassword, mustVerifyPhone,
    signUp, signIn, signInWithGoogle, signInWithOAuth, signOut,
    resetPassword, updatePassword, updateProfile, refreshProfile, markPhoneVerified,
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
