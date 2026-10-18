import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getAuth, Auth } from "firebase-admin/auth";
import { getFirestore, Firestore } from "firebase-admin/firestore";
// [START] CREATED BY Umut
import { getDatabase, Database } from "firebase-admin/database";
// [END] CREATED BY Umut
import fs from "fs";
import path from "path";

let app: App;

// [START] CREATED BY Umut
const rawRtdbUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
const rtdbUrl =
  rawRtdbUrl && !rawRtdbUrl.includes("firebaseio.com")
    ? rawRtdbUrl
    : "https://sigalmedia-social-default-rtdb.europe-west1.firebasedatabase.app";
// [END] CREATED BY Umut

// [MODIFIED BY Umut]
if (!getApps().length) {
  try {
    const serviceAccountPath = path.join(process.cwd(), "serviceAccountKey.json");
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
      app = initializeApp({
        credential: cert(serviceAccount),
        projectId: "sigalmedia-social",
        databaseURL: rtdbUrl,
      });
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        app = initializeApp({
          credential: cert(serviceAccount),
          projectId: "sigalmedia-social",
          databaseURL: rtdbUrl,
        });
      } catch (parseErr) {
        console.error("FIREBASE_SERVICE_ACCOUNT_KEY parse error:", parseErr);
        app = initializeApp({ projectId: "sigalmedia-social", databaseURL: rtdbUrl });
      }
    } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      app = initializeApp({
        credential: cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sigalmedia-social",
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
        projectId: "sigalmedia-social",
        databaseURL: rtdbUrl,
      });
    } else {
      app = initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sigalmedia-social",
        databaseURL: rtdbUrl,
      });
    }
  } catch (error) {
    console.error("Firebase admin init error:", error);
    app = initializeApp({
      projectId: "sigalmedia-social",
      databaseURL: rtdbUrl,
    });
  }
} else {
  app = getApps()[0];
}

// [START] AeroCode
const firestoreDbId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "default";

export const adminAuth: Auth = getAuth(app);
export const adminDb: Firestore = getFirestore(app, firestoreDbId);
// [END] AeroCode

// [START] CREATED BY Umut
export const adminRtdb: Database = getDatabase(app);
// [END] CREATED BY Umut
