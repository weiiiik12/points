// js/main.js
import { auth, db } from './firebase-init.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let userRef = null;
let userData = null;
let currentSelectedSubject = 'chi'; // 配合 index.html 預設改為國語科
let cloudLevelsData = []; // 儲存關卡設定
let excelUsersDatabase = []; // 儲存全校學生帳密名冊

// 🎯 Winnie 老師的 Google 試算表 CSV 網址對接
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?output=csv";
const GOOGLE_SHEET_LEVELS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=583344199&single=true&output=csv"; 
const GOOGLE_SHEET_STUDENTS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=204098901&single=true&output=csv";

document.addEventListener('DOMContentLoaded', () => {
    loadExcelCredentials(); 
    initAuthButtons();
    checkWeekendStatus();
    loadCloudLevels(); 
    fetchGoogleSheetShop(); 
    
    const adminBtn = document.querySelector('.btn-settings');
    if (adminBtn) {
        adminBtn.addEventListener('click', openAdminPanel);
    }
});

// 🔄 預載 Excel 學生帳密名冊
async function loadExcelCredentials() {
    try {
        const response = await fetch(GOOGLE_SHEET_STUDENTS_URL);
        const csvText = await response.text();
        const lines = csvText.split('\n').map(line => line.split(','));
        const headers = lines[0].map(h => h.trim());
        
        excelUsersDatabase = [];
        for(let i = 1; i < lines.length; i++) {
            if(!lines[i] || lines[i].length < 2) continue;
            excelUsersDatabase.push({
                email: (lines[i][headers.indexOf('email')] || '').trim().toLowerCase(),
                password: (lines[i][headers.indexOf('password')] || '').trim(),
                realName: (lines[i][headers.indexOf('realName')] || '未命名').trim(),
                grade: (lines[i][headers.indexOf('grade')] || 'g1').trim().toLowerCase()
            });
        }
        console.log("Excel 學生庫同步完成，共：" + excelUsersDatabase.length + " 筆。");
    } catch (err) {
        console.error("預載帳密失敗:", err);
    }
}

// 🔑 綁定登入按鈕點擊監聽
function initAuthButtons() {
    const btnLogin = document.getElementById('btnLogin');
    if (btnLogin) {
        btnLogin.onclick = null;
        btnLogin.addEventListener('click', loginUser);
    }
}

