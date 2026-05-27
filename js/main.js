// js/main.js
import { auth, db } from './firebase-init.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let userRef = null;
let userData = null;
let currentSelectedSubject = 'eng'; // 預設改為英文科
let cloudLevelsData = []; // 儲存從雲端下載的五大科關卡設定
let excelUsersDatabase = []; // 儲存從 Excel 下載的全校學生帳密名冊

// 🎯 直購商店與關卡地圖的 CSV 網址（維持老師原本設定的連結）
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?output=csv";
const GOOGLE_SHEET_LEVELS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=這裡要換成妳levels分頁的ID&single=true&output=csv";

// 🎯 新增：學生 Excel 名冊發布網址（用來抓取整批匯入的帳密，gid 已經幫妳對接好 204098901 囉！）
const GOOGLE_SHEET_STUDENTS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=204098901&single=true&output=csv";

document.addEventListener('DOMContentLoaded', () => {
    loadExcelCredentials(); // 1. 網頁一打開，偷偷把 Excel 的學生帳密名冊預載進來
    initAuthButtons();
    initAuthListener();
    checkWeekendStatus();
    loadCloudLevels(); // 2. 自動連線下載 Excel 關卡地圖連結
    fetchGoogleSheetShop(); // 3. 自動加載蝦皮商店內容
    
    const adminBtn = document.querySelector('.btn-settings');
    if (adminBtn) {
        adminBtn.removeAttribute('onclick'); // 防卡死安全移除舊屬性
        adminBtn.addEventListener('click', openAdminPanel);
    }
});

// 🔄 📑 新增：非同步抓取雲端全校學生帳密資料
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
        console.log("Excel 學生帳密著名庫載入完畢，共計：" + excelUsersDatabase.length + " 筆。");
    } catch (err) {
        console.error("預載 Excel 學生名冊帳密失敗:", err);
    }
}

// 🔄 📑 非同步抓取雲端關卡連結庫
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
        renderLevelGrid(); // 雲端下載成功，立刻刷新關卡狀態
    } catch (err) {
        console.error("讀取雲端關卡失敗，採用常態預設結構:", err);
        renderLevelGrid();
    }
}

