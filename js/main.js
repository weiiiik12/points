// js/main.js

import { auth, db } from './firebase-init.js';
import { signInAnonymously, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { DAILY_QUESTIONS } from './questions.js'; // 🌟 成功掛載妳的專屬題庫！

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
                    <div style="display: flex; background: white; border: 1px solid #e8e8e8; border-radius: 4px; overflow: hidden; box-shadow: 2px 2px 6px rgba(0,0,0,0.05); width: 100%; min-height: 100px; align-items: stretch; position: relative;">
                        <div style="background: ${themeColor}; width: 110px; display: flex; flex-direction: column; justify-content: center; align-items: center; color: white; position: relative; flex-shrink: 0; border-right: 1px dashed rgba(255,255,255,0.4);">
                            <span style="font-size: 2.5rem;">🛍️</span>
                            <div style="position: absolute; left: -5px; top: 0; bottom: 0; width: 10px; background-image: radial-gradient(circle, #ffffff 4px, transparent 4px); background-size: 10px 14px; background-position: -5px 0;"></div>
                        </div>
                        <div style="flex: 1; padding: 12px 15px; text-align: left; display: flex; flex-direction: column; justify-content: center; min-width: 0; border-right: 1px dashed #e8e8e8;">
                            <h4 style="margin: 0 0 8px 0; font-size: 1.15rem; color: #333; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.title}</h4>
                            <p style="margin: 0; font-size: 0.85rem; color: #757575;">兌換日期：${item.date || '未知'}</p>
                        </div>
                        <div style="padding: 0 15px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 85px;">
                            ${isClaimed ? `
                                <button style="background: white; color: #ccc; border: 1px solid #ccc; padding: 6px 0; border-radius: 2px; font-size: 0.85rem; font-weight: bold; cursor: not-allowed; width: 100%;">已核銷</button>
                            ` : `
                                <button onclick="claimBackpackItem(${index}, '${item.title.replace(/'/g, "\\'")}')" style="background: ${themeColor}; color: white; border: none; padding: 6px 0; border-radius: 2px; font-size: 0.85rem; font-weight: bold; cursor: pointer; transition: 0.2s; box-shadow: 0 2px 4px rgba(238,77,45,0.2); width: 100%;">未使用</button>
                            `}
                        </div>
                    </div>
                `;
            });
            
            backpackHtml += `</div>`;
            backpackGrid.innerHTML = backpackHtml;
        }
    }
}

function bookkeepingScore(score) {
    const scoreDisplay = document.getElementById('scoreDisplay');
    if (scoreDisplay) scoreDisplay.innerText = score;
}

window.claimBackpackItem = async function(itemIndex, itemTitle) {
    if (!checkGuestPermission()) return; 

    Swal.fire({
        title: '🎁 實體禮物領取確認',
        html: `請問老師已經把實體小禮物<br><b style="color:#ff7675; font-size:1.1rem;">【${itemTitle}】</b><br>交到妳手上了嗎？<br><br><span style="color:#e74c3c; font-size:0.85rem; font-weight:bold;">⚠️ 注意：確定領取後不可退換喔！</span>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#ff7675',
        cancelButtonColor: '#b2bec3',
        confirmButtonText: '確定領取，不退換！',
        cancelButtonText: '先不要'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: '安全核銷中...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

            const currentInventory = [...(userData.inventory || [])];
            if (currentInventory[itemIndex]) {
                currentInventory[itemIndex].status = "已領取";
                currentInventory[itemIndex].claimedAt = new Date().toLocaleString(); 
            }

            try {
                await updateDoc(userRef, {
                    inventory: currentInventory
                });
                Swal.fire('🎉 領取成功！', `【${itemTitle}】核銷成功，快開心地向老師領取吧！`, 'success');
            } catch (err) {
                console.error("核銷失敗:", err);
                Swal.fire('連線異常', '請找 Winnie 老師手動處理喔！', 'error');
            }
        }
    });
};

