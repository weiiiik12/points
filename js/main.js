// 📊 抓取商店商品並購買 (✨已加入背包上限 10 格限制！)
window.buyShopItem = async function(title, price, stock) {
    if (!checkGuestPermission()) return; // 阻擋遊客
    if (!userData) return;

    // 🔒 【核心防護 1】背包 10 格容量限制防爆檢查
    const currentInventory = userData.inventory || [];
    if (currentInventory.length >= 10) {
        return Swal.fire({
            title: '🎒 背包空間滿了！',
            html: `妳的榮譽背包已經達到 <b style="color:#d63031;">10 個商品</b> 的最大上限囉！<br>請趕快找老師<b>【核銷領取】</b>或去<b>【交易所賣掉】</b>騰出空間，才能繼續買新東西喔！`,
            icon: 'warning'
        });
    }

    if (userData.score < price) {
        return Swal.fire('點數不足', `還差 ${price - userData.score} 點才能購買喔！`, 'warning');
    }

    Swal.fire({
        title: '確定兌換？',
        text: `是否扣除 ${price} 點兌換【${title}】？`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#ff9f43'
    }).then(async (result) => {
        if (result.isConfirmed) {
            // 📡 扣點數，並把商品的品名、日期、當初價格(price)、未領取狀態(status)一起打包塞進雲端
            await updateDoc(userRef, {
                score: userData.score - price,
                inventory: [...currentInventory, { 
                    title: title, 
                    price: price, // 🎯 確實存入價格，方便背包讀取
                    date: new Date().toLocaleDateString(),
                    status: "未領取" 
                }],
                history: [...(userData.history || []), { 
                    time: new Date().toLocaleString(), 
                    amount: -price, 
                    reason: `[直購] 兌換 ${title} (扣除 ${price} 點)` 
                }]
            });
            Swal.fire('🎉 兌換成功！', `禮物已放入背包（容量：${currentInventory.length + 1}/10），請查看！`, 'success');
        }
    });
};

// 🔄 更新學生頂部資訊欄與「蝦皮票券風榮譽背包」
function updateStudentUI() {
    if (!userData) return;
    const nameDisplay = document.getElementById('childNameDisplay');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const userEmail = document.getElementById('userEmail');
    const avatar = document.getElementById('userAvatar');

    if (nameDisplay) nameDisplay.innerText = `${userData.nickname} (${userData.realName})`;
    if (scoreDisplay) bookkeepingScore(userData.score || 0); 
    if (userEmail) userEmail.innerText = `🟢 在線：${userData.realName}`;
    if (avatar && userData.avatarUrl) avatar.src = userData.avatarUrl;

    // 🎒 蝦皮優惠券風格背包外殼
    const backpackGrid = document.getElementById('inventoryContainer');
    if (backpackGrid) {
        const myItems = userData.inventory || []; 
        
        // 秀出目前的背包容量進度條狀態
        let headerHtml = `<div style="font-size:0.8rem; color:#718096; text-align:right; font-weight:bold; margin-bottom:5px;">🎒 背包負重：<span style="color:${myItems.length >= 10 ? '#d63031' : '#9b59b6'}">${myItems.length}</span> / 10</div>`;

        if (myItems.length === 0) {
            backpackGrid.innerHTML = headerHtml + `<p style="color:#999; text-align:center; font-size:0.9rem; padding:15px;">🎒 背包空空如也，快去上面買東西吧！</p>`;
        } else {
            let backpackHtml = headerHtml + `<div style="display: flex; flex-direction: column; gap: 15px; width: 100%; box-sizing: border-box;">`;
            
            myItems.forEach((item, index) => {
                const isClaimed = item.status === "已領取"; 
                // 🎯 修正：防呆讀取，如果舊資料沒有存到 price，預設給 50 點
                const itemPrice = item.price || 50; 
                
                backpackHtml += `
                    <div class="ticket-card" style="display: flex; background: white; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03); width: 100%; min-height: 95px; align-items: center; box-sizing: border-box;">
                        
                        <div style="background: ${isClaimed ? '#b2bec3' : 'linear-gradient(135deg, #ff7675, #ff9f43)'}; width: 85px; min-height: 100px; display: flex; flex-direction: column; justify-content: center; align-items: center; color: white; position: relative; flex-shrink: 0;">
                            <span style="font-size: 1.8rem; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));">🎁</span>
                            <small style="font-size: 0.65rem; font-weight: bold; margin-top: 4px; letter-spacing: 1px;">官方正品</small>
                            <div style="position: absolute; left: -4px; top: 0; bottom: 0; width: 8px; background-image: radial-gradient(circle, #f8f9fa 3px, transparent 4px); background-size: 12px 12px;"></div>
                        </div>

                        <div style="flex: 1; padding: 10px 15px; text-align: left; display: flex; flex-direction: column; justify-content: center; min-width: 0;">
                            <h4 style="margin: 0 0 4px 0; font-size: 1.05rem; color: #2d3436; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.title}</h4>
                            <p style="margin: 0 0 2px 0; font-size: 0.75rem; color: #718096; font-weight: 500;">📅 兌換時間：${item.date || '未知'}</p>
                            <p style="margin: 0; font-size: 0.8rem; color: #e17055; font-weight: 800;">💰 價值：${itemPrice} <span style="font-size:0.65rem; font-weight:normal; color:#888;">點</span></p>
                        </div>

                        <div style="padding-right: 15px; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; align-items: flex-end;">
                            ${isClaimed ? `
                                <button style="background: #b2bec3; color: white; border: none; padding: 8px 14px; border-radius: 8px; font-size: 0.85rem; font-weight: bold; cursor: not-allowed;">已核銷</button>
                            ` : `
                                <button onclick="claimBackpackItem(${index}, '${item.title.replace(/'/g, "\\'")}')" style="background: #ff7675; color: white; border: none; padding: 8px 14px; border-radius: 8px; font-size: 0.85rem; font-weight: bold; cursor: pointer; font-shadow: 0 2px 5px rgba(255,118,117,0.2);">未領取</button>
                                <button onclick="sellBackToMarket(${index}, '${item.title.replace(/'/g, "\\'")}', ${itemPrice})" style="background: #ffffff; color: #4a90e2; border: 1px solid #4a90e2; padding: 4px 10px; border-radius: 6px; font-size: 0.7rem; font-weight: bold; cursor: pointer; transition: 0.2s;">⚖️ 轉售退貨</button>
                            `}
                        </div>

                    </div>
                `;
            });
            
            backpackHtml += `</div>`;
            backpackGrid.innerHTML = backpackHtml;
        }
    }
}

