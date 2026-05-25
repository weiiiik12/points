// js/main.js
import { auth, db, initError } from './firebase-init.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged, sendPasswordResetEmail, updateEmail, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, addDoc, collection, query, where, orderBy, limit, onSnapshot, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { DEFAULT_TIERS, ACHIEVEMENT_LIST } from './constants.js';

// SweetAlert Toast
const Toast = Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true
});

if (initError) document.getElementById('loginError').innerText = "系統初始化失敗，請檢查設定";

let currentUser = null;
let isGuest = false;
let userRef = null;

// === 快照暫存 (切換小孩時重繪用) ===
let unsubscribePosts = null; 
let unsubscribeRequests = null;
let unsubscribeMarket = null;
let lastPostSnapshot = null;   
let lastMarketSnapshot = null; 
let lastRequestSnapshot = null; // 新增：暫存好友邀請快照

let masterData = {
    currentIdx: 0,
    settings: {
        dailyInterest: 0.02, interestHour: 20, fixedDepositRate: 0.06, fixedDepositDays: 30,
        gachaCost: 100, adminPin: null,
        pityRareThreshold: 10, pityLegendaryThreshold: 100, pityBigTarget: 5, prizeScope: 'global',
        enableBuffs: false,      
        allowFriendMarket: false 
    },
    tiers: JSON.parse(JSON.stringify(DEFAULT_TIERS)),
    children: []
};

let data = null; 
let currentDisplayedScore = 0;
let currentSocialBadges = ['😊']; 

// === 輔助函數 ===
function createNewChildData() {
    return { 
        score: 0, bag: [], history: [], achievements: [], 
        pityRare: 0, pityLegendary: 0, lastLoginDate: "", deposits: [], statDepositDays: 0,
        friends: [], 
        tiers: JSON.parse(JSON.stringify(DEFAULT_TIERS)) 
    };
}

function getBuffedSettings() {
    let settings = { ...masterData.settings };
    let buffs = {
        effectiveCost: settings.gachaCost,
        effectivePityLeg: settings.pityLegendaryThreshold,
        effectiveDailyRate: settings.dailyInterest,
        effectiveFixedRate: settings.fixedDepositRate,
        isGolden: false
    };

    if (!masterData.settings.enableBuffs || !data || !data.achievements) return buffs;

    if (data.achievements.includes('gacha_king')) buffs.effectiveCost = Math.floor(settings.gachaCost * 0.95);
    if (data.achievements.includes('bad_luck')) buffs.effectivePityLeg = Math.floor(settings.pityLegendaryThreshold * 0.90);
    if (data.achievements.includes('saver_5')) buffs.effectiveDailyRate = parseFloat((settings.dailyInterest * 1.1).toFixed(4));
    if (data.achievements.includes('rich_5000')) buffs.effectiveFixedRate = parseFloat((settings.fixedDepositRate * 1.08).toFixed(4));
    if (data.achievements.includes('lucky_leg')) buffs.isGolden = true;

    return buffs;
}

function getCurrentTiers() {
    if (masterData.settings.prizeScope === 'individual') {
        if (!data.tiers) data.tiers = JSON.parse(JSON.stringify(masterData.tiers));
        return data.tiers;
    }
    return masterData.tiers;
}

// === 資料讀寫邏輯 ===
async function loadDataFromCloud() {
    try { 
        const snap = await getDoc(userRef); 
        const cloudData = snap.exists() ? snap.data() : null;
        
        if (cloudData && cloudData.children) {
            masterData = cloudData;
            
            if(!masterData.settings.pityRareThreshold) masterData.settings.pityRareThreshold = 10;
            if(!masterData.settings.pityLegendaryThreshold) masterData.settings.pityLegendaryThreshold = 100;
            if(!masterData.settings.prizeScope) masterData.settings.prizeScope = 'global';
            if(masterData.settings.interestHour === undefined) masterData.settings.interestHour = 20; 
            if(!masterData.settings.gachaCost) masterData.settings.gachaCost = 100;
            if(masterData.settings.enableBuffs === undefined) masterData.settings.enableBuffs = false;
            if(masterData.settings.allowFriendMarket === undefined) masterData.settings.allowFriendMarket = false;

            if(masterData.friends && Array.isArray(masterData.friends)) {
                masterData.children.forEach(c => {
                    if(!c.data.friends) {
                        c.data.friends = masterData.friends.map(uid => ({uid: uid, name: '未知好友'}));
                    }
                });
                delete masterData.friends; 
            }
            masterData.children.forEach(c => {
                if(!c.data.friends) c.data.friends = [];
                if(c.data.friends.length > 0 && typeof c.data.friends[0] === 'string') {
                    c.data.friends = c.data.friends.map(uid => ({uid: uid, name: '舊好友'}));
                }
            });

        } else if (cloudData && cloudData.score !== undefined) {
            let oldData = { ...cloudData };
            delete oldData.tiers;
            masterData.tiers = cloudData.tiers || JSON.parse(JSON.stringify(DEFAULT_TIERS));
            masterData.settings = { dailyInterest: 0.02, interestHour: 20, fixedDepositRate: 0.06, fixedDepositDays: 30, gachaCost: 100, enableBuffs: false, allowFriendMarket: false };
            masterData.children = [{ name: "寶貝1", data: oldData }];
            masterData.children[0].data.friends = []; 
            masterData.children[0].data.tiers = JSON.parse(JSON.stringify(masterData.tiers));
        } else {
            masterData.children = [{ name: "寶貝1", data: createNewChildData() }];
            masterData.settings.interestHour = 20;
            masterData.settings.gachaCost = 100;
            masterData.settings.enableBuffs = false;
            masterData.settings.allowFriendMarket = false;
        }
        
        switchChild(masterData.currentIdx);
        saveData(); 
        checkAchievements(); 
        
        startSocialListeners();
        checkMySales();
    }
    catch (e) { console.error(e); Swal.fire('讀取失敗', e.message, 'error'); }
}

function saveData() {
    masterData.settings.dailyInterest = parseFloat(masterData.settings.dailyInterest.toFixed(4));
    masterData.settings.fixedDepositRate = parseFloat(masterData.settings.fixedDepositRate.toFixed(4));
    masterData.lastLoginDate = new Date().toISOString(); 

    if (currentUser) { 
        masterData.email = currentUser.isAnonymous ? `👻 遊客 (ID:${currentUser.uid.slice(0,5)})` : currentUser.email;
        setDoc(userRef, masterData).then(()=>updateUI()); 
    }
}

// === 社交與市集監聽器 ===
function startSocialListeners() {
    // 1. 監聽留言板
    const qPosts = query(collection(db, "posts"), orderBy("timestamp", "desc"), limit(30));
    unsubscribePosts = onSnapshot(qPosts, (snapshot) => {
        lastPostSnapshot = snapshot;
        renderPostListUI(snapshot);
    });

    // 2. 監聽好友邀請 (修正：支援指定小孩)
    const qReqs = query(collection(db, "friend_requests"), where("toUid", "==", currentUser.uid), where("status", "==", "pending"));
    unsubscribeRequests = onSnapshot(qReqs, (snapshot) => {
        lastRequestSnapshot = snapshot; // 暫存
        checkFriendRequestsUI(snapshot); // 檢查並顯示
    });
    
    // 3. 監聽市集
    const qMarket = query(collection(db, "market_items"), where("status", "==", "active"), limit(50));
    unsubscribeMarket = onSnapshot(qMarket, (snapshot) => {
        lastMarketSnapshot = snapshot;
        renderMarketListUI(snapshot);
    });
    
    // 4. 監聽好友邀請確認 (這部分邏輯不變，因為是「發送方」收到確認)
    const qAcc = query(collection(db, "friend_requests"), where("fromUid", "==", currentUser.uid), where("status", "==", "accepted"));
    onSnapshot(qAcc, (snapshot) => {
        snapshot.forEach(d => {
            const req = d.data();
            // 只有「發送這邀請的小孩」需要處理
            if (req.fromChildIdx !== undefined && req.fromChildIdx !== masterData.currentIdx) return;

            if(!data.friends) data.friends = [];
            if(!data.friends.some(f => f.uid === req.toUid)) {
                // 修改處：優先使用資料庫存的 toName，如果沒有(舊資料)才顯示 ID
                const friendName = req.toName || `好友 (ID:${req.toUid.slice(0,5)})`;

                data.friends.push({ uid: req.toUid, name: friendName });
                saveData(); 
                Swal.fire('好友通知', `${friendName} 同意了你的邀請！`, 'success');
                renderFriendList(); // 立即刷新列表

                // 加好友後，立刻刷新市集以顯示該好友商品
                if(lastMarketSnapshot) renderMarketListUI(lastMarketSnapshot);
            }
            deleteDoc(doc(db, "friend_requests", d.id)); 
        });
    });
}

