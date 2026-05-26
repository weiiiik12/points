// js/main.js
import { auth, db, initError } from './firebase-init.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged, sendPasswordResetEmail, updateEmail, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, addDoc, collection, query, where, orderBy, limit, onSnapshot, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { DEFAULT_TIERS, ACHIEVEMENT_LIST } from './constants.js';
import { DAILY_QUESTIONS } from './questions.js';

// SweetAlert Toast
const Toast = Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true
});

const loginErrorEl = document.getElementById('loginError');
if (initError && loginErrorEl) loginErrorEl.innerText = "系統初始化失敗，請檢查設定";

let currentUser = null;
let isGuest = false;
let userRef = null;

// === 快照暫存 ===
let unsubscribePosts = null; 
let unsubscribeRequests = null;
let unsubscribeMarket = null;
let lastPostSnapshot = null;   
let lastMarketSnapshot = null; 
let lastRequestSnapshot = null;

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
        answeredQuestions: [], 
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
    const qPosts = query(collection(db, "posts"), orderBy("timestamp", "desc"), limit(30));
    unsubscribePosts = onSnapshot(qPosts, (snapshot) => {
        lastPostSnapshot = snapshot;
        renderPostListUI(snapshot);
    });

    const qReqs = query(collection(db, "friend_requests"), where("toUid", "==", currentUser.uid), where("status", "==", "pending"));
    unsubscribeRequests = onSnapshot(qReqs, (snapshot) => {
        lastRequestSnapshot = snapshot; 
        checkFriendRequestsUI(snapshot); 
    });
    
    const qMarket = query(collection(db, "market_items"), where("status", "==", "active"), limit(50));
    unsubscribeMarket = onSnapshot(qMarket, (snapshot) => {
        lastMarketSnapshot = snapshot;
        renderMarketListUI(snapshot);
    });
    
    const qAcc = query(collection(db, "friend_requests"), where("fromUid", "==", currentUser.uid), where("status", "==", "accepted"));
    onSnapshot(qAcc, (snapshot) => {
        snapshot.forEach(d => {
            const req = d.data();
            if (req.fromChildIdx !== undefined && req.fromChildIdx !== masterData.currentIdx) return;

            if(!data.friends) data.friends = [];
            if(!data.friends.some(f => f.uid === req.toUid)) {
                const friendName = req.toName || `好友 (ID:${req.toUid.slice(0,5)})`;
                data.friends.push({ uid: req.toUid, name: friendName });
                saveData(); 
                Swal.fire('好友通知', `${friendName} 同意了你的邀請！`, 'success');
                renderFriendList(); 
                if(lastMarketSnapshot) renderMarketListUI(lastMarketSnapshot);
            }
            deleteDoc(doc(db, "friend_requests", d.id)); 
        });
    });
}

