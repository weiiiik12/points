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
