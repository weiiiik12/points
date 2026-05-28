// js/main.js
import { auth, db } from './firebase-init.js';
import { signInAnonymously, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let userRef = null;
let userData = null;
let currentSelectedSubject = 'chi'; // 預設為國語科
let cloudLevelsData = []; // 儲存全校導師上傳的 Google 表單題庫陣列
let excelUsersDatabase = []; // 儲存全校學生帳密名冊

// 🌟 全域遊客判定開關
let isGuest = false;

// 🎯 Winnie 提供的三大核心 Google 試算表 CSV 網址對接
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=0&single=true&output=csv";
const GOOGLE_SHEET_LEVELS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=392728486&single=true&output=csv"; 
const GOOGLE_SHEET_STUDENTS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=485295361&single=true&output=csv";

document.addEventListener('DOMContentLoaded', async () => {
    await loadExcelCredentials(); 
    checkAutoLogin();             
    
    initAuthButtons();
    checkWeekendStatus();
    loadCloudLevels(); // 載入雲端多導師 Google 表單題庫庫
    fetchGoogleSheetShop(); 
    
    const adminBtn = document.querySelector('.btn-settings');
    if (adminBtn) {
        adminBtn.addEventListener('click', openAdminPanel);
    }
});

// 🛡️ 遊客權限檢查器
function checkGuestPermission() {
    if (isGuest) {
        Swal.fire('👻 遊客模式', '您目前使用的是遊客體驗帳號，僅供參觀看畫面，無法執行此操作喔！', 'info');
        return false;
    }
    return true;
}

// 🔄 預載 Excel 全校學生註冊庫
async function loadExcelCredentials() {
    try {
        const response = await fetch(GOOGLE_SHEET_STUDENTS_URL);
        const csvText = await response.text();
        const lines = csvText.split(/\r?\n/).map(line => line.split(','));
        const headers = lines[0].map(h => h.trim());
        
        excelUsersDatabase = [];
        for(let i = 1; i < lines.length; i++) {
            if(!lines[i] || lines[i].length < 2 || lines[i][0] === "") continue;
            excelUsersDatabase.push({
                email: (lines[i][headers.indexOf('email')] || '').trim().toLowerCase(),
                password: (lines[i][headers.indexOf('password')] || '').trim(),
                realName: (lines[i][headers.indexOf('realName')] || '未命名').trim(),
                grade: (lines[i][headers.indexOf('grade')] || 'g1').trim().toLowerCase()
            });
        }
    } catch (err) {
        console.error("預載帳密失敗:", err);
    }
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

// 🔑 精準對照 Excel 登入機制
async function loginUser() {
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const errorEl = document.getElementById('loginError');
    
    if (!emailInput || !passwordInput) return;
    
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value.trim();
    
    if (!email || !password) {
        if (errorEl) errorEl.innerText = "請完整填寫您的帳號及密碼！";
        return;
    }
    
    if (errorEl) errorEl.innerText = "雲端數據驗證中...";

    const matchedUser = excelUsersDatabase.find(u => u.email === email && u.password === password);

    if (matchedUser) {
        isGuest = false;
        localStorage.setItem('hago_logged_in_email', email);
        const userCleanId = email.replace(/[^a-zA-Z0-9]/g, "_"); 
        enterSystem(userCleanId, matchedUser.realName);
    } else {
        if (errorEl) errorEl.innerText = "❌ 帳號或密碼錯誤，請重新輸入或詢問班導師！";
    }
}

// 👻 訪客匿名試玩
async function loginAsGuest() {
    const errorEl = document.getElementById('loginError');
    if (errorEl) errorEl.innerText = "建立臨時體驗檔案中...";
    try {
        const credential = await signInAnonymously(auth);
        const guestUid = "guest_" + credential.user.uid.substring(0, 8);
        
        isGuest = true;
        localStorage.setItem('hago_logged_in_guest', guestUid);
        enterSystem(guestUid, "體驗小遊客");
    } catch (err) {
        if (errorEl) errorEl.innerText = "遊客試玩開啟失敗: " + err.message;
    }
}

// 🚀 通過驗證放行
async function enterSystem(userCleanId, realName) {
    const loginOverlay = document.getElementById('loginOverlay');
    const mainContainer = document.getElementById('mainAppContainer');
    
    if (loginOverlay) loginOverlay.style.display = 'none';
    if (mainContainer) mainContainer.style.display = 'block';

    if (isGuest) {
        userData = {
            realName: realName,
            nickname: "參觀小達人",
            avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=guest_hago`,
            score: 888,
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
        updateStudentUI();
    } else {
        const initialData = {
            realName: realName,
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

window.changeNickname = async function() {
    if (!checkGuestPermission()) return;
};

// 🔄 讀取多導師 Excel 題庫分頁
async function loadCloudLevels() {
    try {
        const response = await fetch(GOOGLE_SHEET_LEVELS_URL);
        const csvText = await response.text();
        const lines = csvText.split(/\r?\n/).map(line => line.split(','));
        const headers = lines[0].map(h => h.trim());
        
        cloudLevelsData = [];
        for(let i = 1; i < lines.length; i++) {
            if(!lines[i] || lines[i].length < 2 || lines[i][0] === "") continue;
            cloudLevelsData.push({
                subject: (lines[i][headers.indexOf('subject')] || '').trim().toLowerCase(),
                level: parseInt(lines[i][headers.indexOf('level')]) || 1,
                title: (lines[i][headers.indexOf('title')] || '').trim(),
                url: (lines[i][headers.indexOf('url')] || '').trim()
            });
        }
        renderLevelGrid();
    } catch (err) {
        console.error("關卡資料加載失敗:", err);
    }
}

// 🗺️ 升級版：支援多表單隨機抽題演算的關卡矩陣
function renderLevelGrid() {
    const grid = document.getElementById('quizLevelGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    // 取得當前正式學生的年級代號 (遊客預設為一年的 g1)
    const currentGradeCode = (userData && userData.email) ? 
        (excelUsersDatabase.find(u => u.email === localStorage.getItem('hago_logged_in_email'))?.grade || 'g1') : 'g1';

    for (let i = 1; i <= 12; i++) {
        // 🔍 篩選：篩選出所有符合「當前學科」且「當前關卡數字」的雲端題庫名單
        const allMatchedQuizzes = cloudLevelsData.filter(item => item.subject === currentSelectedSubject && item.level === i);
        
        // 🔍 進階過濾：如果在 title 裡面有包含年級標記（如：[G1] 或 g1），則優先進行年級配對
        let finalQuizzesPool = allMatchedQuizzes.filter(item => item.title.toLowerCase().includes(currentGradeCode));
        
        // 如果該關卡沒有特定區分年級，就直接使用該科目該關卡的所有表單作為備用池
        if (finalQuizzesPool.length === 0) {
            finalQuizzesPool = allMatchedQuizzes;
        }

        const btn = document.createElement('button');
        btn.className = 'btn-level-placeholder';
        
        if (finalQuizzesPool.length > 0 && finalQuizzesPool[0].url) {
            // 🔥 只要有導師上傳過表單，關卡按鈕就會點亮！
            btn.style.cssText = "padding: 12px 8px; border-radius: 10px; cursor: pointer; font-weight: bold; background: linear-gradient(135deg, #a29bfe, #6c5ce7); color: white; border: none; box-shadow: 0 4px 8px rgba(108,92,231,0.2);";
            
            // 秀出關卡地圖上的小標題
            const displayTitle = finalQuizzesPool[0].title.replace(new RegExp(`\\[${currentGradeCode.toUpperCase()}\\]`, 'gi'), '').trim();
            btn.innerHTML = `🚀 第 ${i} 關<br><small style="color:#fff; font-size:0.75rem;">${displayTitle || '進入挑戰'}</small>`;
            
            btn.onclick = () => { 
                if (!checkGuestPermission()) return; // 阻擋遊客
                
                // 🎲 核心機制：從符合條件的表單池中，自動進行「隨機抽題」
                const randomQuizIdx = Math.floor(Math.random() * finalQuizzesPool.length);
                const chosenQuizFormUrl = finalQuizzesPool[randomQuizIdx].url;
                
                window.open(chosenQuizFormUrl, '_blank'); // 彈出被隨機抽到的 Google 表單！
            };
        } else {
            // 🔒 沒表單就維持虛線灰色鎖定
            btn.className = 'btn-level-placeholder'; 
            btn.innerHTML = `🔒 第 ${i} 關<br><small style="color:#cbd5e1; font-size:0.75rem;">冒險準備中</small>`;
            btn.onclick = () => {
                const isWeekend = checkWeekendStatus();
                Swal.fire(`第 ${i} 關`, isWeekend ? '🔥 週末雙倍副本！本關題庫導師正在建置中～' : '常態冒險模式，關卡內容調整中！', 'info');
            };
        }
        grid.appendChild(btn);
    }
}

// 📊 抓取商店商品 (升級版：支援自動標題容錯與對號入座，完美刷出皓晟獎點櫃)
async function fetchGoogleSheetShop() {
    const shopGrid = document.getElementById('googleSheetShopGrid');
    if (!shopGrid) return;
    try {
        const response = await fetch(GOOGLE_SHEET_CSV_URL);
        const csvText = await response.text();
        
        // 1. 精準切分每一行與每一格，並去除多餘的空白
        const lines = csvText.split(/\r?\n/).map(line => line.split(','));
        const headers = lines[0].map(h => h.trim().toLowerCase()); // 全部轉小寫防呆
        
        // 2. 智慧型尋找欄位索引 (不論妳 Excel 寫英文或中文、有大寫或小寫都能通)
        const titleIdx = headers.findIndex(h => h.includes('title') || h.includes('name') || h.includes('名稱') || h.includes('商品'));
        const priceIdx = headers.findIndex(h => h.includes('price') || h.includes('cost') || h.includes('點數') || h.includes('價格') || h.includes('價錢'));
        const stockIdx = headers.findIndex(h => h.includes('stock') || h.includes('count') || h.includes('庫存') || h.includes('數量'));
        const imgIdx = headers.findIndex(h => h.includes('img') || h.includes('url') || h.includes('圖片') || h.includes('照'));

        let html = '';
        let validItemCount = 0;

        // 3. 從第二行開始巡邏商品
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i] || lines[i].length < 2 || lines[i][0] === "") continue;
            
            // 安全提取資料，若找不到對應欄位就使用預設值
            const title = (titleIdx !== -1 && lines[i][titleIdx]) ? lines[i][titleIdx].trim() : '神祕驚喜小禮物';
            const price = (priceIdx !== -1 && lines[i][priceIdx]) ? parseInt(lines[i][priceIdx].trim(), 10) || 100 : 100;
            const stock = (stockIdx !== -1 && lines[i][stockIdx]) ? parseInt(lines[i][stockIdx].trim(), 10) || 0 : 0;
            let imgUrl = (imgIdx !== -1 && lines[i][imgIdx]) ? lines[i][imgIdx].trim() : 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=150';

            // 防呆：如果圖片網址為空，給一張預設禮物圖
            if (!imgUrl || imgUrl === "" || !imgUrl.startsWith('http')) {
                imgUrl = 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=150';
            }

            validItemCount++;

            // 完美對接 index.html 裡的仿蝦皮雙網格小卡片
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
                    <button onclick="buyShopItem('${title.replace(/'/g, "\\'")}', ${price}, ${stock})" ${stock <= 0 ? 'disabled' : ''} style="width:100%; margin-top:8px; padding:6px; background:${stock <= 0 ? '#b2bec3' : '#ff9f43'}; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:0.8rem;">
                        ${stock <= 0 ? '已售完' : '立即直購'}
                    </button>
                </div>
            `;
        }

        if (validItemCount === 0) {
            shopGrid.innerHTML = `<p style="color:#999; text-align:center; grid-column:span 2; padding:20px;">試算表中目前沒有任何上架物品資料喔！</p>`;
        } else {
            shopGrid.innerHTML = html;
        }
    } catch (err) {
        console.error("解讀 Google 試算表失敗:", err);
        shopGrid.innerHTML = `<p style="color:#ef4444; text-align:center; grid-column:span 2; padding:20px;">⚠️ 皓晟獎點櫃連線失敗，請檢查網路或聯絡 Winnie 老師。</p>`;
    }
}

window.buyShopItem = async function(title, price, stock) {
    if (!checkGuestPermission()) return; 
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

// 🎟️ 序號兌換系統
const LOCAL_PROMO_DATABASE = {
    "GOODJOB888": { points: 100, reason: "課堂表現優異" },
    "ENGLISHKING": { points: 150, reason: "英文單字比賽獲勝" },
    "MATH999": { points: 200, reason: "數學挑戰特獎" }
};

window.redeemPromoCode = async function() {
    if (!checkGuestPermission()) return; 

    const input = document.getElementById('promoCodeInput');
    if (!input || !input.value.trim()) return Swal.fire('提示', '請輸入序號', 'warning');
    const code = input.value.trim().toUpperCase();

    if (LOCAL_PROMO_DATABASE[code]) {
        const reward = LOCAL_PROMO_DATABASE[code];
        const history = userData.history || [];
        if (history.some(h => h.reason && h.reason.includes(`[序號兌換:${code}]`))) {
            return Swal.fire('不能重複領取', '這個兌換碼你已經領過囉！', 'error');
        }

        const newScore = (userData.score || 0) + reward.points;
        const newHistory = [...history, { time: new Date().toLocaleString(), amount: reward.points, reason: `[序號兌換:${code}] ${reward.reason}` }];

        await updateDoc(userRef, { score: newScore, history: newHistory });
        Swal.fire('🎉 兌換成功！', `獲得點數：+${reward.points} 點！`, 'success');
        input.value = '';
    } else {
        Swal.fire('序號錯誤', '找不到這組兌換碼，請跟導師確認喔！', 'error');
    }
};

window.startWeekendQuiz = function() {
    if (!checkGuestPermission()) return; 
    if (checkWeekendStatus()) Swal.fire('⚔️ 限時副本開啟！', '週末題目獲得點數自動翻倍！', 'success');
    else Swal.fire('未到開啟時間', '週末才會限時開放隱藏題庫喔！', 'info');
};

window.joinTeamChallenge = function() {
    if (!checkGuestPermission()) return; 
    const val = document.getElementById('teamRoomInput').value.trim();
    if(!val) return Swal.fire('提示', '請輸入 Room ID', 'warning');
    Swal.fire('👥 綁定成功', `已成功加入房間：${val}，組隊通關將獲得倍率加成！`, 'success');
};

window.submitPost = function() { 
    if (!checkGuestPermission()) return; 
    Swal.fire('開發中', '校園廣場留言功能即將開放！', 'info'); 
};

async function openAdminPanel() {
    if (!checkGuestPermission()) return; 

    const { value: teacherId } = await Swal.fire({
        title: '🔑 導師安全認證',
        input: 'password',
        inputPlaceholder: '請輸入導師固定 ID...',
        showCancelButton: true,
        confirmButtonColor: '#2c3e50'
    });
    const TEACHER_REGISTRY = { "hao002": "怡芳老師", "hao030": "湘羚老師", "hao015": "愷容老師", "hao026": "Andrea老師", "lovesan": "徐主任", "hao006": "育琴老師", "hao036": "Winnie老師", "haowork12": "最高管理員" };
    if (teacherId && TEACHER_REGISTRY[teacherId]) {
        localStorage.setItem('activeTeacherName', TEACHER_REGISTRY[teacherId]);
        Swal.fire({ title: '認證成功', text: `歡迎，${TEACHER_REGISTRY[teacherId]}！`, icon: 'success', timer: 1000, showConfirmButton: false })
        .then(() => { window.location.href = 'admin.html'; });
    } else if (teacherId) {
        Swal.fire('認證失敗', '查無此導師 ID！', 'error');
    }
}

window.handleLogout = function() { 
    localStorage.removeItem('hago_logged_in_email');
    localStorage.removeItem('hago_logged_in_guest');
    signOut(auth).then(() => { location.reload(); }).catch(() => { location.reload(); }); 
};