// 🔑 Excel 智慧匹配登入核心邏輯
async function loginUser() {
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const errorEl = document.getElementById('loginError');
    const loginOverlay = document.getElementById('loginOverlay');
    
    if (!emailInput || !passwordInput) return;
    
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value.trim();
    
    if (!email || !password) {
        if (errorEl) errorEl.innerText = "請完整填寫您的帳號及密碼！";
        return;
    }
    
    if (errorEl) errorEl.innerText = "雲端名冊驗證中...";

    // 🔍 對照 Excel 名冊
    const matchedUser = excelUsersDatabase.find(u => u.email === email && u.password === password);

    if (matchedUser) {
        const userCleanId = email.replace(/[^a-zA-Z0-9]/g, "_"); 
        userRef = doc(db, "users", userCleanId);
        
        // 放行隱藏登入遮罩
        if (loginOverlay) loginOverlay.style.display = 'none';
        
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
            userData = docSnap.data();
            updateStudentUI();
        } else {
            const initialData = {
                realName: matchedUser.realName,
                nickname: "新進小達人",
                avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${userCleanId}`,
                score: 100,
                liquidBalance: 0,
                history: [{ time: new Date().toLocaleString(), amount: 100, reason: "系統啟用獎勵" }]
            };
            await setDoc(userRef, initialData);
            userData = initialData;
            updateStudentUI();
        }

        // 綁定即時監聽
        onSnapshot(userRef, (snap) => {
            if (snap.exists()) {
                userData = snap.data();
                updateStudentUI();
            }
        });

        Swal.fire('登入成功', `歡迎回來，${matchedUser.realName} 同學！`, 'success');
    } else {
        if (errorEl) errorEl.innerText = "❌ 帳號或密碼錯誤，請重新輸入或詢問班導師！";
    }
}

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
}

// 🔄 讀取關卡連結
async function loadCloudLevels() {
    try {
        const response = await fetch(GOOGLE_SHEET_LEVELS_URL);
        const csvText = await response.text();
        const lines = csvText.split('\n').map(line => line.split(','));
        const headers = lines[0].map(h => h.trim());
        
        cloudLevelsData = [];
        for(let i = 1; i < lines.length; i++) {
            if(!lines[i] || lines[i].length < 2) continue;
            cloudLevelsData.push({
                subject: (lines[i][headers.indexOf('subject')] || '').trim(),
                level: parseInt(lines[i][headers.indexOf('level')]) || 1,
                title: (lines[i][headers.indexOf('title')] || '').trim(),
                url: (lines[i][headers.indexOf('url')] || '').trim()
            });
        }
        renderLevelGrid();
    } catch (err) {
        console.error("關卡資料加載失敗:", err);
        renderLevelGrid();
    }
}

// 🗺️ 渲染關卡矩陣
function renderLevelGrid() {
    const grid = document.getElementById('quizLevelGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    for (let i = 1; i <= 12; i++) {
        const matchConfig = cloudLevelsData.find(item => item.subject === currentSelectedSubject && item.level === i);
        const btn = document.createElement('button');
        btn.className = 'btn-level-placeholder';
        
        if (matchConfig && matchConfig.url) {
            btn.style.cssText = "padding: 12px 8px; border-radius: 10px; cursor: pointer; font-weight: bold; background: linear-gradient(135deg, #a29bfe, #6c5ce7); color: white; border: none; box-shadow: 0 4px 8px rgba(108,92,231,0.2);";
            btn.innerHTML = `🚀 第 ${i} 關<br><small style="color:#fff; font-size:0.75rem;">${matchConfig.title || '點擊出發'}</small>`;
            btn.onclick = () => { window.open(matchConfig.url, '_blank'); };
        } else {
            btn.className = 'btn-level-placeholder';
            btn.innerHTML = `🔒 第 ${i} 關<br><small style="color:#cbd5e1; font-size:0.75rem;">冒險準備中</small>`;
            btn.onclick = () => {
                const isWeekend = checkWeekendStatus();
                Swal.fire(`第 ${i} 關`, isWeekend ? '🔥 週末雙倍倍率！本關題庫導師正在建置中～' : '常態冒險模式，關卡準備中！', 'info');
            };
        }
        grid.appendChild(btn);
    }
}

// 📊 抓取商店商品 (完美對接：皓晟獎點櫃)
async function fetchGoogleSheetShop() {
    const shopGrid = document.getElementById('googleSheetShopGrid');
    if (!shopGrid) return;
    try {
        const response = await fetch(GOOGLE_SHEET_CSV_URL);
        const csvText = await response.text();
        const lines = csvText.split('\n').map(line => line.split(','));
        const headers = lines[0].map(h => h.trim());
        let html = '';
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i] || lines[i].length < 2) continue;
            const title = lines[i][headers.indexOf('title')] || '神秘小禮物';
            const price = parseInt(lines[i][headers.indexOf('price')]) || 999;
            const stock = parseInt(lines[i][headers.indexOf('stock')]) || 0;
            const imgUrl = lines[i][headers.indexOf('imgUrl')] || 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=150';

            html += `
                <div class="shopee-card" style="background:#fff; border:1px solid #edf2f7; border-radius:12px; overflow:hidden; display:flex; flex-direction:column; justify-content:space-between; padding:10px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                    <img src="${imgUrl.trim()}" style="width:100%; height:110px; object-fit:cover; border-radius:8px;" alt="商品">
                    <div style="margin-top:6px;">
                        <h4 style="margin:0; font-size:0.85rem; color:#2d3436; height:2.4em; overflow:hidden;">${title}</h4>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                            <span style="color:#e17055; font-weight:800; font-size:1rem;">${price}點</span>
                            <span style="font-size:0.7rem; color:#718096; background:#edf2f7; padding:2px 4px; border-radius:4px;">庫存:${stock}</span>
                        </div>
                    </div>
                    <button onclick="buyShopItem('${title}', ${price}, ${stock})" ${stock <= 0 ? 'disabled' : ''} style="width:100%; margin-top:8px; padding:6px; background:${stock <= 0 ? '#b2bec3' : '#ff9f43'}; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:0.8rem;">
                        ${stock <= 0 ? '已售完' : '立即直購'}
                    </button>
                </div>
            `;
        }
        shopGrid.innerHTML = html;
    } catch (err) {
        shopGrid.innerHTML = `<p style="color:#999; text-align:center; grid-column:span 2;">商店資料讀取中...</p>`;
    }
}

window.buyShopItem = async function(title, price, stock) {
    if (!userData) return;
    if (userData.score < price) return Swal.fire('點數不足', `還差 ${price - userData.score} 點才能購買喔！`, 'warning');

    Swal.fire({
        title: '確定兌換？', text: `是否扣除 ${price} 點兌換【${title}】？`, icon: 'question', showCancelButton: true
    }).then(async (result) => {
        if (result.isConfirmed) {
            await updateDoc(userRef, {
                score: userData.score - price,
                inventory: [...(userData.inventory || []), { title: title, date: new Date().toLocaleDateString() }],
                history: [...(userData.history || []), { date: new Date().toLocaleDateString(), amount: -price, reason: `[直購] 兌換 ${title}` }]
            });
            Swal.fire('🎉 兌換成功！', `禮物已放入背包，請找老師領取！`, 'success');
        }
    });
};

window.selectSubject = function(subject) {
    currentSelectedSubject = subject;
    document.querySelectorAll('#subjectFilterGroup .btn-filter-opt').forEach(btn => btn.classList.remove('active'));
    if (event && event.currentTarget) event.currentTarget.classList.add('active');
    renderLevelGrid();
};

window.switchTab = function(tabId) {
    document.querySelectorAll('.section').forEach(content => content.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.style.display = 'block';
    if (event && event.currentTarget) event.currentTarget.classList.add('active');
};

function checkWeekendStatus() {
    const today = new Date();
    const isWeekend = (today.getDay() === 0 || today.getDay() === 6);
    const badge = document.getElementById('weekendBadge');
    if (badge) badge.style.display = isWeekend ? 'inline-block' : 'none';
    return isWeekend;
}

window.joinTeamChallenge = function() {
    const val = document.getElementById('teamRoomInput').value.trim();
    if(!val) return Swal.fire('提示', '請輸入 Room ID', 'warning');
    Swal.fire('👥 綁定成功', `已成功加入房間：${val}，組隊通關將獲得倍率加成！`, 'success');
};

async function openAdminPanel() {
    const { value: teacherId } = await Swal.fire({
        title: '🔑 導師安全認證',
        input: 'password',
        inputPlaceholder: '請輸入導師固定 ID...',
        showCancelButton: true,
        confirmButtonColor: '#2c3e50'
    });
    const TEACHER_REGISTRY = { "hao002": "怡芳老師", "hao030": "湘羚老師", "hao015": "愷容老師", "hao026": "Andrea老師", "lovesan": "徐主任", "hao006": "育琴老師", "hao036": "Winnie老師" };
    if (teacherId && TEACHER_REGISTRY[teacherId]) {
        localStorage.setItem('activeTeacherName', TEACHER_REGISTRY[teacherId]);
        Swal.fire({ title: '認證成功', text: `歡迎，${TEACHER_REGISTRY[teacherId]}！`, icon: 'success', timer: 1000, showConfirmButton: false })
        .then(() => { window.location.href = 'admin.html'; });
    } else if (teacherId) {
        Swal.fire('認證失敗', '查無此導師 ID！', 'error');
    }
}

window.handleLogout = function() { signOut(auth).then(() => { location.reload(); }); };
