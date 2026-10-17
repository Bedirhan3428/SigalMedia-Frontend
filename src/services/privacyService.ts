import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  deleteDoc,
  updateDoc,
  writeBatch,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { BlockedUserData, FollowRequestData } from "@/types/privacy";
import { UserProfile } from "@/types/user";

/**
 * Kullanıcının hesap gizliliğini (Herkese Açık / Gizli) günceller.
 * Hesap herkese açık yapıldığında bekleyen takip isteklerini otomatik onaylar.
 */
export async function setAccountPrivacy(isPrivate: boolean): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Oturum açılmamış");

  const userRef = doc(db, "users", currentUser.uid);
  await updateDoc(userRef, {
    isPrivate,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Kullanıcıyı engeller: API üzerinden çalışır, gerekirse istemci tarafı atomik batch ile yedeklenir.
 */
export async function blockUser(targetUid: string): Promise<boolean> {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid === targetUid) return false;

  try {
    const token = await currentUser.getIdToken();
    const res = await fetch("/api/users/block", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ targetUid, action: "block" }),
    });

    if (res.ok) {
      return true;
    }
  } catch {
    // Fallback client-side transaction/batch below
  }

  // İstemci tarafı yedek (yerel geliştirmede serviceAccountKey yoksa sorunsuz çalışması için)
  const currentUid = currentUser.uid;
  const batch = writeBatch(db);

  const blockRef = doc(db, "blocks", `${currentUid}_${targetUid}`);
  const followABRef = doc(db, "follows", `${currentUid}_${targetUid}`);
  const followBARef = doc(db, "follows", `${targetUid}_${currentUid}`);
  const reqABRef = doc(db, "follow_requests", `${currentUid}_${targetUid}`);
  const reqBARef = doc(db, "follow_requests", `${targetUid}_${currentUid}`);
  const currentUserRef = doc(db, "users", currentUid);
  const targetUserRef = doc(db, "users", targetUid);

  const [followABSnap, followBASnap, reqABSnap, reqBASnap] = await Promise.all([
    getDoc(followABRef),
    getDoc(followBARef),
    getDoc(reqABRef),
    getDoc(reqBARef),
  ]);

  batch.set(blockRef, {
    blockerUid: currentUid,
    blockedUid: targetUid,
    createdAt: serverTimestamp(),
  });

  if (followABSnap.exists()) {
    batch.delete(followABRef);
    batch.update(currentUserRef, {
      "stats.followingCount": increment(-1),
      updatedAt: serverTimestamp(),
    });
    batch.update(targetUserRef, {
      "stats.followersCount": increment(-1),
      updatedAt: serverTimestamp(),
    });
  }

  if (followBASnap.exists()) {
    batch.delete(followBARef);
    batch.update(targetUserRef, {
      "stats.followingCount": increment(-1),
      updatedAt: serverTimestamp(),
    });
    batch.update(currentUserRef, {
      "stats.followersCount": increment(-1),
      updatedAt: serverTimestamp(),
    });
  }

  if (reqABSnap.exists()) {
    batch.delete(reqABRef);
  }
  if (reqBASnap.exists()) {
    batch.delete(reqBARef);
  }

  await batch.commit();
  return true;
}

/**
 * Kullanıcının engelini kaldırır.
 */
export async function unblockUser(targetUid: string): Promise<boolean> {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid === targetUid) return false;

  try {
    const token = await currentUser.getIdToken();
    const res = await fetch("/api/users/block", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ targetUid, action: "unblock" }),
    });

    if (res.ok) {
      return true;
    }
  } catch {
    // Fallback client-side delete below
  }

  const blockRef = doc(db, "blocks", `${currentUser.uid}_${targetUid}`);
  await deleteDoc(blockRef);
  return true;
}

/**
 * Mevcut kullanıcının engellediği hesapları profil bilgileriyle birlikte getirir.
 */
export async function getBlockedUsers(currentUid: string): Promise<BlockedUserData[]> {
  if (!currentUid) return [];

  const q = query(collection(db, "blocks"), where("blockerUid", "==", currentUid));
  const snap = await getDocs(q);

  if (snap.empty) return [];

  const results: BlockedUserData[] = [];
  await Promise.all(
    snap.docs.map(async (blockDoc) => {
      const data = blockDoc.data();
      const blockedUid = data.blockedUid as string;
      try {
        const userSnap = await getDoc(doc(db, "users", blockedUid));
        if (userSnap.exists()) {
          const u = userSnap.data() as UserProfile;
          results.push({
            uid: blockedUid,
            username: u.username || "kullanici",
            displayName: u.displayName || "Kullanıcı",
            photoURL: u.photoURL || "",
            blockedAt: data.createdAt,
          });
        }
      } catch {
        // Silinmiş kullanıcıysa atla
      }
    })
  );

  return results;
}

/**
 * Arama ve keşfette filtreleme için mevcut kullanıcının engellediği ve onu engelleyen ID kümelerini döner.
 */
