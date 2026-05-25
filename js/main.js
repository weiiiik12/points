// js/main.js
import { auth, db } from './firebase-init.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, addDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUserRef = null;
let currentUserId = null;

// ----------------------------------------------------
// 🔐 登入狀態監聽與自動初始化
// ----------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    const loginOverlay = document.getElementById('login-overlay');
    const mainApp = document.getElementById('main-app');

    if (user) {
        currentUserId = user.uid;
        currentUserRef = doc(db, "users", user.uid);
        
        const userSnap = await getDoc(currentUserRef);
        if (!userSnap.exists()) {
            await setDoc(currentUserRef, {
                name: user.email.split('@')[0],
                points: 0,
                bag: [],
                achievements: []
            });
        }

        document.getElementById('user-email-display').innerText = user.email;
        loginOverlay.style.display = 'none';
        mainApp.style.display = 'block';

        startListeningData();
        checkWeekendStatus();
    } else {
        loginOverlay.style.display = 'flex';
        mainApp.style.display = 'none';
    }
});

// ----------------------------------------------------
// 🔌 即時直播監聽學生核心資料
// ----------------------------------------------------
function startListeningData() {
    onSnapshot(currentUserRef, (snapshot) => {
        if (snapshot.exists()) {
            const userData = snapshot.data();
            document.getElementById('points-display').innerText = userData.points || 0;
            
            // 渲染背包顯示
            const bagList = userData.bag || [];
            const bagDisplay = document.getElementById('bag-list-display');
            if(bagList.length === 0) {
                bagDisplay.innerText = "背包空空的，快去兌換吧！";
            } else {
                bagDisplay.innerHTML = bagList.map(item => `🎒 <span style="background:#dfe6e9; padding:2px 8px; border-radius:15px; margin-right:5px; display:inline-block; margin-bottom:5px;">${item}</span>`).join('');
            }

            // 渲染成就徽章亮起
            const achs = userData.achievements || [];
            if(achs.includes('first_10')) document.getElementById('ach-first').style.opacity = "1";
            if(achs.includes('king_100')) document.getElementById('ach-king').style.opacity = "1";
            if(achs.includes('seven_days')) document.getElementById('ach-seven').style.opacity = "1";
            if(achs.includes('team_success')) document.getElementById('ach-team').style.opacity = "1";
        }
    });
}

// ----------------------------------------------------
// 📅 週末特別挑戰自動檢查判斷
// ----------------------------------------------------
function checkWeekendStatus() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0是週日，6是週六
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        document.getElementById('weekend-badge').style.display = 'block';
        return true;
    }
    return false;
}

// ----------------------------------------------------
// 💰 模擬答題點數增加發放 (支援週末自動翻倍)
// ----------------------------------------------------
window.simulateAddPoints = async function(basePoints, reason) {
    let finalPoints = basePoints;
    let isBonus = checkWeekendStatus();
    
    if (isBonus) {
        finalPoints = basePoints * 2; // 週末自動翻倍邏輯
    }

    try {
        const userSnap = await getDoc(currentUserRef);
        if (userSnap.exists()) {
            const currentPoints = userSnap.data().points || 0;
            await updateDoc(currentUserRef, {
                points: currentPoints + finalPoints
            });
            Swal.fire('挑戰成功！', `獲得了 ${finalPoints} 點！${isBonus ? '(週末加倍翻轉！)' : ''}`, 'success');
        }
    } catch (e) {
        console.error(e);
    }
};

// ----------------------------------------------------
// 🎫 兌換碼 (序號系統核心邏輯)
// ----------------------------------------------------
document.getElementById('btn-redeem-code').addEventListener('click', async () => {
    const codeInput = document.getElementById('redeem-code-input').value.trim().toUpperCase();
    if(!codeInput) return Swal.fire('提示', '請輸入兌換碼！', 'warning');

    try {
        // 去雲端 promo_codes 資料夾尋找該組代碼
        const codeRef = doc(db, "promo_codes", codeInput);
        const codeSnap = await getDoc(codeRef);

        if (!codeSnap.exists()) {
            return Swal.fire('錯誤', '這組兌換碼不存在喔！', 'error');
        }

        const codeData = codeSnap.data();
        const usedList = codeData.isUsedBy || [];

        // 檢查這位學生有沒有重複領過
        if (usedList.includes(currentUserId)) {
            return Swal.fire('拿過囉', '每位學生限領一次這組序號！', 'warning');
        }

        // 通過驗證，開始發放點數
        const userSnap = await getDoc(currentUserRef);
        const currentPoints = userSnap.data().points || 0;
        const currentBag = userSnap.data().bag || [];

        // 變更學生點數
        await updateDoc(currentUserRef, {
            points: currentPoints + codeData.points
        });

        // 將該學生 UID 丟進序號的「已領取名單」中鎖死
        usedList.push(currentUserId);
        await updateDoc(codeRef, {
            isUsedBy: usedList
        });

        Swal.fire('兌換成功！', `成功匯入金額 ${codeData.points} 點！`, 'success');
        document.getElementById('redeem-code-input').value = "";

    } catch (e) {
        Swal.fire('系統錯誤', e.message, 'error');
    }
});