// === 獨立渲染函式：好友邀請檢查 ===
function checkFriendRequestsUI(snapshot) {
    const alertBox = document.getElementById('friendReqAlert');
    if(!alertBox) return;
    
    if (!snapshot || snapshot.empty) {
        alertBox.style.display = 'none';
        window.pendingRequests = [];
        return;
    }

    // 過濾：只留下「指名給當前小孩」的邀請
    window.pendingRequests = [];
    snapshot.forEach(doc => {
        const req = doc.data();
        if (req.toChildIdx === undefined || req.toChildIdx === masterData.currentIdx) {
            window.pendingRequests.push({id: doc.id, ...req});
        }
    });

    if (window.pendingRequests.length > 0) {
        alertBox.style.display = 'flex';
        const count = window.pendingRequests.length;
        alertBox.querySelector('span').innerText = `🔔 你有 ${count} 個好友邀請！`;
    } else {
        alertBox.style.display = 'none';
    }
}

// === 獨立渲染函式：留言板 ===
function renderPostListUI(snapshot) {
    const postList = document.getElementById('postList');
    if(!postList) return; 
    if (!snapshot || snapshot.empty) { postList.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">還沒有人留言，快來搶頭香！</div>'; return; }
    
    let html = '';
    snapshot.forEach(doc => {
        const p = doc.data();
        
        const isSameAccount = (p.authorUid === currentUser.uid);
        const isSameChild = (p.authorChildIdx !== undefined) ? (p.authorChildIdx === masterData.currentIdx) : true;
        const isMe = isSameAccount && isSameChild; 
        const isFriend = data.friends.some(f => f.uid === p.authorUid); 
        
        const dateStr = new Date(p.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const shortId = p.authorUid.slice(0, 5);
        
        // 多選徽章顯示
        let badgeDisplay = '';
        if (p.badgeIcon) {
            if (Array.isArray(p.badgeIcon)) {
                badgeDisplay = p.badgeIcon.map(icon => 
                    `<span style="font-size:1.5rem; margin-right:2px; filter: drop-shadow(0 0 2px gold);">${icon}</span>`
                ).join('');
            } else {
                badgeDisplay = `<span style="font-size:1.5rem; margin-right:5px; filter: drop-shadow(0 0 2px gold);">${p.badgeIcon}</span>`;
            }
        } else {
            badgeDisplay = `<span style="font-size:1.5rem; margin-right:5px;">😊</span>`;
        }
        
        let btnHtml = '';
        if (isMe) {
             btnHtml = `<button class="btn-delete-post" onclick="deletePost('${doc.id}')">🗑️ 刪除</button>`;
        } else {
            if (isFriend) {
                btnHtml = `<button class="btn-add-friend disabled">已是好友</button>`;
            } else if (isSameAccount) {
                 btnHtml = `<span style="font-size:0.8rem; color:#636e72;">(家人)</span>`;
            } else {
                const targetIdx = p.authorChildIdx !== undefined ? p.authorChildIdx : 0;
                btnHtml = `<button class="btn-add-friend" onclick="onPostClick('${p.authorUid}', '${p.authorName}', ${targetIdx})">+ 加好友</button>`;
            }
        }

        html += `
            <div class="post-card">
                <div class="post-header">
                    <div class="post-author" onclick="${!isMe ? `onPostClick('${p.authorUid}', '${p.authorName}', ${p.authorChildIdx || 0})` : ''}">
                        <div style="display:inline-block; vertical-align:middle; margin-right:5px;">${badgeDisplay}</div>
                        ${p.authorName} 
                        <span style="color:#b2bec3; font-size:0.8rem; font-weight:normal; margin-left:5px;">(ID:${shortId})</span>
                        ${isMe ? '<span style="font-size:0.7rem; background:#dfe6e9; padding:2px 5px; border-radius:4px; margin-left:5px;">我</span>' : ''}
                    </div>
                    <div class="post-time">${dateStr}</div>
                </div>
                <div class="post-content">${p.content}</div>
                <div class="post-actions">${btnHtml}</div>
            </div>`;
    });
    postList.innerHTML = html;
}

// === 獨立渲染函式：市集 ===
function renderMarketListUI(snapshot) {
    const list = document.getElementById('marketList');
    const empty = document.getElementById('marketEmpty');
    if(!list) return;
    if (!snapshot) return;

    let html = '';
    let count = 0;
    
    snapshot.forEach(doc => {
        const item = doc.data();
        
        const isMyAccount = (item.sellerUid === currentUser.uid);
        const isMySelf = isMyAccount && (item.sellerChildIdx === masterData.currentIdx);
        const isFriend = data.friends.some(f => f.uid === item.sellerUid);
        
        let showItem = false;
        if (isMySelf) showItem = true;
        else if (isMyAccount) showItem = true; 
        else if (isFriend) {
            if (masterData.settings.allowFriendMarket) showItem = true;
        }

        if (showItem) {
            count++;
            const btnHtml = isMySelf
                ? `<button class="btn-cancel-sell" onclick="cancelSellItem('${doc.id}')">下架</button>`
                : `<button class="btn-buy" onclick="buyItem('${doc.id}', ${item.price}, '${item.itemData.reward}')" ${data.score < item.price ? 'disabled' : ''}>購買</button>`;
            
            let sellerDisplay = item.sellerName;
            if (isMySelf) sellerDisplay += " (我)";
            else if (isMyAccount) sellerDisplay += " (家人)";

            html += `
            <div class="market-item" style="border-left-color: ${item.itemData.color}">
                <div class="market-header">
                    <div>
                        <div class="market-title">${item.itemData.reward}</div>
                        <span class="market-tag" style="background:${item.itemData.color}">${item.itemData.tierName}</span>
                    </div>
                    <div class="market-price">${item.price}<small>點</small></div>
                </div>
                <div class="market-seller">賣家：${sellerDisplay}</div>
                <div class="market-actions">${btnHtml}</div>
            </div>`;
        }
    });

    if (count === 0) { 
        if (masterData.settings.allowFriendMarket === false && !snapshot.empty) {
            list.innerHTML = '';
            empty.innerHTML = '市集有商品，但家長設定為隱藏好友市集。<br>(只能看到自己與家人的物品)';
            empty.style.display = 'block';
        } else {
            list.innerHTML = ''; 
            empty.innerText = '目前沒有商品上架';
            empty.style.display = 'block'; 
        }
    }
    else { list.innerHTML = html; empty.style.display = 'none'; }
}

// === Auth 相關 (保持不變) ===
const loginOverlay = document.getElementById('loginOverlay');
const loadingMsg = document.getElementById('loadingMsg');
const errorMsg = document.getElementById('loginError');

function handleAuthError(error) {
    loadingMsg.style.display = 'none';
    let msg = error.code;
    if (msg === 'auth/invalid-email') msg = "Email 格式不正確";
    else if (msg === 'auth/user-not-found' || msg === 'auth/wrong-password' || msg === 'auth/invalid-credential') msg = "帳號或密碼錯誤";
    else if (msg === 'auth/email-already-in-use') msg = "此 Email 已經註冊過了";
    else if (msg === 'auth/weak-password') msg = "密碼太弱 (至少需6位)";
    else if (msg === 'auth/missing-password') msg = "請輸入密碼";
    errorMsg.innerText = msg;
    Swal.fire({ icon: 'error', title: '登入失敗', text: msg });
}

document.getElementById('btnLogin').addEventListener('click', () => {
    const email = document.getElementById('emailInput').value; const password = document.getElementById('passwordInput').value;
    if(!email || !password) { errorMsg.innerText="請輸入帳號密碼"; return; }
    loadingMsg.style.display = 'block'; errorMsg.innerText = "";
    signInWithEmailAndPassword(auth, email, password).then(()=>{ Toast.fire({ icon: 'success', title: '登入成功' }); }).catch(handleAuthError);
});
document.getElementById('btnRegister').addEventListener('click', () => {
    const email = document.getElementById('emailInput').value; const password = document.getElementById('passwordInput').value;
    if(!email || !password) { errorMsg.innerText="請輸入帳號密碼"; return; }
    loadingMsg.style.display = 'block'; errorMsg.innerText = "";
    createUserWithEmailAndPassword(auth, email, password).then(() => { Swal.fire('註冊成功！', '已為您自動登入', 'success'); }).catch(handleAuthError);
});
document.getElementById('btnForgotPassword').addEventListener('click', () => {
    const email = document.getElementById('emailInput').value;
    if(!email) { errorMsg.innerText = "請輸入 Email 後再按忘記密碼"; return; }
    loadingMsg.style.display = 'block'; errorMsg.innerText = "";
    sendPasswordResetEmail(auth, email).then(() => { loadingMsg.style.display = 'none'; Swal.fire('重設信已寄出！', '請檢查您的信箱', 'success'); }).catch(handleAuthError);
});
document.getElementById('btnGuest').addEventListener('click', () => {
    loadingMsg.style.display = 'block';
    signInAnonymously(auth).catch((error) => { handleAuthError(error); Swal.fire('注意', '請確認 Firebase 後台已開啟 [Anonymous] 登入功能！', 'warning'); });
});
document.getElementById('btnLogout').addEventListener('click', () => {
    Swal.fire({ title: '確定要登出嗎？', icon: 'question', showCancelButton: true, confirmButtonText: '登出', cancelButtonText: '取消' })
        .then((result) => { if (result.isConfirmed) signOut(auth).then(() => { location.reload(); }); });
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        userRef = doc(db, "users", user.uid);
        isGuest = user.isAnonymous;
        document.getElementById('userEmail').innerText = isGuest ? "👻 遊客 (ID:" + user.uid.slice(0,5) + ")" : user.email;
        loginOverlay.style.display = 'none';
        await loadDataFromCloud();
        setInterval(updateTimerAndDeposits, 1000);
    } else {
        loginOverlay.style.display = 'flex';
        loadingMsg.style.display = 'none';
    }
});

// === UI 控制邏輯 ===
let currentPinInput = "";
let pinContext = 'login'; 

function switchChild(idx) {
    if(idx < 0 || idx >= masterData.children.length) idx = 0;
    masterData.currentIdx = idx;
    data = masterData.children[idx].data;
    
    if(!data.friends) data.friends = [];

    document.getElementById('childSwitcher').innerText = masterData.children[idx].name + " ▼";
    document.getElementById("childDropdown").innerHTML = masterData.children.map((c, i) => `<div onclick="switchChild(${i})">${c.name} ${i === masterData.currentIdx ? '✔' : ''}</div>`).join('');
    
    currentDisplayedScore = data.score;
    document.getElementById('scoreDisplay').innerText = data.score;
    checkDailyInterest();
    renderFriendList();
    
    // 切換小孩時，立即調用暫存的 Snapshot 重繪畫面
    if(lastPostSnapshot) renderPostListUI(lastPostSnapshot);
    if(lastMarketSnapshot) renderMarketListUI(lastMarketSnapshot);
    if(lastRequestSnapshot) checkFriendRequestsUI(lastRequestSnapshot); 

    updateUI();
}

function switchTab(id) {
    if(id === 'tab-admin' && masterData.settings.adminPin) {
        pinContext = 'login';
        document.getElementById('pinTitle').innerText = "請輸入家長密碼";
        document.getElementById('pinModal').style.display = 'flex';
        currentPinInput = "";
        updatePinDisplay();
        return;
    }
    performSwitchTab(id);
}

function performSwitchTab(id) {
    document.querySelectorAll('.section').forEach(d => d.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    
    const buttons = document.querySelectorAll('.nav-btn');
    const tabs = ['tab-gacha', 'tab-bag', 'tab-social', 'tab-market', 'tab-bank', 'tab-admin'];
    const idx = tabs.indexOf(id);
    if(idx !== -1 && buttons[idx]) buttons[idx].classList.add('active');
    
    if(id === 'tab-social') renderFriendList();
}

function updateUI() {
    if (currentDisplayedScore !== data.score) {
        animateScore(currentDisplayedScore, data.score, 1000);
        currentDisplayedScore = data.score;
    } else {
        document.getElementById('scoreDisplay').innerText = data.score;
    }

    const buffs = getBuffedSettings();

    // 顯示利率
    let dRateHtml = parseFloat((masterData.settings.dailyInterest * 100).toFixed(2)) + '%';
    if (buffs.effectiveDailyRate > masterData.settings.dailyInterest) {
        dRateHtml = `<span style="text-decoration:line-through; font-size:0.8em; color:#ddd;">${dRateHtml}</span> <span style="color:#ffeaa7;">${(buffs.effectiveDailyRate*100).toFixed(2)}%</span><span class="buff-tag">VIP</span>`;
    }
    document.getElementById('dispDailyRate').innerHTML = dRateHtml;
    document.getElementById('dispInterestHour').innerText = masterData.settings.interestHour;

    let fRateHtml = parseFloat((masterData.settings.fixedDepositRate * 100).toFixed(2)) + '%';
    if (buffs.effectiveFixedRate > masterData.settings.fixedDepositRate) {
        fRateHtml = `<span style="text-decoration:line-through; font-size:0.8em; color:#ddd;">${fRateHtml}</span> <span style="color:#ffeaa7;">${(buffs.effectiveFixedRate*100).toFixed(2)}%</span><span class="buff-tag">黑卡</span>`;
    }
    document.getElementById('dispFixedRate').innerHTML = fRateHtml;
    document.getElementById('dispFixedDays').innerText = masterData.settings.fixedDepositDays;
    
    // 預估利息
    const dailyRate = buffs.effectiveDailyRate;
    const todayEst = Math.floor(data.score * dailyRate);
    document.getElementById('estInterestVal').innerText = todayEst;
    document.getElementById('estInterestFormula').innerText = `(目前點數 ${data.score} × 利率 ${dailyRate.toFixed(4)} = ${todayEst})`;

    // 機率與保底
    const currentTiers = getCurrentTiers();
    currentTiers.forEach((t, i) => { const el = document.getElementById(`label-prob${i}`); if(el) el.innerText = t.chance + "%"; });
    document.getElementById('limitRare').innerText = masterData.settings.pityRareThreshold;
    
    let legLimitHtml = masterData.settings.pityLegendaryThreshold;
    if (buffs.effectivePityLeg < masterData.settings.pityLegendaryThreshold) {
        legLimitHtml = `<span style="text-decoration:line-through; color:#aaa;">${legLimitHtml}</span> <span style="color:#d63031; font-weight:bold;">${buffs.effectivePityLeg}</span>`;
    }
    document.getElementById('limitLeg').innerHTML = legLimitHtml;
    document.getElementById('limitTargetName').innerText = (masterData.settings.pityBigTarget == 4) ? "傳奇+" : "神話";
    document.getElementById('pityRareDisp').innerText = data.pityRare;
    document.getElementById('pityLegDisp').innerText = data.pityLegendary;

    // 抽獎按鈕
    const btn = document.getElementById('btnDraw');
    const cost = buffs.effectiveCost;
    let btnText = `啟動轉盤 (-${cost}點)`;
    if (cost < masterData.settings.gachaCost) btnText += " 🔥優惠中";
    
    if (data.score < cost) { btn.innerText = `點數不足 (缺${cost - data.score})`; btn.disabled = true; } 
    else { btn.innerText = btnText; btn.disabled = false; }
    
    // 背包
    const bagList = document.getElementById('bagList'); bagList.innerHTML = '';
    if (data.bag.length === 0) document.getElementById('bagEmpty').style.display = 'block';
    else {
        document.getElementById('bagEmpty').style.display = 'none';
        data.bag.forEach((item, idx) => {
            const div = document.createElement('div'); div.className = 'list-item'; div.style.borderLeftColor = item.color;
            div.innerHTML = `<div><small style="color:${item.color};font-weight:bold;">${item.tierName}</small><br><span>${item.reward}</span></div>
            <div>
                <button class="btn-sell" onclick="startSellItem(${idx})">💰 拍賣</button>
                <button class="btn-use" onclick="useItem(${idx})">使用</button>
            </div>`;
            bagList.appendChild(div);
        });
    }
    
    // 歷史紀錄
    const histList = document.getElementById('historyList');
    histList.innerHTML = data.history.slice().reverse().map(h => `<div style="border-bottom:1px solid #eee; padding:8px 0;">${h.date} - ${h.reason} <span style="float:right; font-weight:bold; color:${h.amount>0?'#00b894':'#e17055'}">${h.amount}</span></div>`).join('');
    
    updateTimerAndDeposits();
}

function animateScore(start, end, duration) {
    if (start === end) return;
    const range = end - start;
    const minTimer = 50;
    let stepTime = Math.abs(Math.floor(duration / range));
    stepTime = Math.max(stepTime, minTimer);
    const startTime = new Date().getTime();
    const endTime = startTime + duration;
    let timer;
    const obj = document.getElementById('scoreDisplay');
    
    function run() {
        const now = new Date().getTime();
        const remaining = Math.max((endTime - now) / duration, 0);
        const value = Math.round(end - (remaining * range));
        obj.innerText = value;
        if (value == end) clearInterval(timer);
    }
    timer = setInterval(run, stepTime);
    run();
}

// === 遊戲核心：抽獎 ===
function startGacha() {
    const buffs = getBuffedSettings();
    const cost = buffs.effectiveCost;
    if (data.score < cost) return;
    
    if (masterData.settings.prizeScope === 'individual' && !data.tiers) {
        data.tiers = JSON.parse(JSON.stringify(masterData.tiers));
    }
    if (buffs.isGolden) document.body.classList.add('golden-mode');

    let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function playBeep(f,t,d){let o=audioCtx.createOscillator();let g=audioCtx.createGain();o.type=t;o.frequency.setValueAtTime(f,audioCtx.currentTime);g.gain.setValueAtTime(0.05,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+d);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+d);}
    
    data.score -= cost; 
    const now = new Date(); const d = `${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    data.history.push({ date: d, reason: '參加抽獎', amount: -cost });

    const tiersSource = getCurrentTiers();
    let rand = Math.random() * 100;
    let cumulative = 0;
    let resultTier = tiersSource[0];
    
    const pityLegLimit = buffs.effectivePityLeg;
    const pityRareLimit = masterData.settings.pityRareThreshold;

    if (data.pityLegendary >= (pityLegLimit - 1)) {
        resultTier = (masterData.settings.pityBigTarget == 4) ? ((Math.random() > 0.5) ? tiersSource[4] : tiersSource[5]) : tiersSource[5];
    } else if (data.pityRare >= (pityRareLimit - 1)) {
        resultTier = tiersSource[2]; 
    } else {
        for (let t of tiersSource) {
            cumulative += t.chance;
            if (rand <= cumulative) { resultTier = t; break; }
        }
    }

    if (resultTier.index === 5) { data.pityLegendary = 0; data.pityRare = 0; }
    else if (resultTier.index >= 2) { data.pityRare = 0; data.pityLegendary++; }
    else { data.pityRare++; data.pityLegendary++; }
    
    saveData();
    
    const btnDraw = document.getElementById('btnDraw');
    const finalResult = document.getElementById('finalResult');
    btnDraw.disabled = true;
    finalResult.innerHTML = '<span style="color:#999; font-size:1.5rem">🎰 轉動中...</span>';
    
    let currentIdx = 0; const totalLoops = 5; 
    const boxes = document.querySelectorAll('.roulette-box');
    let speed = 40; let stepCount = 0; let totalSteps = (totalLoops * 6) + resultTier.index; 
    
    function step() {
        boxes.forEach(b => b.classList.remove('active'));
        document.getElementById(`box-${currentIdx}`).classList.add('active');
        playBeep(800, 'square', 0.03);
        if (stepCount >= totalSteps) {
            playBeep(600, 'sine', 0.1); 
            let finalReward = "銘謝惠顧";
            if (resultTier.rewards && resultTier.rewards.length > 0) {
                finalReward = resultTier.rewards[Math.floor(Math.random() * resultTier.rewards.length)];
            }
            finalResult.innerHTML = `<h2 style="color:${resultTier.color}">${resultTier.name}級獎勵！</h2><p style="font-weight:bold; font-size:1.3rem; color:#333;">${finalReward}</p>`;
            data.bag.unshift({ tierName: resultTier.name, color: resultTier.color, reward: finalReward, id: Date.now() });
            saveData();
            btnDraw.disabled = false; updateUI();
            if (resultTier.index >= 2) fireConfetti();
            document.body.classList.remove('golden-mode');
            checkAchievements();
            Swal.fire({ title: `${resultTier.name}級獎勵！`, text: finalReward, color: resultTier.color, icon: resultTier.index >= 4 ? 'success' : (resultTier.index >= 2 ? 'info' : undefined), confirmButtonText: '太棒了！', confirmButtonColor: resultTier.color, backdrop: `rgba(0,0,123,0.4)` });
            return;
        }
        stepCount++; currentIdx++; if (currentIdx >= 6) currentIdx = 0;
        let remainingSteps = totalSteps - stepCount;
        if (remainingSteps < 8) speed += (10 - remainingSteps) * 20; else if (speed > 40) speed = 40;
        setTimeout(step, speed);
    }
    step();
}

// === 社交功能：留言板 (多選徽章) ===
function selectSocialBadge() {
    const unlocked = ACHIEVEMENT_LIST.filter(ach => data.achievements.includes(ach.id));
    if (unlocked.length === 0) return Swal.fire('還沒有徽章', '快去解鎖成就吧！', 'info');

    // 建立選項 HTML
    let html = unlocked.map(ach => 
        `<div id="badge-opt-${ach.icon}" class="badge-option ${currentSocialBadges.includes(ach.icon) ? 'selected' : ''}" 
              onclick="toggleBadgeSelection('${ach.icon}')">${ach.icon}</div>`
    ).join('');
    
    // 注入暫存的選擇邏輯到 window，讓 SweetAlert 內部點擊有效
    window.tempSelectedBadges = [...currentSocialBadges];
    window.toggleBadgeSelection = function(icon) {
        const idx = window.tempSelectedBadges.indexOf(icon);
        if(idx > -1) {
            window.tempSelectedBadges.splice(idx, 1);
            document.getElementById(`badge-opt-${icon}`).classList.remove('selected');
        } else {
            if(window.tempSelectedBadges.length >= 3) {
                // 自動移除第一個，加入新的 (保持3個)
                const removed = window.tempSelectedBadges.shift();
                document.getElementById(`badge-opt-${removed}`).classList.remove('selected');
            }
            window.tempSelectedBadges.push(icon);
            document.getElementById(`badge-opt-${icon}`).classList.add('selected');
        }
    };

    Swal.fire({
        title: '選擇徽章 (最多3個)',
        html: `<div class="badge-select-grid">${html}</div>`,
        showConfirmButton: true,
        confirmButtonText: '確定',
        didClose: () => { delete window.tempSelectedBadges; delete window.toggleBadgeSelection; }
    }).then((result) => {
        if (result.isConfirmed) {
            currentSocialBadges = window.tempSelectedBadges;
            document.getElementById('mySocialBadge').innerText = currentSocialBadges[0] || '😊';
        }
    });
}
window.selectSocialBadge = selectSocialBadge;

function submitPost() {
    const input = document.getElementById('postInput');
    const content = input.value.trim();
    if (!content) return Swal.fire('請輸入內容', '', 'warning');
    
    const childName = masterData.children[masterData.currentIdx].name;

    addDoc(collection(db, "posts"), {
        content: content,
        authorName: childName,
        authorUid: currentUser.uid,
        authorChildIdx: masterData.currentIdx, 
        badgeIcon: currentSocialBadges, // 送出陣列
        timestamp: Date.now()
    }).then(() => {
        input.value = '';
        Toast.fire({ icon: 'success', title: '留言已發送' });
    }).catch(e => Swal.fire('發送失敗', e.message, 'error'));
}

window.deletePost = function(postId) {
    Swal.fire({
        title: '確定刪除留言？', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d63031', confirmButtonText: '刪除', cancelButtonText: '取消'
    }).then((result) => {
        if (result.isConfirmed) {
            deleteDoc(doc(db, "posts", postId))
                .then(() => Toast.fire({icon: 'success', title: '留言已刪除'}))
                .catch(e => Swal.fire('刪除失敗', e.message, 'error'));
        }
    });
}

function onPostClick(uid, name, targetChildIdx) {
    if (uid === currentUser.uid) return; 
    
    if (data.friends.some(f => f.uid === uid)) {
        return Swal.fire('你們已經是朋友囉', '', 'info');
    }

    Swal.fire({
        title: `想跟 ${name} 當朋友嗎？`, input: 'text', inputLabel: '傳送打招呼訊息', inputValue: '很高興認識你，想跟你做朋友！', showCancelButton: true, confirmButtonText: '送出邀請 💌'
    }).then((result) => {
        if (result.isConfirmed && result.value) {
            // 修改：多傳遞一個 name 參數
            sendFriendRequest(uid, result.value, targetChildIdx, name);
        }
    });
}

// 修改：接收 targetName 參數
function sendFriendRequest(targetUid, msg, targetChildIdx, targetName) {
    const myName = masterData.children[masterData.currentIdx].name;
    addDoc(collection(db, "friend_requests"), {
        fromUid: currentUser.uid,
        fromChildIdx: masterData.currentIdx, // 寄件小孩
        fromName: myName,
        toUid: targetUid,
        toChildIdx: targetChildIdx, // 收件小孩 (精準投遞!)
        toName: targetName, // 修改：將對方的名字也存入資料庫
        message: msg,
        status: 'pending',
        timestamp: Date.now()
    }).then(() => Swal.fire('邀請已送出', '等待對方確認中...', 'success'));
}

function showFriendRequests() {
    if (!window.pendingRequests || window.pendingRequests.length === 0) return;
    const req = window.pendingRequests[0];
    Swal.fire({
        title: '好友邀請 💌', html: `<p><strong>${req.fromName}</strong> 想加你好友</p><p>"${req.message}"</p>`, showDenyButton: true, confirmButtonText: '✅ 同意', denyButtonText: '❌ 婉拒'
    }).then((result) => {
        if (result.isConfirmed) {
            const friendData = { uid: req.fromUid, name: req.fromName };
            acceptFriend(req, friendData);
        } else if (result.isDenied) {
            deleteDoc(doc(db, "friend_requests", req.id));
        }
    });
}

async function acceptFriend(req, friendData) {
    if(!data.friends) data.friends = [];
    
    if(!data.friends.some(f => f.uid === friendData.uid)) {
        data.friends.push(friendData);
        saveData(); 
    }
    
    await updateDoc(doc(db, "friend_requests", req.id), { status: 'accepted' });
    Swal.fire('已成為好友！', '現在可以在市集看到他的東西了', 'success');
    renderFriendList();

    // 新增：加好友後，強制使用「最後一次的市集快照」重新渲染市集列表
    if(lastMarketSnapshot) renderMarketListUI(lastMarketSnapshot);
}

function renderFriendList() {
    const div = document.getElementById('myFriendList');
    if (!div) return;
    
    if (!data.friends || data.friends.length === 0) {
        div.innerHTML = '<span style="font-size:0.8rem; color:#aaa;">還沒有好友，去留言板交朋友吧！</span>';
        return;
    }
    
    // 修改：在名字後面加上灰色 ID
    let html = data.friends.map((f, i) => `
        <div class="friend-chip">
            <span onclick="Swal.fire('${f.name}')">
                ${f.name} <span style="color:#b2bec3; font-size:0.8rem; font-weight:normal;">(ID:${f.uid.slice(0,5)})</span>
            </span> 
            <small onclick="removeFriend(${i})" style="cursor:pointer; color:#ff7675; margin-left:5px;">✖</small>
        </div>
    `).join('');
    
    div.innerHTML = html;
}

window.removeFriend = function(index) {
    const friend = data.friends[index];
    Swal.fire({
        title: `解除好友？`,
        text: `確定要刪除 ${friend.name} 嗎？`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d63031',
        confirmButtonText: '刪除'
    }).then((r) => {
        if(r.isConfirmed) {
            data.friends.splice(index, 1);
            saveData();
            renderFriendList();
            Toast.fire({icon: 'success', title: '已解除好友'});
        }
    });
}

// === 市集 (Market) ===
function startSellItem(bagIdx) {
    const item = data.bag[bagIdx];
    Swal.fire({
        title: '拍賣上架 (公開)',
        text: '上架後，你自己和好友都能看到喔！',
        input: 'number',
        inputAttributes: { min: 1, step: 1 },
        showCancelButton: true
    }).then((res) => {
        if(res.isConfirmed && res.value) {
            const price = parseInt(res.value);
            if(price<=0) return Swal.fire('錯誤', '價格必須大於 0', 'error');
            const tax = Math.floor(price*0.1);
            
            Swal.fire({ 
                title:`確認售價 ${price}`, 
                html: `手續費 (10%)：<b style="color:red">-${tax}</b><br>實拿：<b style="color:#00b894">${price-tax}</b>`, 
                icon:'warning', 
                showCancelButton:true, 
                confirmButtonText:'確認上架' 
            }).then((c)=>{
                if(c.isConfirmed) {
                    addDoc(collection(db, "market_items"), {
                        sellerUid: currentUser.uid,
                        sellerName: masterData.children[masterData.currentIdx].name,
                        sellerChildIdx: masterData.currentIdx, 
                        price: price,
                        itemData: item,
                        status: 'active',
                        timestamp: Date.now()
                    });
                    
                    data.bag.splice(bagIdx, 1);
                    saveData();
                    Swal.fire('上架成功', '', 'success');
                }
            });
        }
    });
}

function cancelSellItem(docId) {
    updateDoc(doc(db, "market_items", docId), { status: 'cancelled' });
}

async function buyItem(docId, price, rewardName) {
    if(data.score < price) return Swal.fire('點數不足', '快去存錢吧', 'error');
    
    try {
        const itemRef = doc(db, "market_items", docId);
        const itemSnap = await getDoc(itemRef);
        
        if(!itemSnap.exists() || itemSnap.data().status !== 'active') {
            return Swal.fire('來晚了', '商品已被買走或下架', 'error');
        }
        
        const itemData = itemSnap.data().itemData;
        
        await updateDoc(itemRef, {
            status: 'sold',
            buyerUid: currentUser.uid
        });
        
        data.score -= price;
        data.bag.unshift(itemData);
        data.history.push({ date: new Date().toLocaleDateString(), reason: `購買: ${rewardName}`, amount: -price });
        saveData();
        
        Swal.fire('購買成功', '商品已放入背包', 'success');
        
    } catch(e) {
        console.error(e);
        Swal.fire('交易失敗', e.message, 'error');
    }
}

function checkMySales() {
    const qSold = query(collection(db, "market_items"), where("sellerUid", "==", currentUser.uid), where("status", "==", "sold"));
    onSnapshot(qSold, (snap) => {
        snap.forEach(d => {
            const item = d.data();
            const tax = Math.floor(item.price * 0.1);
            const profit = item.price - tax;
            
            const childIdx = item.sellerChildIdx || 0;
            if(masterData.children[childIdx]) {
                masterData.children[childIdx].data.score += profit;
                masterData.children[childIdx].data.history.push({ date: new Date().toLocaleDateString(), reason: `拍賣售出: ${item.itemData.reward}`, amount: profit });
            }
            
            deleteDoc(doc(db, "market_items", d.id)); 
            saveData();
            Toast.fire({ icon: 'success', title: `商品售出！獲得 ${profit} 點` });
        });
    });

    const qCancel = query(collection(db, "market_items"), where("sellerUid", "==", currentUser.uid), where("status", "==", "cancelled"));
    onSnapshot(qCancel, (snap) => {
        snap.forEach(d => {
            const item = d.data();
            const childIdx = (item.sellerChildIdx !== undefined) ? item.sellerChildIdx : 0;
            if(masterData.children[childIdx]) {
                masterData.children[childIdx].data.bag.unshift(item.itemData);
            }
            deleteDoc(doc(db, "market_items", d.id)); 
            saveData();
            Toast.fire({ icon: 'info', title: '商品已退回背包' });
        });
    });
}


// === 遊戲核心：銀行 (保持不變) ===
function updateTimerAndDeposits() {
    if(!data) return;
    const now = new Date();
    let target = new Date(now); target.setHours(masterData.settings.interestHour, 0, 0, 0); if (now > target) target.setDate(target.getDate() + 1);
    const diff = target - now;
    const h = Math.floor((diff % (86400000)) / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
    document.getElementById('interestTimer').innerText = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    
    const list = document.getElementById('depositList');
    const empty = document.getElementById('depositEmpty');
    if (data.deposits.length === 0) { list.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    
    let html = '';
    const buffs = getBuffedSettings();
    
    data.deposits.forEach(d => {
        const end = new Date(d.endDate); const isMature = now >= end; const timeLeft = end - now;
        const startStr = new Date(d.startDate).toLocaleString();
        let timeStr = isMature ? "✅ 可領回" : `⏳ 剩 ${Math.floor(timeLeft / 86400000)}天${Math.floor((timeLeft % 86400000) / 3600000)}時`;
        
        const daysLocked = masterData.settings.fixedDepositDays;
        const rate = d.rateSnap !== undefined ? d.rateSnap : buffs.effectiveFixedRate;
        const total = d.amount * Math.pow(1 + rate, daysLocked);
        const profit = Math.floor(total - d.amount);

        html += `<div class="deposit-item">
                    <div class="deposit-header"><span>本金: ${d.amount}</span><span style="color:#00b894;">(+${profit})</span></div>
                    <div style="font-size:0.75rem; color:#aaa; margin-top:2px;">📅 ${startStr}</div>
                    <div style="font-size:0.75rem; color:#888;">💡 鎖定利率: ${(rate*100).toFixed(2)}%</div>
                    <div class="deposit-time">${timeStr}</div>
                    <button class="btn-redeem" onclick="redeemDeposit(${d.id})" ${isMature?'':'disabled'}>${isMature?'領取':'未到期'}</button>
                 </div>`;
    });
    list.innerHTML = html;
}

function checkDailyInterest() {
    const now = new Date(); const today = now.toDateString();
    if(now.getHours() < masterData.settings.interestHour) return;
    if(data.lastLoginDate !== today && data.score > 0) {
        const buffs = getBuffedSettings();
        const interest = Math.floor(data.score * buffs.effectiveDailyRate);
        if(interest > 0) {
            data.score += interest;
            data.history.push({ date: new Date().toLocaleDateString(), reason: "活存利息", amount: interest });
            Swal.fire({ title: '每日利息發放', text: `昨天的存款讓你獲得了 ${interest} 點！(利率: ${(buffs.effectiveDailyRate*100).toFixed(2)}%)`, icon: 'success', timer: 3000 });
        }
        data.lastLoginDate = today; saveData(); checkAchievements();
    } else if(data.lastLoginDate === "") { data.lastLoginDate = today; saveData(); }
}

function createDeposit() {
    const amt = parseInt(document.getElementById('depositAmount').value);
    if(!amt || amt <= 0 || amt > data.score) return Swal.fire('錯誤', "點數不足或輸入錯誤", 'error');
    const days = masterData.settings.fixedDepositDays;
    const buffs = getBuffedSettings();
    const rate = buffs.effectiveFixedRate;
    const total = amt * Math.pow(1 + rate, days);
    const estimatedProfit = Math.floor(total - amt);

    Swal.fire({
        title: '確定要定存嗎？',
        html: `存入: <b>${amt}</b> 點<br>鎖定: <b>${days}</b> 天<br>預計獲利: <b style="color:#00b894">+${estimatedProfit}</b> 點<br><small style="color:#e67e22">(適用利率: ${(rate*100).toFixed(2)}%)</small><br><br><span style="color:red;font-size:0.9rem">期間內絕對不能解約喔！</span>`,
        icon: 'question', showCancelButton: true, confirmButtonText: '存下去！', confirmButtonColor: '#00b894'
    }).then((result) => {
        if (result.isConfirmed) {
            data.score -= amt;
            const now = new Date(); const end = new Date(now); end.setDate(end.getDate() + days);
            data.deposits.push({ id: Date.now(), amount: amt, rateSnap: rate, startDate: now.toISOString(), endDate: end.toISOString(), status: 'active' });
            data.history.push({ date: new Date().toLocaleDateString(), reason: "申請定存", amount: -amt });
            saveData(); checkAchievements(); Swal.fire('存入成功', '努力存錢是好習慣！', 'success');
        }
    });
}

function redeemDeposit(id) {
    const idx = data.deposits.findIndex(d => d.id === id); if(idx===-1) return;
    const dep = data.deposits[idx];
    const days = masterData.settings.fixedDepositDays;
    const buffs = getBuffedSettings();
    const rate = dep.rateSnap !== undefined ? dep.rateSnap : buffs.effectiveFixedRate;
    
    const total = dep.amount * Math.pow(1 + rate, days);
    const profit = Math.floor(total - dep.amount);
    
    data.score += (dep.amount + profit);
    data.history.push({ date: new Date().toLocaleDateString(), reason: "定存領回", amount: (dep.amount+profit) });
    
    if (dep.amount >= 100) {
        const duration = Math.round((new Date(dep.endDate) - new Date(dep.startDate)) / (1000 * 60 * 60 * 24));
        data.statDepositDays = (data.statDepositDays || 0) + duration;
    }

    data.deposits.splice(idx, 1);
    saveData(); checkAchievements(); Swal.fire('定存到期', `本金 ${dep.amount} + 利息 ${profit} 已入帳！`, 'success');
}

// === 遊戲核心：成就與物品 (保持不變) ===
function checkAchievements() {
    if (!data.achievements) data.achievements = [];
    let hasNew = false;
    ACHIEVEMENT_LIST.forEach(ach => {
        if (!data.achievements.includes(ach.id)) {
            if (ach.condition(data)) {
                data.achievements.push(ach.id);
                hasNew = true;
                Swal.fire({ title: '🏆 解鎖成就！', html: `<div style="font-size:4rem; margin:10px 0;">${ach.icon}</div><h3>${ach.title}</h3><p>${ach.desc}</p>`, icon: 'success', timer: 4000, backdrop: `rgba(0,0,123,0.4) url("https://sweetalert2.github.io/images/nyan-cat.gif") left top no-repeat` });
                data.history.push({ date: new Date().toLocaleDateString(), reason: `達成成就: ${ach.title}`, amount: 0 });
            }
        }
    });
    if (hasNew) saveData();
}

function openAchievements() {
    if (!data.achievements) data.achievements = [];
    const html = ACHIEVEMENT_LIST.map(ach => {
        const isUnlocked = data.achievements.includes(ach.id);
        const statusClass = isUnlocked ? 'unlocked' : '';
        let progressHtml = (!isUnlocked && ach.getProgress) ? `<div class="progress-text">${ach.getProgress(data)}</div>` : '';
        return `<div class="badge-item ${statusClass}" onclick="showBadgeDetail('${ach.title}', '${ach.desc}', '${ach.icon}', ${isUnlocked}, '${ach.buffText || ''}')"><div class="badge-icon">${ach.icon}</div><div class="badge-name">${ach.title}</div>${progressHtml}</div>`;
    }).join('');
    Swal.fire({ title: '我的成就徽章', html: `<div class="badge-grid">${html}</div>`, width: 600, showConfirmButton: true, confirmButtonText: '太酷了' });
}

function showBadgeDetail(title, desc, icon, isUnlocked, buffText) {
    let buffHtml = '';
    if (buffText) buffHtml = masterData.settings.enableBuffs ? `<div style="background:#e8f8f5; color:#27ae60; padding:8px; border-radius:5px; margin-top:10px; font-weight:bold; font-size:0.9rem; border:1px dashed #2ecc71;">${buffText}</div>` : `<div style="background:#f1f2f6; color:#95a5a6; padding:8px; border-radius:5px; margin-top:10px; font-size:0.8rem;">(特殊能力已被家長停用)</div>`;

    const config = isUnlocked ? {
        title: '🏆 已獲得成就', html: `<div style="font-size:4rem; margin:10px 0; text-shadow: 0 0 10px gold;">${icon}</div><h3 style="color:#d35400">${title}</h3><p style="font-size:1.1rem; color:#2d3436;">${desc}</p>${buffHtml}`, icon: 'success', confirmButtonText: '棒棒噠'
    } : {
        title: '尚未解鎖', html: `<div style="font-size:3rem; margin:10px 0; opacity:0.3; filter:grayscale(1);">${icon}</div><p>提示：${desc}</p>${buffText ? '<div style="color:#aaa; font-size:0.8rem; margin-top:5px;">解鎖後可獲得特殊能力</div>' : ''}`, icon: 'question', confirmButtonText: '加油'
    };
    Swal.fire(config).then(() => openAchievements());
}

function useItem(idx) {
    const item = data.bag[idx]; 
    Swal.fire({
        title: '確定要使用嗎？', html: `這張卡片是：<b style="color:${item.color}">${item.reward}</b>`, icon: 'question', showCancelButton: true, confirmButtonText: '用掉！', cancelButtonText: '再等等', confirmButtonColor: '#ff7675'
    }).then((result) => {
        if (result.isConfirmed) {
            const match = item.reward.match(/增加點數(\d+)點/);
            if (match) { 
                const p = parseInt(match[1]); data.score += p; 
                data.history.push({ date: new Date().toLocaleDateString(), reason: `使用: ${item.reward}`, amount: p });
                Swal.fire('效果發動', `🎊 已增加 ${p} 點！`, 'success'); 
            } else {
                data.history.push({ date: new Date().toLocaleDateString(), reason: `使用: ${item.reward}`, amount: 0 });
                Swal.fire('已使用', '記得去找爸爸媽媽兌換喔！', 'success');
            }
            data.bag.splice(idx, 1); saveData();
        }
    });
}

function addPoints() {
    const r = document.getElementById('reasonIn').value, p = parseInt(document.getElementById('pointsIn').value);
    if(!r || !p) return Swal.fire('提示', "請輸入原因和點數", 'info');
    data.score += p; 
    data.history.push({ date: new Date().toLocaleDateString(), reason: r, amount: p });
    saveData(); checkAchievements(); 
    Toast.fire({ icon: 'success', title: p >= 0 ? '點數已發放' : '點數已扣除' });
    document.getElementById('reasonIn').value = '';
}

// === 管理功能 (保持不變) ===
function openSettings() {
    document.getElementById('settingsModal').style.display = 'block';
    document.getElementById('setDailyRate').value = masterData.settings.dailyInterest;
    document.getElementById('setInterestHour').value = masterData.settings.interestHour;
    document.getElementById('setFixedRate').value = masterData.settings.fixedDepositRate;
    document.getElementById('setFixedDays').value = masterData.settings.fixedDepositDays;
    document.getElementById('setPityRare').value = masterData.settings.pityRareThreshold;
    document.getElementById('setPityLeg').value = masterData.settings.pityLegendaryThreshold;
    document.getElementById('setPityTarget').value = masterData.settings.pityBigTarget || 5;
    document.getElementById('setGachaCost').value = masterData.settings.gachaCost;
    document.getElementById('setEnableBuffs').checked = masterData.settings.enableBuffs !== false;
    document.getElementById('setAllowFriendMarket').checked = masterData.settings.allowFriendMarket !== false;

    const scope = masterData.settings.prizeScope || 'global';
    document.querySelector(`input[name="prizeScope"][value="${scope}"]`).checked = true;
    updateScopeHint(scope);

    const currentTiers = getCurrentTiers();
    currentTiers.forEach((t, i) => document.getElementById(`prob${i}`).value = t.chance);

    document.getElementById('guestBindSection').style.display = isGuest ? 'block' : 'none';
    document.getElementById('userAccountSection').style.display = isGuest ? 'none' : 'block';
    if(!isGuest) document.getElementById('settingsEmailDisplay').innerText = currentUser.email;

    renderPrizeManager();
    renderSettingsChildList();
}

function updateScopeHint(scope) {
    const hint = document.getElementById('scopeHint');
    if(scope === 'global') hint.innerText = "目前模式：所有小孩共用同一套獎品清單。";
    else hint.innerText = "目前模式：當前小孩 (" + masterData.children[masterData.currentIdx].name + ") 擁有獨立獎品清單。";
}

function saveSettings() {
    masterData.settings.dailyInterest = parseFloat(document.getElementById('setDailyRate').value);
    masterData.settings.interestHour = parseInt(document.getElementById('setInterestHour').value);
    masterData.settings.fixedDepositRate = parseFloat(document.getElementById('setFixedRate').value);
    masterData.settings.fixedDepositDays = parseInt(document.getElementById('setFixedDays').value);
    masterData.settings.pityRareThreshold = parseInt(document.getElementById('setPityRare').value);
    masterData.settings.pityLegendaryThreshold = parseInt(document.getElementById('setPityLeg').value);
    masterData.settings.pityBigTarget = parseInt(document.getElementById('setPityTarget').value);
    masterData.settings.gachaCost = parseInt(document.getElementById('setGachaCost').value);
    masterData.settings.enableBuffs = document.getElementById('setEnableBuffs').checked;
    masterData.settings.prizeScope = document.querySelector('input[name="prizeScope"]:checked').value;
    masterData.settings.allowFriendMarket = document.getElementById('setAllowFriendMarket').checked;

    let newProbs = [];
    for(let i=0; i<6; i++) newProbs.push(parseFloat(document.getElementById(`prob${i}`).value));
    const targetTiers = getCurrentTiers();
    newProbs.forEach((p, i) => targetTiers[i].chance = p);

    saveData(); updateUI(); document.getElementById('settingsModal').style.display = 'none';
    Toast.fire({ icon: 'success', title: '設定已儲存' });
}

function renderSettingsChildList() {
    const list = document.getElementById('settingsChildList');
    list.innerHTML = masterData.children.map((c, i) => `
        <div class="child-row"><span>${c.name}</span><div>
            <button class="btn-mini-edit" onclick="renameChildSettings(${i})">改名</button>
            <button class="btn-mini-del" onclick="deleteChildSettings(${i})">刪除</button>
        </div></div>`).join('');
}

function addNewChildFromSettings() {
    const name = document.getElementById('settingsNewChildName').value;
    if (!name) return;
    masterData.children.push({ name: name, data: createNewChildData() });
    document.getElementById('settingsNewChildName').value = '';
    saveData(); renderSettingsChildList(); switchChild(masterData.currentIdx);
}

function renderPrizeManager() {
    const select = document.getElementById('tierSelect'); 
    const listDiv = document.getElementById('prizeManagerList'); 
    const currentTiers = getCurrentTiers(); 
    const tierData = currentTiers[parseInt(select.value)];
    select.style.borderColor = tierData.color; select.style.color = tierData.color; 
    
    if (tierData.rewards.length === 0) { listDiv.innerHTML = '<div style="padding:10px; text-align:center; color:#999;">無獎品</div>'; } 
    else { listDiv.innerHTML = tierData.rewards.map((reward, idx) => `<div class="prize-manage-item"><span>${reward}</span><div><button class="btn-mini-edit" onclick="editPrize(${parseInt(select.value)}, ${idx})">✏️</button><button class="btn-mini-del" onclick="removePrize(${parseInt(select.value)}, ${idx})">🗑️</button></div></div>`).join(''); }
}

function addCustomPrize() {
    const name = document.getElementById('newPrizeName').value.trim(); if(!name) return;
    getCurrentTiers()[parseInt(document.getElementById('tierSelect').value)].rewards.push(name);
    saveData(); document.getElementById('newPrizeName').value = ''; renderPrizeManager();
}

function fireConfetti() { const c = document.getElementById('confetti-canvas'); const ctx = c.getContext('2d'); c.width = window.innerWidth; c.height = window.innerHeight; let p = []; const colors = ['#f1c40f', '#e74c3c', '#3498db', '#9b59b6', '#2ecc71']; for(let i=0; i<150; i++) p.push({x: c.width/2, y: c.height/2, r: Math.random()*6+2, dx: Math.random()*10-5, dy: Math.random()*10-5, color: colors[Math.floor(Math.random()*colors.length)], life: 100}); function d() { ctx.clearRect(0,0,c.width,c.height); let active = false; p.forEach(k => { if(k.life>0){ active=true; ctx.beginPath(); ctx.arc(k.x, k.y, k.r, 0, Math.PI*2); ctx.fillStyle=k.color; ctx.fill(); k.x+=k.dx; k.y+=k.dy; k.dy+=0.2; k.life--; }}); if(active) requestAnimationFrame(d); else ctx.clearRect(0,0,c.width,c.height); } d(); }

// === 新功能：指引與改版說明 (內容已填充) ===
function showAppGuide() {
    Swal.fire({
        title: '📖 App 使用戰略指南',
        html: `
            <div style="text-align:left; font-size:0.9rem; line-height:1.6; max-height: 400px; overflow-y: auto; padding: 0 10px;">
                
                <h4 style="color:#2d3436; margin-bottom:5px; background:#dfe6e9; padding:5px 10px; border-radius:5px;">👨‍👩‍👧‍👦 家長專區：多寶貝與客製化</h4>
                <ul style="margin-top:5px; padding-left:20px; color:#555;">
                    <li><b>管理多位小孩：</b>
                        家中有多個寶貝嗎？點擊畫面最上方的<b>「小孩名字」</b>，即可快速切換不同小孩的帳戶。若要新增小孩，請至「家長設定」頁面操作。
                    </li>
                    <li><b>客製化獎品：</b>
                        覺得預設獎品不適合？進入<b>「家長設定」</b> > <b>「獎品內容」</b>，您可以自由修改每一級別的獎品名稱，或新增更多選項。
                    </li>
                    <li><b>共用 vs 獨立獎品庫：</b>
                        您可以選擇<b>「全家共用」</b>同一套獎品清單，或是切換為<b>「個別小孩設定」</b>，讓哥哥愛玩的電動、妹妹喜歡的貼紙分開管理！
                    </li>
                </ul>

                <h4 style="color:#4a90e2; margin-bottom:5px;">💰 點數怎麼來？</h4>
                <ul style="margin-top:0; padding-left:20px; color:#555;">
                    <li><b>家長發放：</b> 幫忙做家事、表現好，請爸媽從「家長設定」發點數！</li>
                    <li><b>銀行利息：</b> 每天晚上 <b>20:00</b> 只要有點數在身上，就會自動生利息 (複利滾存)。</li>
                    <li><b>市集拍賣：</b> 把不需要的卡片賣給兄弟姊妹或朋友。</li>
                </ul>

                <h4 style="color:#e67e22; margin-bottom:5px;">🎰 抽獎與保底機制</h4>
                <ul style="margin-top:0; padding-left:20px; color:#555;">
                    <li>每次抽獎消耗 <b>100 點(可客製化消耗點數)</b>。</li>
                    <li><b>小保底：</b> 連續 10 次沒抽到稀有(藍色)以上，第 10 次必中！(可客製化次數)</li>
                    <li><b>大保底：</b> 連續 100 次沒中神話/傳奇大獎，第 100 次必中！(可客製化次數)</li>
                    <li><span style="color:#e74c3c;">提示：</span> 運氣不好時別氣餒，保底進度會一直累積喔！</li>
                </ul>

                <h4 style="color:#27ae60; margin-bottom:5px;">🏦 銀行投資心法</h4>
                <ul style="margin-top:0; padding-left:20px; color:#555;">
                    <li><b>活存：</b> 隨時可用，利率較低 (預設 2%)。</li>
                    <li><b>定存：</b> 錢會被鎖住一段時間 (例如 30 天)，但利率超高！適合想存大錢買神話獎勵的人。</li>
                </ul>

                <h4 style="color:#8e44ad; margin-bottom:5px;">🤝 社交與市集</h4>
                <ul style="margin-top:0; padding-left:20px; color:#555;">
                    <li>可以在<b>市集</b>買別人的卡片，也能自己上架 (會收 10% 交易稅)。</li>
                    <li>同一家人的兄弟姊妹，可以直接互相購買，不需要加好友喔！</li>
                </ul>
            </div>
        `,
        width: 600,
        confirmButtonText: '收到，準備出發！',
        confirmButtonColor: '#4a90e2'
    });
}
function showChangelog() {
    Swal.fire({
        title: '📣 v2.0 重大更新公告',
        html: `
            <div style="text-align:left; font-size:0.9rem; line-height:1.6; max-height: 400px; overflow-y: auto; padding: 0 10px;">
                <div style="background:#e3f2fd; padding:10px; border-radius:8px; margin-bottom:10px; color:#0984e3;">
                    <strong>🔥 本次更新亮點：</strong><br>
                    全新開放「成就系統」、「跳蚤市集」與「交誼廣場」，讓賺點數與收集卡片更好玩！
                </div>

                <h4 style="color:#d63031; margin-bottom:5px; border-bottom:1px solid #eee; padding-bottom:5px;">🏆 成就系統 (New!)</h4>
                <ul style="margin-top:5px; padding-left:20px; color:#555;">
                    <li><b>解鎖徽章：</b>達成特定條件 (如：第一次登入、存款達標、連續摃龜...) 即可獲得專屬成就徽章。</li>
                    <li><b>特殊能力 (Buff)：</b>部分稀有成就會開啟強大被動效果！例如：
                        <ul style="font-size:0.85rem; color:#666; margin-top:3px;">
                            <li>💎 <b>超級富豪：</b>持有大量資產，定存利率提升。</li>
                            <li>🎰 <b>轉盤大師：</b>抽獎次數夠多，抽獎費用打 95 折。</li>
                            <li>🏦 <b>小小銀行家：</b>習慣定存，活存利率也能提升。</li>
                        </ul>
                    </li>
                </ul>

                <h4 style="color:#e67e22; margin-bottom:5px; border-bottom:1px solid #eee; padding-bottom:5px;">🏙️ 跳蚤市集 (New!)</h4>
                <ul style="margin-top:5px; padding-left:20px; color:#555;">
                    <li><b>自由買賣：</b>背包裡重複或不想要的卡片，可以自己訂價格上架拍賣。</li>
                    <li><b>跨玩家交易：</b>可以購買家人或好友上架的商品，互通有無。</li>
                    <li><b>交易手續費：</b>為了維持經濟平衡，商品售出時銀行會收取 <b>10% 手續費</b>喔！(定價時請精打細算)</li>
                </ul>

                <h4 style="color:#4a90e2; margin-bottom:5px; border-bottom:1px solid #eee; padding-bottom:5px;">💬 廣場與社交 (New!)</h4>
                <ul style="margin-top:5px; padding-left:20px; color:#555;">
                    <li><b>留言板：</b>可以在廣場發佈心情，還能攜帶 3 個你最自豪的「成就徽章」出來炫耀！</li>
                    <li><b>好友系統：</b>在留言板點擊名字即可發送好友邀請。</li>
                    <li><b>安全機制：</b>為了避免亂買東西，<b>需家長在設定中開啟「允許查看好友市集」</b>，你們才能在市集看到朋友賣的東西喔！(預設只能看到自家人的)</li>
                </ul>
                
                <p style="text-align:center; color:#aaa; font-size:0.8rem; margin-top:20px;">
                    感謝您的使用與回饋，祝大家親子同樂幸福美滿！ 🎉
                </p>
            </div>
        `,
        width: 600,
        confirmButtonText: '太棒了！',
        confirmButtonColor: '#e84393'
    });
}
// === 全域函式綁定 ===
window.switchChild = switchChild;
window.switchTab = switchTab;
window.startGacha = startGacha;
window.useItem = useItem;
window.addPoints = addPoints;
window.createDeposit = createDeposit;
window.redeemDeposit = redeemDeposit;
window.openSettings = openSettings;
window.saveSettings = saveSettings;
window.renderPrizeManager = renderPrizeManager;
window.addCustomPrize = addCustomPrize;
window.openAchievements = openAchievements;
window.showBadgeDetail = showBadgeDetail;
window.addNewChildFromSettings = addNewChildFromSettings;
window.toggleChildDropdown = function() { document.getElementById("childDropdown").classList.toggle("show"); };
window.closeSettings = function() { document.getElementById('settingsModal').style.display = 'none'; };
window.switchPrizeScope = function(scope) { updateScopeHint(scope); if(scope === 'individual' && (!data.tiers || data.tiers.length === 0)) data.tiers = JSON.parse(JSON.stringify(masterData.tiers)); renderPrizeManager(); };

// 綁定新功能
window.onPostClick = onPostClick;
window.submitPost = submitPost;
window.deletePost = deletePost; 
window.selectSocialBadge = selectSocialBadge;
window.showFriendRequests = showFriendRequests;
window.startSellItem = startSellItem;
window.cancelSellItem = cancelSellItem;
window.buyItem = buyItem;
window.renderFriendList = renderFriendList;
window.removeFriend = removeFriend; 
// 綁定使用指引與改版內容
window.showAppGuide = showAppGuide;
window.showChangelog = showChangelog;

// 其他
window.enterPin = function(num) { if(currentPinInput.length<4) { currentPinInput+=num; updatePinDisplay(); if(currentPinInput.length===4) { if(pinContext==='login') { if(currentPinInput===masterData.settings.adminPin) { closePin(); performSwitchTab('tab-admin'); } else { document.getElementById('pinTitle').style.color="red"; setTimeout(()=>{document.getElementById('pinTitle').style.color="#2d3436";},1000); currentPinInput=""; updatePinDisplay(); } } else if(pinContext==='setup') { masterData.settings.adminPin=currentPinInput; saveData(); Swal.fire('密碼已設定！','','success'); closePin(); } } } };
window.clearPin = function() { currentPinInput = currentPinInput.slice(0, -1); updatePinDisplay(); };
window.closePin = function() { document.getElementById('pinModal').style.display = 'none'; };
window.startSetPin = function() { pinContext = 'setup'; currentPinInput = ""; document.getElementById('pinTitle').innerText = "請設定新密碼 (4位數字)"; document.getElementById('pinModal').style.display = 'flex'; updatePinDisplay(); };
window.removePin = function() { Swal.fire({ title: '確定移除密碼？', icon: 'warning', showCancelButton: true }).then((r) => { if (r.isConfirmed) { masterData.settings.adminPin = null; saveData(); Swal.fire('已移除密碼', '', 'success'); } }); };
function updatePinDisplay() { document.getElementById('pinDisplay').innerText = "*".repeat(currentPinInput.length); }
window.forgotPin = async function() { if (currentUser && currentUser.isAnonymous) return Swal.fire('遊客帳號', '無法重置', 'info'); const { value: p } = await Swal.fire({ title: '重置密碼鎖', input: 'password', showCancelButton: true }); if (p) { try { await reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(currentUser.email, p)); masterData.settings.adminPin = null; saveData(); closePin(); Swal.fire('重置成功', '', 'success'); performSwitchTab('tab-admin'); } catch (e) { Swal.fire('密碼錯誤', '', 'error'); } } };
window.bindGuestAccount = function() { const e = document.getElementById('bindEmail').value, p = document.getElementById('bindPass').value; if(currentUser.isAnonymous) updateEmail(currentUser, e).then(() => updatePassword(currentUser, p)).then(() => { Swal.fire('轉正成功', '', 'success').then(()=>location.reload()); }).catch(err => Swal.fire('失敗', err.message, 'error')); };
window.triggerResetPassword = function() { if(currentUser.email) sendPasswordResetEmail(auth, currentUser.email).then(()=>Swal.fire('已寄出', '', 'success')); };
window.removePrize = function(t, r) { getCurrentTiers()[t].rewards.splice(r, 1); saveData(); renderPrizeManager(); };
window.editPrize = async function(t, r) { const tiers = getCurrentTiers(); const { value: n } = await Swal.fire({ input: 'text', inputValue: tiers[t].rewards[r], showCancelButton: true }); if(n) { tiers[t].rewards[r] = n; saveData(); renderPrizeManager(); } };
window.restoreDefaultPrizes = function() { if(masterData.settings.prizeScope==='individual') data.tiers=JSON.parse(JSON.stringify(DEFAULT_TIERS)); else masterData.tiers=JSON.parse(JSON.stringify(DEFAULT_TIERS)); saveData(); renderPrizeManager(); Swal.fire('已恢復', '', 'success'); };
window.writeToAuthor = async function() { const { value: t } = await Swal.fire({ input: 'textarea', showCancelButton: true }); if (t) { try { await addDoc(collection(db, "messages"), { content: t, sender: currentUser ? currentUser.email : "Guest", timestamp: new Date().toISOString() }); Swal.fire('已發送', '', 'success'); } catch (e) { Swal.fire('錯誤', e.message, 'error'); } } };
window.resetAll = function() { Swal.fire({ title: '確定清空重置？', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' }).then((r) => { if(r.isConfirmed) { masterData.children=[{name:"寶貝1",data:createNewChildData()}]; masterData.currentIdx=0; saveData(); switchChild(0); Swal.fire('已重置', '', 'success'); } }); };
window.exportData = function() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(masterData)], {type: "application/json"})); a.download = `backup.json`; a.click(); };
window.importData = function(input) { const f = input.files[0]; if (!f) return; const r = new FileReader(); r.onload = function(e) { try { const imp = JSON.parse(e.target.result); if(imp.children) masterData = imp; else { masterData.children = [{name:"寶貝1", data:imp}]; masterData.currentIdx=0; } saveData(); Swal.fire('還原成功', '', 'success'); switchChild(0); } catch(err) { Swal.fire('格式錯誤', '', 'error'); } }; r.readAsText(f); input.value = ''; };
window.renameChildSettings = async function(i) { const {value:n}=await Swal.fire({input:'text',inputValue:masterData.children[i].name,showCancelButton:true}); if(n){masterData.children[i].name=n; saveData(); renderSettingsChildList(); switchChild(masterData.currentIdx);} };
window.deleteChildSettings = function(i) { if(masterData.children.length<=1) return Swal.fire('無法刪除','至少保留一位','error'); masterData.children.splice(i,1); if(masterData.currentIdx>=masterData.children.length) masterData.currentIdx=0; saveData(); renderSettingsChildList(); switchChild(masterData.currentIdx); };