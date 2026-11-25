import {
  createUserWithEmailAndPassword,
  onAuthStateChanged as fbOnAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { AuthServiceError, mapFirebaseAuthError } from "./errors";
import type { AppUser, AuthService, SignUpResult } from "./types";

/** Wraps today's Firebase auth calls unchanged. The Firebase `User` object is the AppUser (structural match). */
export function createFirebaseAuthService(): AuthService {
  return {
    backend: "firebase",

    onAuthStateChanged: (callback) => fbOnAuthStateChanged(auth, (u) => callback(u)),

    getCurrentUser: () => auth.currentUser,

    async signInWithGoogle() {
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (err) {
        throw mapFirebaseAuthError(err);
      }
    },

    async signInWithEmail(email, password): Promise<AppUser> {
      try {
        return (await signInWithEmailAndPassword(auth, email, password)).user;
      } catch (err) {
        throw mapFirebaseAuthError(err);
      }
    },

    async signUpWithEmail(email, password): Promise<SignUpResult> {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        // Firebase mode confirms the address with the 4-digit code flow driven by the login page.
        return { user: cred.user, needsEmailConfirmation: true };
      } catch (err) {
        throw mapFirebaseAuthError(err);
      }
    },

    async signOut() {
      await fbSignOut(auth);
    },

    async resendVerificationEmail() {
      throw new AuthServiceError("unknown", "firebase mode uses the verification code API");
    },

    async sendPasswordReset(email) {
      try {
        await sendPasswordResetEmail(auth, email);
      } catch (err) {
        throw mapFirebaseAuthError(err);
      }
    },

    async updatePassword() {
      // Firebase mode sets the new password on /auth/action (confirmPasswordReset with the oobCode).
      throw new AuthServiceError("unknown", "use /auth/action in firebase mode");
    },

    getIdToken: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null),
  };
}
