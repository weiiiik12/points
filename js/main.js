// js/main.js
import { auth, db } from './firebase-init.js';
import { signInAnonymously, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let currentUid = null; 
let userRef = null;
let userData = null;
let currentSelectedSubject = 'chi'; 
let excelUsersDatabase = []; 
let isGuest = false;

// ==========================================
// 🔗 雲端資料庫網址設定區
// ==========================================
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=0&single=true&output=csv";
const GOOGLE_SHEET_STUDENTS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=485295361&single=true&output=csv";

const QUESTION_URLS = {
    chi: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=347151370&single=true&output=csv", 
    eng: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=1583741101&single=true&output=csv", 
    math: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=1479866223&single=true&output=csv", 
    sci: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=1403571866&single=true&output=csv", 
    soc: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=900979351&single=true&output=csv"  
};

let allCloudQuestions = [];
const QUIZ_BACKGROUNDS = [
    "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=1600&auto=format&fit=crop"
];
let bgInterval = null;

// ==========================================
// 🚀 系統初始化
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    await loadExcelCredentials(); 
    checkAutoLogin();              
    initAuthButtons();
    checkWeekendStatus();
    
    fetchGoogleSheetShop(); 
    fetchGoogleSheetQuestions(); 

    const adminBtn = document.querySelector('.btn-settings');
    if (adminBtn) adminBtn.addEventListener('click', openAdminPanel);
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

// ==========================================
// 📂 資料抓取與解析區
// ==========================================
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
    } catch (err) { console.error("預載帳密失敗:", err); }
}

async function fetchGoogleSheetQuestions() {
    allCloudQuestions = []; 
    for (const [subjectKey, url] of Object.entries(QUESTION_URLS)) {
        if (!url) continue; 
        try {
            const response = await fetch(url);
            const csvText = await response.text();
            const rawLines = csvText.split(/\r?\n/);
            const headers = parseCSVLineSafely(rawLines[0]).map(h => h.trim().toLowerCase());
            
            for (let i = 1; i < rawLines.length; i++) {
                if (!rawLines[i] || rawLines[i].trim() === "") continue;
                const cols = parseCSVLineSafely(rawLines[i]);
                if (cols.length < 2) continue;

                let options = [];
                if (cols[headers.indexOf('opt1')]) options.push(cols[headers.indexOf('opt1')].trim());
                if (cols[headers.indexOf('opt2')]) options.push(cols[headers.indexOf('opt2')].trim());
                if (cols[headers.indexOf('opt3')]) options.push(cols[headers.indexOf('opt3')].trim());
                if (cols[headers.indexOf('opt4')]) options.push(cols[headers.indexOf('opt4')].trim());

                allCloudQuestions.push({
                    grade: cols[headers.indexOf('grade')]?.trim().toLowerCase() || 'g1',
                    subject: subjectKey, 
                    unit: parseInt(cols[headers.indexOf('unit')]?.trim(), 10) || 1,
                    q: cols[headers.indexOf('question')]?.trim() || '未命名的題目',
                    options: options,
                    ans: (parseInt(cols[headers.indexOf('ans')]?.trim(), 10) || 1) - 1 
                });
            }
        } catch (err) { console.error(`讀取 ${subjectKey} 題庫失敗:`, err); }
    }
    renderLevelGrid(); 
}

async function fetchGoogleSheetShop() {
    const shopGrid = document.getElementById('googleSheetShopGrid');
    if (!shopGrid) return;
    try {
        const response = await fetch(GOOGLE_SHEET_CSV_URL);
        const csvText = await response.text();
        const rawLines = csvText.split(/\r?\n/);
        const headers = parseCSVLineSafely(rawLines[0]).map(h => h.trim().toLowerCase());
        const titleIdx = headers.findIndex(h => h.includes('title') || h.includes('name'));
        const priceIdx = headers.findIndex(h => h.includes('price') || h.includes('cost'));
        const stockIdx = headers.findIndex(h => h.includes('stock') || h.includes('count'));
        const imgIdx = headers.findIndex(h => h.includes('img') || h.includes('url'));
        
        let html = ''; let validItemCount = 0;
        for (let i = 1; i < rawLines.length; i++) {
            if (!rawLines[i] || rawLines[i].trim() === "") continue;
            const cols = parseCSVLineSafely(rawLines[i]); if (cols.length < 2) continue;
            const title = (titleIdx !== -1 && cols[titleIdx]) ? cols[titleIdx].trim() : '神祕小禮物';
            const price = (priceIdx !== -1 && cols[priceIdx]) ? parseInt(cols[priceIdx].trim(), 10) || 50 : 50;
            const stock = (stockIdx !== -1 && cols[stockIdx]) ? parseInt(cols[stockIdx].trim(), 10) || 0 : 0;
            let imgUrl = (imgIdx !== -1 && cols[imgIdx]) ? cols[imgIdx].trim() : 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=150';
            validItemCount++;
            html += `
                <div class="shopee-card" style="background:#fff; border:1px solid #edf2f7; border-radius:12px; overflow:hidden; display:flex; flex-direction:column; justify-content:space-between; padding:10px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                    <img src="${imgUrl}" style="width:100%; height:110px; object-fit:cover; border-radius:8px;">
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

// ==========================================
// 🔑 登入與權限系統
// ==========================================
function checkAutoLogin() {
    const savedEmail = localStorage.getItem('hago_logged_in_email');
    const savedGuest = localStorage.getItem('hago_logged_in_guest');
    if (savedEmail) {
        const matchedUser = excelUsersDatabase.find(u => u.email === savedEmail);
        if (matchedUser) {
            isGuest = false;
            enterSystem(savedEmail.replace(/[^a-zA-Z0-9]/g, "_"), matchedUser.realName);
        } else localStorage.removeItem('hago_logged_in_email');
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
    const email = document.getElementById('emailInput')?.value.trim().toLowerCase();
    const password = document.getElementById('passwordInput')?.value.trim();
    const errorEl = document.getElementById('loginError');
    if (!email || !password) { if (errorEl) errorEl.innerText = "請完整填寫您的帳號及密碼！"; return; }
    if (errorEl) errorEl.innerText = "雲端數據驗證中...";
    
    const matchedUser = excelUsersDatabase.find(u => u.email === email && u.password === password);
    if (matchedUser) {
        localStorage.setItem('hago_logged_in_email', email);
        enterSystem(email.replace(/[^a-zA-Z0-9]/g, "_"), matchedUser.realName);
    } else { if (errorEl) errorEl.innerText = "❌ 帳號或密碼錯誤！"; }
}

async function loginAsGuest() {
    try { 
        const credential = await signInAnonymously(auth); 
        isGuest = true; 
        const guestId = "guest_" + credential.user.uid.substring(0, 8);
        localStorage.setItem('hago_logged_in_guest', guestId); 
        enterSystem(guestId, "體驗小遊客"); 
    } catch (err) {}
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
        userData = { realName: realName, nickname: "參觀小達人", avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=guest_hago`, score: 888, grade: "g1", inventory: [] };
        updateStudentUI();
        renderLevelGrid(); 
        if(event && event.type === 'click') Swal.fire('👻 遊客登入', '歡迎參觀體驗模式！', 'success');
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
    inventory: [], 
    createdAt: new Date().toISOString(), // ⭐ 核心：務必紀錄帳號啟用日期以判斷首月優惠
    history: [{ time: new Date().toLocaleString(), amount: 100, reason: "系統啟用獎勵" }] 
};

    onSnapshot(userRef, (snap) => {
        if (snap.exists()) {
            userData = snap.data();
            updateStudentUI();
        }
    });

    renderLevelGrid(); 
    if(event && event.type === 'click') Swal.fire('登入成功', `歡迎來到皓孩子網，${realName}！✨`, 'success');
}

