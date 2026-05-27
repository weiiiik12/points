// js/main.js
import { auth, db } from './firebase-init.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let userRef = null;
let userData = null;
let currentSelectedSubject = 'eng';

document.addEventListener('DOMContentLoaded', () => {
    initAuthButtons();
    initAuthListener();
    checkWeekendStatus();
    renderLevelGrid();
    
    const adminBtn = document.querySelector('.btn-settings');
    if (adminBtn) {
        adminBtn.addEventListener('click', openAdminPanel);
    }
});

// 精準綁定登入與註冊按鈕
function initAuthButtons() {
    const btnLogin = document.getElementById('btnLogin');
    const btnRegister = document.getElementById('btnRegister');

    if (btnLogin) {
        btnLogin.onclick = null; // 清除舊綁定
        btnLogin.addEventListener('click', loginUser);
    }
    if (btnRegister) {
        btnRegister.onclick = null;
        btnRegister.addEventListener('click', registerUser);
    }
}

function initAuthListener() {
    const loginOverlay = document.getElementById('loginOverlay');

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            userRef = doc(db, "users", user.uid);
            if (loginOverlay) loginOverlay.style.display = 'none';
            
            onSnapshot(userRef, (docSnap) => {
                if (docSnap.exists()) {
                    userData = docSnap.data();
                    updateStudentUI();
                } else {
                    const initialData = {
                        realName: user.email.split('@')[0],
                        nickname: "新進小達人",
                        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`,
                        score: 100,
                        liquidBalance: 0,
                        history: [{ time: new Date().toLocaleString(), amount: 100, reason: "新人註冊獎勵金" }]
                    };
                    setDoc(userRef, initialData);
                }
            });
        } else {
            if (loginOverlay) loginOverlay.style.display = 'flex';
        }
    });
}

function updateStudentUI() {
    if (!userData) return;
    const nameEl = document.getElementById('childNameDisplay');
    const scoreEl = document.getElementById('scoreDisplay');
    const avatarEl = document.getElementById('userAvatar');

    if (nameEl) nameEl.innerText = `${userData.nickname} (${userData.realName})`;
    if (scoreEl) scoreEl.innerText = userData.score || 0;
    if (avatarEl && userData.avatarUrl) avatarEl.src = userData.avatarUrl;
}

async function loginUser() {
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const errorEl = document.getElementById('loginError');
    
    if (!emailInput || !passwordInput) return;
    
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    
    if (!email || !password) {
        if (errorEl) errorEl.innerText = "請填寫帳號及密碼！";
        return;
    }
    
    if (errorEl) errorEl.innerText = "正在登入中...";
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        if (errorEl) errorEl.innerText = "登入失敗：" + err.message;
    }
}

async function registerUser() {
    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value.trim();
    const errorEl = document.getElementById('loginError');
    
    if (!email || !password) return;
    
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        Swal.fire('註冊成功', '歡迎加入系統！', 'success');
    } catch (err) {
        if (errorEl) errorEl.innerText = "註冊失敗：" + err.message;
    }
}

function checkWeekendStatus() {
    const today = new Date();
    const day = today.getDay(); 
    const isWeekend = (day === 0 || day === 6);
    const badge = document.getElementById('weekendBadge');
    if (badge) badge.style.display = isWeekend ? 'inline-block' : 'none';
    return isWeekend;
}

window.selectSubject = function(subject) {
    currentSelectedSubject = subject;
    document.querySelectorAll('.btn-subject').forEach(btn => btn.classList.remove('active'));
    if (event && event.currentTarget) event.currentTarget.classList.add('active');
    renderLevelGrid();
};

function renderLevelGrid() {
    const grid = document.getElementById('quizLevelGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 1; i <= 12; i++) {
        const btn = document.createElement('button');
        btn.className = 'btn-level-placeholder';
        btn.style.cssText = "padding: 10px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; cursor: pointer;";
        btn.innerHTML = `🌟 第 ${i} 關<br><small style="color:#7f8c8d;">題庫建置中</small>`;
        btn.onclick = () => {
            const isWeekend = checkWeekendStatus();
            Swal.fire(`第 ${i} 關`, isWeekend ? '🔥 週末挑戰點數翻倍中！題庫建置中，敬請期待！' : '平日常態挑戰模式，題庫全科架構調整中！', 'info');
        };
        grid.appendChild(btn);
    }
}

window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const targetTab = document.getElementById(`tab-${tabId}`);
    if (targetTab) targetTab.style.display = 'block';
    if (event && event.currentTarget) event.currentTarget.classList.add('active');
};

async function openAdminPanel() {
    const { value: password } = await Swal.fire({
        title: '🔑 老師安全認證',
        input: 'password',
        inputPlaceholder: '請輸入 Winnie 老師的後台管理密碼',
        showCancelButton: true
    });

    if (password === "winnie888") {
        Swal.fire({
            title: '🛠️ 老師權限認證通過',
            text: '即將前往獨立的教師管理後台面版...',
            icon: 'success',
            timer: 1200,
            showConfirmButton: false
        }).then(() => {
            window.location.href = 'admin.html';
        });
    } else if (password) {
        Swal.fire('認證失敗', '密碼不正確喔！', 'error');
    }
}

window.handleLogout = function() {
    signOut(auth).then(() => { location.reload(); });
};