// ⚖️ 🔥 【全新核心連動功能】將未領取商品賣回交易所（自動扣除 10% 手續費）
window.sellBackToMarket = async function(itemIndex, itemTitle, originalPrice) {
    if (!checkGuestPermission()) return; // 阻擋遊客
    if (!userData) return;

    // 📐 計算 10% 手續費與實際退款點數
    const tax = Math.round(originalPrice * 0.1); // 四捨五入計算 10% 手續費
    const refundScore = originalPrice - tax; // 學生實際拿回來的點數

    Swal.fire({
        title: '⚖️ 確定將商品轉售退貨？',
        html: `是否要將未領取的【${itemTitle}】退回交易所？<br><br>` +
              `<div style="text-align:left; background:#edf2f7; padding:12px; border-radius:8px; font-size:0.85rem; line-height:1.6;">` +
              `• 原商品價值：<b>${originalPrice} 點</b><br>` +
              `• 交易所扣除手續費 (10%)：<b style="color:#d63031;">-${tax} 點</b><br>` +
              `• 妳將實際回收：<b style="color:#27ae60; font-size:1.05rem;">+${refundScore} 點</b>` +
              `</div><br>` +
              `<span style="color:#e74c3c; font-size:0.8rem; font-weight:bold;">⚠️ 警示：退貨後商品將立即消失且不可還原！</span>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#4a90e2',
        cancelButtonColor: '#b2bec3',
        confirmButtonText: '確定退貨轉售',
        cancelButtonText: '先留著'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: '交易所媒合退貨中...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

            // 1. 從學生的背包陣列裡，精準拔除這項商品
            const currentInventory = [...(userData.inventory || [])];
            currentInventory.splice(itemIndex, 1); // 一鍵刪除

            // 2. 幫學生加回點數，並更新 Firebase 歷史清單
            try {
                const newScore = (userData.score || 0) + refundScore;
                const newHistory = [...(userData.history || []), {
                    time: new Date().toLocaleString(),
                    amount: refundScore,
                    reason: `[交易所退貨] 轉售 ${itemTitle}，扣除 10% 手續費 (${tax}點)，收回 ${refundScore} 點。`
                }];

                await updateDoc(userRef, {
                    score: newScore,
                    inventory: currentInventory,
                    history: newHistory
                });

                Swal.fire('⚖️ 交易所退貨成功！', `已成功幫妳回收點數，金幣 <b style="color:#27ae60;">+${refundScore}</b> 點已入帳！`, 'success');
            } catch (err) {
                console.error("退貨失敗:", err);
                Swal.fire('交易所卡住', '連線異常，請稍後再試！', 'error');
            }
        }
    });
};