export async function getBlockedUserIds(
  currentUid: string
): Promise<{ blockedByMe: Set<string>; blockedMe: Set<string> }> {
  const blockedByMe = new Set<string>();
  const blockedMe = new Set<string>();

  if (!currentUid) return { blockedByMe, blockedMe };

  try {
    const [byMeSnap, meSnap] = await Promise.all([
      getDocs(query(collection(db, "blocks"), where("blockerUid", "==", currentUid))),
      getDocs(query(collection(db, "blocks"), where("blockedUid", "==", currentUid))),
    ]);

    byMeSnap.forEach((d) => {
      const uid = d.data().blockedUid;
      if (uid) blockedByMe.add(uid);
    });

    meSnap.forEach((d) => {
      const uid = d.data().blockerUid;
      if (uid) blockedMe.add(uid);
    });
  } catch (err) {
    console.error("Engel listesi alınamadı:", err);
  }

  return { blockedByMe, blockedMe };
}

/**
 * Mevcut kullanıcıya gelen bekleyen takip isteklerini getirir.
 */
export async function getFollowRequests(currentUid: string): Promise<FollowRequestData[]> {
  if (!currentUid) return [];

  const q = query(collection(db, "follow_requests"), where("targetUid", "==", currentUid));
  const snap = await getDocs(q);

  if (snap.empty) return [];

  const results: FollowRequestData[] = [];
  await Promise.all(
    snap.docs.map(async (reqDoc) => {
      const data = reqDoc.data();
      const requesterUid = data.requesterUid as string;
      try {
        const userSnap = await getDoc(doc(db, "users", requesterUid));
        if (userSnap.exists()) {
          const u = userSnap.data() as UserProfile;
          results.push({
            requestId: reqDoc.id,
            requesterUid,
            username: u.username || "kullanici",
            displayName: u.displayName || "Kullanıcı",
            photoURL: u.photoURL || "",
            createdAt: data.createdAt,
          });
        }
      } catch {
        // Kullanıcı bulunamazsa atla
      }
    })
  );

  return results;
}

/**
 * Gelen takip isteğini onaylar ("accept") veya siler ("reject").
 */
export async function respondFollowRequest(
  requesterUid: string,
  action: "accept" | "reject"
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Oturum açılmamış");

  try {
    const token = await currentUser.getIdToken();
    const res = await fetch("/api/users/follow-request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ requesterUid, action }),
    });

    if (res.ok) return;
  } catch {
    // Fallback client-side below
  }

  const currentUid = currentUser.uid;
  const reqRef = doc(db, "follow_requests", `${requesterUid}_${currentUid}`);

  if (action === "reject") {
    await deleteDoc(reqRef);
    return;
  }

  const batch = writeBatch(db);
  const followRef = doc(db, "follows", `${requesterUid}_${currentUid}`);
  const followSnap = await getDoc(followRef);

  batch.delete(reqRef);

  if (!followSnap.exists()) {
    batch.set(followRef, {
      followerId: requesterUid,
      followingId: currentUid,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, "users", requesterUid), {
      "stats.followingCount": increment(1),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, "users", currentUid), {
      "stats.followersCount": increment(1),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
}

/**
 * Gizli bir hesaba takip isteği gönderir.
 */
export async function sendFollowRequest(targetUid: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid === targetUid) return;

  const reqRef = doc(db, "follow_requests", `${currentUser.uid}_${targetUid}`);
  await setDoc(reqRef, {
    requesterUid: currentUser.uid,
    targetUid,
    createdAt: serverTimestamp(),
  });
}

/**
 * Gönderilmiş takip isteğini geri çeker.
 */
export async function cancelFollowRequest(targetUid: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const reqRef = doc(db, "follow_requests", `${currentUser.uid}_${targetUid}`);
  await deleteDoc(reqRef);
}

/**
 * Açık bir hesabı doğrudan takip eder veya takipten çıkar.
 */
export async function toggleDirectFollow(
  targetUid: string,
  currentlyFollowing: boolean
): Promise<boolean> {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid === targetUid) return currentlyFollowing;

  const currentUid = currentUser.uid;
  const followRef = doc(db, "follows", `${currentUid}_${targetUid}`);
  const currentUserRef = doc(db, "users", currentUid);
  const targetUserRef = doc(db, "users", targetUid);
  const batch = writeBatch(db);

  if (currentlyFollowing) {
    batch.delete(followRef);
    batch.update(currentUserRef, {
      "stats.followingCount": increment(-1),
      updatedAt: serverTimestamp(),
    });
    batch.update(targetUserRef, {
      "stats.followersCount": increment(-1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return false;
  } else {
    batch.set(followRef, {
      followerId: currentUid,
      followingId: targetUid,
      createdAt: serverTimestamp(),
    });
    batch.update(currentUserRef, {
      "stats.followingCount": increment(1),
      updatedAt: serverTimestamp(),
    });
    batch.update(targetUserRef, {
      "stats.followersCount": increment(1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return true;
  }
}
