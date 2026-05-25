// js/firebase-init.js 裡面請直接貼上這一段（這是妳專屬的雲端鑰匙）：
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA84BEQc_szhvmbVlxVR_mXnCQ0E4auqTg",
    authDomain: "hago-award-system.firebaseapp.com",
    projectId: "hago-award-system",
    storageBucket: "hago-award-system.firebasestorage.app",
    messagingSenderId: "959940017225",
    appId: "1:959940017225:web:85a36866320f53638f5398",
    measurementId: "G-HRS8GBGJ89"
};

let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.error("Firebase Init Error:", e);
}

export { app, auth, db };