window.handleLogout = function() { localStorage.removeItem('hago_logged_in_email'); localStorage.removeItem('hago_logged_in_guest'); signOut(auth).then(() => { location.reload(); }); };

// ==========================================
// 🎨 前台介面更新與互動區
// ==========================================
function bookkeepingScore(score) {
    const scoreDisplay = document.getElementById('scoreDisplay');
    if (scoreDisplay) scoreDisplay.innerText = score;
}

function updateStudentUI() {
    if (!userData) return;
    const nameDisplay = document.getElementById('childNameDisplay');
    const userEmail = document.getElementById('userEmail');
    const avatar = document.getElementById('userAvatar');

    if (nameDisplay) nameDisplay.innerText = `${userData.nickname} (${userData.realName})`;
    bookkeepingScore(userData.score || 0); 
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
    if (window.updateBankUI) window.updateBankUI();
}

window.claimBackpackItem = async function(itemIndex, itemTitle) {
    if (!checkGuestPermission()) return; 
    Swal.fire({
        title: '🎁 實體禮物領取確認',
        html: `請問老師已經把小禮物<br><b style="color:#ff7675; font-size:1.1rem;">【${itemTitle}】</b><br>交到妳手上了嗎？<br><br><span style="color:#e74c3c; font-size:0.85rem; font-weight:bold;">⚠️ 注意：確定領取後不可退換喔！</span>`,
        icon: 'question', showCancelButton: true, confirmButtonColor: '#ff7675', cancelButtonColor: '#b2bec3', confirmButtonText: '確定領取，不退換！', cancelButtonText: '先不要'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: '安全核銷中...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
            const currentInventory = [...(userData.inventory || [])];
            if (currentInventory[itemIndex]) {
                currentInventory[itemIndex].status = "已領取";
                currentInventory[itemIndex].claimedAt = new Date().toLocaleString(); 
            }
            try {
                await updateDoc(userRef, { inventory: currentInventory });
                Swal.fire('🎉 領取成功！', `【${itemTitle}】核銷成功！`, 'success');
            } catch (err) { Swal.fire('連線異常', '請找 Winnie 老師手動處理喔！', 'error'); }
        }
    });
};