// ----------------------------------------------------
// 🎁 商店直購：扣點數並塞入背包
// ----------------------------------------------------
window.buyProductDirect = async function(itemName, price) {
    try {
        const userSnap = await getDoc(currentUserRef);
        if (userSnap.exists()) {
            const currentPoints = userSnap.data().points || 0;
            const currentBag = userSnap.data().bag || [];

            if (currentPoints < price) {
                return Swal.fire('點數不夠', `妳還差 ${price - currentPoints} 點才能兌換！`, 'error');
            }

            // 扣除點數，並將物品名塞入學生的 bag 陣列中
            currentBag.unshift(itemName);
            await updateDoc(currentUserRef, {
                points: currentPoints - price,
                bag: currentBag
            });

            Swal.fire('直購兌換成功！', `已將【${itemName}】放入妳的背包🎒！`, 'success');
        }
    } catch (e) {
        console.error(e);
    }
};

// ----------------------------------------------------
// ⚙️ 教師後台：在雲端生成新序號
// ----------------------------------------------------
window.generatePromoCodeCloud = async function() {
    const code = document.getElementById('new-promo-code').value.trim().toUpperCase();
    const pts = parseInt(document.getElementById('new-promo-points').value);

    if(!code || !pts) return Swal.fire('提示', '欄位都要輸入喔！', 'warning');

    try {
        // 直接在雲端建立一張以「代碼為名稱」的文件
        await setDoc(doc(db, "promo_codes", code), {
            code: code,
            points: pts,
            isUsedBy: [] // 初始已領取學生名單為空
        });

        Swal.fire('教師發佈成功！', `雲端序號【${code}】已生效，價值 ${pts} 點！`, 'success');
        document.getElementById('new-promo-code').value = "";
        document.getElementById('new-promo-points').value = "";
    } catch (e) {
        Swal.fire('發佈失敗', e.message, 'error');
    }
};

// ----------------------------------------------------
// 🧭 頁籤切換控制控制中心
// ----------------------------------------------------
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    
    // 讓點選的按鈕變色
    const buttons = document.querySelectorAll('.nav-btn');
    buttons.forEach(btn => {
        if(btn.getAttribute('onclick').includes(tabId)) btn.classList.add('active');
    });
};

// ----------------------------------------------------
// 系統核心：登入 / 註冊 / 登出事件監聽
// ----------------------------------------------------
document.getElementById('btn-login').addEventListener('click', () => {
    const email = document.getElementById('email-input').value.trim();
    const password = document.getElementById('password-input').value;
    signInWithEmailAndPassword(auth, email, password).catch(() => {
        document.getElementById('login-error-msg').innerText = "密碼錯誤或學生帳號不存在！";
    });
});
document.getElementById('btn-register').addEventListener('click', () => {
    const email = document.getElementById('email-input').value.trim();
    const password = document.getElementById('password-input').value;
    createUserWithEmailAndPassword(auth, email, password).catch(() => {
        document.getElementById('login-error-msg').innerText = "註冊失敗，信箱格式錯誤或已被註冊！";
    });
});
document.getElementById('btn-logout').addEventListener('click', () => { signOut(auth); });

// 預留空架構函式，提供妳後續逐步開發
window.joinTeamChallenge = function() { Swal.fire('2~8人組隊共答', '此核心架構功能開發中！', 'info'); };
window.simulateGacha = function() { Swal.fire('盲盒抽獎模組', '此盲盒大機率保底機制開發中！', 'info'); };
window.createDeposit = function() { Swal.fire('複利金庫投資', '此複利定存投資模組開發中！', 'info'); };
window.submitPost = function() { Swal.fire('同班交誼廣場', '此留言與配戴徽章功能開發中！', 'info'); };
window.createTradeRequest = function() { Swal.fire('以物易物市集', '此禁止點數交易、專屬交換請求功能開發中！', 'info'); };
