// js/firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 已將專案 ID 修改為 hago-award-system
const firebaseConfig = {
    apiKey: "AIzaSyCArCzhRG6H-07Ooet34ikyP3w9xVq6t1U", // 註：若此金鑰無法連線，請至新專案後台複製新的 apiKey 替換
    authDomain: "hago-award-system.firebaseapp.com",
    projectId: "hago-award-system",
    storageBucket: "hago-award-system.appspot.com", // Firebase 預設通常為 .appspot.com 或 .firebasestorage.app
    messagingSenderId: "980449979485", // 建議同步替換為新專案的發送者 ID
    appId: "1:980449979485:web:652d6b419385e76ad071b4", // 建議同步替換為新專案的應用程式 ID
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
