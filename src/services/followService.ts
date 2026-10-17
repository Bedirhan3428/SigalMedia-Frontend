// [START] AeroCode
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { FollowUserData } from "@/types/follow";
import { UserProfile } from "@/types/user";

// [START] AeroCode
export async function getFollowingIdSet(currentUid: string): Promise<Set<string>> {
  if (!currentUid) return new Set();
  try {
    const q = query(
      collection(db, "follows"),
      where("followerId", "==", currentUid)
    );
    const snap = await getDocs(q);
    const set = new Set<string>();
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data?.followingId) {
        set.add(data.followingId);
      }
    });
    return set;
  } catch (error) {
    console.error("getFollowingIdSet hatası:", error);
    return new Set();
  }
}
// [END] AeroCode

// [START] AeroCode
export async function checkIsFollowing(
  currentUid: string,
  targetUid: string
): Promise<boolean> {
  if (!currentUid || !targetUid || currentUid === targetUid) return false;
  try {
    const followDocRef = doc(db, "follows", `${currentUid}_${targetUid}`);
    const snap = await getDoc(followDocRef);
    return snap.exists();
  } catch (error) {
    console.error("checkIsFollowing hatası:", error);
    return false;
  }
}
// [END] AeroCode

// [START] AeroCode
async function clientSideToggleFollow(
  followerUid: string,
  targetUid: string,
  action: "toggle" | "follow" | "unfollow" = "toggle"
): Promise<{
  success: boolean;
  isFollowing: boolean;
  followersCount?: number;
  followingCount?: number;
}> {
  const followRef = doc(db, "follows", `${followerUid}_${targetUid}`);
  const followerUserRef = doc(db, "users", followerUid);
  const targetUserRef = doc(db, "users", targetUid);

  return runTransaction(db, async (transaction) => {
    const followSnap = await transaction.get(followRef);
    const followerSnap = await transaction.get(followerUserRef);
    const targetSnap = await transaction.get(targetUserRef);

    if (!targetSnap.exists()) {
      throw new Error("Kullanıcı bulunamadı");
    }

    const followerData = followerSnap.data() || {};
    const targetData = targetSnap.data() || {};

    const currentFollowingCount = Math.max(
      0,
      Number(followerData?.stats?.followingCount || 0)
    );
    const currentFollowersCount = Math.max(
      0,
      Number(targetData?.stats?.followersCount || 0)
    );

    const exists = followSnap.exists();
    let shouldFollow = !exists;
    if (action === "follow") shouldFollow = true;
    if (action === "unfollow") shouldFollow = false;

    if (shouldFollow && !exists) {
      transaction.set(followRef, {
        followerId: followerUid,
        followingId: targetUid,
        createdAt: serverTimestamp(),
      });

      const nextFollowingCount = currentFollowingCount + 1;
      const nextFollowersCount = currentFollowersCount + 1;

      if (followerSnap.exists()) {
        transaction.update(followerUserRef, {
          "stats.followingCount": nextFollowingCount,
          updatedAt: serverTimestamp(),
        });
      }

      transaction.update(targetUserRef, {
        "stats.followersCount": nextFollowersCount,
        updatedAt: serverTimestamp(),
      });

      return {
        success: true,
        isFollowing: true,
        followingCount: nextFollowingCount,
        followersCount: nextFollowersCount,
      };
    } else if (!shouldFollow && exists) {
      transaction.delete(followRef);

      const nextFollowingCount = Math.max(0, currentFollowingCount - 1);
      const nextFollowersCount = Math.max(0, currentFollowersCount - 1);

      if (followerSnap.exists()) {
        transaction.update(followerUserRef, {
          "stats.followingCount": nextFollowingCount,
          updatedAt: serverTimestamp(),
        });
      }

      transaction.update(targetUserRef, {
        "stats.followersCount": nextFollowersCount,
        updatedAt: serverTimestamp(),
      });

      return {
        success: true,
        isFollowing: false,
        followingCount: nextFollowingCount,
        followersCount: nextFollowersCount,
      };
    }

    return {
      success: true,
      isFollowing: exists,
      followingCount: currentFollowingCount,
      followersCount: currentFollowersCount,
    };
  });
}
// [END] AeroCode

// [START] AeroCode
export async function toggleFollow(
  targetUid: string,
  action: "toggle" | "follow" | "unfollow" = "toggle"
): Promise<{
  success: boolean;
  isFollowing: boolean;
  followersCount?: number;
  followingCount?: number;
}> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Oturum açmanız gerekiyor.");
  }

  if (currentUser.uid === targetUid) {
    throw new Error("Kendinizi takip edemezsiniz.");
  }

  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch("/api/users/follow", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ targetUid, action }),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        isFollowing: Boolean(data.isFollowing),
        followersCount: data.followersCount,
        followingCount: data.followingCount,
      };
    }
  } catch {
    // Fallback to clientSideToggleFollow
  }

  return clientSideToggleFollow(currentUser.uid, targetUid, action);
}
// [END] AeroCode

