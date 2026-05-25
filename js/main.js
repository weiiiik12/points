// js/main.js

// ----------------------------------------------------
// 🔐 自訂學號登入系統 (取代原本的 Firebase Auth 郵件登入)
// ----------------------------------------------------

// 檢查瀏覽器在地快照，看看這台電腦上次是不是已經登入過了
window.addEventListener('load', () => {
    const savedUserId = localStorage.getItem('currentStudentId');
    if (savedUserId) {
        logInSuccess(savedUserId, localStorage.getItem('currentStudentName'));
    }
});

// 處理學生的登入點擊
document.getElementById('btn-login').addEventListener('click', async () => {
    const studentId = document.getElementById('email-input').value.trim(); // 拿學號
    const inputPassword = document.getElementById('password-input').value.trim(); // 拿密碼
    const errorBox = document.getElementById('login-error-msg');

    if (!studentId || !inputPassword) {
        return errorBox.innerText = "學號和密碼都要填喔！";
    }

    try {
        // 直接去雲端 users 資料夾找尋以該學號為名稱的文件
        const studentRef = doc(db, "users", studentId);
        const studentSnap = await getDoc(studentRef);

        if (!studentSnap.exists()) {
            return errorBox.innerText = "❌ 找不到這個學號，請跟老師確認！";
        }

        const studentData = studentSnap.data();

        // 核對密碼是否正確
        if (studentData.password === inputPassword) {
            errorBox.innerText = "";
            // 將登入狀態存在學生的電腦裡（下次開網頁免重新登入）
            localStorage.setItem('currentStudentId', studentId);
            localStorage.setItem('currentStudentName', studentData.name);
            
            // 執行登入成功流程
            logInSuccess(studentId, studentData.name);
        } else {
            errorBox.innerText = "❌ 密碼不對喔，再想一下！";
        }

    } catch (e) {
        errorBox.innerText = "連線失敗：" + e.message;
    }
});

// 登入成功的動作
function logInSuccess(studentId, studentName) {
    currentUserId = studentId;
    currentUserRef = doc(db, "users", studentId);

    document.getElementById('user-email-display').innerText = `${studentName} (座號:${studentId})`;
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';

    // 啟動資料庫即時直播監聽
    startListeningData();
    startListeningMarket();
    checkWeekendStatus();
}

// 登出按鈕
document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.clear(); // 清除在地登入快照
    location.reload();    // 重新整理網頁，大門就會自動重新鎖上
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
// ----------------------------------------------------
// 🏙️ 易物市集核心邏輯 (全新實體化)
// ----------------------------------------------------

// 1. 發佈交換請求到雲端
window.createTradeRequestCloud = async function() {
    const myItem = document.getElementById('my-trade-item').value.trim();
    const targetItem = document.getElementById('target-trade-item').value.trim();

    if (!myItem || !targetItem) {
        return Swal.fire('欄位不完整', '請輸入妳要拿出什麼，以及想換什麼！', 'warning');
    }

    try {
        // 檢查學生的背包裡到底有沒有這項物品
        const userSnap = await getDoc(currentUserRef);
        const currentBag = userSnap.data().bag || [];

        if (!currentBag.includes(myItem)) {
            return Swal.fire('物品不存在', `妳的背包裡沒有【${myItem}】，沒辦法拿出來交換喔！`, 'error');
        }

        // 先把該物品從學生的背包「扣留/凍結」，避免他同時拿去跟別人換
        const itemIndex = currentBag.indexOf(myItem);
        currentBag.splice(itemIndex, 1);
        await updateDoc(currentUserRef, { bag: currentBag });

        // 在雲端建立一個交易案件 (market_trades 集合)
        await addDoc(collection(db, "market_trades"), {
            sellerUid: currentUserId,
            sellerName: userSnap.data().name || "神祕同學",
            offerItem: myItem,
            wantItem: targetItem,
            status: "active",
            timestamp: Date.now()
        });

        Swal.fire('上架成功！', `已將【${myItem}】扣留並掛牌，等待同學拿【${targetItem}】來換！`, 'success');
        document.getElementById('my-trade-item').value = "";
        document.getElementById('target-trade-item').value = "";

    } catch (e) {
        Swal.fire('上架失敗', e.message, 'error');
    }
};

