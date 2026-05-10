import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
});

export const useAuth = () => useContext(AuthContext);

type UserRow = {
  auth_user_id: string | null;
  firebase_uid: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: 'member' | 'admin';
  chapter_role: string | null;
  crossing_year: string | null;
  photo_url: string | null;
  created_at: string;
};

function mapUserProfile(row: UserRow): UserProfile {
  return {
    uid: row.firebase_uid,
    auth_user_id: row.auth_user_id ?? undefined,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone ?? undefined,
    role: row.role,
    chapter_role: row.chapter_role ?? undefined,
    crossing_year: row.crossing_year ?? undefined,
    photo_url: row.photo_url ?? undefined,
    created_at: row.created_at,
  };
}

async function fetchProfileForUser(authUser: User): Promise<UserProfile | null> {
  let query = supabase
    .from('users')
    .select('auth_user_id, firebase_uid, email, first_name, last_name, phone, role, chapter_role, crossing_year, photo_url, created_at')
    .eq('auth_user_id', authUser.id)
    .maybeSingle();

  let { data, error } = await query;

  if (error) {
    throw error;
  }

  if (!data && authUser.email) {
    const fallback = await supabase
      .from('users')
      .select('auth_user_id, firebase_uid, email, first_name, last_name, phone, role, chapter_role, crossing_year, photo_url, created_at')
      .ilike('email', authUser.email)
      .maybeSingle();

    if (fallback.error) {
      throw fallback.error;
    }

    data = fallback.data;

    if (data && !data.auth_user_id) {
      const { error: attachError } = await supabase
        .from('users')
        .update({ auth_user_id: authUser.id, updated_at: new Date().toISOString() })
        .eq('firebase_uid', data.firebase_uid);

      if (attachError) {
        throw attachError;
      }

      data = {
        ...data,
        auth_user_id: authUser.id,
      };
    }
  }

  return data ? mapUserProfile(data as UserRow) : null;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      setLoading(true);
      const { data: sessionData, error } = await supabase.auth.getSession();

      if (cancelled) {
        return;
      }

      if (error) {
        console.error('Failed to get Supabase session:', error);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      const authUser = sessionData.session?.user ?? null;
      setUser(authUser);

      if (!authUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const nextProfile = await fetchProfileForUser(authUser);
        if (!cancelled) {
          setProfile(nextProfile);
        }
      } catch (profileError) {
        console.error('Failed to load Supabase profile:', profileError);
        if (!cancelled) {
          setProfile(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const authUser = session?.user ?? null;
      setUser(authUser);

      if (!authUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      void fetchProfileForUser(authUser)
        .then((nextProfile) => {
          if (!cancelled) {
            setProfile(nextProfile);
          }
        })
        .catch((profileError) => {
          console.error('Failed to refresh Supabase profile:', profileError);
          if (!cancelled) {
            setProfile(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const value = {
    user,
    profile,
    loading,
    isAdmin: profile?.role === 'admin' || user?.email === 'info@goblackly.com',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
