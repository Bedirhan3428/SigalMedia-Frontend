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
    await firebaseSignOut(auth);
    setUser(null);
    setProfile(null);
    router.push("/login");
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

    // Google dışındaki hesaplarda email doğrulaması zorunlu
    const isGoogleUser = user.providerData.some((p) => p.providerId === "google.com");
    if (!user.emailVerified && !isGoogleUser) {
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
