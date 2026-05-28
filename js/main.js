// ⚡ 智慧導覽切換核心：完美串聯5大標籤與「我的帳號」專屬神祕大基地
window.switchTab = function(tabId) {
    // 1. 先將畫面上所有的區塊內容隱藏
    document.querySelectorAll('.section').forEach(content => content.style.display = 'none');
    
    // 2. 熄滅5大主要導覽標籤按鈕的亮燈狀態
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    // 3. 找出要秀出來的目的地分頁，將它點亮顯示
    const targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.style.display = 'block';
    }
    
    // 4. 【分流連動亮燈邏輯】
    if (tabId === 'tab-account') {
        // A. 如果學生點的是右上角「🏆 我的帳號」，就把右上角按鈕亮起，並確保5大主標籤不要亮
        const accountNavBtn = document.getElementById('btnMyAccountNav');
        if (accountNavBtn) accountNavBtn.classList.add('active');
    } else {
        // B. 如果點的是常態的5大分頁，亮起對應的主按鈕，並熄滅右上角「我的帳號」按鈕
        const accountNavBtn = document.getElementById('btnMyAccountNav');
        if (accountNavBtn) accountNavBtn.classList.remove('active');
        
        // 點亮對應的原生5大按鈕
        const currentActiveNavBtn = document.getElementById(`btn-${tabId}`);
        if (currentActiveNavBtn) currentActiveNavBtn.classList.add('active');
    }
};