window.buyShopItem = async function(title, price, stock) {
    if (!checkGuestPermission() || !userData) return;
    const currentInventory = userData.inventory || [];
    if (currentInventory.length >= 10) {
        return Swal.fire({ title: '🎒 背包已滿', text: '妳的榮譽背包已經裝滿 10 個物品囉！請先拿去找老師核銷兌換，清出空間再來買吧。', icon: 'warning', confirmButtonColor: '#e17055' });
    }
    if (userData.score < price) return Swal.fire('點數不足', `還差 ${price - userData.score} 點！`, 'warning');
    
    Swal.fire({ title: '確定兌換？', text: `是否扣除 ${price} 點兌換【${title}】？`, icon: 'question', showCancelButton: true, confirmButtonColor: '#00b894' }).then(async (result) => {
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

// ✨ 智慧渲染冒險單元地圖 (資料驅動 + 難度選擇)
function renderLevelGrid() {
    const grid = document.getElementById('quizLevelGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const subjectQuizzes = allCloudQuestions.filter(item => item.subject === currentSelectedSubject);

    if (subjectQuizzes.length === 0) {
        grid.innerHTML = `<p style="color:#999; grid-column: span 3; text-align:center; padding: 20px; font-weight:bold;">這科的單元還在建置中喔！敬請期待 ✨</p>`;
        return;
    }

    const uniqueUnits = [...new Set(subjectQuizzes.map(item => item.unit))].sort((a, b) => a - b);

    uniqueUnits.forEach(unitNum => {
        const btn = document.createElement('button');
        btn.className = 'btn-level-placeholder';
        btn.style.cssText = "padding: 12px 8px; border-radius: 10px; cursor: pointer; font-weight: bold; background: linear-gradient(135deg, #a29bfe, #6c5ce7); color: white; border: none; box-shadow: 0 4px 8px rgba(108,92,231,0.2); transition: 0.2s;";
        
        btn.innerHTML = `🚀 第 ${unitNum} 單元<br><small style="color:#fff; font-size:0.75rem;">點擊開始測驗</small>`;
        btn.onmouseover = () => btn.style.transform = "translateY(-3px)";
        btn.onmouseout = () => btn.style.transform = "translateY(0)";

        btn.onclick = () => { 
            if (!checkGuestPermission()) return; 
            Swal.fire({
                title: `第 ${unitNum} 單元挑戰`,
                html: '請選擇妳的挑戰難度：<br><br><div style="text-align:left; font-size:0.9rem; color:#666; background:#f8f9fa; padding:10px; border-radius:8px;">🟢 <b>簡單：</b>10秒/題，答對得 1 點<br>🟡 <b>中等：</b>7秒/題，答對得 3 點<br>🔴 <b>困難：</b>5秒/題，答對得 5 點</div>',
                showDenyButton: true,
                showCancelButton: true,
                confirmButtonText: '🟢 簡單',
                denyButtonText: '🟡 中等',
                cancelButtonText: '🔴 困難',
                confirmButtonColor: '#00b894',
                denyButtonColor: '#f1c40f',
                cancelButtonColor: '#e74c3c',
            }).then((result) => {
                if (result.isConfirmed) startSingleQuiz(unitNum, 'easy');
                else if (result.isDenied) startSingleQuiz(unitNum, 'medium');
                else if (result.dismiss === Swal.DismissReason.cancel) startSingleQuiz(unitNum, 'hard');
            });
        };
        grid.appendChild(btn);
    });
}

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

// ==========================================
// ⚔️ 知識王對戰系統核心邏輯 (含 AI 模式與戰報)
// ==========================================
function generateRoomCode() { return Math.floor(100000 + Math.random() * 900000).toString(); }

let unsubscribeRoom = null; 
let currentArenaRef = null;
let currentBattleQuestions = []; 
let arenaTimerInterval = null;
let currentQuestionIndex = 0;
let isAnswered = false;
let myArenaTotalScore = 0; 

// 🔥 新增：戰鬥數據統計
let isAIMode = false;
let aiTimer = null;
let aiTotalScore = 0;
let myCorrectCount = 0;
let myTotalTimeSpent = 0;

window.startAIBattle = async function() {
    if (!checkGuestPermission() || !userData) return;
    
    const subjectQs = allCloudQuestions.filter(q => q.subject === currentSelectedSubject);
    if (subjectQs.length < 3) return Swal.fire('題庫不足', '這個科目的雲端題庫還不到3題，無法開啟擂台喔！', 'warning');

    const shuffledQuestions = subjectQs.sort(() => 0.5 - Math.random()).slice(0, 3);
    isAIMode = true;
    currentArenaRef = null; 
    
    const mockRoomData = {
        questions: shuffledQuestions,
        players: {
            [currentUid]: { name: userData.realName, score: 0 },
            "ai_bot": { name: "🤖 AI 知識大師", score: 0 }
        }
    };
    
    Swal.fire({
        title: '🤖 尋找 AI 對手中...',
        html: 'AI 大師已準備就緒！',
        timer: 1500,
        showConfirmButton: false,
        didOpen: () => { Swal.showLoading(); }
    }).then(() => {
        startBattleArena("AI_MODE", mockRoomData);
    });
};

window.createTeamRoom = async function() {
    if (!checkGuestPermission() || !userData) return;
    const subjectQs = allCloudQuestions.filter(q => q.subject === currentSelectedSubject);
    if (subjectQs.length < 3) return Swal.fire('題庫不足', '這個科目的雲端題庫還不到3題，無法開啟擂台喔！', 'warning');

    const shuffledQuestions = subjectQs.sort(() => 0.5 - Math.random()).slice(0, 3);
    const roomCode = generateRoomCode();
    const roomRef = doc(db, "team_challenges", roomCode);
    isAIMode = false;

    try {
        await setDoc(roomRef, {
            status: "waiting", hostUid: currentUid, createdAt: Date.now(),
            questions: shuffledQuestions,
            players: { [currentUid]: { name: userData.realName, isReady: false, score: 0 } }
        });
        enterWaitingRoom(roomCode, true);
    } catch (err) { Swal.fire('建立失敗', err.message, 'error'); }
};

window.joinTeamChallenge = async function() {
    if (!checkGuestPermission() || !userData) return;
    const inputEl = document.getElementById('teamRoomInput');
    const roomCode = inputEl ? inputEl.value.trim() : '';
    if (!roomCode || roomCode.length !== 6) return Swal.fire('格式錯誤', '請輸入 6 位數房號！', 'warning');

    const roomRef = doc(db, "team_challenges", roomCode);
    const roomSnap = await getDoc(roomRef);
    if (!roomSnap.exists()) return Swal.fire('找不到房間', '這間教室不存在！', 'error');
    
    isAIMode = false;
    try {
        await updateDoc(roomRef, { [`players.${currentUid}`]: { name: userData.realName, isReady: false, score: 0 } });
        enterWaitingRoom(roomCode, false);
    } catch (err) { Swal.fire('加入失敗', err.message, 'error'); }
};

function enterWaitingRoom(roomCode, isHost) {
    const roomRef = doc(db, "team_challenges", roomCode);
    currentArenaRef = roomRef;

    Swal.fire({
        title: `⚔️ 知識王對戰室：${roomCode}`,
        html: `<div id="waitingRoomContent" style="min-height: 100px;">正在建立連線...</div>`,
        showCancelButton: true, showConfirmButton: true, confirmButtonText: '✋ 我準備好了！', cancelButtonText: '離開房間', confirmButtonColor: '#00b894', cancelButtonColor: '#b2bec3', allowOutsideClick: false,
        didOpen: () => {
            unsubscribeRoom = onSnapshot(roomRef, (snap) => {
                if (!snap.exists()) { Swal.close(); return Swal.fire('房間解散', '房主已關閉對戰室。', 'info'); }
                const data = snap.data();
                const players = data.players || {};
                const playerKeys = Object.keys(players);
                let html = `<p style="color:#666;">目前對戰人數：${playerKeys.length} / 2</p>`;
                let allReady = true;

                playerKeys.forEach(uid => {
                    const p = players[uid];
                    const readyStatus = p.isReady ? '<span style="color:#00b894; font-weight:bold; float:right;">(已準備 ✔️)</span>' : '<span style="color:#e17055; float:right;">(裝備中...)</span>';
                    html += `<div style="padding: 12px; background: #f8f9fa; border-radius: 8px; margin-bottom: 8px; text-align: left; border-left: 4px solid ${p.isReady ? '#00b894' : '#e17055'};">👤 <b>${p.name}</b> ${readyStatus}</div>`;
                    if (!p.isReady) allReady = false;
                });
                document.getElementById('waitingRoomContent').innerHTML = html;

                if (playerKeys.length === 2 && allReady && data.status === "waiting") { if (isHost) updateDoc(roomRef, { status: "playing" }); }
                if (data.status === "playing") { if (unsubscribeRoom) unsubscribeRoom(); Swal.close(); startBattleArena(roomCode, data); }
            });
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            await updateDoc(roomRef, { [`players.${currentUid}.isReady`]: true });
            Swal.fire({ title: `⚔️ 等待對手準備中...`, showConfirmButton: false, showCancelButton: true, cancelButtonText: '取消準備', allowOutsideClick: false
            }).then(async (res) => {
                if (res.dismiss === Swal.DismissReason.cancel) { await updateDoc(roomRef, { [`players.${currentUid}.isReady`]: false }); if (unsubscribeRoom) unsubscribeRoom(); }
            });
        } else { if (unsubscribeRoom) unsubscribeRoom(); }
    });
}

function startBattleArena(roomCode, roomData) {
    const overlay = document.getElementById('battleArenaOverlay');
    if(overlay) overlay.style.display = 'flex';
    
    currentBattleQuestions = roomData.questions || [];
    const players = roomData.players;
    const playerUids = Object.keys(players);
    const opponentUid = playerUids.find(uid => uid !== currentUid);

    document.getElementById('arenaMyName').innerText = players[currentUid].name;
    document.getElementById('arenaOpName').innerText = players[opponentUid].name;
    
    myArenaTotalScore = 0; aiTotalScore = 0;
    myCorrectCount = 0; myTotalTimeSpent = 0;
    currentQuestionIndex = 0;

    if (!isAIMode && currentArenaRef) {
        onSnapshot(currentArenaRef, (snap) => {
            if (!snap.exists()) return;
            const liveData = snap.data();
            const opLiveScore = liveData.players[opponentUid].score || 0;
            document.getElementById('arenaOpScore').innerText = opLiveScore;
            document.getElementById('arenaOpBar').style.width = Math.min((opLiveScore / 900) * 100, 100) + "%";
        });
    }
    loadArenaQuestion();
}

function loadArenaQuestion() {
    if (currentQuestionIndex >= currentBattleQuestions.length) return endBattle(); 
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
    
    if (isAIMode) {
        const aiDelay = Math.floor(Math.random() * 6000) + 1500; 
        clearTimeout(aiTimer);
        aiTimer = setTimeout(() => {
            if (isAnswered) return; 
            const isCorrect = Math.random() < 0.7; 
            const aiTimeLeft = 10 - (aiDelay / 1000);
            
            let points = 0;
            if (isCorrect) {
                if (aiTimeLeft >= 8) points = 300; else if (aiTimeLeft >= 4) points = 200; else points = 100;
            } else points = -50;
            
            aiTotalScore = Math.max(0, aiTotalScore + points);
            document.getElementById('arenaOpScore').innerText = aiTotalScore;
            document.getElementById('arenaOpBar').style.width = Math.min((aiTotalScore / 900) * 100, 100) + "%";
        }, aiDelay);
    }
    
    clearInterval(arenaTimerInterval);
    arenaTimerInterval = setInterval(() => {
        if (!isAnswered) {
            timeLeft--;
            document.getElementById('arenaTimer').innerText = timeLeft;
            if (timeLeft <= 3) document.getElementById('arenaTimer').style.color = "#ff7675"; 
            if (timeLeft <= 0) { clearInterval(arenaTimerInterval); submitArenaAnswer(-1, currentQ.ans, null); }
        }
    }, 1000);
}

async function submitArenaAnswer(selectedIndex, correctIndex, btnElement) {
    if (isAnswered) return;
    isAnswered = true;
    clearInterval(arenaTimerInterval);
    clearTimeout(aiTimer); 

    const timeLeft = parseInt(document.getElementById('arenaTimer').innerText);
    myTotalTimeSpent += (10 - Math.max(0, timeLeft)); 

    let pointsEarned = 0;
    if (selectedIndex === correctIndex) {
        myCorrectCount++; 
        if (btnElement) { btnElement.style.background = "#00b894"; btnElement.style.borderColor = "#00ce8d"; }
        if (timeLeft >= 8) pointsEarned = 300; else if (timeLeft >= 4) pointsEarned = 200; else pointsEarned = 100;
    } else {
        if (btnElement) { btnElement.style.background = "#e74c3c"; btnElement.style.borderColor = "#ff7675"; }
        const allBtns = document.getElementById('arenaOptions').children;
        if(allBtns[correctIndex]) allBtns[correctIndex].style.background = "#00b894";
        pointsEarned = -50; 
    }

    myArenaTotalScore = Math.max(0, myArenaTotalScore + pointsEarned);
    document.getElementById('arenaMyScore').innerText = myArenaTotalScore;
    document.getElementById('arenaMyBar').style.width = Math.min((myArenaTotalScore / 900) * 100, 100) + "%";

    if (!isAIMode && currentArenaRef) {
        try { await updateDoc(currentArenaRef, { [`players.${currentUid}.score`]: myArenaTotalScore }); } catch (err) {}
    }

    setTimeout(() => { currentQuestionIndex++; loadArenaQuestion(); }, 2500);
}

async function endBattle() {
    const overlay = document.getElementById('battleArenaOverlay');
    if(overlay) overlay.style.display = 'none';
    
    const totalQ = currentBattleQuestions.length;
    const accuracy = Math.round((myCorrectCount / totalQ) * 100);
    const avgTime = (myTotalTimeSpent / totalQ).toFixed(1);
    
    const opScore = isAIMode ? aiTotalScore : parseInt(document.getElementById('arenaOpScore').innerText);
    let winMessage = myArenaTotalScore > opScore ? "🏆 挑戰勝利！" : (myArenaTotalScore === opScore ? "🤝 平手！" : "💔 挑戰失敗");
    let pointReward = myArenaTotalScore > opScore ? myArenaTotalScore : Math.floor(myArenaTotalScore / 2); 
    
    const newTotalScore = (userData.score || 0) + pointReward;
    
    try {
        await updateDoc(userRef, { 
            score: newTotalScore,
            history: [...(userData.history || []), { date: new Date().toLocaleDateString(), amount: pointReward, reason: `[對戰] 擂台結算` }]
        });
        
        Swal.fire({
            title: winMessage,
            html: `
                <div style="text-align:left; background:#f8f9fa; padding:15px; border-radius:10px; margin:10px 0;">
                    <p style="margin:5px 0;">🎯 <b>正確率：</b> <span style="color:${accuracy >= 60 ? '#00b894' : '#e74c3c'}">${accuracy}%</span> (${myCorrectCount}/${totalQ})</p>
                    <p style="margin:5px 0;">⏱️ <b>平均作答速度：</b> ${avgTime} 秒/題</p>
                    <hr style="border:0; border-top:1px dashed #ccc; margin:10px 0;">
                    <p style="margin:5px 0;">🆚 <b>雙方分數：</b> ${myArenaTotalScore} : ${opScore}</p>
                </div>
                獲得對戰點數：<b style="color:#e17055; font-size:1.5rem;">${pointReward}</b> 點！
            `,
            icon: myArenaTotalScore > opScore ? 'success' : 'info'
        });
    } catch (err) { Swal.fire('結算異常', '分數發放失敗', 'error'); }
}

// ==========================================
// 🎯 單人測驗闖關系統 (錯題優先、難度計分、背景輪播)
// ==========================================
let singleQuestions = [];
let singleCurrentIndex = 0;
let singleTotalEarned = 0; 
let singleTimerInterval = null;
let singleIsAnswered = false;
let currentDiffTime = 10;
let currentDiffPoints = 1;

window.startSingleQuiz = function(unitNum, difficulty) {
    const unitQs = allCloudQuestions.filter(q => q.subject === currentSelectedSubject && q.unit === unitNum);
    if (unitQs.length === 0) return Swal.fire('暫無題目', '老師還在努力出題中喔！', 'warning');

    let diffLabel = "簡單";
    if (difficulty === 'easy') { currentDiffTime = 10; currentDiffPoints = 1; diffLabel = "簡單"; }
    else if (difficulty === 'medium') { currentDiffTime = 7; currentDiffPoints = 3; diffLabel = "中等"; }
    else if (difficulty === 'hard') { currentDiffTime = 5; currentDiffPoints = 5; diffLabel = "困難"; }

    if (!userData.questionStats) userData.questionStats = {}; 
    unitQs.sort((a, b) => {
        const wrongA = (userData.questionStats[a.q] && userData.questionStats[a.q].wrong) || 0;
        const wrongB = (userData.questionStats[b.q] && userData.questionStats[b.q].wrong) || 0;
        return (wrongB + Math.random()) - (wrongA + Math.random());
    });

    singleQuestions = unitQs.slice(0, 10);
    singleCurrentIndex = 0;
    singleTotalEarned = 0;

    const subjectNames = { chi: '📝 國語科', eng: '🔤 英文科', math: '🔢 數學科', sci: '🔬 自然科', soc: '🌍 社會科' };
    document.getElementById('singleQuizTitle').innerText = `${subjectNames[currentSelectedSubject]} - 第 ${unitNum} 單元 (${diffLabel})`;
    document.getElementById('singleQuizScore').innerText = '0';
    
    let bgIndex = 0;
    const bgElement = document.getElementById('quizBackground');
    if (bgElement) {
        bgElement.style.backgroundImage = `url('${QUIZ_BACKGROUNDS[0]}')`;
        clearInterval(bgInterval);
        bgInterval = setInterval(() => {
            bgIndex = (bgIndex + 1) % QUIZ_BACKGROUNDS.length;
            bgElement.style.backgroundImage = `url('${QUIZ_BACKGROUNDS[bgIndex]}')`;
        }, 10000); 
    }

    document.getElementById('singleQuizOverlay').style.display = 'flex';
    loadSingleQuestion();
};

function loadSingleQuestion() {
    if (singleCurrentIndex >= singleQuestions.length) return endSingleQuiz();

    singleIsAnswered = false;
    const currentQ = singleQuestions[singleCurrentIndex];
    
    document.getElementById('singleQuizProgressText').innerText = `進度: ${singleCurrentIndex + 1} / ${singleQuestions.length}`;
    const progress = ((singleCurrentIndex + 1) / singleQuestions.length) * 100;
    document.getElementById('singleQuizProgress').style.width = `${progress}%`;
    
    document.getElementById('singleQuizQuestion').innerText = currentQ.q;
    const optionsContainer = document.getElementById('singleQuizOptions');
    optionsContainer.innerHTML = '';
    
    currentQ.options.forEach((optText, index) => {
        const btn = document.createElement('button');
        btn.innerText = optText;
        btn.style.cssText = "padding: 18px; font-size: 1.1rem; font-weight: bold; color: white; background: rgba(255,255,255,0.15); border: 2px solid rgba(255,255,255,0.4); border-radius: 12px; cursor: pointer; transition: 0.2s;";
        btn.onmouseover = () => btn.style.background = "rgba(255,255,255,0.3)";
        btn.onmouseout = () => btn.style.background = "rgba(255,255,255,0.15)";
        
        btn.onclick = () => submitSingleAnswer(index, currentQ.ans, btn);
        optionsContainer.appendChild(btn);
    });

    let timeLeft = currentDiffTime;
    document.getElementById('singleQuizTimer').innerText = timeLeft;
    document.getElementById('singleQuizTimer').style.color = "#f1c40f"; 
    
    clearInterval(singleTimerInterval);
    singleTimerInterval = setInterval(() => {
        if (!singleIsAnswered) {
            timeLeft--;
            document.getElementById('singleQuizTimer').innerText = timeLeft;
            if (timeLeft <= 3) document.getElementById('singleQuizTimer').style.color = "#ff7675"; 
            if (timeLeft <= 0) {
                clearInterval(singleTimerInterval);
                submitSingleAnswer(-1, currentQ.ans, null); 
            }
        }
    }, 1000);
}

async function submitSingleAnswer(selectedIndex, correctIndex, btnElement) {
    if (singleIsAnswered) return;
    singleIsAnswered = true;
    clearInterval(singleTimerInterval);

    const currentQ = singleQuestions[singleCurrentIndex];
    const qText = currentQ.q; 

    if (!userData.questionStats) userData.questionStats = {};
    if (!userData.questionStats[qText]) userData.questionStats[qText] = { correct: 0, wrong: 0 };

    if (selectedIndex === correctIndex) {
        if (btnElement) {
            btnElement.style.background = "#00b894"; 
            btnElement.style.borderColor = "#00ce8d";
        }
        userData.questionStats[qText].correct++;
        let pts = currentDiffPoints;
        if (checkWeekendStatus()) pts *= 2;
        singleTotalEarned += pts;

    } else {
        if (btnElement) {
            btnElement.style.background = "#e74c3c"; 
            btnElement.style.borderColor = "#ff7675";
        }
        const allBtns = document.getElementById('singleQuizOptions').children;
        if(allBtns[correctIndex]) allBtns[correctIndex].style.background = "#00b894";
        userData.questionStats[qText].wrong++;
    }

    document.getElementById('singleQuizScore').innerText = singleTotalEarned;

    setTimeout(() => {
        singleCurrentIndex++;
        loadSingleQuestion();
    }, 1500); 
}

async function endSingleQuiz() {
    clearInterval(bgInterval); 
    document.getElementById('singleQuizOverlay').style.display = 'none';
    
    if (singleTotalEarned <= 0) {
        try { await updateDoc(userRef, { questionStats: userData.questionStats }); } catch(e){}
        return Swal.fire('挑戰結束', '這次沒有拿到點數喔，沒關係，下次一定會更好！💪', 'info');
    }

    const newTotalScore = (userData.score || 0) + singleTotalEarned;
    
    try {
        await updateDoc(userRef, { 
            score: newTotalScore,
            questionStats: userData.questionStats, 
            history: [...(userData.history || []), { 
                date: new Date().toLocaleDateString(), 
                amount: singleTotalEarned, 
                reason: `[單人挑戰] 完成測驗` 
            }]
        });
        
        Swal.fire({
            title: '🎉 闖關成功！',
            html: `太棒了！這次挑戰獲得了 <b style="color:#e17055; font-size:1.5rem;">${singleTotalEarned}</b> 點！<br>點數已自動存入錢包。`,
            icon: 'success'
        });
    } catch (err) { Swal.fire('結算異常', '點數發放失敗', 'error'); }
}

window.quitSingleQuiz = function() {
    Swal.fire({
        title: '⚠️ 確定要放棄挑戰嗎？',
        html: '現在退出是<b style="color:#e74c3c;">無法獲得任何點數</b>的喔！<br>而且剛剛答錯的題目依然會記錄進錯題本中。',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e74c3c',
        cancelButtonColor: '#b2bec3',
        confirmButtonText: '對，我要退出',
        cancelButtonText: '繼續挑戰！'
    }).then(async (result) => {
        if (result.isConfirmed) {
            clearInterval(singleTimerInterval);
            clearInterval(bgInterval);
            singleTotalEarned = 0;
            document.getElementById('singleQuizOverlay').style.display = 'none';
            try { await updateDoc(userRef, { questionStats: userData.questionStats }); } catch(e) {}
            Swal.fire('已安全退出', '這次的挑戰不計分，整理好心情隨時可以再戰！💪', 'info');
        }
    });
};

// ==========================================
// 🏦 銀行活存與定存系統 (新制 1% / 3% 每週結算版)
// ==========================================
const BANK_SETTINGS = {
    weeklyRate: 0.002,        // 建議改為 0.002 (即 0.2%)
    fixedRate: 0.03,          // 定存維持 0.03 (即 3%)
    fixedDays: 30,            // 定存鎖定天數 30天
    settlementDay: 0,         // 每週日結算
    interestHour: 20,         // 晚上 20:00 發放利息
    minPointsNormal: 1000,    // 常態起息門檻
    minPointsNewAccount: 100  // 新帳號首月起息門檻
};

window.updateBankUI = function() {
    if (!userData) return;
    
    // 1. 判斷帳號身分並計算本週預估利息
    const now = new Date();
    const accountCreated = userData.createdAt ? new Date(userData.createdAt) : new Date();
    const isNewAccount = (now - accountCreated) <= 30 * 24 * 60 * 60 * 1000; // 30天內算新帳號
    const requiredMin = isNewAccount ? BANK_SETTINGS.minPointsNewAccount : BANK_SETTINGS.minPoints;
    
    const currentScore = userData.score || 0;
    const isQualified = currentScore >= requiredMin;
    const weekEst = isQualified ? Math.floor(currentScore * BANK_SETTINGS.weeklyRate) : 0;
    
    const estEl = document.getElementById('estInterestVal');
    if (estEl) {
        if (isQualified) {
            estEl.innerHTML = `${weekEst} 點 <small style="color:#2ecc71;font-size:0.75rem;">(已達 ${requiredMin} 點門檻)</small>`;
        } else {
            estEl.innerHTML = `0 點 <small style="color:#e74c3c;font-size:0.75rem;">(未達 ${requiredMin} 點門檻)</small>`;
        }
    }

    // 2. 渲染定存清單
    const list = document.getElementById('depositList');
    const empty = document.getElementById('depositEmpty');
    const deposits = userData.deposits || [];
    
    if (deposits.length === 0) {
        if(list) list.innerHTML = '';
        if(empty) empty.style.display = 'block';
    } else {
        if(empty) empty.style.display = 'none';
        let html = '';
        
        deposits.forEach(d => {
            const end = new Date(d.endDate); 
            const isMature = now >= end; 
            const timeLeft = end - now;
            const total = d.amount * Math.pow(1 + BANK_SETTINGS.fixedRate, BANK_SETTINGS.fixedDays);
            const profit = Math.floor(total - d.amount);
            
            let timeStr = isMature ? "✅ 已到期，可領回" : `⏳ 剩餘鎖定：${Math.floor(timeLeft / 86400000)}天 ${Math.floor((timeLeft % 86400000) / 3600000)}時`;

            html += `
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 15px; margin-bottom: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.02);">
                <div style="display:flex; justify-content:space-between; font-weight:bold; color:#2d3436; margin-bottom:5px; font-size:1.1rem;">
                    <span>定存本金: ${d.amount}</span>
                    <span style="color:#00b894;">利息: +${profit}</span>
                </div>
                <div style="font-size:0.85rem; color:#888;">📅 存入日期: ${new Date(d.startDate).toLocaleString()}</div>
                <div style="font-size:0.9rem; color:#e17055; font-weight:bold; margin-top:8px;">${timeStr}</div>
                <button onclick="redeemDeposit(${d.id})" style="width:100%; margin-top:12px; padding:10px; border-radius:8px; border:none; font-weight:bold; cursor:${isMature?'pointer':'not-allowed'}; background:${isMature?'#f1c40f':'#edf2f7'}; color:${isMature?'#d35400':'#a0aec0'}; transition: 0.2s;" ${isMature?'':'disabled'}>
                    ${isMature ? '💰 提領定存本利' : '🔒 未到期無法提領'}
                </button>
            </div>`;
        });
        if(list) list.innerHTML = html;
    }
};

// 3. 倒數計時與每週結算利息觸發器
setInterval(() => {
    if (!userData) return;
    const now = new Date();
    
    // 計算距離本週日 20:00 的倒數
    let target = new Date(now);
    const currentDay = target.getDay();
    const distanceToSunday = (BANK_SETTINGS.settlementDay - currentDay + 7) % 7;
    target.setDate(target.getDate() + distanceToSunday);
    target.setHours(BANK_SETTINGS.interestHour, 0, 0, 0);
    
    if (now >= target) {
        target.setDate(target.getDate() + 7); // 如果這週日已經過了，指到下週日
    }
    
    const diff = target - now;
    const days = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    
    const timerEl = document.getElementById('interestTimer');
    if (timerEl) timerEl.innerText = `${days}天 ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    
    if(window.updateBankUI) window.updateBankUI();

    // === 活存自動每週發息檢設 ===
    if (!isGuest && userRef) {
        // 以 "年份-第幾週" 作為本週唯一識別字串 (例如 2026-W25)
        const getWeekIdentifier = (date) => {
            const oneJan = new Date(date.getFullYear(), 0, 1);
            const numberOfDays = Math.floor((date - oneJan) / (24 * 60 * 60 * 1000));
            const weekIdx = Math.ceil((date.getDay() + 1 + numberOfDays) / 7);
            return `${date.getFullYear()}-W${weekIdx}`;
        };
        
        const currentWeekStr = getWeekIdentifier(now);

        // 如果當下是星期天，且時間超過晚上 20:00
        if (now.getDay() === BANK_SETTINGS.settlementDay && now.getHours() >= BANK_SETTINGS.interestHour) {
            // 檢查資料庫中紀錄的「上次結算週碼」是否和這週不同
            if (userData.lastSettlementWeek !== currentWeekStr) {
                const accountCreated = userData.createdAt ? new Date(userData.createdAt) : new Date();
                const isNewAccount = (now - accountCreated) <= 30 * 24 * 60 * 60 * 1000;
                const requiredMin = isNewAccount ? BANK_SETTINGS.minPointsNewAccount : BANK_SETTINGS.minPoints;

                if ((userData.score || 0) >= requiredMin) {
                    const interest = Math.floor(userData.score * BANK_SETTINGS.weeklyRate);
                    if (interest > 0) {
                        userData.score += interest;
                        userData.lastSettlementWeek = currentWeekStr;
                        
                        import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js").then((firestore) => {
                            firestore.updateDoc(userRef, {
                                score: userData.score,
                                lastSettlementWeek: currentWeekStr,
                                history: [...(userData.history || []), { 
                                    date: new Date().toLocaleDateString(), 
                                    reason: `🏦 皓銀行每週利息結算 (${isNewAccount ? '新創優惠' : '常態達標'})`, 
                                    amount: interest 
                                }]
                            });
                            Swal.fire({ title: '💰 皓銀行每週結算！', text: `恭喜！本週活存資產達標，獲得週利息 +${interest} 點！`, icon: 'success' });
                        });
                        return;
                    }
                }
                
                // 即使沒達標或利息為0，也必須標記這週已審查過，避免重複計算
                userData.lastSettlementWeek = currentWeekStr;
                import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js").then((firestore) => {
                    firestore.updateDoc(userRef, { lastSettlementWeek: currentWeekStr });
                });
            }
        }
    }
}, 1000);

// 4. 申請定存 (3%)
window.createDeposit = async function() {
    if (!checkGuestPermission() || !userData) return;
    const amtInput = document.getElementById('depositAmount');
    const amt = parseInt(amtInput.value);
    
    if (!amt || amt <= 0) return Swal.fire('錯誤', '請輸入正確的整數金額！', 'error');
    if (amt > userData.score) return Swal.fire('錯誤', '妳包包裡的點數不夠存入定存喔！', 'error');

    const total = amt * Math.pow(1 + BANK_SETTINGS.fixedRate, BANK_SETTINGS.fixedDays);
    const profit = Math.floor(total - amt);

    Swal.fire({
        title: '確定要辦理定存嗎？',
        html: `定存金額: <b>${amt}</b> 點<br>鎖定天數: <b>${BANK_SETTINGS.fixedDays}</b> 天<br>到期預計獲得利息: <b style="color:#00b894">+${profit}</b> 點<br><br><span style="color:#e74c3c;font-size:0.85rem;font-weight:bold;">⚠️ 提醒：定存一經確認後，30天內絕不能中途解約提領！</span>`,
        icon: 'question', showCancelButton: true, confirmButtonText: '確定存入', confirmButtonColor: '#00b894'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: '定存單寫入雲端中...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
            const now = new Date(); 
            const end = new Date(now); 
            end.setDate(end.getDate() + BANK_SETTINGS.fixedDays);
            
            const newDeposit = { id: Date.now(), amount: amt, startDate: now.toISOString(), endDate: end.toISOString() };
            const currentDeposits = userData.deposits || [];
            
            try {
                const { updateDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
                await updateDoc(userRef, {
                    score: userData.score - amt,
                    deposits: [...currentDeposits, newDeposit],
                    history: [...(userData.history || []), { date: new Date().toLocaleDateString(), reason: `[定存] 辦理30天定存`, amount: -amt }]
                });
                amtInput.value = '';
                Swal.fire('辦理成功', '您的定存單已成功生效，開始期待到期吧！', 'success');
            } catch(e) { Swal.fire('連線錯誤', '辦理定存失敗，請檢查網路連線', 'error'); }
        }
    });
};

// 5. 領回定存
window.redeemDeposit = async function(id) {
    if (!checkGuestPermission() || !userData) return;
    
    const currentDeposits = userData.deposits || [];
    const idx = currentDeposits.findIndex(d => d.id === id);
    if (idx === -1) return;
    
    const dep = currentDeposits[idx];
    const total = dep.amount * Math.pow(1 + BANK_SETTINGS.fixedRate, BANK_SETTINGS.fixedDays);
    const profit = Math.floor(total - dep.amount);
    
    Swal.fire({ title: '提領審查中...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    
    try {
        const updatedDeposits = [...currentDeposits];
        updatedDeposits.splice(idx, 1);
        
        const { updateDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        await updateDoc(userRef, {
            score: (userData.score || 0) + dep.amount + profit,
            deposits: updatedDeposits,
            history: [...(userData.history || []), { date: new Date().toLocaleDateString(), reason: `[定存] 定存到期提領`, amount: dep.amount + profit }]
        });
        Swal.fire('🎉 提領成功', `太棒了！定存本金 ${dep.amount} 與利息 ${profit} 已全數匯入錢包！`, 'success');
    } catch(e) { Swal.fire('連線錯誤', '提領失敗，請稍後再試', 'error'); }
};
