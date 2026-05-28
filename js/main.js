// 🚀 通過驗證放行 (已補上年級儲存與記憶機制)
async function enterSystem(userCleanId, realName) {
    const loginOverlay = document.getElementById('loginOverlay');
    const mainContainer = document.getElementById('mainAppContainer');
    
    if (loginOverlay) loginOverlay.style.display = 'none';
    if (mainContainer) mainContainer.style.display = 'block';

    // 🔍 關鍵修正：從預載的 Excel 學生庫中，幫這名學生找出他真正的年級！
    const matchedStudentInfo = excelUsersDatabase.find(u => u.email.replace(/[^a-zA-Z0-9]/g, "_") === userCleanId || u.email === localStorage.getItem('hago_logged_in_email'));
    const studentGrade = matchedStudentInfo ? matchedStudentInfo.grade.toLowerCase() : 'g1';

    if (isGuest) {
        userData = {
            realName: realName,
            nickname: "參觀小達人",
            avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=guest_hago`,
            score: 888,
            grade: "g1", // 遊客預設為一年級
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
    
    // 正式學生的 Firebase 讀寫邏輯
    userRef = doc(db, "users", userCleanId);
    const docSnap = await getDoc(userRef);
    
    if (docSnap.exists()) {
        userData = docSnap.data();
        
        // ✨ 強大安全同步：萬一老師在 Excel 幫學生「升級/換班」了，自動在 Firebase 更新年級欄位！
        if (userData.grade !== studentGrade) {
            await updateDoc(userRef, { grade: studentGrade });
            userData.grade = studentGrade;
        }
        
        updateStudentUI();
    } else {
        // 第一次登入的學生，將 Excel 裡設定好的年級（grade）完整記錄進 Firebase 資料庫！
        const initialData = {
            realName: realName,
            nickname: "新進小達人",
            avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${userCleanId}`,
            score: 100,
            grade: studentGrade, // 🎯 這裡成功把年級寫入紀錄了！
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
