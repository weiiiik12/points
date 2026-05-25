// js/firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 完美注入 hago-award-system 的專屬設定！
const firebaseConfig = {
    apiKey: "AIzaSyA84BEQc_szhvmbVlxVR_mXnCQ0E4auqTg",
    authDomain: "hago-award-system.firebaseapp.com",
    projectId: "hago-award-system",
    storageBucket: "hago-award-system.firebasestorage.app",
    messagingSenderId: "959940017225",
    appId: "1:959940017225:web:60ec11488e7468038f5398",
    measurementId: "G-FVFNDK2N0G"
};

let app, auth, db, analytics;
let initError = null;

try {
    app = initializeApp(firebaseConfig);
    analytics = getAnalytics(app);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.error("Firebase Init Error:", e);
    initError = e;
}

export { app, auth, db, analytics, initError };