// 2. 直播監聽易物市集 (即時顯示所有人上架的物品)
function startListeningMarket() {
    const marketRef = collection(db, "market_trades");
    // 只抓目前還有效的交換案件
    const q = query(marketRef, where("status", "==", "active"));

    onSnapshot(q, async (snapshot) => {
        const marketListDiv = document.getElementById('market-list-display');
        if (!marketListDiv) return;

        if (snapshot.empty) {
            marketListDiv.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">目前市集沒有人在交換禮物券～</div>';
            return;
        }

        let html = "";
        
        // 讀取目前學生的背包，用來判斷他手上的東西夠不夠換
        const userSnap = await getDoc(currentUserRef);
        const myBag = userSnap.data().bag || [];

        snapshot.forEach((docSnap) => {
            const trade = docSnap.data();
            const tradeId = docSnap.id;
            
            const isMe = trade.sellerUid === currentUserId;
            // 檢查我背包有沒有對方想要的物品
            const canTrade = myBag.includes(trade.wantItem);

            html += `
                <div class="card" style="border-left: 6px solid ${isMe ? '#6c5ce7' : '#00b894'}; padding: 12px; position: relative;">
                    <div style="font-size: 0.85rem; color: #888; margin-bottom: 5px;">
                        發起人: <b>${trade.sellerName}</b> ${isMe ? '<span style="background:#6c5ce7; color:white; padding:1px 5px; border-radius:3px; font-size:0.7rem;">我發起的</span>' : ''}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <span style="color:#e17055; font-weight:bold;">🎁 釋出：${trade.offerItem}</span><br>
                            <span style="color:#0984e3; font-weight:bold;">🔍 想要：${trade.wantItem}</span>
                        </div>
                        <div>
                            ${isMe ? 
                                `<button onclick="cancelTradeCloud('${tradeId}', '${trade.offerItem}')" style="background:#d63031; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">下架退回</button>` : 
                                `<button onclick="acceptTradeCloud('${tradeId}')" ${!canTrade ? 'disabled style="background:#b2bec3; cursor:not-allowed;"' : 'style="background:#00b894; color:white; border:none; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer;"'}>
                                    ${canTrade ? '🤝 跟我換' : '❌ 缺指定券'}
                                </button>`
                            }
                        </div>
                    </div>
                </div>
            `;
        });

        marketListDiv.innerHTML = html;
    });
}

// 3. 處理「跟我換」的交換按鈕邏輯
window.acceptTradeCloud = async function(tradeId) {
    try {
        const tradeRef = doc(db, "market_trades", tradeId);
        const tradeSnap = await getDoc(tradeRef);

        if (!tradeSnap.exists() || tradeSnap.data().status !== "active") {
            return Swal.fire('來晚了', '這個交換案件已經被別人換走或下架囉！', 'error');
        }

        const tradeData = tradeSnap.data();

        // A. 檢查買家(目前登入者)背包是否還有那張想要換出去的券
        const mySnap = await getDoc(currentUserRef);
        let myBag = mySnap.data().bag || [];

        if (!myBag.includes(tradeData.wantItem)) {
            return Swal.fire('物品不見了', `妳的背包裡好像沒有【${tradeData.wantItem}】囉！`, 'error');
        }

        // B. 開始進行雙方背包物品大對調
        // 1. 扣除買家背包裡的 wantItem，並塞入賣家的 offerItem
        const itemIdx = myBag.indexOf(tradeData.wantItem);
        myBag.splice(itemIdx, 1);
        myBag.unshift(tradeData.offerItem);
        await updateDoc(currentUserRef, { bag: myBag });

        // 2. 找到賣家的雲端背包，把買家付出的 wantItem 塞進賣家背包
        const sellerUserRef = doc(db, "users", tradeData.sellerUid);
        const sellerSnap = await getDoc(sellerUserRef);
        let sellerBag = sellerSnap.data().bag || [];
        sellerBag.unshift(tradeData.wantItem);
        await updateDoc(sellerUserRef, { bag: sellerBag });

        // 3. 把雲端市集的案件狀態改為已完成 (Completed) 結案
        await updateDoc(tradeRef, { status: "completed", buyerUid: currentUserId });

        Swal.fire('交換成功！', `🤝 順利完成了物品交換！快去背包檢查吧！`, 'success');

    } catch (e) {
        Swal.fire('交易失敗', e.message, 'error');
    }
};

// 4. 下架交換請求，把凍結的禮物券退回背包
window.cancelTradeCloud = async function(tradeId, offerItem) {
    try {
        await updateDoc(doc(db, "market_trades", tradeId), { status: "cancelled" });
        
        // 退回背包
        const userSnap = await getDoc(currentUserRef);
        const currentBag = userSnap.data().bag || [];
        currentBag.unshift(offerItem);
        await updateDoc(currentUserRef, { bag: currentBag });

        Swal.fire('已下架', `【${offerItem}】已成功退回到妳的背包🎒。`, 'info');
    } catch (e) {
        console.error(e);
    }
};
