// js/main.js
import { auth, db } from './firebase-init.js';
import { signInAnonymously, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
// 1. 學生帳密與商店網址 (請保留妳原本的)
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=0&single=true&output=csv";
const GOOGLE_SHEET_STUDENTS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=485295361&single=true&output=csv";

// 2. ✨ 新增：五大科目的雲端題庫 CSV 網址 (請把妳發布的網址貼在引號內)
const QUESTION_URLS = {
    chi: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=347151370&single=true&output=csv", // 
    eng: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=1583741101&single=true&output=csv", // 
    math: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=1479866223&single=true&output=csv", // 
    sci: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=1403571866&single=true&output=csv", // 
    soc: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=900979351&single=true&output=csv"   //  
};

let allCloudQuestions = []; // 專門用來存放全校全科題目的超級陣列
// ✨ 妳可以把喜歡的圖片網址放進這個陣列裡
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
    
    // 啟動資料抓取
    fetchGoogleSheetShop(); 
    fetchGoogleSheetQuestions(); 

    const adminBtn = document.querySelector('.btn-settings');
    if (adminBtn) adminBtn.addEventListener('click', openAdminPanel);
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

// ==========================================
// 📂 資料抓取與解析區
// ==========================================
// 載入學生帳密
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

// ✨ 載入全科雲端題庫
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
    console.log("🔥 全科題庫載入完成，共", allCloudQuestions.length, "題");
    renderLevelGrid(); 
}

