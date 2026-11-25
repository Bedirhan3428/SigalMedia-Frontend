import { updateProfile } from "firebase/auth";
import { doc, getDoc, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import type { UserProfile } from "@/types/user";
import type { OnboardingInput, ProfilePatch, ProfileService } from "./types";

/** Today's Firestore code, moved here unchanged behind the ProfileService seam. */
export function createFirebaseProfileService(): ProfileService {
  const get = async (uid: string): Promise<UserProfile | null> => {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      return snap.exists() ? (snap.data() as UserProfile) : null;
    } catch (error) {
      console.error("Error fetching user profile:", error);
      return null;
    }
  };

  return {
    backend: "firebase",
    get,

    async getByIdOrUsername(idOrUsername) {
      let resolvedUid = decodeURIComponent(idOrUsername);
      let userSnap = await getDoc(doc(db, "users", resolvedUid));
      if (!userSnap.exists()) {
        const cleanUsername = resolvedUid.replace(/^@/, "").toLowerCase();
        const usernameSnap = await getDoc(doc(db, "usernames", cleanUsername));
        if (usernameSnap.exists()) {
          resolvedUid = usernameSnap.data().uid;
          userSnap = await getDoc(doc(db, "users", resolvedUid));
        }
      }
      return userSnap.exists() ? (userSnap.data() as UserProfile) : null;
    },

    async checkUsernameAvailable(username) {
      const snap = await getDoc(doc(db, "usernames", username.toLowerCase()));
      return !snap.exists();
    },

    async resolveEmailForUsername(username) {
      const usernameSnap = await getDoc(doc(db, "usernames", username));
      if (!usernameSnap.exists()) return "not-found";
      let email = usernameSnap.data()?.email as string | undefined;
      if (!email) {
        const uid = usernameSnap.data()?.uid as string | undefined;
        if (!uid) return null;
        const userSnap = await getDoc(doc(db, "users", uid));
        email = userSnap.data()?.email;
      }
      return email ? email.toLowerCase() : null;
    },

    async completeOnboarding(input: OnboardingInput) {
      let finalPhotoURL = input.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${input.username}`;
      if (input.avatarFile) {
        const fileExt = input.avatarFile.name.split(".").pop() || "jpg";
        const storageRef = ref(storage, `avatars/${input.uid}_${Date.now()}.${fileExt}`);
        const snapshot = await uploadBytes(storageRef, input.avatarFile);
        finalPhotoURL = await getDownloadURL(snapshot.ref);
      }

      // Firestore atomic writeBatch (users + usernames in one commit)
      const batch = writeBatch(db);
      const userRef = doc(db, "users", input.uid);
      const usernameRef = doc(db, "usernames", input.username.toLowerCase());

      batch.set(userRef, {
        uid: input.uid,
        email: input.email,
        username: input.username,
        username_lowercase: input.username.toLowerCase(),
        displayName: input.displayName,
        photoURL: finalPhotoURL,
        bio: "",
        birthDate: input.birthDate,
        age: input.age,
        isVerified: false,
        // [START] NexusAI
        isPrivate: false,
        // [END] NexusAI
        emailVerified: true,
        role: "user",
        onboardingCompleted: true,
        stats: { postsCount: 0, followersCount: 0, followingCount: 0 },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(usernameRef, { uid: input.uid, email: input.email, createdAt: serverTimestamp() });
      await batch.commit();
    },

    async update(uid, patch: ProfilePatch) {
      const fields: Record<string, unknown> = { updatedAt: serverTimestamp() };
      let photoURL: string | undefined;

      if (patch.photoRemoved) {
        photoURL = "";
      } else if (patch.avatarFile) {
        const file = patch.avatarFile;
        const fileExt = file.name.split(".").pop() || "jpg";
        const avatarRef = ref(storage, `avatars/${uid}/avatar_${Date.now()}.${fileExt}`);
        await uploadBytes(avatarRef, file, { contentType: file.type || "image/jpeg" });
        photoURL = await getDownloadURL(avatarRef);
      }
      if (patch.displayName !== undefined) fields.displayName = patch.displayName;
      if (patch.bio !== undefined) fields.bio = patch.bio;
      if (patch.isPrivate !== undefined) fields.isPrivate = patch.isPrivate;
      if (patch.messageSettings) fields.messageSettings = patch.messageSettings;
      if (patch.profileStyle !== undefined) fields.profileStyle = patch.profileStyle;
      if (photoURL !== undefined) fields.photoURL = photoURL;

      await updateDoc(doc(db, "users", uid), fields);

      if (photoURL !== undefined || patch.displayName !== undefined) {
        if (auth.currentUser) {
          try {
            await updateProfile(auth.currentUser, {
              displayName: patch.displayName,
              photoURL: photoURL !== undefined ? photoURL || undefined : undefined,
            });
          } catch {
            // Optional; the Firestore document is the source of truth.
          }
        }
      }
      return photoURL;
    },
  };
}
