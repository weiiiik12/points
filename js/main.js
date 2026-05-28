// js/main.js
import { auth, db } from './firebase-init.js';
import { signInAnonymously, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let userRef = null;
let userData = null;
let currentSelectedSubject = 'chi'; 
let cloudLevelsData = []; // 改為儲存從 Firebase 即時下載的雲端表單題庫
let excelUsersDatabase = []; 

let isGuest = false;

// 🎯 Winnie 提供的學生與商店試算表 CSV 網址對接 (Levels 分頁功成身退，正式移除)
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=0&single=true&output=csv";
const GOOGLE_SHEET_STUDENTS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=485295361&single=true&output=csv";

document.addEventListener('DOMContentLoaded', async () => {
    await loadExcelCredentials(); 
    checkAutoLogin();             
    
    initAuthButtons();
    checkWeekendStatus();
    startFirebaseQuizzesListener(); // ✨ 新增：改為 24 小時即時監聽雲端老師發布的關卡
    fetchGoogleSheetShop(); 
    
    const adminBtn = document.querySelector('.btn-settings');
    if (adminBtn) {
        adminBtn.addEventListener('click', openAdminPanel);
    }
});

// 🛡️ 智能 CSV 安全解析核心器
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

// 🛡️ 遊客權限檢查器
function checkGuestPermission() {
    if (isGuest) {
        Swal.fire('👻 遊客模式', '您目前使用的是遊客體驗帳號，僅供參觀看畫面，無法執行此操作喔！', 'info');
        return false;
    }
    return true;
}

// 🔄 預載 Excel 學生註冊庫
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

// 📡 ✨ 新增：24小時即時雲端關卡監聽器（老師一按發布，這裡不用重新整理網頁就會自動亮起！）
function startFirebaseQuizzesListener() {
    onSnapshot(collection(db, "quizzes"), (snapshot) => {
        cloudLevelsData = [];
        snapshot.forEach(docSnap => {
            cloudLevelsData.push(docSnap.data());
        });
        renderLevelGrid(); // 關卡池一變動，立刻重刷前台地圖
    });
}

// 🛡️ 自動登入檢查機制
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

// 🚀 通過驗證放行 (已補上年級儲存與記憶機制)
async function enterSystem(userCleanId, realName) {
    const loginOverlay = document.getElementById('loginOverlay');
    const mainContainer = document.getElementById('mainAppContainer');
    
    if (loginOverlay) loginOverlay.style.display = 'none';
    if (mainContainer) mainContainer.style.display = 'block';

    // 🔍 關鍵修正：從預載的 Excel 學生庫中，幫這名學生找出他真正的年級！
    const matchedStudentInfo = excelUsersDatabase.find(u => u.email.replace(/[^a-zA-Z0-9]/g, "_") === userCleanId || u.email === localStorage.getItem('hago_logged_in_email'));
    const studentGrade = matchedStudentInfo ? matchedStudentInfo.grade.toLowerCase() : 'g1';

    if (isGuest) {
        userData = {
            realName: realName,
            nickname: "參觀小達人",
            avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=guest_hago`,
            score: 888,
            grade: "g1", // 遊客預設為一年級
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
    
    // 正式學生的 Firebase 讀寫邏輯
    userRef = doc(db, "users", userCleanId);
    const docSnap = await getDoc(userRef);
    
    if (docSnap.exists()) {
        userData = docSnap.data();
        
        // ✨ 強大安全同步：萬一老師在 Excel 幫學生「升級/換班」了，自動在 Firebase 更新年級欄位！
        if (userData.grade !== studentGrade) {
            await updateDoc(userRef, { grade: studentGrade });
            userData.grade = studentGrade;
        }
        
        updateStudentUI();
    } else {
        // 第一次登入的學生，將 Excel 裡設定好的年級（grade）完整記錄進 Firebase 資料庫！
        const initialData = {
            realName: realName,
            nickname: "新進小達人",
            avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${userCleanId}`,
            score: 100,
            grade: studentGrade, // 🎯 這裡成功把年級寫入紀錄了！
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

// 🔄 更新學生頂部資訊欄與「榮譽背包小櫥窗」
function updateStudentUI() {
    if (!userData) return;
    const nameDisplay = document.getElementById('childNameDisplay');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const userEmail = document.getElementById('userEmail');
    const avatar = document.getElementById('userAvatar');

    if (nameDisplay) nameDisplay.innerText = `${userData.nickname} (${userData.realName})`;
    if (scoreDisplay) scoreDisplay.innerText = userData.score || 0;
    if (userEmail) userEmail.innerText = `🟢 在線：${userData.realName}`;
    if (avatar && userData.avatarUrl) avatar.src = userData.avatarUrl;

    // 🎒 🔥 【核心修正】即時重刷並渲染學生的實體背包！
    const backpackGrid = document.getElementById('userBackpackGrid');
    if (backpackGrid) {
        const myItems = userData.inventory || []; // 撈取雲端存好的禮物清單
        
        if (myItems.length === 0) {
            backpackGrid.innerHTML = `<p style="color:#999; grid-column: span 2; text-align:center; font-size:0.9rem; padding:10px;">背包空空如也，快去商店逛逛吧！</p>`;
        } else {
            let backpackHtml = '';
            myItems.forEach(item => {
                backpackHtml += `
                    <div style="background:#f8f9fa; border:2px solid #e2e8f0; border-radius:12px; padding:10px; text-align:center; box-shadow: 0 2px 4px rgba(0,0,0,0.02); position:relative;">
                        <span style="font-size:1.8rem;">🎁</span>
                        <h5 style="margin:6px 0 2px 0; font-size:0.82rem; color:#2d3436; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.title}</h5>
                        <small style="color:#a0aec0; font-size:0.65rem; display:block;">📅 ${item.date || '兌換時間'}</small>
                        <div style="margin-top:6px; background:#9b59b6; color:white; font-size:0.65rem; font-weight:bold; padding:2px 0; border-radius:4px;">未領取</div>
                    </div>
                `;
            });
            backpackGrid.innerHTML = backpackHtml;
        }
    }
}
function renderLevelGrid() {
    const grid = document.getElementById('quizLevelGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    // 🎯 100% 精準抓取剛才記錄在學生身上的年級代號 (若找不到則預設 g1)
    const currentGradeCode = (userData && userData.grade) ? userData.grade.toLowerCase() : 'g1';

    for (let i = 1; i <= 12; i++) {
        // 📡 從 Firebase 陣列中篩選符合「當前科目」、「關卡數」且「該學生年級」的老師發布名單
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

// 📊 抓取商店商品
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
    if (userData.score < price) return Swal.fire('點數不足', `還差 ${price - userData.score} 點！`, 'warning');
    Swal.fire({ title: '確定兌換？', text: `是否扣除 ${price} 點兌換【${title}】？`, icon: 'question', showCancelButton: true }).then(async (result) => {
        if (result.isConfirmed) {
            await updateDoc(userRef, { score: userData.score - price, inventory: [...(userData.inventory || []), { title: title, date: new Date().toLocaleDateString() }], history: [...(userData.history || []), { date: new Date().toLocaleDateString(), amount: -price, reason: `[直購] 兌換 ${title}` }] });
            Swal.fire('🎉 兌換成功！', `禮物已放進背包。`, 'success');
        }
    });
};

window.selectSubject = function(subject) { currentSelectedSubject = subject; document.querySelectorAll('#subjectFilterGroup .btn-filter-opt').forEach(btn => btn.classList.remove('active')); if (event && event.currentTarget) event.currentTarget.classList.add('active'); renderLevelGrid(); };
window.switchTab = function(tabId) { document.querySelectorAll('.section').forEach(content => content.style.display = 'none'); document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active')); const targetTab = document.getElementById(tabId); if (targetTab) targetTab.style.display = 'block'; if (event && event.currentTarget) event.currentTarget.classList.add('active'); };
function checkWeekendStatus() { const today = new Date(); const isWeekend = (today.getDay() === 0 || today.getDay() === 6); const badge = document.getElementById('weekendBadge'); if (badge) badge.style.display = isWeekend ? 'inline-block' : 'none'; return isWeekend; }
window.redeemPromoCode = async function() { Swal.fire('提示', '請向導師領取最新兌換碼。', 'info'); };
window.startWeekendQuiz = function() { Swal.fire('未到開啟時間', '週末才會限時開放隱藏題庫喔！', 'info'); };
window.joinTeamChallenge = function() { Swal.fire('👥 綁定成功', `已成功加入房間！`, 'success'); };
async function openAdminPanel() {
    if (!checkGuestPermission()) return;
    const { value: teacherId } = await Swal.fire({ title: '🔑 導師安全認證', input: 'password', inputPlaceholder: '請輸入導師固定 ID...', showCancelButton: true, confirmButtonColor: '#2c3e50' });
    const TEACHER_REGISTRY = { "hao002": "怡芳老師", "hao030": "湘羚老師", "hao015": "愷容老師", "hao026": "Andrea老師", "lovesan": "徐主任", "hao006": "育琴老師", "hao036": "Winnie老師", "haowork12": "最高管理員" };
    if (teacherId && TEACHER_REGISTRY[teacherId]) { localStorage.setItem('activeTeacherName', TEACHER_REGISTRY[teacherId]); Swal.fire({ title: '認證成功', text: `歡迎！`, icon: 'success', timer: 1000, showConfirmButton: false }).then(() => { window.location.href = 'admin.html'; }); }
}
window.handleLogout = function() { localStorage.removeItem('hago_logged_in_email'); localStorage.removeItem('hago_logged_in_guest'); signOut(auth).then(() => { location.reload(); }); };