// 載入商店
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
        const initialData = { realName: realName, nickname: "新進小達人", avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${userCleanId}`, score: 100, grade: studentGrade, inventory: [], history: [{ time: new Date().toLocaleString(), amount: 100, reason: "系統啟用獎勵" }] };
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

// ✨ 更新蝦皮風格背包
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

// 核銷背包物品
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

// 🛒 直購商品 (含 10 個上限防呆)
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

// ✨ 智慧渲染冒險單元地圖 (資料驅動)
// ✨ 智慧渲染冒險單元地圖 (資料驅動)
function renderLevelGrid() {
    const grid = document.getElementById('quizLevelGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const currentGradeCode = (userData && userData.grade) ? userData.grade.toLowerCase() : 'g1';
    
    // 1. 篩選出符合目前「科目」的所有雲端題庫 (不分年級)
    const subjectQuizzes = allCloudQuestions.filter(item => 
        item.subject === currentSelectedSubject
    );

    // 2. 如果這個科目完全沒有建置題庫，顯示留白提示
    if (subjectQuizzes.length === 0) {
        grid.innerHTML = `<p style="color:#999; grid-column: span 3; text-align:center; padding: 20px; font-weight:bold;">這科的單元還在建置中喔！敬請期待 ✨</p>`;
        return;
    }

    // 3. 找出有哪些「單元號碼」(unit)，去除重複並從小到大排序
    const uniqueUnits = [...new Set(subjectQuizzes.map(item => item.unit))].sort((a, b) => a - b);

    // 4. 動態產生「有題目」的單元按鈕
    uniqueUnits.forEach(unitNum => {
        const btn = document.createElement('button');
        btn.className = 'btn-level-placeholder';
        btn.style.cssText = "padding: 12px 8px; border-radius: 10px; cursor: pointer; font-weight: bold; background: linear-gradient(135deg, #a29bfe, #6c5ce7); color: white; border: none; box-shadow: 0 4px 8px rgba(108,92,231,0.2); transition: 0.2s;";
        
        btn.innerHTML = `🚀 第 ${unitNum} 單元<br><small style="color:#fff; font-size:0.75rem;">點擊開始測驗</small>`;
        btn.onmouseover = () => btn.style.transform = "translateY(-3px)";
        btn.onmouseout = () => btn.style.transform = "translateY(0)";

        // 👇 這裡就是升級後的難度選擇邏輯！
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

// 介面切換小工具
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
// ⚔️ 知識王對戰系統核心邏輯
// ==========================================
function generateRoomCode() { return Math.floor(100000 + Math.random() * 900000).toString(); }

// 👑 房主建立房間 (智慧抽出該科目 3 題)
window.createTeamRoom = async function() {
    if (!checkGuestPermission() || !userData) return;
    
    // 找出目前科目跟年級的所有題目
    // 找出目前科目的所有題目 (不分年級)
    const subjectQs = allCloudQuestions.filter(q => q.subject === currentSelectedSubject);
    if (subjectQs.length < 3) {
        return Swal.fire('題庫不足', '這個科目的雲端題庫還不到3題，無法開啟擂台喔！', 'warning');
    }

    // 隨機打亂並抽出3題
    const shuffledQuestions = subjectQs.sort(() => 0.5 - Math.random()).slice(0, 3);
    const roomCode = generateRoomCode();
    const roomRef = doc(db, "team_challenges", roomCode);

    try {
        await setDoc(roomRef, {
            status: "waiting", 
            hostUid: currentUid,
            createdAt: Date.now(),
            questions: shuffledQuestions, // 將抽好的 3 題存入房間
            players: { [currentUid]: { name: userData.realName, isReady: false, score: 0 } }
        });
        enterWaitingRoom(roomCode, true);
    } catch (err) { Swal.fire('建立失敗', err.message, 'error'); }
};

window.joinTeamChallenge = async function() {
    if (!checkGuestPermission() || !userData) return;
    const inputEl = document.getElementById('teamRoomInput');
    const roomCode = inputEl ? inputEl.value.trim() : '';
    if (!roomCode || roomCode.length !== 6) return Swal.fire('格式錯誤', '請輸入同學提供的 6 位數房號！', 'warning');

    const roomRef = doc(db, "team_challenges", roomCode);
    const roomSnap = await getDoc(roomRef);

    if (!roomSnap.exists()) return Swal.fire('找不到房間', '這間教室不存在，請確認房號是否正確！', 'error');
    const roomData = roomSnap.data();
    if (roomData.status !== "waiting") return Swal.fire('來晚了', '這個房間已經開始對戰或結束囉！', 'warning');
    if (Object.keys(roomData.players).length >= 2) return Swal.fire('房間已滿', '這個房間已經有兩個人囉，去別間看看吧！', 'warning');

    try {
        await updateDoc(roomRef, { [`players.${currentUid}`]: { name: userData.realName, isReady: false, score: 0 } });
        enterWaitingRoom(roomCode, false);
    } catch (err) { Swal.fire('加入失敗', err.message, 'error'); }
};

let unsubscribeRoom = null; 
let currentArenaRef = null;

function enterWaitingRoom(roomCode, isHost) {
    const roomRef = doc(db, "team_challenges", roomCode);
    currentArenaRef = roomRef;

    Swal.fire({
        title: `⚔️ 知識王對戰室：${roomCode}`,
        html: `<div id="waitingRoomContent" style="min-height: 100px;">正在建立連線...</div>`,
        showCancelButton: true, showConfirmButton: true, confirmButtonText: '✋ 我準備好了！', cancelButtonText: '離開房間', confirmButtonColor: '#00b894', cancelButtonColor: '#b2bec3', allowOutsideClick: false,
        didOpen: () => {
            unsubscribeRoom = onSnapshot(roomRef, (snap) => {
                if (!snap.exists()) { Swal.close(); return Swal.fire('房間已解散', '房主已關閉這個對戰室。', 'info'); }
                const data = snap.data();
                const players = data.players || {};
                const playerKeys = Object.keys(players);
                let html = `<p style="color:#666; font-size:0.9rem; margin-bottom:15px;">目前對戰人數：${playerKeys.length} / 2</p>`;
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
            Swal.fire({ title: `⚔️ 等待對手準備中...`, html: `<div style="padding: 20px;">大家都在等妳喔！</div>`, showConfirmButton: false, showCancelButton: true, cancelButtonText: '取消準備', cancelButtonColor: '#e74c3c', allowOutsideClick: false
            }).then(async (res) => {
                if (res.dismiss === Swal.DismissReason.cancel) { await updateDoc(roomRef, { [`players.${currentUid}.isReady`]: false }); if (unsubscribeRoom) unsubscribeRoom(); }
            });
        } else if (result.dismiss === Swal.DismissReason.cancel) { if (unsubscribeRoom) unsubscribeRoom(); }
    });
}

// ⚔️ 擂台戰鬥區
let currentBattleQuestions = []; 
let arenaTimerInterval = null;
let currentQuestionIndex = 0;
let isAnswered = false;
let myArenaTotalScore = 0; 

function startBattleArena(roomCode, roomData) {
    const overlay = document.getElementById('battleArenaOverlay');
    if(overlay) overlay.style.display = 'flex';
    
    currentBattleQuestions = roomData.questions || [];
    const players = roomData.players;
    const playerUids = Object.keys(players);
    const opponentUid = playerUids.find(uid => uid !== currentUid);

    document.getElementById('arenaMyName').innerText = players[currentUid].name;
    document.getElementById('arenaOpName').innerText = players[opponentUid].name;

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

    const timeLeft = parseInt(document.getElementById('arenaTimer').innerText);
    let pointsEarned = 0;

    if (selectedIndex === correctIndex) {
        if (btnElement) { btnElement.style.background = "#00b894"; btnElement.style.borderColor = "#00ce8d"; }
        if (timeLeft >= 8) pointsEarned = 300; else if (timeLeft >= 4) pointsEarned = 200; else pointsEarned = 100;
    } else {
        if (btnElement) { btnElement.style.background = "#e74c3c"; btnElement.style.borderColor = "#ff7675"; }
        const allBtns = document.getElementById('arenaOptions').children;
        if(allBtns[correctIndex]) allBtns[correctIndex].style.background = "#00b894";
        pointsEarned = -50; 
    }

    myArenaTotalScore = Math.max(0, myArenaTotalScore + pointsEarned);
    try { await updateDoc(currentArenaRef, { [`players.${currentUid}.score`]: myArenaTotalScore }); } catch (err) {}

    setTimeout(() => { currentQuestionIndex++; loadArenaQuestion(); }, 2500);
}

async function endBattle() {
    const overlay = document.getElementById('battleArenaOverlay');
    if(overlay) overlay.style.display = 'none';
    
    const newTotalScore = (userData.score || 0) + myArenaTotalScore;
    try {
        await updateDoc(userRef, { 
            score: newTotalScore,
            history: [...(userData.history || []), { date: new Date().toLocaleDateString(), amount: myArenaTotalScore, reason: `[知識王] 擂台對戰獎勵` }]
        });
        Swal.fire({ title: '🏆 對戰結束！', html: `妳在擂台中獲得了 <b style="color:#e17055; font-size:1.5rem;">${myArenaTotalScore}</b> 點！<br>已發放至妳的錢包。`, icon: 'success' });
    } catch (err) { Swal.fire('結算異常', '分數發放失敗，請通知 Winnie 老師。', 'error'); }
}
// ==========================================
// 🎯 單人測驗闖關系統 (支援秒數計分與週末翻倍)
// ==========================================
let singleQuestions = [];
let singleCurrentIndex = 0;
let singleTotalScore = 0;
let singleTimerInterval = null;
let singleIsAnswered = false;

// ==========================================
// 🎯 單人測驗闖關系統 (錯題優先、難度計分、背景輪播)
// ==========================================
let singleQuestions = [];
let singleCurrentIndex = 0;
let singleTotalEarned = 0; // 改為直接顯示獲得的點數
let singleTimerInterval = null;
let singleIsAnswered = false;

// 難度參數
let currentDiffTime = 10;
let currentDiffPoints = 1;

window.startSingleQuiz = function(unitNum, difficulty) {
    const unitQs = allCloudQuestions.filter(q => q.subject === currentSelectedSubject && q.unit === unitNum);
    if (unitQs.length === 0) return Swal.fire('暫無題目', '老師還在努力出題中喔！', 'warning');

    // 設定難度參數
    let diffLabel = "簡單";
    if (difficulty === 'easy') { currentDiffTime = 10; currentDiffPoints = 1; diffLabel = "簡單"; }
    else if (difficulty === 'medium') { currentDiffTime = 7; currentDiffPoints = 3; diffLabel = "中等"; }
    else if (difficulty === 'hard') { currentDiffTime = 5; currentDiffPoints = 5; diffLabel = "困難"; }

    // 🔥 錯題優先演算法
    if (!userData.questionStats) userData.questionStats = {}; // 確保有錯題本紀錄
    unitQs.sort((a, b) => {
        const wrongA = (userData.questionStats[a.q] && userData.questionStats[a.q].wrong) || 0;
        const wrongB = (userData.questionStats[b.q] && userData.questionStats[b.q].wrong) || 0;
        // 加入隨機亂數，讓錯題優先但不會每次順序都一模一樣死板
        return (wrongB + Math.random()) - (wrongA + Math.random());
    });

    // 擷取前 10 題
    singleQuestions = unitQs.slice(0, 10);
    singleCurrentIndex = 0;
    singleTotalEarned = 0;

    // UI 更新
    const subjectNames = { chi: '📝 國語科', eng: '🔤 英文科', math: '🔢 數學科', sci: '🔬 自然科', soc: '🌍 社會科' };
    document.getElementById('singleQuizTitle').innerText = `${subjectNames[currentSelectedSubject]} - 第 ${unitNum} 單元 (${diffLabel})`;
    document.getElementById('singleQuizScore').innerText = '0';
    
    // 啟動背景輪播
    let bgIndex = 0;
    const bgElement = document.getElementById('quizBackground');
    bgElement.style.backgroundImage = `url('${QUIZ_BACKGROUNDS[0]}')`;
    clearInterval(bgInterval);
    bgInterval = setInterval(() => {
        bgIndex = (bgIndex + 1) % QUIZ_BACKGROUNDS.length;
        bgElement.style.backgroundImage = `url('${QUIZ_BACKGROUNDS[bgIndex]}')`;
    }, 10000); // 每 10 秒換一張圖

    document.getElementById('singleQuizOverlay').style.display = 'flex';
    loadSingleQuestion();
};

function loadSingleQuestion() {
    if (singleCurrentIndex >= singleQuestions.length) return endSingleQuiz();

    singleIsAnswered = false;
    const currentQ = singleQuestions[singleCurrentIndex];
    
    // 更新上方進度 (例如：1 / 10)
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

    // 啟動專屬難度的倒數計時
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
                submitSingleAnswer(-1, currentQ.ans, null); // 超時算錯
            }
        }
    }, 1000);
}

async function submitSingleAnswer(selectedIndex, correctIndex, btnElement) {
    if (singleIsAnswered) return;
    singleIsAnswered = true;
    clearInterval(singleTimerInterval);

    const currentQ = singleQuestions[singleCurrentIndex];
    const qText = currentQ.q; // 用題目文字當作錯題本的鑰匙

    if (!userData.questionStats) userData.questionStats = {};
    if (!userData.questionStats[qText]) userData.questionStats[qText] = { correct: 0, wrong: 0 };

    if (selectedIndex === correctIndex) {
        if (btnElement) {
            btnElement.style.background = "#00b894"; 
            btnElement.style.borderColor = "#00ce8d";
        }
        // 答對，紀錄並直接給予該難度的點數
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
        
        // 答錯，記錄進錯題本，未來會優先出現
        userData.questionStats[qText].wrong++;
    }

    document.getElementById('singleQuizScore').innerText = singleTotalEarned;

    setTimeout(() => {
        singleCurrentIndex++;
        loadSingleQuestion();
    }, 1500); 
}

async function endSingleQuiz() {
    clearInterval(bgInterval); // 停止背景輪播
    document.getElementById('singleQuizOverlay').style.display = 'none';
    
    if (singleTotalEarned <= 0) {
        // 即便 0 分也要把錯題紀錄更新上雲端
        try { await updateDoc(userRef, { questionStats: userData.questionStats }); } catch(e){}
        return Swal.fire('挑戰結束', '這次沒有拿到點數喔，沒關係，下次一定會更好！💪', 'info');
    }

    const newTotalScore = (userData.score || 0) + singleTotalEarned;
    
    try {
        await updateDoc(userRef, { 
            score: newTotalScore,
            questionStats: userData.questionStats, // 同步錯題本大數據！
            history: [...(userData.history || []), { 
                date: new Date().toLocaleDateString(), 
                amount: singleTotalEarned, 
                reason: `[單人挑戰] 完成測驗` 
            }]
        });
        
        Swal.fire({
            title: '🎉 闖關成功！',
            html: `太棒了！這次挑戰妳紮紮實實地賺到了 <b style="color:#e17055; font-size:1.5rem;">${singleTotalEarned}</b> 點！<br>點數已自動存入錢包。`,
            icon: 'success'
        });
    } catch (err) {
        Swal.fire('結算異常', '點數發放失敗，請通知 Winnie 老師。', 'error');
    }
}