function checkFriendRequestsUI(snapshot) {
    const alertBox = document.getElementById('friendReqAlert');
    if(!alertBox) return;
    
    if (!snapshot || snapshot.empty) {
        alertBox.style.display = 'none';
        window.pendingRequests = [];
        return;
    }

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

function renderPostListUI(snapshot) {
    const postList = document.getElementById('postList');
    if(!postList) return; 
    if (!snapshot || snapshot.empty) { postList.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">還地區沒有人留言，快來搶頭香！</div>'; return; }
    
    let html = '';
    snapshot.forEach(doc => {
        const p = doc.data();
        const isSameAccount = (p.authorUid === currentUser.uid);
        const isSameChild = (p.authorChildIdx !== undefined) ? (p.authorChildIdx === masterData.currentIdx) : true;
        const isMe = isSameAccount && isSameChild; 
        const isFriend = data.friends.some(f => f.uid === p.authorUid); 
        const dateStr = new Date(p.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const shortId = p.authorUid.slice(0, 5);
        
        let badgeDisplay = '';
        if (p.badgeIcon) {
            if (Array.isArray(p.badgeIcon)) {
                badgeDisplay = p.badgeIcon.map(icon => `<span style="font-size:1.5rem; margin-right:2px; filter: drop-shadow(0 0 2px gold);">${icon}</span>`).join('');
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

function renderMarketListUI(snapshot) {
    const list = document.getElementById('marketList');
    const empty = document.getElementById('marketEmpty');
    if(!list || !snapshot) return;

    let html = '';
    let count = 0;
    
    snapshot.forEach(doc => {
        const item = doc.data();
        const isMyAccount = (item.sellerUid === currentUser.uid);
        const isMySelf = isMyAccount && (item.sellerChildIdx === masterData.currentIdx);
        const isFriend = data.friends.some(f => f.uid === item.sellerUid);
        
        let showItem = false;
        if (isMySelf || isMyAccount) showItem = true;
        else if (isFriend && masterData.settings.allowFriendMarket) showItem = true;

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
            empty.innerHTML = '市集有商品，但已設定為隱藏好友市集。<br>(只能看到自己與家人內部的物品)';
            empty.style.display = 'block';
        } else {
            list.innerHTML = ''; 
            empty.innerText = '目前沒有商品上架';
            empty.style.display = 'block'; 
        }
    }
    else { list.innerHTML = html; empty.style.display = 'none'; }
}

// === Auth 相關元素與事件處理綁定 ===
const loginOverlay = document.getElementById('loginOverlay');
const loadingMsg = document.getElementById('loadingMsg');
const errorMsg = document.getElementById('loginError');

function handleAuthError(error) {
    if(loadingMsg) loadingMsg.style.display = 'none';
    let msg = error.code;
    if (msg === 'auth/invalid-email') msg = "Email 格式不正確";
    else if (msg === 'auth/user-not-found' || msg === 'auth/wrong-password' || msg === 'auth/invalid-credential') msg = "帳號或密碼錯誤";
    else if (msg === 'auth/email-already-in-use') msg = "此 Email 已經註冊過了";
    else if (msg === 'auth/weak-password') msg = "密碼太弱 (至少需6位)";
    else if (msg === 'auth/missing-password') msg = "請輸入密碼";
    if(errorMsg) errorMsg.innerText = msg;
    Swal.fire({ icon: 'error', title: '登入失敗', text: msg });
}

// 👑 關鍵修正：將 Auth 觸發功能直接繫結至 window 全域，徹底解決按鈕結冰沒反應的問題！
window.handleLoginAction = function() {
    const email = document.getElementById('emailInput').value.trim(); 
    const password = document.getElementById('passwordInput').value;
    if(!email || !password) { if(errorMsg) errorMsg.innerText="請輸入帳號密碼"; return; }
    if(loadingMsg) loadingMsg.style.display = 'block'; if(errorMsg) errorMsg.innerText = "";
    signInWithEmailAndPassword(auth, email, password).then(()=>{ Toast.fire({ icon: 'success', title: '登入成功' }); }).catch(handleAuthError);
};

window.handleRegisterAction = function() {
    const email = document.getElementById('emailInput').value.trim(); 
    const password = document.getElementById('passwordInput').value;
    if(!email || !password) { if(errorMsg) errorMsg.innerText="請輸入帳號密碼"; return; }
    if(loadingMsg) loadingMsg.style.display = 'block'; if(errorMsg) errorMsg.innerText = "";
    createUserWithEmailAndPassword(auth, email, password).then(() => { Swal.fire('註冊成功！', '已為您自動登入', 'success'); }).catch(handleAuthError);
};

window.handleForgotPasswordAction = function() {
    const email = document.getElementById('emailInput').value.trim();
    if(!email) { if(errorMsg) errorMsg.innerText = "請輸入 Email 後再按忘記密碼"; return; }
    if(loadingMsg) loadingMsg.style.display = 'block'; if(errorMsg) errorMsg.innerText = "";
    sendPasswordResetEmail(auth, email).then(() => { if(loadingMsg) loadingMsg.style.display = 'none'; Swal.fire('重設信已寄出！', '請檢查您的信箱', 'success'); }).catch(handleAuthError);
};

window.handleGuestLoginAction = function() {
    if(loadingMsg) loadingMsg.style.display = 'block';
    signInAnonymously(auth).catch((error) => { handleAuthError(error); Swal.fire('注意', '請確認驗證功能開啟', 'warning'); });
};

// 幫 DOM 元素重新掛載監聽器（防線二）
setTimeout(() => {
    const btnL = document.getElementById('btnLogin'); if(btnL) btnL.onclick = window.handleLoginAction;
    const btnR = document.getElementById('btnRegister'); if(btnR) btnR.onclick = window.handleRegisterAction;
    const btnF = document.getElementById('btnForgotPassword'); if(btnF) btnF.onclick = window.handleForgotPasswordAction;
    const btnG = document.getElementById('btnGuest'); if(btnG) btnG.onclick = window.handleGuestLoginAction;
    const btnOut = document.getElementById('btnLogout'); if(btnOut) {
        btnOut.onclick = function() {
            Swal.fire({ title: '確定要登出嗎？', icon: 'question', showCancelButton: true, confirmButtonText: '登出', cancelButtonText: '取消' })
                .then((result) => { if (result.isConfirmed) signOut(auth).then(() => { location.reload(); }); });
        };
    }
}, 200);

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        userRef = doc(db, "users", user.uid);
        isGuest = user.isAnonymous;
        const userEmailEl = document.getElementById('userEmail');
        if(userEmailEl) userEmailEl.innerText = isGuest ? "👻 遊客 (ID:" + user.uid.slice(0,5) + ")" : user.email;
        if(loginOverlay) loginOverlay.style.display = 'none';
        await loadDataFromCloud();
        setInterval(updateTimerAndDeposits, 1000);
    } else {
        if(loginOverlay) loginOverlay.style.display = 'flex';
        if(loadingMsg) loadingMsg.style.display = 'none';
    }
});

// === UI 控制邏輯 ===
let currentPinInput = "";
let pinContext = 'login'; 

function checkVocabGameReward() {
    const mainUrlParams = new URLSearchParams(window.location.search);
    if (mainUrlParams.has('completedGame') && mainUrlParams.get('completedGame') === 'vocab' && currentUser && data) {
        const gamePoints = parseInt(mainUrlParams.get('points') || '0');
        const targetIdx = parseInt(mainUrlParams.get('idx') || '0');
        const incomingAuth = mainUrlParams.get('auth');
        const expectedAuth = btoa(`hago_${gamePoints}_${currentUser.uid}`);

        if (incomingAuth === expectedAuth && gamePoints > 0) {
            if (masterData.children && masterData.children[targetIdx]) {
                const tokenReason = `🎮 單字挑戰過關獎勵(驗證碼:${incomingAuth.slice(0,8)})`;
                const alreadyClaimed = masterData.children[targetIdx].data.history.some(h => h.reason === tokenReason);

                if (!alreadyClaimed) {
                    masterData.children[targetIdx].data.score += gamePoints;
                    const now = new Date();
                    const d = `${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
                    masterData.children[targetIdx].data.history.push({ date: d, reason: tokenReason, amount: gamePoints });

                    saveData();
                    setTimeout(() => { if (typeof updateUI === 'function') updateUI(); }, 100);

                    Swal.fire({
                        title: '✨ 跨界挑戰成功！',
                        html: `成功同步單字遊戲成果！<br>已幫 <b>${masterData.children[targetIdx].name}</b> 存入 <b>${gamePoints}</b> 點數！`,
                        icon: 'success',
                        confirmButtonColor: '#6c5ce7'
                    }).then(() => {
                        window.history.replaceState({}, document.title, window.location.pathname);
                    });
                }
            }
        }
    }
}

function switchChild(idx) {
    if(idx < 0 || idx >= masterData.children.length) idx = 0;
    masterData.currentIdx = idx;
    data = masterData.children[idx].data;
    if(!data.friends) data.friends = [];

    const switcherEl = document.getElementById('childSwitcher');
    if(switcherEl) switcherEl.innerText = masterData.children[idx].name + " ▼";
    
    const dropdownEl = document.getElementById("childDropdown");
    if(dropdownEl) dropdownEl.innerHTML = masterData.children.map((c, i) => `<div onclick="switchChild(${i})">${c.name} ${i === masterData.currentIdx ? '✔' : ''}</div>`).join('');
    
    currentDisplayedScore = data.score;
    const scoreDisplayEl = document.getElementById('scoreDisplay');
    if(scoreDisplayEl) scoreDisplayEl.innerText = data.score;
    
    checkDailyInterest();
    renderFriendList();
    
    if(lastPostSnapshot) renderPostListUI(lastPostSnapshot);
    if(lastMarketSnapshot) renderMarketListUI(lastMarketSnapshot);
    if(lastRequestSnapshot) checkFriendRequestsUI(lastRequestSnapshot); 

    if (typeof window.renderDailyQuizSystem === 'function') {
        window.renderDailyQuizSystem(); 
    }
    
    checkVocabGameReward(); 
    updateUI();
}

function switchTab(id) {
    const pinModalEl = document.getElementById('pinModal');
    if(id === 'tab-admin' && masterData.settings.adminPin) {
        pinContext = 'login';
        const pinTitleEl = document.getElementById('pinTitle');
        if(pinTitleEl) pinTitleEl.innerText = "請輸入家長密碼";
        if(pinModalEl) pinModalEl.style.display = 'flex';
        currentPinInput = "";
        updatePinDisplay();
        return;
    }
    performSwitchTab(id);
}

function performSwitchTab(id) {
    document.querySelectorAll('.section').forEach(d => d.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    const sectionEl = document.getElementById(id);
    if(sectionEl) sectionEl.classList.add('active');
    
    const buttons = document.querySelectorAll('.nav-btn');
    const tabs = ['tab-gacha', 'tab-bag', 'tab-social', 'tab-market', 'tab-bank', 'tab-admin'];
    const idx = tabs.indexOf(id);
    if(idx !== -1 && buttons[idx]) buttons[idx].classList.add('active');
    
    if(id === 'tab-social') renderFriendList();
}

function updateUI() {
    if(!data) return;
    const scoreDisplayEl = document.getElementById('scoreDisplay');
    if (currentDisplayedScore !== data.score) {
        animateScore(currentDisplayedScore, data.score, 1000);
        currentDisplayedScore = data.score;
    } else {
        if(scoreDisplayEl) scoreDisplayEl.innerText = data.score;
    }

    const buffs = getBuffedSettings();

    let dRateHtml = parseFloat((masterData.settings.dailyInterest * 100).toFixed(2)) + '%';
    const dispDailyRateEl = document.getElementById('dispDailyRate');
    if(dispDailyRateEl) dispDailyRateEl.innerHTML = dRateHtml;
    
    const dispInterestHourEl = document.getElementById('dispInterestHour');
    if(dispInterestHourEl) dispInterestHourEl.innerText = masterData.settings.interestHour;

    let fRateHtml = parseFloat((masterData.settings.fixedDepositRate * 100).toFixed(2)) + '%';
    const dispFixedRateEl = document.getElementById('dispFixedRate');
    if(dispFixedRateEl) dispFixedRateEl.innerHTML = fRateHtml;
    
    const dispFixedDaysEl = document.getElementById('dispFixedDays');
    if(dispFixedDaysEl) dispFixedDaysEl.innerText = masterData.settings.fixedDepositDays;
    
    const dailyRate = buffs.effectiveDailyRate;
    const todayEst = Math.floor(data.score * dailyRate);
    const estInterestValEl = document.getElementById('estInterestVal');
    if(estInterestValEl) estInterestValEl.innerText = todayEst;
    
    const estInterestFormulaEl = document.getElementById('estInterestFormula');
    if(estInterestFormulaEl) estInterestFormulaEl.innerText = `(目前點數 ${data.score} × 利率 ${dailyRate.toFixed(4)} = ${todayEst})`;

    const bagList = document.getElementById('bagList'); 
    if(bagList) {
        bagList.innerHTML = '';
        const bagEmptyEl = document.getElementById('bagEmpty');
        if (data.bag.length === 0) {
            if(bagEmptyEl) bagEmptyEl.style.display = 'block';
        } else {
            if(bagEmptyEl) bagEmptyEl.style.display = 'none';
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
    }
    
    const histList = document.getElementById('historyList');
    if(histList) histList.innerHTML = data.history.slice().reverse().map(h => `<div style="border-bottom:1px solid #eee; padding:8px 0;">${h.date} - ${h.reason} <span style="float:right; font-weight:bold; color:${h.amount>0?'#00b894':'#e17055'}">${h.amount}</span></div>`).join('');
    
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
    if(!obj) return;
    
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

function startGacha() {
    const buffs = getBuffedSettings();
    const cost = buffs.effectiveCost;
    if (data.score < cost) return;
    if (masterData.settings.prizeScope === 'individual' && !data.tiers) data.tiers = JSON.parse(JSON.stringify(masterData.tiers));
    data.score -= cost; saveData();
}

function selectSocialBadge() {
    const unlocked = ACHIEVEMENT_LIST.filter(ach => data.achievements.includes(ach.id));
    if (unlocked.length === 0) return Swal.fire('還沒有徽章', '快去解鎖成就吧！', 'info');
    let html = unlocked.map(ach => `<div id="badge-opt-${ach.icon}" class="badge-option" onclick="toggleBadgeSelection('${ach.icon}')">${ach.icon}</div>`).join('');
    Swal.fire({ title: '選擇徽章', html: html });
}
window.selectSocialBadge = selectSocialBadge;

function submitPost() {
    const input = document.getElementById('postInput');
    if(!input) return;
    const content = input.value.trim();
    if (!content) return;
    const childName = masterData.children[masterData.currentIdx].name;
    addDoc(collection(db, "posts"), { content: content, authorName: childName, authorUid: currentUser.uid, authorChildIdx: masterData.currentIdx, badgeIcon: currentSocialBadges, timestamp: Date.now() }).then(() => { input.value = ''; });
}

window.deletePost = function(postId) { deleteDoc(doc(db, "posts", postId)); }
function onPostClick(uid, name, targetChildIdx) { if (uid === currentUser.uid) return; sendFriendRequest(uid, "加好友吧", targetChildIdx, name); }
function sendFriendRequest(targetUid, msg, targetChildIdx, targetName) {
    const myName = masterData.children[masterData.currentIdx].name;
    addDoc(collection(db, "friend_requests"), { fromUid: currentUser.uid, fromChildIdx: masterData.currentIdx, fromName: myName, toUid: targetUid, toChildIdx: targetChildIdx, toName: targetName, message: msg, status: 'pending', timestamp: Date.now() });
}
function showFriendRequests() {}
async function acceptFriend(req, friendData) {}
function renderFriendList() { const div = document.getElementById('myFriendList'); if (div) div.innerHTML = ''; }
window.removeFriend = function(index) {}

function updateTimerAndDeposits() {}
function createDeposit() {}
function redeemDeposit(id) {}
window.openAchievements = function() {};
window.showBadgeDetail = function() {};

function useItem(idx) {
    if(!data) return;
    const item = data.bag[idx];
    data.history.push({ date: new Date().toLocaleDateString(), reason: `使用: ${item.reward}`, amount: 0 });
    data.bag.splice(idx, 1); saveData();
    Swal.fire('使用成功', `已向老師登記使用：${item.reward}`, 'success');
}

window.addPoints = function() {};
window.openSettings = function() {};
window.saveSettings = function() {};
window.renderSettingsChildList = function() {};
window.addNewChildFromSettings = function() {};
window.renderPrizeManager = function() {};
window.addCustomPrize = function() {};
window.fireConfetti = function() {};
window.showAppGuide = function() {};
window.showChangelog = function() {};

// === 全域生命週期綁定 ===
window.switchChild = switchChild;
window.switchTab = switchTab;
window.useItem = useItem;
window.submitPost = submitPost;
window.closeSettings = function() { document.getElementById('settingsModal').style.display = 'none'; };
window.toggleChildDropdown = function() { document.getElementById("childDropdown").classList.toggle("show"); };
window.enterPin = function(num) {};
window.clearPin = function() {};
window.closePin = function() {};
window.startSetPin = function() {};
window.removePin = function() {};
window.forgotPin = function() {};
window.bindGuestAccount = function() {};
window.triggerResetPassword = function() {};
window.removePrize = function(t, r) {};
window.editPrize = function(t, r) {};
window.restoreDefaultPrizes = function() {};
window.writeToAuthor = function() {};
window.resetAll = function() {};
window.exportData = function() {};
window.importData = function(input) {};
window.renameChildSettings = function(i) {};
window.deleteChildSettings = function(i) {};

// ==========================================================================
// 🎮 挑戰小學堂核心邏輯模組（限制 5 題防刷版）
// ==========================================================================
const CONST_DAILY_QUIZZES = [
    { q: "請問 'School' 的中文是什麼？", a: ["蘋果", "學校", "老師", "書本"], correct: 1 },
    { q: "老師常說的 'Listen carefully' 是什麼意思？", a: ["大聲朗讀", "仔細聆聽", "請回座位"], correct: 1 },
    { q: "英文句子開頭的第一個字母通常要如何處理？", a: ["維持小寫", "全部加底線", "一定要大寫"], correct: 2 },
    { q: "英文單字 'Beautiful' 的意思是什麼？", a: ["美麗的", "醜陋的", "帥氣的"], correct: 0 },
    { q: "星期三的英文縮寫是哪一個？", a: ["Tue.", "Wed.", "Thu."], correct: 1 },
    { q: "安親班的英文最接近哪一個？", a: ["After-school care center", "Library", "Gym"], correct: 0 }
];

window.renderDailyQuizSystem = function() {
    const container = document.getElementById('quizContainer');
    if (!container || !data) return;

    if (data.dailyQuizCount === undefined) data.dailyQuizCount = 0;
    if (!data.dailyQuizDate) data.dailyQuizDate = new Date().toDateString();

    const todayStr = new Date().toDateString();
    if (data.dailyQuizDate !== todayStr) {
        data.dailyQuizCount = 0;
        data.dailyQuizDate = todayStr;
        saveData();
    }

    if (data.dailyQuizCount >= 5) {
        container.innerHTML = `
            <div class="quiz-finish-msg" style="text-align: center; color: #ef4444; font-weight: bold; font-size: 1.05rem; padding: 15px 0;">
                🎉 今天已回答完畢~ 明天再加油!
            </div>
            <div style="text-align:center; font-size:0.8rem; color:#94a3b8; margin-top:5px;">
                (每日答題上限：5 / 5 題)
            </div>
        `;
        return;
    }

    const randomIdx = Math.floor(Math.random() * CONST_DAILY_QUIZZES.length);
    const quiz = CONST_DAILY_QUIZZES[randomIdx];

    let optionsHtml = quiz.a.map((opt, idx) => `
        <button class="btn-school-action" 
                style="background:#ffffff; color:#475569; border:1px solid #cbd5e1; margin-bottom:8px; text-align:left; padding:15px; font-weight:normal; width:100%; border-radius:10px; cursor:pointer;"
                onclick="submitDailyQuizAnswer(${randomIdx}, ${idx})">
            ${idx + 1}. ${opt}
        </button>
    `).join('');

    container.innerHTML = `
        <div style="font-size:0.95rem; font-weight:bold; color:#1e293b; margin-bottom:12px; text-align:left;">
            <span style="background:#6c5ce7; color:white; padding:2px 6px; border-radius:4px; font-size:0.75rem; margin-right:5px;">
                第 ${data.dailyQuizCount + 1} 題
            </span> 
            ${quiz.q}
        </div>
        <div style="display:flex; flex-direction:column;">
            ${optionsHtml}
        </div>
    `;
};

window.submitDailyQuizAnswer = function(quizIdx, selectedIdx) {
    if (!data) return;
    const quiz = CONST_DAILY_QUIZZES[quizIdx];

    if (selectedIdx === quiz.correct) {
        data.score += 10;
        data.dailyQuizCount += 1;
        
        const now = new Date();
        const d = `${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        data.history.push({ date: d, reason: `挑戰小學堂：答對每日問答`, amount: 10 });

        saveData();

        Swal.fire({
            icon: 'success', title: '答對了！', text: '太棒了，獲得點數 10 點！💰', timer: 1500, showConfirmButton: false
        }).then(() => { renderDailyQuizSystem(); });
    } else {
        data.dailyQuizCount += 1;
        saveData();
        Swal.fire({
            icon: 'error', title: '答錯囉！', text: '沒關係，下一題再接再厲！💪', timer: 1500, showConfirmButton: false
        }).then(() => { renderDailyQuizSystem(); });
    }
};

// ==========================================================================
// 📚 分科挑戰 - 狀態控制與空白點擊處理邏輯
// ==========================================================================
let currentSelectedGrade = 'g1';
let currentSelectedSubject = 'math';

window.selectGrade = function(btnElement, gradeCode) {
    const siblings = document.querySelectorAll('#gradeFilterGroup .btn-filter-opt');
    siblings.forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');
    currentSelectedGrade = gradeCode;
};

window.selectSubject = function(btnElement, subjectCode) {
    const siblings = document.querySelectorAll('#subjectFilterGroup .btn-filter-opt');
    siblings.forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');
    currentSelectedSubject = subjectCode;
};

window.handlePlaceholderClick = function(levelNum) {
    let gradeName = currentSelectedGrade === 'g1' ? '一年級' : currentSelectedGrade === 'g2' ? '二年級' : '三年級';
    let subName = currentSelectedSubject === 'math' ? '數學' : currentSelectedSubject === 'eng' ? '英文' : '國語';

    Swal.fire({
        title: `🎯 ${gradeName} - ${subName}`,
        text: `你點擊了第 ${levelNum} 關！本關卡題目內容 Winnie 老師正在全力調整中，敬請期待喔！✨`,
        icon: 'info', confirmButtonText: '好，我會認真準備！'
    });
};

// 🎟️ 老師兌換序號
const PROMO_CODES = {
    "GOODJOB888": { points: 100, reason: "課堂表現優異兌換" },
    "ENGLISHKING": { points: 150, reason: "英文單字比賽獲勝" },
    "COMPLETE100": { points: 50, reason: "作業認真完成獎勵" }
};
window.redeemPromoCode = function() {
    const input = document.getElementById('promoCodeInput');
    if (!input) return;
    const code = input.value.trim().toUpperCase();
    if (!code) return Swal.fire('提示', '請輸入兌換碼！', 'info');

    if (PROMO_CODES[code]) {
        const reward = PROMO_CODES[code];
        const alreadyUsed = data.history.some(h => h.reason.includes(`兌換碼:${code}`));
        if (alreadyUsed) return Swal.fire('注意', '這個兌換碼你已經領過囉！', 'warning');

        data.score += reward.points;
        const now = new Date();
        const d = `${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        data.history.push({ date: d, reason: `使用序號兌換碼:${code} (${reward.reason})`, amount: reward.points });

        saveData(); input.value = '';
        Swal.fire({ title: '🎟️ 兌換成功！', html: `獲得獎勵：<b>${reward.points}</b> 點！`, icon: 'success' });
    } else {
        Swal.fire('錯誤', '找不到這個兌換碼喔！', 'error');
    }
};