function renderLevelGrid() {
    const grid = document.getElementById('quizLevelGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const currentGradeCode = (userData && userData.grade) ? userData.grade.toLowerCase() : 'g1';

    for (let i = 1; i <= 12; i++) {
        const finalQuizzesPool = cloudLevelsData.filter(item => 
            item.subject === currentSelectedSubject && 
            item.level === i && 
            item.grade.toLowerCase() === currentGradeCode
        );

        const btn = document.createElement('button');
        btn.className = 'btn-level-placeholder';

        if (finalQuizzesPool.length > 0) {
            btn.style.cssText = "padding: 12px 8px; border-radius: 10px; cursor: pointer; font-weight: bold; background: linear-gradient(135deg, #a29bfe, #6c5ce7); color: white; border: none; box-shadow: 0 4px 8px rgba(108,92,231,0.2);";
            const latestTitle = finalQuizzesPool[finalQuizzesPool.length - 1].title;
            btn.innerHTML = `🚀 第 ${i} 關<br><small style="color:#fff; font-size:0.75rem;">${latestTitle}</small>`;
            btn.onclick = () => { 
                if (!checkGuestPermission()) return; 
                const randomIdx = Math.floor(Math.random() * finalQuizzesPool.length);
                window.open(finalQuizzesPool[randomIdx].url, '_blank'); 
            };
        } else {
            btn.innerHTML = `🔒 第 ${i} 關<br><small style="color:#cbd5e1; font-size:0.75rem;">冒險準備中</small>`;
            btn.onclick = () => {
                Swal.fire(`第 ${i} 關`, checkWeekendStatus() ? '🔥 週末雙倍副本！本關題庫導師正在建置中～' : '常態冒險模式，關卡內容調整中！', 'info');
            };
        }
        grid.appendChild(btn);
    }
}

async function fetchGoogleSheetShop() {
    const shopGrid = document.getElementById('googleSheetShopGrid');
    if (!shopGrid) return;
    try {
        const response = await fetch(GOOGLE_SHEET_CSV_URL);
        const csvText = await response.text();
        const rawLines = csvText.split(/\r?\n/);
        const headers = parseCSVLineSafely(rawLines[0]).map(h => h.trim().toLowerCase());
        const titleIdx = headers.findIndex(h => h.includes('title') || h.includes('name') || h.includes('名稱') || h.includes('商品'));
        const priceIdx = headers.findIndex(h => h.includes('price') || h.includes('cost') || h.includes('點數') || h.includes('價格') || h.includes('價錢'));
        const stockIdx = headers.findIndex(h => h.includes('stock') || h.includes('count') || h.includes('庫存') || h.includes('數量'));
        const imgIdx = headers.findIndex(h => h.includes('img') || h.includes('url') || h.includes('圖片') || h.includes('照'));
        
        let html = ''; let validItemCount = 0;
        for (let i = 1; i < rawLines.length; i++) {
            if (!rawLines[i] || rawLines[i].trim() === "") continue;
            const cols = parseCSVLineSafely(rawLines[i]); if (cols.length < 2) continue;
            const title = (titleIdx !== -1 && cols[titleIdx]) ? cols[titleIdx].trim() : '神祕小禮物';
            const price = (priceIdx !== -1 && cols[priceIdx]) ? parseInt(cols[priceIdx].trim(), 10) || 50 : 50;
            const stock = (stockIdx !== -1 && cols[stockIdx]) ? parseInt(cols[stockIdx].trim(), 10) || 0 : 0;
            let imgUrl = (imgIdx !== -1 && cols[imgIdx]) ? cols[imgIdx].trim() : '';
            if (!imgUrl || !imgUrl.startsWith('http')) imgUrl = 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=150';
            validItemCount++;
            html += `
                <div class="shopee-card" style="background:#fff; border:1px solid #edf2f7; border-radius:12px; overflow:hidden; display:flex; flex-direction:column; justify-content:space-between; padding:10px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                    <img src="${imgUrl}" style="width:100%; height:110px; object-fit:cover; border-radius:8px;" alt="商品">
                    <div style="margin-top:6px; text-align:left;">
                        <h4 style="margin:0; font-size:0.85rem; color:#2d3436; height:2.4em; overflow:hidden; font-weight:bold;">${title}</h4>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                            <span style="color:#e17055; font-weight:800; font-size:1rem;">${price} <small style="font-size:0.7rem; font-weight:normal; color:#888;">點</small></span>
                            <span style="font-size:0.7rem; color:#718096; background:#edf2f7; padding:2px 4px; border-radius:4px;">庫存:${stock}</span>
                        </div>
                    </div>
                    <button onclick="buyShopItem('${title.replace(/'/g, "\\'")}', ${price}, ${stock})" ${stock <= 0 ? 'disabled' : ''} style="width:100%; margin-top:8px; padding:6px; background:${stock <= 0 ? '#b2bec3' : '#ff9f43'}; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:0.8rem;">${stock <= 0 ? '已售完' : '立即直購'}</button>
                </div>`;
        }
        shopGrid.innerHTML = validItemCount === 0 ? `<p style="padding:20px;">🛒 商店空空如也</p>` : html;
    } catch (err) { console.error(err); }
}

window.buyShopItem = async function(title, price, stock) {
    if (!checkGuestPermission() || !userData) return;

    const currentInventory = userData.inventory || [];
    if (currentInventory.length >= 10) {
        return Swal.fire({
            title: '🎒 背包已滿', 
            text: '妳的榮譽背包已經裝滿 10 個物品囉！請先拿去找老師核銷兌換，清出空間再來買吧。', 
            icon: 'warning',
            confirmButtonColor: '#e17055'
        });
    }

    if (userData.score < price) return Swal.fire('點數不足', `還差 ${price - userData.score} 點！`, 'warning');
    
    Swal.fire({ 
        title: '確定兌換？', 
        text: `是否扣除 ${price} 點兌換【${title}】？`, 
        icon: 'question', 
        showCancelButton: true,
        confirmButtonColor: '#00b894'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await updateDoc(userRef, { 
                score: userData.score - price, 
                inventory: [...currentInventory, { title: title, date: new Date().toLocaleDateString(), status: "未領取" }], 
                history: [...(userData.history || []), { date: new Date().toLocaleDateString(), amount: -price, reason: `[直購] 兌換 ${title}` }] 
            });
            Swal.fire('🎉 兌換成功！', `禮物已放進背包。`, 'success');
        }
    });
};