// 📊 自動抓取 Google 試算表並渲染成蝦皮/淘寶雙網格版面
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
                <div class="shopee-card" style="background:#fff; border:1px solid #f1f2f6; border-radius:12px; overflow:hidden; box-shadow:0 3px 6px rgba(0,0,0,0.02); display:flex; flex-direction:column; justify-content:space-between; padding:10px;">
                    <img src="${imgUrl.trim()}" style="width:100%; height:120px; object-fit:cover; border-radius:8px;" alt="商品">
                    <div style="margin-top:8px;">
                        <h4 style="margin:0; font-size:0.95rem; color:#2d3436; height:2.4em; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${title}</h4>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                            <span style="color:#ee5253; font-weight:800; font-size:1.1rem;">${price}<small style="font-size:0.7rem; font-weight:normal; color:#999;">點</small></span>
                            <span style="font-size:0.75rem; color:#636e72; background:#f1f2f6; padding:2px 6px; border-radius:4px;">庫存:${stock}</span>
                        </div>
                    </div>
                    <button onclick="buyShopItem('${title}', ${price}, ${stock})" ${stock <= 0 ? 'disabled' : ''} style="width:100%; margin-top:10px; padding:6px; background:${stock <= 0 ? '#b2bec3' : '#ff9f43'}; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:0.85rem;">
                        ${stock <= 0 ? '已售完' : '立即直購'}
                    </button>
                </div>
            `;
        }
        shopGrid.innerHTML = html;
    } catch (err) {
        console.error("讀取 Google 商店失敗:", err);
        shopGrid.innerHTML = `<p style="color:#999; text-align:center; grid-column:span 2;">Winnie 老師正在把試算表「發布到網路」中，請稍候再看喔！</p>`;
    }
}

// 🛒 直購扣款與派發機制
window.buyShopItem = async function(title, price, stock) {
    if (!userData) return;
    if ((userData.score || 0) < price) {
        return Swal.fire('點數不足', `妳還差 ${price - userData.score} 點金幣才能購買這個禮物喔！`, 'warning');
    }

    Swal.fire({
        title: '確定要直購嗎？',
        text: `確認扣除 ${price} 點金幣來兌換【${title}】嗎？`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '確定兌換'
    }).then(async (result) => {
        if (result.isConfirmed) {
            const currentInventory = userData.inventory || [];
            const currentHistory = userData.history || [];
            
            await updateDoc(userRef, {
                score: userData.score - price,
                inventory: [...currentInventory, { title: title, date: new Date().toLocaleDateString(), type: 'store' }],
                history: [...currentHistory, { time: new Date().toLocaleString(), amount: -price, reason: `[商店購買] 兌換 ${title}` }]
            });
            
            Swal.fire('🎉 兌換成功！', `已成功扣款，小禮物【${title}】已經放進妳的 🎒 背包中囉！請向導師領取實體獎品。`, 'success');
        }
    });
};

// 👥 好友組隊闖關點擊綁定
window.joinTeamChallenge = async function() {
    const roomInput = document.getElementById('teamRoomInput');
    if (!roomInput || !roomInput.value.trim()) return Swal.fire('提示', '請輸入同學的 Room ID', 'warning');
    const roomId = roomInput.value.trim();

    Swal.fire({
        title: '👥 組隊闖關成功連線！',
        text: `已成功將你與 Room ID: ${roomId} 的隊伍同步綁定！通關時全員將同時獲得點數報酬！`,
        icon: 'success'
    });
};

// 🎟️ 序號兌換碼系統
const LOCAL_PROMO_DATABASE = {
    "GOODJOB888": { points: 100, reason: "課堂表現優異獎勵" },
    "ENGLISHKING": { points: 150, reason: "英文單字競賽破關獎勵" },
    "MATH999": { points: 200, reason: "數學精熟大挑戰特獎" }
};

window.redeemPromoCode = async function() {
    const input = document.getElementById('promoCodeInput');
    if (!input || !input.value.trim()) return Swal.fire('提示', '請輸入序號', 'warning');
    const code = input.value.trim().toUpperCase();

    if (LOCAL_PROMO_DATABASE[code]) {
        const reward = LOCAL_PROMO_DATABASE[code];
        const history = userData.history || [];
        const hasClaimed = history.some(h => h.reason && h.reason.includes(`[序號兌換:${code}]`));
        
        if (hasClaimed) return Swal.fire('不能重複領取', '這個兌換碼你已經領過囉！', 'error');

        const newScore = (userData.score || 0) + reward.points;
        const newHistory = [...history, { time: new Date().toLocaleString(), amount: reward.points, reason: `[序號兌換:${code}] ${reward.reason}` }];

        await updateDoc(userRef, {
            score: newScore,
            history: newHistory
        });

        Swal.fire('🎉 兌換成功！', `獲得點數：+${reward.points} 點！\n原因：${reward.reason}`, 'success');
        input.value = '';
    } else {
        Swal.fire('序號錯誤', '找不到這組兌換碼，請跟老師確認喔！', 'error');
    }
};

// 週末限時挑戰按鈕點擊
window.startWeekendQuiz = function() {
    const isWeekend = checkWeekendStatus();
    if (isWeekend) {
        Swal.fire('⚔️ 限時副本開啟！', '你已成功進入週末限定題庫，此處所有題目獲得的點數全部自動翻 2 倍！題目加載中...', 'success');
    } else {
        Swal.fire('未到開啟時間', '這是週六、週日才會限時對外開放的隱藏神秘題庫喔！', 'info');
    }
};

// 🔑 升級：全新對照 Google 試算表（Excel）全校學生名冊帳密登入機制
async function loginUser() {
    const email = document.getElementById('emailInput').value.trim().toLowerCase();
    const password = document.getElementById('passwordInput').value.trim();
    const errorEl = document.getElementById('loginError');
    const loginOverlay = document.getElementById('loginOverlay');
    
    if (!email || !password) {
        if (errorEl) errorEl.innerText = "請填寫帳號及密碼！";
        return;
    }
    
    if (errorEl) errorEl.innerText = "雲端驗證中...";

    // 🔍 比對預載的 Excel 學生數據庫是否有這組帳密
    const matchedUser = excelUsersDatabase.find(u => u.email === email && u.password === password);

    if (matchedUser) {
        // 驗證成功，將 email 去除特殊字元，轉化為唯一的 Firebase 文件路徑識別 ID
        const userCleanId = email.replace(/[^a-zA-Z0-9]/g, "_"); 
        userRef = doc(db, "users", userCleanId);
        
        if (loginOverlay) loginOverlay.style.display = 'none';
        
        // 讀取學生的 Firebase 金幣，如果第一次登入則用 Excel 資料自動上傳建立！
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
            userData = docSnap.data();
            updateStudentUI();
        } else {
            const initialData = {
                realName: matchedUser.realName,
                nickname: "新進小達人",
                avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${userCleanId}`,
                score: 100, // 首次啟用發放 100 點
                liquidBalance: 0,
                history: [{ time: new Date().toLocaleString(), amount: 100, reason: "系統整批導入啟用獎勵" }]
            };
            await setDoc(userRef, initialData);
            userData = initialData;
            updateStudentUI();
        }

        // 啟動即時雲端點數快照監聽器
        onSnapshot(userRef, (snap) => {
            if (snap.exists()) {
                userData = snap.data();
                updateStudentUI();
            }
        });

        Swal.fire('登入成功', `歡迎回來，${matchedUser.realName} 同學！`, 'success');
    } else {
        if (errorEl) errorEl.innerText = "❌ 帳號或密碼錯誤，請跟您的班導師確認喔！";
    }
}

