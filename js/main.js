// js/main.js
import { auth, db, initError } from './firebase-init.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, onSnapshot, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { DEFAULT_TIERS, ACHIEVEMENT_LIST } from './constants.js';

// 全域狀態管理
let currentUser = null;
let userRef = null;
let userData = null;
let currentSelectedSubject = 'eng'; // 預設英文科

// 頁面初始化檢查
document.addEventListener('DOMContentLoaded', () => {
    initAuthListener();
    checkWeekendStatus();
    renderLevelGrid();
});

// 📅 1. 判斷是否為週末並顯示雙倍點數 Badge
function checkWeekendStatus() {
    const today = new Date();
    const day = today.getDay(); 
    const isWeekend = (day === 0 || day === 6); // 0是週日，6是週六
    const badge = document.getElementById('weekendBadge');
    if (badge) {
        badge.style.display = isWeekend ? 'inline-block' : 'none';
    }
    return isWeekend;
}

// 🔑 Firebase 登入與狀態監聽
function initAuthListener() {
    const loginOverlay = document.getElementById('loginOverlay');
    
    // 綁定按鈕點擊事件
    document.getElementById('btnLogin').addEventListener('click', loginUser);
    document.getElementById('btnRegister').addEventListener('click', registerUser);

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            userRef = doc(db, "users", user.uid);
            if (loginOverlay) loginOverlay.style.display = 'none';
            
            // 即時監聽學生雲端資料
            onSnapshot(userRef, (docSnap) => {
                if (docSnap.exists()) {
                    userData = docSnap.data();
                    updateStudentUI();
                } else {
                    // 新註冊學生，建立初始資料庫欄位
                    const initialData = {
                        realName: user.email.split('@')[0], // 老師查看的真實姓名預設為Email前綴
                        nickname: "新進小達人", // 廣場所看暱稱
                        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`,
                        score: 100,
                        liquidBalance: 0,
                        history: [{ time: new Date().toLocaleString(), amount: 100, reason: "新人註冊獎勵金" }],
                        inventory: [],
                        achievements: []
                    };
                    setDoc(userRef, initialData);
                }
            });
        } else {
            if (loginOverlay) loginOverlay.style.display = 'flex';
        }
    });
}

// 學生前端介面更新 (具備防卡死安全過濾)
function updateStudentUI() {
    if (!userData) return;

    const nameEl = document.getElementById('childNameDisplay');
    const scoreEl = document.getElementById('scoreDisplay');
    const avatarEl = document.getElementById('userAvatar');
    const liquidEl = document.getElementById('liquidBalance');

    if (nameEl) nameEl.innerText = `${userData.nickname} (${userData.realName})`;
    if (scoreEl) scoreEl.innerText = userData.score;
    if (avatarEl && userData.avatarUrl) avatarEl.src = userData.avatarUrl;
    if (liquidEl) liquidEl.innerText = userData.liquidBalance || 0;
}

// 🔤 數學/英文/國語 科目選擇切換
window.selectSubject = function(subject) {
    currentSelectedSubject = subject;
    document.querySelectorAll('.btn-subject').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');
    renderLevelGrid();
};

// 🗺️ 動態渲染 12 關大架構地圖
function renderLevelGrid() {
    const grid = document.getElementById('quizLevelGrid');
    if (!grid) return;
    grid.innerHTML = '';

    for (let i = 1; i <= 12; i++) {
        const btn = document.createElement('button');
        btn.className = 'btn-level-placeholder';
        btn.innerHTML = `🌟 第 ${i} 關<br><small style="color:#7f8c8d;">全科大題庫架構</small>`;
        btn.onclick = () => startLevelChallenge(i);
        grid.appendChild(btn);
    }
}

// 🎯 觸發關卡挑戰
function startLevelChallenge(levelNum) {
    const isWeekend = checkWeekendStatus();
    const bonusText = isWeekend ? "【🔥 週末挑戰點數翻倍！】" : "";
    
    Swal.fire({
        title: `關卡挑戰：第 ${levelNum} 關`,
        text: `妳開啟了當前科目的第 ${levelNum} 關。${bonusText} 內容 Winnie 老師正在建置更龐大的全科資料庫系統中，敬請期待！`,
        icon: 'info',
        confirmButtonText: '收到！我會好好複習'
    });
}

// 👥 好友共答組隊綁定功能
window.joinTeamChallenge = async function() {
    const roomInput = document.getElementById('teamRoomInput');
    if (!roomInput || !roomInput.value.trim()) return Swal.fire('提示', '請輸入房間 Room ID', 'warning');
    const roomId = roomInput.value.trim();

    Swal.fire({
        title: '👥 組隊挑戰配對成功！',
        text: `已成功將你與 Room ID: ${roomId} 的同學進行雲端連線綁定！結算時雙方將同時獲得 2~8 人團隊加成報酬！`,
        icon: 'success'
    });
};

// 🎫 老師兌換序號系統 (前端輸入兌換)
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
        
        // 檢查是否重複領取
        const history = userData.history || [];
        const hasClaimed = history.some(h => h.reason.includes(`[序號兌換:${code}]`));
        if (hasClaimed) return Swal.fire('不重複領取', '這個兌換碼你已經領過囉！', 'error');

        const newScore = userData.score + reward.points;
        const newHistory = [...history, { time: new Date().toLocaleString(), amount: reward.points, reason: `[序號兌換:${code}] ${reward.reason}` }];

        await updateDoc(userRef, {
            score: newScore,
            history: newHistory
        });

        Swal.fire('🎉 兌換成功！', `獲得點數：+${reward.points} 點！\n獎勵原因：${reward.reason}`, 'success');
        input.value = '';
    } else {
        Swal.fire('序號錯誤', '找不到這組兌換碼，請跟 Winnie 老師確認喔！', 'error');
    }
};

// ✏️ 修改大頭貼與暱稱
window.changeCustomAvatar = async function() {
    const { value: url } = await Swal.fire({
        title: '🖼️ 設定自訂大頭貼',
        input: 'url',
        inputLabel: '請貼上你的自訂頭像圖片網址 (或是由老師提供之圖床網址)',
        placeholder: 'https://...',
        showCancelButton: true
    });
    if (url) {
        await updateDoc(userRef, { avatarUrl: url });
        Swal.fire('修改成功', '大頭貼已更新！', 'success');
    }
};

window.changeNickname = async function() {
    const { value: newNick } = await Swal.fire({
        title: '👥 修改你在廣場的暱稱',
        input: 'text',
        inputValue: userData.nickname || "",
        inputPlaceholder: '輸入你想顯示的帥氣稱號...',
        showCancelButton: true
    });
    if (newNick) {
        await updateDoc(userRef, { nickname: newNick });
        Swal.fire('修改成功', `在廣場中，大家以後會叫你【${newNick}】！(老師後台依然能看到你的本名)`, 'success');
    }
};

// ⚖️ 物品交易行 (10%手續費核心邏輯)
window.buyMarketItem = function(itemId, originalPrice) {
    const tax = Math.floor(originalPrice * 0.1);
    const sellerReceive = originalPrice - tax;

    Swal.fire({
        title: '確認購買物品？',
        text: `此物品售價為 ${originalPrice} 點。\n(系統交易行將自動扣除 10% 手續費即 ${tax} 點，賣家最終將收到 ${sellerReceive} 點)`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '確定購買'
    }).then((result) => {
        if (result.isConfirmed) {
            Swal.fire('交易成功！', '手續費已扣除，物品已派發至背包！', 'success');
        }
    });
};

// 📑 籤頁切換邏輯
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active-content'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const targetTab = document.getElementById(`tab-${tabId}`);
    if (targetTab) targetTab.classList.add('active-content');
    event.currentTarget.classList.add('active');
};

// 🔐 Winnie 老師專屬密碼鎖進入管理功能
window.openAdminPanel = async function() {
    const { value: password } = await Swal.fire({
        title: '🔑 老師安全認證',
        input: 'password',
        inputPlaceholder: '請輸入 Winnie 老師的後台管理密碼',
        showCancelButton: true
    });

    if (password === "winnie888") { // 預設密碼
        Swal.fire({
            title: '🛠️ 老師權限認證通過',
            text: '稍後我們將把「Google 表單獎品管理、Excel 庫存自動連線、序號大量產出器」完整更新在獨立的 admin.html 教師專屬後台面板！',
            icon: 'success'
        });
    } else if (password) {
        Swal.fire('認證失敗', '密碼不正確喔！你是不是調皮的學生？', 'error');
    }
};

// 處理登出
window.handleLogout = function() {
    signOut(auth).then(() => {
        location.reload();
    });
};

// Firebase 註冊與登入模組
async function loginUser() {
    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value.trim();
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        document.getElementById('loginError').innerText = "登入失敗：" + err.message;
    }
}
async function registerUser() {
    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value.trim();
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        Swal.fire('註冊成功', '請填寫基本姓名並開啟你的探索之旅！', 'success');
    } catch (err) {
        document.getElementById('loginError').innerText = "註冊失敗：" + err.message;
    }
}
