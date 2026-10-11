"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { usePathname, useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { UserProfile } from "@/types/user";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const router = useRouter();
  const pathname = usePathname();

  const fetchProfile = async (uid: string): Promise<UserProfile | null> => {
    try {
      const userDocRef = doc(db, "users", uid);
      const userSnap = await getDoc(userDocRef);
      if (userSnap.exists()) {
        return userSnap.data() as UserProfile;
      }
      return null;
    } catch (error) {
      console.error("Error fetching user profile:", error);
      return null;
    }
  };

  const refreshProfile = async () => {
    if (!user) return;
    const data = await fetchProfile(user.uid);
    setProfile(data);
  };

  const signOut = async () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.clear();
        sessionStorage.clear();
      }
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Sign out error:", error);
    } finally {
      setUser(null);
      setProfile(null);
      setLoading(false);
      router.replace("/login");
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userProfile = await fetchProfile(currentUser.uid);
        setProfile(userProfile);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Navigation guard
  useEffect(() => {
    if (loading) return;

    const isAuthRoute = pathname === "/login" || pathname.startsWith("/auth");
    const isOnboardingRoute = pathname === "/onboarding";

    if (!user) {
      if (!isAuthRoute) {
        router.push("/login");
      }
      return;
    }

    // Google hesapları, yerel doğrulanan 4 haneli kod veya profili tamamlanmış hesaplar doğrulanmış kabul edilir
    const isGoogleUser = user.providerData.some((p) => p.providerId === "google.com");
    const isLocalVerified =
      typeof window !== "undefined" &&
      (localStorage.getItem(`email_verified_${user.uid}`) === "true" ||
        (user.email && localStorage.getItem(`email_verified_${user.email}`) === "true"));
    const isProfileVerified = Boolean(profile?.onboardingCompleted || (profile as any)?.emailVerified);
    const isVerified = user.emailVerified || isGoogleUser || isLocalVerified || isProfileVerified;

    if (!isVerified) {
      if (pathname !== "/auth/verify-email") {
        router.push("/auth/verify-email");
      }
      return;
    }

    // User is logged in and verified
    const isCompleted = profile?.onboardingCompleted;

    if (!isCompleted) {
      if (!isOnboardingRoute) {
        router.push("/onboarding");
      }
    } else {
      if (isAuthRoute || isOnboardingRoute) {
        router.push("/");
      }
    }
  }, [user, profile, loading, pathname, router]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
