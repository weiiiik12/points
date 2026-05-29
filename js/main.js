// js/main.js
import { auth, db } from './firebase-init.js';
import { signInAnonymously, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let currentUid = null; 
let userRef = null;
let userData = null;
let currentSelectedSubject = 'chi'; 
let cloudLevelsData = []; 
let excelUsersDatabase = []; 

let isGuest = false;

const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=0&single=true&output=csv";
const GOOGLE_SHEET_STUDENTS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=485295361&single=true&output=csv";

document.addEventListener('DOMContentLoaded', async () => {
    await loadExcelCredentials(); 
    checkAutoLogin();              

    initAuthButtons();
    checkWeekendStatus();
    startFirebaseQuizzesListener(); 
    fetchGoogleSheetShop(); 

    const adminBtn = document.querySelector('.btn-settings');
    if (adminBtn) {
        adminBtn.addEventListener('click', openAdminPanel);
    }
});

function parseCSVLineSafely(text) {
    let p = '', r = [];
    let q = false;
    for (let i = 0; i < text.length; i++) {
        let c = text[i];
        if (c === '"') { q = !q; }
        else if (c === ',' && !q) { r.push(p); p = ''; }
        else { p += c; }
    }
    r.push(p);
    return r;
}

function checkGuestPermission() {
    if (isGuest) {
        Swal.fire('👻 遊客模式', '您目前使用的是遊客體驗帳號，僅供參觀看畫面，無法執行此操作喔！', 'info');
        return false;
    }
    return true;
}

async function loadExcelCredentials() {
    try {
        const response = await fetch(GOOGLE_SHEET_STUDENTS_URL);
        const csvText = await response.text();
        const rawLines = csvText.split(/\r?\n/);
        const headers = parseCSVLineSafely(rawLines[0]).map(h => h.trim());

        excelUsersDatabase = [];
        for(let i = 1; i < rawLines.length; i++) {
            if(!rawLines[i] || rawLines[i].trim() === "") continue;
            const cols = parseCSVLineSafely(rawLines[i]);
            if (cols.length < 2) continue;

            excelUsersDatabase.push({
                email: (cols[headers.indexOf('email')] || '').trim().toLowerCase(),
                password: (cols[headers.indexOf('password')] || '').trim(),
                realName: (cols[headers.indexOf('realName')] || '未命名').trim(),
                grade: (cols[headers.indexOf('grade')] || 'g1').trim().toLowerCase()
            });
        }
    } catch (err) {
        console.error("預載帳密失敗:", err);
    }
}

function startFirebaseQuizzesListener() {
    onSnapshot(collection(db, "quizzes"), (snapshot) => {
        cloudLevelsData = [];
        snapshot.forEach(docSnap => {
            cloudLevelsData.push(docSnap.data());
        });
        renderLevelGrid(); 
    });
}

function checkAutoLogin() {
    const savedEmail = localStorage.getItem('hago_logged_in_email');
    const savedGuest = localStorage.getItem('hago_logged_in_guest');

    if (savedEmail) {
        const matchedUser = excelUsersDatabase.find(u => u.email === savedEmail);
        if (matchedUser) {
            isGuest = false;
            const userCleanId = savedEmail.replace(/[^a-zA-Z0-9]/g, "_");
            enterSystem(userCleanId, matchedUser.realName);
        } else {
            localStorage.removeItem('hago_logged_in_email');
        }
    } else if (savedGuest) {
        isGuest = true;
        enterSystem(savedGuest, "體驗小遊客");
    }
}

function initAuthButtons() {
    const btnLogin = document.getElementById('btnLogin');
    const btnGuest = document.getElementById('btnGuest');
    if (btnLogin) btnLogin.onclick = () => loginUser();
    if (btnGuest) btnGuest.onclick = () => loginAsGuest();
}

async function loginUser() {
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const errorEl = document.getElementById('loginError');
    if (!emailInput || !passwordInput) return;
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value.trim();
    if (!email || !password) { if (errorEl) errorEl.innerText = "請完整填寫您的帳號及密碼！"; return; }
    if (errorEl) errorEl.innerText = "雲端數據驗證中...";
    const matchedUser = excelUsersDatabase.find(u => u.email === email && u.password === password);
    if (matchedUser) {
        localStorage.setItem('hago_logged_in_email', email);enterSystem(email.replace(/[^a-zA-Z0-9]/g, "_"), matchedUser.realName);
    } else { if (errorEl) errorEl.innerText = "❌ 帳號或密碼錯誤！"; }
}

async function loginAsGuest() {
    try { const credential = await signInAnonymously(auth); isGuest = true; localStorage.setItem('hago_logged_in_guest', "guest_" + credential.user.uid.substring(0, 8)); enterSystem("guest_" + credential.user.uid.substring(0, 8), "體驗小遊客"); } catch (err) {}
}

async function enterSystem(userCleanId, realName) {
    currentUid = userCleanId; 

    const loginOverlay = document.getElementById('loginOverlay');
    const mainContainer = document.getElementById('mainAppContainer');

    if (loginOverlay) loginOverlay.style.display = 'none';
    if (mainContainer) mainContainer.style.display = 'block';

    const matchedStudentInfo = excelUsersDatabase.find(u => u.email.replace(/[^a-zA-Z0-9]/g, "_") === userCleanId || u.email === localStorage.getItem('hago_logged_in_email'));
    const studentGrade = matchedStudentInfo ? matchedStudentInfo.grade.toLowerCase() : 'g1';

    if (isGuest) {
        userData = {
            realName: realName,
            nickname: "參觀小達人",
            avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=guest_hago`,
            score: 888,
            grade: "g1",
            liquidBalance: 0,
            history: []
        };
        updateStudentUI();
        if(event && event.type === 'click') {
            Swal.fire('👻 遊客登入', '歡迎參觀！目前為體驗模式，所有操作都不會產生紀錄喔！', 'success');
        }
        renderLevelGrid(); 
        return;
    }

    userRef = doc(db, "users", userCleanId);
    const docSnap = await getDoc(userRef);

    if (docSnap.exists()) {
        userData = docSnap.data();
        if (userData.grade !== studentGrade) {
            await updateDoc(userRef, { grade: studentGrade });
            userData.grade = studentGrade;
        }
        updateStudentUI();
    } else {
        const initialData = {
            realName: realName,
            nickname: "新進小達人",
            avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${userCleanId}`,
            score: 100,
            grade: studentGrade, 
            liquidBalance: 0,
            history: [{ time: new Date().toLocaleString(), amount: 100, reason: "系統啟用獎勵" }]
        };
        await setDoc(userRef, initialData);
        userData = initialData;
        updateStudentUI();
    }

    onSnapshot(userRef, (snap) => {
        if (snap.exists()) {
            userData = snap.data();
            updateStudentUI();
        }
    });

    if(event && event.type === 'click') {
        Swal.fire('登入成功', `歡迎來到皓孩子網，${realName}！✨`, 'success');
    }
    renderLevelGrid(); 
}

// 🔄 蝦皮風格背包更新
function updateStudentUI() {
    if (!userData) return;
    const nameDisplay = document.getElementById('childNameDisplay');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const userEmail = document.getElementById('userEmail');
    const avatar = document.getElementById('userAvatar');

    if (nameDisplay) nameDisplay.innerText = `${userData.nickname} (${userData.realName})`;
    if (scoreDisplay) bookkeepingScore(userData.score || 0); 
    if (userEmail) userEmail.innerText = `🟢 在線：${userData.realName}`;
    if (avatar && userData.avatarUrl) avatar.src = userData.avatarUrl;

    const backpackGrid = document.getElementById('inventoryContainer');
    if (backpackGrid) {
        const myItems = userData.inventory || []; 

        const titleEl = backpackGrid.previousElementSibling.previousElementSibling;
        if (titleEl && titleEl.tagName === 'H3') {
            titleEl.innerHTML = `🎒 我的背包 <span style="font-size: 0.9rem; color: #888;">(${myItems.length}/10)</span>`;
            titleEl.style.color = '#ee4d2d';
        }

        if (myItems.length === 0) {
            backpackGrid.innerHTML = `<p style="color:#999; text-align:center; font-size:0.9rem; padding:15px;">🎒 背包空空如也，快去上面買東西吧！</p>`;
        } else {
            let backpackHtml = `<div style="display: flex; flex-direction: column; gap: 12px; margin-top: 15px; width: 100%; box-sizing: border-box;">`;
            
            myItems.forEach((item, index) => {
                const isClaimed = item.status === "已領取";
                const themeColor = isClaimed ? '#c0c0c0' : '#ee4d2d'; 
                
                backpackHtml += `
                    <div style="display: flex; background: white; border: 1px solid #e8e8e8; border-radius: 4px; overflow: hidden; box-shadow: 2px 2px 6px rgba(0,0,0,0.05); width: 100%; min-
