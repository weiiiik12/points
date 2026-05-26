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

// === Auth 相關 ===
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

const btnLogin = document.getElementById('btnLogin');
if(btnLogin) {
    btnLogin.addEventListener('click', () => {
        const email = document.getElementById('emailInput').value; const password = document.getElementById('passwordInput').value;
        if(!email || !password) { if(errorMsg) errorMsg.innerText="請輸入帳號密碼"; return; }
        if(loadingMsg) loadingMsg.style.display = 'block'; if(errorMsg) errorMsg.innerText = "";
        signInWithEmailAndPassword(auth, email, password).then(()=>{ Toast.fire({ icon: 'success', title: '登入成功' }); }).catch(handleAuthError);
    });
}
const btnRegister = document.getElementById('btnRegister');
if(btnRegister) {
    btnRegister.addEventListener('click', () => {
        const email = document.getElementById('emailInput').value; const password = document.getElementById('passwordInput').value;
        if(!email || !password) { if(errorMsg) errorMsg.innerText="請輸入帳號密碼"; return; }
        if(loadingMsg) loadingMsg.style.display = 'block'; if(errorMsg) errorMsg.innerText = "";
        createUserWithEmailAndPassword(auth, email, password).then(() => { Swal.fire('註冊成功！', '已為您自動登入', 'success'); }).catch(handleAuthError);
    });
}
const btnForgotPassword = document.getElementById('btnForgotPassword');
if(btnForgotPassword) {
    btnForgotPassword.addEventListener('click', () => {
        const email = document.getElementById('emailInput').value;
        if(!email) { if(errorMsg) errorMsg.innerText = "請輸入 Email 後再按忘記密碼"; return; }
        if(loadingMsg) loadingMsg.style.display = 'block'; if(errorMsg) errorMsg.innerText = "";
        sendPasswordResetEmail(auth, email).then(() => { if(loadingMsg) loadingMsg.style.display = 'none'; Swal.fire('重設信已寄出！', '請檢查您的信箱', 'success'); }).catch(handleAuthError);
    });
}
const btnGuest = document.getElementById('btnGuest');
if(btnGuest) {
    btnGuest.addEventListener('click', () => {
        if(loadingMsg) loadingMsg.style.display = 'block';
        signInAnonymously(auth).catch((error) => { handleAuthError(error); Swal.fire('注意', '請確認驗證功能開啟', 'warning'); });
    });
}
const btnLogout = document.getElementById('btnLogout');
if(btnLogout) {
    btnLogout.addEventListener('click', () => {
        Swal.fire({ title: '確定要登出嗎？', icon: 'question', showCancelButton: true, confirmButtonText: '登出', cancelButtonText: '取消' })
            .then((result) => { if (result.isConfirmed) signOut(auth).then(() => { location.reload(); }); });
    });
}

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

    renderDailyQuiz(); 
    checkVocabGameReward(); // 確保在這裡才安全檢查遊戲點數
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

    // 顯示利率
    let dRateHtml = parseFloat((masterData.settings.dailyInterest * 100).toFixed(2)) + '%';
    if (buffs.effectiveDailyRate > masterData.settings.dailyInterest) {
        dRateHtml = `<span style="text-decoration:line-through; font-size:0.8em; color:#ddd;">${dRateHtml}</span> <span style="color:#ffeaa7;">${(buffs.effectiveDailyRate*100).toFixed(2)}%</span><span class="buff-tag">VIP</span>`;
    }
    const dispDailyRateEl = document.getElementById('dispDailyRate');
    if(dispDailyRateEl) dispDailyRateEl.innerHTML = dRateHtml;
    
    const dispInterestHourEl = document.getElementById('dispInterestHour');
    if(dispInterestHourEl) dispInterestHourEl.innerText = masterData.settings.interestHour;

    let fRateHtml = parseFloat((masterData.settings.fixedDepositRate * 100).toFixed(2)) + '%';
    if (buffs.effectiveFixedRate > masterData.settings.fixedDepositRate) {
        fRateHtml = `<span style="text-decoration:line-through; font-size:0.8em; color:#ddd;">${fRateHtml}</span> <span style="color:#ffeaa7;">${(buffs.effectiveFixedRate*100).toFixed(2)}%</span><span class="buff-tag">黑卡</span>`;
    }
    const dispFixedRateEl = document.getElementById('dispFixedRate');
    if(dispFixedRateEl) dispFixedRateEl.innerHTML = fRateHtml;
    
    const dispFixedDaysEl = document.getElementById('dispFixedDays');
    if(dispFixedDaysEl) dispFixedDaysEl.innerText = masterData.settings.fixedDepositDays;
    
    // 預估利息
    const dailyRate = buffs.effectiveDailyRate;
    const todayEst = Math.floor(data.score * dailyRate);
    const estInterestValEl = document.getElementById('estInterestVal');
    if(estInterestValEl) estInterestValEl.innerText = todayEst;
    
    const estInterestFormulaEl = document.getElementById('estInterestFormula');
    if(estInterestFormulaEl) estInterestFormulaEl.innerText = `(目前點數 ${data.score} × 利率 ${dailyRate.toFixed(4)} = ${todayEst})`;

    // 機率與保底
    const currentTiers = getCurrentTiers();
    currentTiers.forEach((t, i) => { const el = document.getElementById(`label-prob${i}`); if(el) el.innerText = t.chance + "%"; });
    
    const limitRareEl = document.getElementById('limitRare');
    if(limitRareEl) limitRareEl.innerText = masterData.settings.pityRareThreshold;
    
    let legLimitHtml = masterData.settings.pityLegendaryThreshold;
    if (buffs.effectivePityLeg < masterData.settings.pityLegendaryThreshold) {
        legLimitHtml = `<span style="text-decoration:line-through; color:#aaa;">${legLimitHtml}</span> <span style="color:#d63031; font-weight:bold;">${buffs.effectivePityLeg}</span>`;
    }
    const limitLegEl = document.getElementById('limitLeg');
    if(limitLegEl) limitLegEl.innerHTML = legLimitHtml;
    
    const limitTargetNameEl = document.getElementById('limitTargetName');
    if(limitTargetNameEl) limitTargetNameEl.innerText = (masterData.settings.pityBigTarget == 4) ? "傳奇+" : "神話";
    
    const pityRareDispEl = document.getElementById('pityRareDisp');
    if(pityRareDispEl) pityRareDispEl.innerText = data.pityRare;
    
    const pityLegDispEl = document.getElementById('pityLegDisp');
    if(pityLegDispEl) pityLegDispEl.innerText = data.pityLegendary;

    // 抽獎按鈕
    const btn = document.getElementById('btnDraw');
    if(btn) {
        const cost = buffs.effectiveCost;
        let btnText = `啟動轉盤 (-${cost}點)`;
        if (cost < masterData.settings.gachaCost) btnText += " 🔥優惠中";
        
        if (data.score < cost) { btn.innerText = `點數不足 (缺${cost - data.score})`; btn.disabled = true; } 
        else { btn.innerText = btnText; btn.disabled = false; }
    }
    
    // 背包
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
    
    // 歷史紀錄
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

