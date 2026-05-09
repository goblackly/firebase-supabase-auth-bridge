import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, refreshFirebaseSupabaseRoleToken } from '../firebase';
import { UserProfile } from '../types';
import { syncUserProfileToSupabase } from '../services/supabaseBridge';

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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = undefined;

      if (firebaseUser) {
        try {
          await refreshFirebaseSupabaseRoleToken(true);
        } catch (err) {
          console.error('Failed to refresh Firebase token for Supabase:', err);
        }
      }

      setUser(firebaseUser);

      if (firebaseUser) {
        const profileRef = doc(db, 'users', firebaseUser.uid);
        unsubscribeProfile = onSnapshot(profileRef, async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const nextProfile = { uid: docSnap.id, ...data } as UserProfile;
            setProfile(nextProfile);
            setLoading(false);

            void syncUserProfileToSupabase({
              uid: docSnap.id,
              email: data.email ?? firebaseUser.email ?? '',
              first_name: data.first_name ?? '',
              last_name: data.last_name ?? '',
              phone: data.phone,
              role: data.role ?? (firebaseUser.email === 'info@goblackly.com' ? 'admin' : 'member'),
              chapter_role: data.chapter_role,
              crossing_year: data.crossing_year,
              photo_url: data.photo_url,
            }).catch((err) => {
              console.warn('Supabase profile sync deferred:', err);
            });

            if (firebaseUser.email === 'info@goblackly.com' && data.role !== 'admin') {
              try {
                await updateDoc(profileRef, { role: 'admin' });
              } catch (err) {
                console.error('Failed to auto-promote admin:', err);
              }
            }
          } else {
            if (firebaseUser.email === 'info@goblackly.com') {
              try {
                await setDoc(profileRef, {
                  first_name: 'Admin',
                  last_name: 'User',
                  email: firebaseUser.email,
                  role: 'admin',
                  created_at: serverTimestamp()
                });
              } catch (err) {
                console.error('Failed to create bootstrap admin profile:', err);
              }
            }
            setProfile(null);
            setLoading(false);
          }
        }, (error) => {
          const errInfo = {
            error: error.message,
            operationType: 'get',
            path: `users/${firebaseUser.uid}`,
            authInfo: {
              userId: firebaseUser.uid,
              email: firebaseUser.email,
              emailVerified: firebaseUser.emailVerified,
            }
          };
          console.error('Profile listener error:', JSON.stringify(errInfo));
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
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