// [START] AeroCode
export async function getSuggestedUsers(
  currentUid: string,
  limitCount = 25
): Promise<FollowUserData[]> {
  try {
    const followingSet = await getFollowingIdSet(currentUid);
    const q = query(collection(db, "users"), limit(limitCount + 10));
    const snap = await getDocs(q);

    const list: FollowUserData[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Partial<UserProfile>;
      const uid = data.uid || docSnap.id;
      if (uid === currentUid) return;
      if (!data.username) return;

      list.push({
        uid,
        username: data.username,
        displayName: data.displayName || data.username,
        photoURL: data.photoURL || "",
        bio: data.bio || "",
        isFollowing: followingSet.has(uid),
        followersCount: data.stats?.followersCount ?? 0,
      });
    });

    return list.slice(0, limitCount);
  } catch (error) {
    console.error("getSuggestedUsers hatası:", error);
    return [];
  }
}
// [END] AeroCode

// [START] AeroCode
export async function searchUsers(
  queryText: string,
  currentUid: string
): Promise<FollowUserData[]> {
  const cleaned = queryText.trim().replace(/^@/, "").toLowerCase();
  if (!cleaned) {
    return getSuggestedUsers(currentUid);
  }

  try {
    const followingSet = await getFollowingIdSet(currentUid);
    const q = query(collection(db, "users"), limit(80));
    const snap = await getDocs(q);

    const results: FollowUserData[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Partial<UserProfile>;
      const uid = data.uid || docSnap.id;
      if (uid === currentUid) return;
      if (!data.username) return;

      const usernameLower = (
        data.username_lowercase || data.username
      ).toLowerCase();
      const displayNameLower = (data.displayName || "").toLowerCase();

      if (
        usernameLower.includes(cleaned) ||
        displayNameLower.includes(cleaned)
      ) {
        results.push({
          uid,
          username: data.username,
          displayName: data.displayName || data.username,
          photoURL: data.photoURL || "",
          bio: data.bio || "",
          isFollowing: followingSet.has(uid),
          followersCount: data.stats?.followersCount ?? 0,
        });
      }
    });

    results.sort((a, b) => {
      const aStarts = a.username.toLowerCase().startsWith(cleaned) ? 0 : 1;
      const bStarts = b.username.toLowerCase().startsWith(cleaned) ? 0 : 1;
      return aStarts - bStarts;
    });

    return results.slice(0, 30);
  } catch (error) {
    console.error("searchUsers hatası:", error);
    return [];
  }
}
// [END] AeroCode

// [START] AeroCode
export async function getUserFollowers(
  targetUid: string,
  currentUid: string
): Promise<FollowUserData[]> {
  if (!targetUid) return [];
  try {
    const [followingSet, followersSnap] = await Promise.all([
      getFollowingIdSet(currentUid),
      getDocs(
        query(collection(db, "follows"), where("followingId", "==", targetUid))
      ),
    ]);

    const followerIds: string[] = [];
    followersSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data?.followerId) {
        followerIds.push(data.followerId);
      }
    });

    if (followerIds.length === 0) return [];

    const userDocs = await Promise.all(
      followerIds.map((uid) => getDoc(doc(db, "users", uid)))
    );

    const result: FollowUserData[] = [];
    userDocs.forEach((userSnap) => {
      if (!userSnap.exists()) return;
      const data = userSnap.data() as Partial<UserProfile>;
      const uid = data.uid || userSnap.id;
      if (!data.username) return;

      result.push({
        uid,
        username: data.username,
        displayName: data.displayName || data.username,
        photoURL: data.photoURL || "",
        bio: data.bio || "",
        isFollowing: followingSet.has(uid),
        followersCount: data.stats?.followersCount ?? 0,
      });
    });

    return result;
  } catch (error) {
    console.error("getUserFollowers hatası:", error);
    return [];
  }
}
// [END] AeroCode

// [START] AeroCode
export async function getUserFollowing(
  targetUid: string,
  currentUid: string
): Promise<FollowUserData[]> {
  if (!targetUid) return [];
  try {
    const [followingSet, followingSnap] = await Promise.all([
      getFollowingIdSet(currentUid),
      getDocs(
        query(collection(db, "follows"), where("followerId", "==", targetUid))
      ),
    ]);

    const followingIds: string[] = [];
    followingSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data?.followingId) {
        followingIds.push(data.followingId);
      }
    });

    if (followingIds.length === 0) return [];

    const userDocs = await Promise.all(
      followingIds.map((uid) => getDoc(doc(db, "users", uid)))
    );

    const result: FollowUserData[] = [];
    userDocs.forEach((userSnap) => {
      if (!userSnap.exists()) return;
      const data = userSnap.data() as Partial<UserProfile>;
      const uid = data.uid || userSnap.id;
      if (!data.username) return;

      result.push({
        uid,
        username: data.username,
        displayName: data.displayName || data.username,
        photoURL: data.photoURL || "",
        bio: data.bio || "",
        isFollowing:
          targetUid === currentUid ? true : followingSet.has(uid),
        followersCount: data.stats?.followersCount ?? 0,
      });
    });

    return result;
  } catch (error) {
    console.error("getUserFollowing hatası:", error);
    return [];
  }
}
// [END] AeroCode
// [END] AeroCode
