// js/main.js
import { auth, db } from './firebase-init.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let userRef = null;
let userData = null;
let currentSelectedSubject = 'eng';

// 🎯 Winnie 老師！這裡已經換上妳剛剛提供 100% 正確的發布網址囉！
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?output=csv";

// ... 下方其他程式碼完全維持不變 ...
document.addEventListener('DOMContentLoaded', () => {
    initAuthButtons();
    initAuthListener();
    checkWeekendStatus();
    renderLevelGrid();
    fetchGoogleSheetShop(); // 自動加載蝦皮商店內容
    
    const adminBtn = document.querySelector('.btn-settings');
    if (adminBtn) {
        adminBtn.addEventListener('click', openAdminPanel);
    }
});

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
        btn.innerHTML = `🌟 第 ${i} 關<br><small style="color:#7f8c8d;">冒險準備中</small>`;
        btn.onclick = () => {
            const isWeekend = checkWeekendStatus();
            Swal.fire(`第 ${i} 關`, isWeekend ? '🔥 週末翻倍模式！關卡準備中！' : '常態冒險模式，關卡準備中！', 'info');
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
        window.location.href = 'admin.html';
    } else if (password) {
        Swal.fire('認證失敗', '密碼不正確喔！', 'error');
    }
}

window.handleLogout = function() { signOut(auth).then(() => { location.reload(); }); };