window.selectSubject = function(subject) { currentSelectedSubject = subject; document.querySelectorAll('#subjectFilterGroup .btn-filter-opt').forEach(btn => btn.classList.remove('active')); if (event && event.currentTarget) event.currentTarget.classList.add('active'); renderLevelGrid(); };
window.switchTab = function(tabId) { document.querySelectorAll('.section').forEach(content => content.style.display = 'none'); document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active')); const targetTab = document.getElementById(tabId); if (targetTab) targetTab.style.display = 'block'; if (event && event.currentTarget) event.currentTarget.classList.add('active'); };
function checkWeekendStatus() { const today = new Date(); const isWeekend = (today.getDay() === 0 || today.getDay() === 6); const badge = document.getElementById('weekendBadge'); if (badge) badge.style.display = isWeekend ? 'inline-block' : 'none'; return isWeekend; }
window.redeemPromoCode = async function() { Swal.fire('提示', '請向導師領取最新兌換碼。', 'info'); };
window.startWeekendQuiz = function() { Swal.fire('未到開啟時間', '週末才會限時開放隱藏題庫喔！', 'info'); };

async function openAdminPanel() {
    if (!checkGuestPermission()) return;
    const { value: teacherId } = await Swal.fire({ title: '🔑 導師安全認證', input: 'password', inputPlaceholder: '請輸入導師固定 ID...', showCancelButton: true, confirmButtonColor: '#2c3e50' });
    const TEACHER_REGISTRY = { "hao002": "怡芳老師", "hao030": "湘羚老師", "hao015": "愷容老師", "hao026": "Andrea老師", "lovesan": "徐主任", "hao006": "育琴老師", "hao036": "Winnie老師", "haowork12": "最高管理員" };
    if (teacherId && TEACHER_REGISTRY[teacherId]) { localStorage.setItem('activeTeacherName', TEACHER_REGISTRY[teacherId]); Swal.fire({ title: '認證成功', text: `歡迎！`, icon: 'success', timer: 1000, showConfirmButton: false }).then(() => { window.location.href = 'admin.html'; }); }
}
window.handleLogout = function() { localStorage.removeItem('hago_logged_in_email'); localStorage.removeItem('hago_logged_in_guest'); signOut(auth).then(() => { location.reload(); }); };

// ==========================================
// ⚔️ 知識王對戰系統核心邏輯
// ==========================================

function generateRoomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

window.createTeamRoom = async function() {
    if (!checkGuestPermission() || !userData) return;
    
    const roomCode = generateRoomCode();
    const roomRef = doc(db, "team_challenges", roomCode);

    // 🎲 從妳的 DAILY_QUESTIONS 題庫中，隨機打亂並抽出 3 題
    const shuffledQuestions = DAILY_QUESTIONS.sort(() => 0.5 - Math.random()).slice(0, 3);
    const battleQuestions = shuffledQuestions.map(item => ({
        q: item.question,
        options: item.options,
        ans: item.answer // 將欄位對應到擂台系統的格式
    }));

    try {
        await setDoc(roomRef, {
            status: "waiting", 
            hostUid: currentUid,
            createdAt: Date.now(),
            questions: battleQuestions, // 🌟 關鍵：把這 3 題存進雲端房間裡！
            players: {
                [currentUid]: { name: userData.realName, isReady: false, score: 0 }
            }
        });
        enterWaitingRoom(roomCode, true);
    } catch (err) {
        Swal.fire('建立失敗', err.message, 'error');
    }
};

window.joinTeamChallenge = async function() {
    if (!checkGuestPermission() || !userData) return;
    
    const inputEl = document.getElementById('teamRoomInput');
    const roomCode = inputEl ? inputEl.value.trim() : '';

    if (!roomCode || roomCode.length !== 6) {
        return Swal.fire('格式錯誤', '請輸入同學提供的 6 位數房號！', 'warning');
    }

    const roomRef = doc(db, "team_challenges", roomCode);
    const roomSnap = await getDoc(roomRef);

    if (!roomSnap.exists()) {
        return Swal.fire('找不到房間', '這間教室不存在，請確認房號是否正確！', 'error');
    }

    const roomData = roomSnap.data();
    if (roomData.status !== "waiting") return Swal.fire('來晚了', '這個房間已經開始對戰或結束囉！', 'warning');
    if (Object.keys(roomData.players).length >= 2) return Swal.fire('房間已滿', '這個房間已經有兩個人囉，去別間看看吧！', 'warning');

    try {
        await updateDoc(roomRef, {
            [`players.${currentUid}`]: { name: userData.realName, isReady: false, score: 0 }
        });
        enterWaitingRoom(roomCode, false);
    } catch (err) {
        Swal.fire('加入失敗', err.message, 'error');
    }
};

let unsubscribeRoom = null; 
let currentArenaRef = null;

function enterWaitingRoom(roomCode, isHost) {
    const roomRef = doc(db, "team_challenges", roomCode);
    currentArenaRef = roomRef;

    Swal.fire({
        title: `⚔️ 知識王對戰室：${roomCode}`,
        html: `<div id="waitingRoomContent" style="min-height: 100px;">正在建立連線...</div>`,
        showCancelButton: true,
        showConfirmButton: true,
        confirmButtonText: '✋ 我準備好了！',
        cancelButtonText: '離開房間',
        confirmButtonColor: '#00b894',
        cancelButtonColor: '#b2bec3',
        allowOutsideClick: false,
        didOpen: () => {
            unsubscribeRoom = onSnapshot(roomRef, (snap) => {
                if (!snap.exists()) {
                    Swal.close();
                    return Swal.fire('房間已解散', '房主已關閉這個對戰室。', 'info');
                }
                
                const data = snap.data();
                const players = data.players || {};
                const playerKeys = Object.keys(players);

                let html = `<p style="color:#666; font-size:0.9rem; margin-bottom:15px;">目前對戰人數：${playerKeys.length} / 2</p>`;
                let allReady = true;

                playerKeys.forEach(uid => {
                    const p = players[uid];
                    const readyStatus = p.isReady 
                        ? '<span style="color:#00b894; font-weight:bold; float:right;">(已準備 ✔️)</span>' 
                        : '<span style="color:#e17055; float:right;">(裝備中...)</span>';
                        
                    html += `<div style="padding: 12px; background: #f8f9fa; border-radius: 8px; margin-bottom: 8px; text-align: left; border-left: 4px solid ${p.isReady ? '#00b894' : '#e17055'};">
                        👤 <b>${p.name}</b> ${readyStatus}
                    </div>`;
                    if (!p.isReady) allReady = false;
                });

                document.getElementById('waitingRoomContent').innerHTML = html;

                if (playerKeys.length === 2 && allReady && data.status === "waiting") {
                    if (isHost) updateDoc(roomRef, { status: "playing" });
                }

                if (data.status === "playing") {
                    if (unsubscribeRoom) unsubscribeRoom(); 
                    Swal.close();
                    startBattleArena(roomCode, data); 
                }
            });
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            await updateDoc(roomRef, { [`players.${currentUid}.isReady`]: true });
            
            Swal.fire({
                title: `⚔️ 等待對手準備中...`,
                html: `<div style="padding: 20px;">大家都在等妳喔！</div>`,
                showConfirmButton: false,
                showCancelButton: true,
                cancelButtonText: '取消準備',
                cancelButtonColor: '#e74c3c',
                allowOutsideClick: false
            }).then(async (res) => {
                if (res.dismiss === Swal.DismissReason.cancel) {
                    await updateDoc(roomRef, { [`players.${currentUid}.isReady`]: false });
                    if (unsubscribeRoom) unsubscribeRoom();
                }
            });
        } else if (result.dismiss === Swal.DismissReason.cancel) {
            if (unsubscribeRoom) unsubscribeRoom();
        }
    });
}

// ==========================================
// ⚔️ 知識王擂台對戰系統
// ==========================================
let currentBattleQuestions = []; // 🌟 用來暫存從 Firebase 下載的本局考卷
let arenaTimerInterval = null;
let currentQuestionIndex = 0;
let isAnswered = false;
let myArenaTotalScore = 0; 

function startBattleArena(roomCode, roomData) {
    const overlay = document.getElementById('battleArenaOverlay');
    if(overlay) overlay.style.display = 'flex';
    
    // 🌟 抓取房主剛才存在雲端的那 3 題
    currentBattleQuestions = roomData.questions || [];

    const players = roomData.players;
    const playerUids = Object.keys(players);
    const opponentUid = playerUids.find(uid => uid !== currentUid);
    const myName = players[currentUid].name;
    const opponentName = players[opponentUid].name;

    document.getElementById('arenaMyName').innerText = myName;
    document.getElementById('arenaOpName').innerText = opponentName;

    onSnapshot(currentArenaRef, (snap) => {
        if (!snap.exists()) return;
        const liveData = snap.data();
        const myLiveScore = liveData.players[currentUid].score || 0;
        const opLiveScore = liveData.players[opponentUid].score || 0;
        
        document.getElementById('arenaMyScore').innerText = myLiveScore;
        document.getElementById('arenaMyBar').style.width = Math.min((myLiveScore / 900) * 100, 100) + "%";
        
        document.getElementById('arenaOpScore').innerText = opLiveScore;
        document.getElementById('arenaOpBar').style.width = Math.min((opLiveScore / 900) * 100, 100) + "%";
    });

    currentQuestionIndex = 0;
    myArenaTotalScore = 0;
    loadArenaQuestion();
}

function loadArenaQuestion() {
    // 🌟 檢查是不是已經把這份專屬考卷考完了
    if (currentQuestionIndex >= currentBattleQuestions.length) {
        return endBattle(); 
    }

    isAnswered = false;
    const currentQ = currentBattleQuestions[currentQuestionIndex]; 
    document.getElementById('arenaQuestion').innerText = currentQ.q;
    
    const optionsContainer = document.getElementById('arenaOptions');
    optionsContainer.innerHTML = '';
    
    currentQ.options.forEach((optText, index) => {
        const btn = document.createElement('button');
        btn.innerText = optText;
        btn.style.cssText = "padding: 18px; font-size: 1.1rem; font-weight: bold; color: white; background: rgba(255,255,255,0.15); border: 2px solid rgba(255,255,255,0.3); border-radius: 12px; cursor: pointer; transition: 0.2s;";
        btn.onmouseover = () => btn.style.background = "rgba(255,255,255,0.3)";
        btn.onmouseout = () => btn.style.background = "rgba(255,255,255,0.15)";
        btn.onclick = () => submitArenaAnswer(index, currentQ.ans, btn);
        optionsContainer.appendChild(btn);
    });

    let timeLeft = 10;
    document.getElementById('arenaTimer').innerText = timeLeft;
    document.getElementById('arenaTimer').style.color = "#f1c40f"; 
    
    clearInterval(arenaTimerInterval);
    arenaTimerInterval = setInterval(() => {
        if (!isAnswered) {
            timeLeft--;
            document.getElementById('arenaTimer').innerText = timeLeft;
            if (timeLeft <= 3) document.getElementById('arenaTimer').style.color = "#ff7675"; 
            if (timeLeft <= 0) {
                clearInterval(arenaTimerInterval);
                submitArenaAnswer(-1, currentQ.ans, null); 
            }
        }
    }, 1000);
}

async function submitArenaAnswer(selectedIndex, correctIndex, btnElement) {
    if (isAnswered) return;
    isAnswered = true;
    clearInterval(arenaTimerInterval);

    const timeLeft = parseInt(document.getElementById('arenaTimer').innerText);
    let pointsEarned = 0;

    if (selectedIndex === correctIndex) {
        if (btnElement) {
            btnElement.style.background = "#00b894"; 
            btnElement.style.borderColor = "#00ce8d";
        }
        if (timeLeft >= 8) pointsEarned = 300;
        else if (timeLeft >= 4) pointsEarned = 200;
        else pointsEarned = 100;
    } else {
        if (btnElement) {
            btnElement.style.background = "#e74c3c"; 
            btnElement.style.borderColor = "#ff7675";
        }
        const allBtns = document.getElementById('arenaOptions').children;
        if(allBtns[correctIndex]) allBtns[correctIndex].style.background = "#00b894";
        pointsEarned = -50; 
    }

    myArenaTotalScore = Math.max(0, myArenaTotalScore + pointsEarned);
    
    try {
        await updateDoc(currentArenaRef, {
            [`players.${currentUid}.score`]: myArenaTotalScore
        });
    } catch (err) {
        console.error("分數同步失敗:", err);
    }

    setTimeout(() => {
        currentQuestionIndex++;
        loadArenaQuestion();
    }, 2500);
}

async function endBattle() {
    const overlay = document.getElementById('battleArenaOverlay');
    if(overlay) overlay.style.display = 'none';
    
    const newTotalScore = (userData.score || 0) + myArenaTotalScore;
    
    try {
        await updateDoc(userRef, { 
            score: newTotalScore,
            history: [...(userData.history || []), { 
                date: new Date().toLocaleDateString(), 
                amount: myArenaTotalScore, 
                reason: `[知識王] 擂台對戰獎勵` 
            }]
        });
        
        Swal.fire({
            title: '🏆 對戰結束！',
            html: `妳在擂台中獲得了 <b style="color:#e17055; font-size:1.5rem;">${myArenaTotalScore}</b> 點！<br>已發放至妳的錢包。`,
            icon: 'success'
        });
    } catch (err) {
        Swal.fire('結算異常', '分數發放失敗，請通知 Winnie 老師。', 'error');
    }
}