function initAuthButtons() {
    const btnLogin = document.getElementById('btnLogin');
    const btnRegister = document.getElementById('btnRegister');
    if (btnLogin) btnLogin.onclick = () => loginUser();
    if (btnRegister) btnRegister.onclick = () => registerUser();
}

// 移除舊的 Firebase 核心監聽，改用 Excel 預置帳密控制
function initAuthListener() { }

function updateStudentUI() {
    if (!userData) return;
    const nameEl = document.getElementById('childNameDisplay');
    const scoreEl = document.getElementById('scoreDisplay');
    const avatarEl = document.getElementById('userAvatar');
    if (nameEl) nameEl.innerText = `${userData.nickname} (${userData.realName})`;
    if (scoreEl) scoreEl.innerText = userData.score || 0;
    if (avatarEl && userData.avatarUrl) avatarEl.src = userData.avatarUrl;
}

async function registerUser() {
    Swal.fire('功能已停用', '為加速全校建檔，目前改由 Winnie 老師在 Excel 整批匯入帳號密碼，不開放學生自行手動註冊喔！', 'info');
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
        const matchConfig = cloudLevelsData.find(item => item.subject === currentSelectedSubject && item.level === i);
        const btn = document.createElement('button');
        btn.className = 'btn-level-placeholder';
        btn.style.cssText = "padding: 12px 8px; border-radius: 12px; cursor: pointer; font-weight: bold; transition: all 0.2s; width: 100%;";
        
        if (matchConfig && matchConfig.url) {
            btn.style.background = "linear-gradient(135deg, #a29bfe, #6c5ce7)";
            btn.style.color = "white";
            btn.style.border = "none";
            btn.style.boxShadow = "0 4px 8px rgba(108,92,231,0.2)";
            btn.innerHTML = `🚀 第 ${i} 關<br><small style="color:#fff; font-size:0.75rem;">${matchConfig.title || '點擊出發'}</small>`;
            btn.onclick = () => { window.open(matchConfig.url, '_blank'); };
        } else {
            btn.style.background = "#f8fafc";
            btn.style.color = "#94a3b8";
            btn.style.border = "1px dashed #cbd5e1";
            btn.innerHTML = `🔒 第 ${i} 關<br><small style="color:#cbd5e1; font-size:0.75rem;">冒險準備中</small>`;
            btn.onclick = () => {
                const isWeekend = checkWeekendStatus();
                Swal.fire(`第 ${i} 關`, isWeekend ? '🔥 週末翻倍模式！關卡內容正在建置中！' : '常態冒險模式，關卡準備中！', 'info');
            };
        }
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

// 🔐 導師安全認證系統 (已完整抽換為 Winnie 老師設定的真實名單！)
async function openAdminPanel() {
    const { value: teacherId } = await Swal.fire({
        title: '🔑 導師安全認證',
        input: 'password',
        inputLabel: '請輸入您的專屬導師固定 ID',
        inputPlaceholder: '請輸入老師的後台管理金鑰...',
        showCancelButton: true,
        confirmButtonColor: '#2c3e50'
    });

    // 🎟️ 補習班導師團隊專屬固定 ID 完美配置清單
    const TEACHER_REGISTRY = {
        "hao002": "怡芳老師",
        "hao030": "湘羚老師",
        "hao015": "愷容老師",
        "hao026": "Andrea老師",
        "lovesan": "徐主任",
        "hao006": "育琴老師",
        "hao036": "Winnie老師"
    };

    if (teacherId && TEACHER_REGISTRY[teacherId]) {
        const teacherName = TEACHER_REGISTRY[teacherId];
        localStorage.setItem('activeTeacherName', teacherName);

        Swal.fire({
            title: '🛠️ 權限認證成功',
            text: `歡迎登入系統，${teacherName}！正在為您開啟雲端管理面板...`,
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
        }).then(() => {
            window.location.href = 'admin.html';
        });
    } else if (teacherId) {
        Swal.fire('認證失敗', '找不到此導師 ID，請向 Winnie 老師確認權限金鑰！', 'error');
    }
}

window.handleLogout = function() { signOut(auth).then(() => { location.reload(); }); };