// === 抽獎 ===
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
    if(btnDraw) btnDraw.disabled = true;
    if(finalResult) finalResult.innerHTML = '<span style="color:#999; font-size:1.5rem">🎰 轉動中...</span>';
    
    let currentIdx = 0; const totalLoops = 5; 
    const boxes = document.querySelectorAll('.roulette-box');
    let speed = 40; let stepCount = 0; let totalSteps = (totalLoops * 6) + resultTier.index; 
    
    function step() {
        boxes.forEach(b => b.classList.remove('active'));
        const activeBox = document.getElementById(`box-${currentIdx}`);
        if(activeBox) activeBox.classList.add('active');
        playBeep(800, 'square', 0.03);
        if (stepCount >= totalSteps) {
            playBeep(600, 'sine', 0.1); 
            let finalReward = "銘謝惠顧";
            if (resultTier.rewards && resultTier.rewards.length > 0) {
                finalReward = resultTier.rewards[Math.floor(Math.random() * resultTier.rewards.length)];
            }
            if(finalResult) finalResult.innerHTML = `<h2 style="color:${resultTier.color}">${resultTier.name}級獎勵！</h2><p style="font-weight:bold; font-size:1.3rem; color:#333;">${finalReward}</p>`;
            data.bag.unshift({ tierName: resultTier.name, color: resultTier.color, reward: finalReward, id: Date.now() });
            saveData();
            if(btnDraw) btnDraw.disabled = false; 
            updateUI();
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

// === 社交功能 ===
function selectSocialBadge() {
    const unlocked = ACHIEVEMENT_LIST.filter(ach => data.achievements.includes(ach.id));
    if (unlocked.length === 0) return Swal.fire('還沒有徽章', '快去解鎖成就吧！', 'info');

    let html = unlocked.map(ach => `<div id="badge-opt-${ach.icon}" class="badge-option ${currentSocialBadges.includes(ach.icon) ? 'selected' : ''}" onclick="toggleBadgeSelection('${ach.icon}')">${ach.icon}</div>`).join('');
    
    window.tempSelectedBadges = [...currentSocialBadges];
    window.toggleBadgeSelection = function(icon) {
        const idx = window.tempSelectedBadges.indexOf(icon);
        if(idx > -1) {
            window.tempSelectedBadges.splice(idx, 1);
            const optEl = document.getElementById(`badge-opt-${icon}`);
            if(optEl) optEl.classList.remove('selected');
        } else {
            if(window.tempSelectedBadges.length >= 3) {
                const removed = window.tempSelectedBadges.shift();
                const remEl = document.getElementById(`badge-opt-${removed}`);
                if(remEl) remEl.classList.remove('selected');
            }
            window.tempSelectedBadges.push(icon);
            const optEl = document.getElementById(`badge-opt-${icon}`);
            if(optEl) optEl.classList.add('selected');
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
            const myBadgeEl = document.getElementById('mySocialBadge');
            if(myBadgeEl) myBadgeEl.innerText = currentSocialBadges[0] || '😊';
        }
    });
}
window.selectSocialBadge = selectSocialBadge;

function submitPost() {
    const input = document.getElementById('postInput');
    if(!input) return;
    const content = input.value.trim();
    if (!content) return Swal.fire('請輸入內容', '', 'warning');
    
    const childName = masterData.children[masterData.currentIdx].name;

    addDoc(collection(db, "posts"), {
        content: content,
        authorName: childName,
        authorUid: currentUser.uid,
        authorChildIdx: masterData.currentIdx, 
        badgeIcon: currentSocialBadges, 
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
    if (data.friends.some(f => f.uid === uid)) return Swal.fire('你們已經是朋友囉', '', 'info');

    Swal.fire({
        title: `想跟 ${name} 當朋友嗎？`, input: 'text', inputLabel: '傳送打招呼訊息', inputValue: '很高興認識你，想跟你做朋友！', showCancelButton: true, confirmButtonText: '送出邀請 💌'
    }).then((result) => {
        if (result.isConfirmed && result.value) {
            sendFriendRequest(uid, result.value, targetChildIdx, name);
        }
    });
}

function sendFriendRequest(targetUid, msg, targetChildIdx, targetName) {
    const myName = masterData.children[masterData.currentIdx].name;
    addDoc(collection(db, "friend_requests"), {
        fromUid: currentUser.uid,
        fromChildIdx: masterData.currentIdx, 
        fromName: myName,
        toUid: targetUid,
        toChildIdx: targetChildIdx, 
        toName: targetName, 
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
    if(lastMarketSnapshot) renderMarketListUI(lastMarketSnapshot);
}

function renderFriendList() {
    const div = document.getElementById('myFriendList');
    if (!div) return;
    if (!data.friends || data.friends.length === 0) {
        div.innerHTML = '<span style="font-size:0.8rem; color:#aaa;">還沒有好友，去留言板交朋友吧！</span>';
        return;
    }
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
        title: `解除好友？`, text: `確定要刪除 ${friend.name} 嗎？`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d63031', confirmButtonText: '刪除'
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
        title: '拍賣上架 (公開)', text: '上架後，你自己和好友都能看到喔！', input: 'number', inputAttributes: { min: 1, step: 1 }, showCancelButton: true
    }).then((res) => {
        if(res.isConfirmed && res.value) {
            const price = parseInt(res.value);
            if(price<=0) return Swal.fire('錯誤', '價格必須大於 0', 'error');
            const tax = Math.floor(price*0.1);
            
            Swal.fire({ 
                title:`確認售價 ${price}`, html: `手續費 (10%)：<b style="color:red">-${tax}</b><br>實拿：<b style="color:#00b894">${price-tax}</b>`, icon:'warning', showCancelButton:true, confirmButtonText:'確認上架' 
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
        if(!itemSnap.exists() || itemSnap.data().status !== 'active') return Swal.fire('來晚了', '商品已被買走或下架', 'error');
        
        const itemData = itemSnap.data().itemData;
        await updateDoc(itemRef, { status: 'sold', buyerUid: currentUser.uid });
        
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

// === 銀行 ===
function updateTimerAndDeposits() {
    if(!data) return;
    const now = new Date();
    let target = new Date(now); target.setHours(masterData.settings.interestHour, 0, 0, 0); if (now > target) target.setDate(target.getDate() + 1);
    const diff = target - now;
    const h = Math.floor((diff % (86400000)) / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
    
    const timerEl = document.getElementById('interestTimer');
    if(timerEl) timerEl.innerText = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    
    const list = document.getElementById('depositList');
    const empty = document.getElementById('depositEmpty');
    if(!list) return;
    if (data.deposits.length === 0) { list.innerHTML = ''; if(empty) empty.style.display = 'block'; return; }
    if(empty) empty.style.display = 'none';
    
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
    const inputEl = document.getElementById('depositAmount');
    if(!inputEl) return;
    const amt = parseInt(inputEl.value);
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

// === 成就與物品 ===
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
    if (buffText) buffHtml = masterData.settings.enableBuffs ? `<div style="background:#e8f8f5; color:#27ae60; padding:8px; border-radius:5px; margin-top:10px; font-weight:bold; font-size:0.9rem; border:1px dashed #2ecc71;">${buffText}</div>` : `<div style="background:#f1f2f6; color:#95a5a6; padding:8px; border-radius:5px; margin-top:10px; font-size:0.8rem;">(特殊能力已被停用)</div>`;

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
                Swal.fire('已使用', '記得找老師兌換喔！', 'success');
            }
            data.bag.splice(idx, 1); saveData();
        }
    });
}

function addPoints() {
    const reasonInEl = document.getElementById('reasonIn');
    const pointsInEl = document.getElementById('pointsIn');
    if(!reasonInEl || !pointsInEl) return;
    const r = reasonInEl.value, p = parseInt(pointsInEl.value);
    if(!r || !p) return Swal.fire('提示', "請輸入原因和點數", 'info');
    data.score += p; 
    data.history.push({ date: new Date().toLocaleDateString(), reason: r, amount: p });
    saveData(); checkAchievements(); 
    Toast.fire({ icon: 'success', title: p >= 0 ? '點數已發放' : '點數已扣除' });
    reasonInEl.value = ''; pointsInEl.value = '';
}

// === 管理功能 ===
function openSettings() {
    const settingsModalEl = document.getElementById('settingsModal');
    if(settingsModalEl) settingsModalEl.style.display = 'block';
    
    const fields = ['setDailyRate', 'setInterestHour', 'setFixedRate', 'setFixedDays', 'setPityRare', 'setPityLeg', 'setGachaCost'];
    const values = [masterData.settings.dailyInterest, masterData.settings.interestHour, masterData.settings.fixedDepositRate, masterData.settings.fixedDepositDays, masterData.settings.pityRareThreshold, masterData.settings.pityLegendaryThreshold, masterData.settings.gachaCost];
    fields.forEach((f, idx) => { const el = document.getElementById(f); if(el) el.value = values[idx]; });
    
    const setPityTargetEl = document.getElementById('setPityTarget');
    if(setPityTargetEl) setPityTargetEl.value = masterData.settings.pityBigTarget || 5;
    
    const setEnableBuffsEl = document.getElementById('setEnableBuffs');
    if(setEnableBuffsEl) setEnableBuffsEl.checked = masterData.settings.enableBuffs !== false;
    
    const setAllowFriendMarketEl = document.getElementById('setAllowFriendMarket');
    if(setAllowFriendMarketEl) setAllowFriendMarketEl.checked = masterData.settings.allowFriendMarket !== false;

    const scope = masterData.settings.prizeScope || 'global';
    const scopeRadio = document.querySelector(`input[name="prizeScope"][value="${scope}"]`);
    if(scopeRadio) scopeRadio.checked = true;
    updateScopeHint(scope);

    const currentTiers = getCurrentTiers();
    currentTiers.forEach((t, i) => { const el = document.getElementById(`prob${i}`); if(el) el.value = t.chance; });

    const guestBindEl = document.getElementById('guestBindSection');
    const userAccountEl = document.getElementById('userAccountSection');
    if(guestBindEl) guestBindEl.style.display = isGuest ? 'block' : 'none';
    if(userAccountEl) userAccountEl.style.display = isGuest ? 'none' : 'block';
    
    const emailDisplayEl = document.getElementById('settingsEmailDisplay');
    if(!isGuest && emailDisplayEl && currentUser) emailDisplayEl.innerText = currentUser.email;

    renderPrizeManager();
    renderSettingsChildList();
}

function updateScopeHint(scope) {
    const hint = document.getElementById('scopeHint');
    if(!hint) return;
    if(scope === 'global') hint.innerText = "目前模式：所有帳號共用同一套獎品清單。";
    else hint.innerText = "目前模式：當前使用者 (" + masterData.children[masterData.currentIdx].name + ") 擁有獨立獎品清單。";
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

    saveData(); updateUI(); 
    const settingsModalEl = document.getElementById('settingsModal');
    if(settingsModalEl) settingsModalEl.style.display = 'none';
    Toast.fire({ icon: 'success', title: '設定已儲存' });
}

function renderSettingsChildList() {
    const list = document.getElementById('settingsChildList');
    if(!list) return;
    list.innerHTML = masterData.children.map((c, i) => `
        <div class="child-row"><span>${c.name}</span><div>
            <button class="btn-mini-edit" onclick="renameChildSettings(${i})">改名</button>
            <button class="btn-mini-del" onclick="deleteChildSettings(${i})">刪除</button>
        </div></div>`).join('');
}

function addNewChildFromSettings() {
    const nameEl = document.getElementById('settingsNewChildName');
    if(!nameEl) return;
    const name = nameEl.value;
    if (!name) return;
    masterData.children.push({ name: name, data: createNewChildData() });
    nameEl.value = '';
    saveData(); renderSettingsChildList(); switchChild(masterData.currentIdx);
}

function renderPrizeManager() {
    const select = document.getElementById('tierSelect'); 
    const listDiv = document.getElementById('prizeManagerList'); 
    if(!select || !listDiv) return;
    const currentTiers = getCurrentTiers(); 
    const tierData = currentTiers[parseInt(select.value)];
    select.style.borderColor = tierData.color; select.style.color = tierData.color; 
    
    if (tierData.rewards.length === 0) { listDiv.innerHTML = '<div style="padding:10px; text-align:center; color:#999;">無獎品</div>'; } 
    else { listDiv.innerHTML = tierData.rewards.map((reward, idx) => `<div class="prize-manage-item"><span>${reward}</span><div><button class="btn-mini-edit" onclick="editPrize(${parseInt(select.value)}, ${idx})">✏️</button><button class="btn-mini-del" onclick="removePrize(${parseInt(select.value)}, ${idx})">🗑️</button></div></div>`).join(''); }
}

function addCustomPrize() {
    const nameEl = document.getElementById('newPrizeName');
    if(!nameEl) return;
    const name = nameEl.value.trim(); if(!name) return;
    getCurrentTiers()[parseInt(document.getElementById('tierSelect').value)].rewards.push(name);
    saveData(); nameEl.value = ''; renderPrizeManager();
}

function fireConfetti() { const c = document.getElementById('confetti-canvas'); if(!c) return; const ctx = c.getContext('2d'); c.width = window.innerWidth; c.height = window.innerHeight; let p = []; const colors = ['#f1c40f', '#e74c3c', '#3498db', '#9b59b6', '#2ecc71']; for(let i=0; i<150; i++) p.push({x: c.width/2, y: c.height/2, r: Math.random()*6+2, dx: Math.random()*10-5, dy: Math.random()*10-5, color: colors[Math.floor(Math.random()*colors.length)], life: 100}); function d() { ctx.clearRect(0,0,c.width,c.height); let active = false; p.forEach(k => { if(k.life>0){ active=true; ctx.beginPath(); ctx.arc(k.x, k.y, k.r, 0, Math.PI*2); ctx.fillStyle=k.color; ctx.fill(); k.x+=k.dx; k.y+=k.dy; k.dy+=0.2; k.life--; }}); if(active) requestAnimationFrame(d); else ctx.clearRect(0,0,c.width,c.height); } d(); }

function showAppGuide() {
    Swal.fire({
        title: '📖 系統使用指引',
        html: `
            <div style="text-align:left; font-size:0.9rem; line-height:1.6; max-height: 400px; overflow-y: auto; padding: 0 10px;">
                <h4 style="color:#2d3436; margin-bottom:5px; background:#dfe6e9; padding:5px 10px; border-radius:5px;">👨‍🏫 皓孩子每日問答系統</h4>
                <ul style="margin-top:5px; padding-left:20px; color:#555;">
                    <li><b>每日挑戰：</b>進入首頁即可看到常態題目，答對可直接獲得豐厚點數獎勵！</li>
                    <li><b>兌換獎勵：</b>輸入老師分發的限時兌換碼，也可以直接增加點數。</li>
                    <li><b>銀行利息：</b>每晚 <b>20:00</b> 進行利息結算，多存多賺喔！</li>
                </ul>
            </div>
        `,
        width: 600, confirmButtonText: '準備出發！', confirmButtonColor: '#4a90e2'
    });
}
function showChangelog() {
    Swal.fire({
        title: '📣 系統改版公告',
        html: `<div style="text-align:left; font-size:0.9rem; line-height:1.6; padding: 10px;">全新開放「每日問答挑戰」與「跨界單字遊戲連動」！</div>`,
        width: 600, confirmButtonText: '太棒了！', confirmButtonColor: '#e84393'
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
window.showAppGuide = showAppGuide;
window.showChangelog = showChangelog;

window.enterPin = function(num) { if(currentPinInput.length<4) { currentPinInput+=num; updatePinDisplay(); if(currentPinInput.length===4) { if(pinContext==='login') { if(currentPinInput===masterData.settings.adminPin) { closePin(); performSwitchTab('tab-admin'); } else { const pt = document.getElementById('pinTitle'); if(pt) pt.style.color="red"; setTimeout(()=>{ if(pt) pt.style.color="#2d3436";},1000); currentPinInput=""; updatePinDisplay(); } } else if(pinContext==='setup') { masterData.settings.adminPin=currentPinInput; saveData(); Swal.fire('密碼已設定！','','success'); closePin(); } } } };
window.clearPin = function() { currentPinInput = currentPinInput.slice(0, -1); updatePinDisplay(); };
window.closePin = function() { document.getElementById('pinModal').style.display = 'none'; };
window.startSetPin = function() { pinContext = 'setup'; currentPinInput = ""; const pt = document.getElementById('pinTitle'); if(pt) pt.innerText = "請設定新密碼 (4位數字)"; const pm = document.getElementById('pinModal'); if(pm) pm.style.display = 'flex'; updatePinDisplay(); };
window.removePin = function() { Swal.fire({ title: '確定移除密碼？', icon: 'warning', showCancelButton: true }).then((r) => { if (r.isConfirmed) { masterData.settings.adminPin = null; saveData(); Swal.fire('已移除密碼', '', 'success'); } }); };
function updatePinDisplay() { const pd = document.getElementById('pinDisplay'); if(pd) pd.innerText = "*".repeat(currentPinInput.length); }
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

// ==========================================
// 🎯 皓孩子獎點網：答題與序號系統
// ==========================================

const PROMO_CODES = {
    "GOODJOB888": { points: 100, reason: "課堂表現優異兌換" },
    "ENGLISHKING": { points: 150, reason: "英文單字比賽獲勝" },
    "COMPLETE100": { points: 50, reason: "作業認真完成獎勵" }
};

function renderDailyQuiz() {
    const container = document.getElementById('quizContainer');
    if (!container || !data) return;

    if (!data.answeredQuestions) data.answeredQuestions = [];
    const activeQuestion = DAILY_QUESTIONS.find(q => !data.answeredQuestions.includes(q.id));

    if (!activeQuestion) {
        container.innerHTML = `
            <div style="text-align:center; padding:20px;">
                <span style="font-size:3rem;">🎉</span>
                <h3 style="color:#2ecc71; margin-bottom:5px;">太厲害了！</h3>
                <p style="color:#666; margin-top:0;">你已經完成了目前所有的常態挑戰，明天的課堂上要繼續加油喔！</p>
            </div>`;
        return;
    }

    let optionsHtml = activeQuestion.options.map((opt, idx) => `
        <button class="big-btn" style="font-size:1.1rem; padding:12px; margin-top:10px; background:linear-gradient(135deg, #f1f2f6 0%, #dfe6e9 100%); color:#2d3436; box-shadow:none; border:2px solid #b2bec3;" 
                onclick="submitAnswer(${activeQuestion.id}, ${idx})">
            ${idx + 1}. ${opt}
        </button>
    `).join('');

    container.innerHTML = `
        <div style="font-size:0.85rem; color:#6c5ce7; font-weight:bold; margin-bottom:5px;">💰 本題獎勵：${activeQuestion.points} 點數</div>
        <h3 style="color:#2d3436; margin-top:0; line-height:1.4;">${activeQuestion.question}</h3>
        <div style="display:flex; flex-direction:column;">
            ${optionsHtml}
        </div>
    `;
}

window.submitAnswer = function(questionId, chosenIdx) {
    const q = DAILY_QUESTIONS.find(item => item.id === questionId);
    if (!q) return;

    if (chosenIdx === q.answer) {
        data.score += q.points;
        if (!data.answeredQuestions) data.answeredQuestions = [];
        data.answeredQuestions.push(q.id);

        const now = new Date();
        const d = `${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        data.history.push({ date: d, reason: `答對問答挑戰: ${q.question.slice(0,10)}...`, amount: q.points });

        saveData(); 
        checkAchievements(); 

        Swal.fire({
            title: '🎉 答對了！', text: `恭喜獲得 ${q.points} 點數！`, icon: 'success', confirmButtonText: '下一題', confirmButtonColor: '#6c5ce7'
        }).then(() => { renderDailyQuiz(); });
    } else {
        Swal.fire({
            title: '❌ 答錯囉！', text: '沒關係，再仔細想一想，你一定可以的！', icon: 'error', confirmButtonText: '重新挑戰', confirmButtonColor: '#ff7675'
        });
    }
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

        saveData();
        input.value = '';

        Swal.fire({
            title: '🎟️ 兌換成功！', html: `獲得獎勵：<b>${reward.points}</b> 點！<br><span style="color:#666; font-size:0.9rem;">(${reward.reason})</span>`, icon: 'success', confirmButtonText: '太棒了！', confirmButtonColor: '#1e88e5'
        });
    } else {
        Swal.fire('錯誤', '找不到這個兌換碼，請確認英文字母有沒有打錯喔！', 'error');
    }
};

window.goToVocabGame = function() {
    if (!currentUser) { Swal.fire('提示', '請先登入帳號再進行挑戰喔！', 'warning'); return; }
    const childName = masterData.children[masterData.currentIdx].name;
    const studentUid = currentUser.uid;
    const currentChildIdx = masterData.currentIdx;
    const gameUrl = `https://weiiiik12.github.io/vocab-game/?uid=${studentUid}&name=${encodeURIComponent(childName)}&idx=${currentChildIdx}`;
    window.open(gameUrl, '_blank');
};


// ==========================================================================
// 🎮 挑戰小學堂核心邏輯模組（全新升級防刷版）
// ==========================================================================

// 模擬題目庫（每天隨機抽 5 題挑戰，可以自由修改這裡的題目內容）
const CONST_DAILY_QUIZZES = [
    { q: "請問 'School' 的中文是什麼？", a: ["蘋果", "學校", "老師", "書本"], correct: 1 },
    { q: "老師常說的 'Listen carefully' 是什麼意思？", a: ["大聲朗讀", "仔細聆聽", "請回座位"], correct: 1 },
    { q: "英文句子開頭的第一個字母通常要如何處理？", a: ["維持小寫", "全部加底線", "一定要大寫"], correct: 2 },
    { q: "英文單字 'Beautiful' 的意思是什麼？", a: ["美麗的", "醜陋的", "帥氣的"], correct: 0 },
    { q: "星期三的英文縮寫是哪一個？", a: ["Tue.", "Wed.", "Thu."], correct: 1 },
    { q: "安親班的英文最接近哪一個？", a: ["After-school care center", "Library", "Gym"], correct: 0 }
];

// 初始化或更新每日問答區（限制 5 題）
window.renderDailyQuizSystem = function() {
    const container = document.getElementById('quizContainer');
    if (!container || !data) return;

    // 1. 確保結構安全，如果沒有紀錄就初始化
    if (data.dailyQuizCount === undefined) data.dailyQuizCount = 0;
    if (!data.dailyQuizDate) data.dailyQuizDate = new Date().toDateString();

    // 2. 跨日檢查：如果系統日期跟紀錄日期不同，自動重置答題數
    const todayStr = new Date().toDateString();
    if (data.dailyQuizDate !== todayStr) {
        data.dailyQuizCount = 0;
        data.dailyQuizDate = todayStr;
        saveData();
    }

    // 3. 核心判定：如果今天已經答滿 5 題，直接顯示金句
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

    // 4. 答題中狀態：隨機挑選一題來渲染
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

// 處理每日問答的答案提交
window.submitDailyQuizAnswer = function(quizIdx, selectedIdx) {
    if (!data) return;
    const quiz = CONST_DAILY_QUIZZES[quizIdx];

    if (selectedIdx === quiz.correct) {
        // 答對了！加 10 點
        data.score += 10;
        data.dailyQuizCount += 1;
        
        const now = new Date();
        const d = `${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        data.history.push({ date: d, reason: `挑戰小學堂：答對每日問答`, amount: 10 });

        saveData();

        Swal.fire({
            icon: 'success',
            title: '答對了！',
            text: '太棒了，獲得點數 10 點！💰',
            timer: 1500,
            showConfirmButton: false
        }).then(() => {
            renderDailyQuizSystem(); // 刷新
        });
    } else {
        // 答錯了，不給分，但也消耗一次今天的額度
        data.dailyQuizCount += 1;
        saveData();
        
        Swal.fire({
            icon: 'error',
            title: '答錯囉！',
            text: '沒關係，下一題再接再厲！💪',
            timer: 1500,
            showConfirmButton: false
        }).then(() => {
            renderDailyQuizSystem(); // 刷新
        });
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
        icon: 'info',
        confirmButtonText: '好，我會認真準備！'
    });
};
