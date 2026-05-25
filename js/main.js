// js/firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    // ⚠️ 請務必確認這整段是你在 hago-award-system 後台複製下來的最新設定！
    apiKey: "AIzaSyCArCzhRG6H-07Ooet34ikyP3w9xVq6t1U", 
    authDomain: "hago-award-system.firebaseapp.com",
    projectId: "hago-award-system",
    storageBucket: "hago-award-system.appspot.com",
    messagingSenderId: "980449979485", 
    appId: "1:980449979485:web:652d6b419385e76ad071b4", // ⚠️ 這兩行若錯，就會跳權限不足
    measurementId: "G-L86Y9Y477Y"
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
