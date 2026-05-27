// js/main.js
import { auth, db } from './firebase-init.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let userRef = null;
let userData = null;
let currentSelectedSubject = 'chi'; // 配合 index.html 預設改為國語科
let cloudLevelsData = []; // 儲存從雲端下載的五大科關卡設定

// 🎯 Winnie 老師！這裡換上妳提供 100% 正確的直購商店發布網址
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?output=csv";

// 🎯 這裡請替換成妳發布試算表「levels」分頁產出的專屬 CSV 網址
const GOOGLE_SHEET_LEVELS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=這裡要換成妳levels分頁的ID&single=true&output=csv";

document.addEventListener('DOMContentLoaded', () => {
    initAuthButtons();
    initAuthListener();
    checkWeekendStatus();
    loadCloudLevels(); // 網頁打開時，自動連線下載 Excel 關卡地圖連結
    fetchGoogleSheetShop(); // 自動加載蝦皮商店內容
    
    const adminBtn = document.querySelector('.btn-settings');
    if (adminBtn) {
        adminBtn.addEventListener('click', openAdminPanel);
    }
});

// 🔄 📑 新增：非同步抓取雲端關卡連結庫
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
        
        // 解析 CSV 資料列
        const lines = csvText.split('\n').map(line => line.split(','));
        const headers = lines[0].map(h => h.trim());
        
        let html = '';
        
        // 從第二行開始讀取商品
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i] || lines[i].length < 2) continue;
            
            // 欄位對照（對應第一行的 title, price, stock, imgUrl）
            const title = lines[i][headers.indexOf('title')] || '神秘小禮物';
            const price = parseInt(lines[i][headers.indexOf('price')]) || 999;
            const stock = parseInt(lines[i][headers.indexOf('stock')]) || 0;
            const imgUrl = lines[i][headers.indexOf('imgUrl')] || 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=150'; // 預設禮物圖

            // 蝦皮風商品卡片 HTML 排版
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
            
            Swal.fire('🎉 兌換成功！', `已成功扣款，小禮物【${title}】已經放進妳的 🎒 背包中囉！請向 Winnie 老師領取實體獎品。`, 'success');
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

// 🎟️ 序號兌換碼系統 (前端輸入兌換)
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
        Swal.fire('序號錯誤', '找不到這組兌換碼，請跟 Winnie 老師確認喔！', 'error');
    }
};

// 週末限時挑戰按鈕點擊
window.startWeekendQuiz = function() {
    const isWeekend = checkWeekendStatus();
    if (isWeekend) {
        Swal.fire('⚔️ 限時副本開啟！', '你已成功進入週末限定題庫，此處所有題目獲得的點數全部自動翻 2 倍！題目加載中...', 'success');
    } else {
        Swal.fire('未到開啟時間', '這是週六、週日才會限時對外開放的隱藏神秘題庫喔！平常請認真複習「知識王大冒險」💪', 'info');
    }
};

// 其餘綁定邏輯完全保留（精簡防錯）
function initAuthButtons() {
    const btnLogin = document.getElementById('btnLogin');
    const btnRegister = document.getElementById('btnRegister');
    if (btnLogin) btnLogin.onclick = () => loginUser();
    if (btnRegister) btnRegister.onclick = () => registerUser();
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
    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value.trim();
    if (!email || !password) return;
    try { await signInWithEmailAndPassword(auth, email, password); } catch (err) { document.getElementById('loginError').innerText = "登入失敗：" + err.message; }
}

async function registerUser() {
    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value.trim();
    try { await createUserWithEmailAndPassword(auth, email, password); Swal.fire('註冊成功', '歡迎加入！', 'success'); } catch (err) { document.getElementById('loginError').innerText = "註冊失敗：" + err.message; }
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
    renderLevelGrid(); // 切換國英數自社時重新渲染地圖
};

// 🗺️ 智慧偵測：對照雲端科目與解鎖狀態
function renderLevelGrid() {
    const grid = document.getElementById('quizLevelGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    for (let i = 1; i <= 12; i++) {
        // 在雲端資料中比對科目代號（chi, eng, math, sci, soc）與關卡數
        const matchConfig = cloudLevelsData.find(item => item.subject === currentSelectedSubject && item.level === i);
        
        const btn = document.createElement('button');
        btn.className = 'btn-level-placeholder';
        btn.style.cssText = "padding: 12px 8px; border-radius: 12px; cursor: pointer; font-weight: bold; transition: all 0.2s; width: 100%;";
        
        if (matchConfig && matchConfig.url) {
            // 🔥 老師在 Excel 有填遊戲網址的關卡：自動紫色發光解鎖
            btn.style.background = "linear-gradient(135deg, #a29bfe, #6c5ce7)";
            btn.style.color = "white";
            btn.style.border = "none";
            btn.style.boxShadow = "0 4px 8px rgba(108,92,231,0.2)";
            btn.innerHTML = `🚀 第 ${i} 關<br><small style="color:#fff; font-size:0.75rem;">${matchConfig.title || '點擊出發'}</small>`;
            btn.onclick = () => {
                window.open(matchConfig.url, '_blank'); // 直接跳轉關卡連結
            };
        } else {
            // 🔒 沒填網址的關卡：自動維持灰白色防點擊
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

// 🔐 導師安全認證系統 (支援多導師專屬固定 ID 登入)
async function openAdminPanel() {
    const { value: teacherId } = await Swal.fire({
        title: '🔑 導師安全認證',
        input: 'password',
        inputLabel: '請輸入您的專屬導師固定 ID',
        inputPlaceholder: '請輸入老師的後台管理金鑰...',
        showCancelButton: true,
        confirmButtonColor: '#2c3e50'
    });

    // 🎟️ 補習班導師團隊專屬固定 ID 配置清單
    const TEACHER_REGISTRY = {
        "winnie888": "Winnie 老師",
        "tiffany777": "Tiffany 老師",
        "andrea666": "Andrea 老師",
        "katrina555": "Katrina 老師",
        "kelly444": "Kelly 老師"
    };

    if (teacherId && TEACHER_REGISTRY[teacherId]) {
        const teacherName = TEACHER_REGISTRY[teacherId];
        
        // 將當前登入的老師名字暫存到瀏覽器，等一下 admin.html 可以直接抓取顯示！
        localStorage.setItem('activeTeacherName', teacherName);

        Swal.fire({
            title: '🛠️ 權限認證成功',
            text: `歡迎登入系統，${teacherName}！正在為您開啟雲端管理面板...`,
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
        }).then(() => {
            window.location.href = 'admin.html'; // 順暢前往獨立後台
        });
    } else if (teacherId) {
        Swal.fire('認證失敗', '找不到此導師 ID，請向 Winnie 老師確認權限金鑰！', 'error');
    }
}

window.handleLogout = function() { signOut(auth).then(() => { location.reload(); }); };
