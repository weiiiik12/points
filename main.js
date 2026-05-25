// js/main.js
import { db } from './firebase-init.js';
// 引入 Firestore 需要用到的功能指令
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 💡 測試函式：讀取學生的點數
async function testFetchUserPoints(userId) {
    try {
        // 定位到 users 資料夾底下的那張學生文件（請把 '妳的自動ID' 換成後台看到的那串亂碼）
        const userRef = doc(db, "users", userId); 
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const userData = userSnap.data();
            console.log(`成功連線！${userData.name} 目前有 ${userData.points} 點。`);
            
            // 抓到點數後，可以動態顯示在網頁畫面上
            // document.getElementById('points-display').innerText = userData.points;
        } else {
            console.log("找不到這個學生的資料！");
        }
    } catch (error) {
        console.error("讀取資料失敗：", error);
    }
}

// 💡 測試函式：給學生加點數（例如答對單字時調用）
async function addPoints(userId, amount) {
    const userRef = doc(db, "users", userId);
    
    try {
        // 先讀取目前的點數
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const currentPoints = userSnap.data().points || 0;
            const newPoints = currentPoints + amount;

            // 把新點數寫回雲端
            await updateDoc(userRef, {
                points: newPoints
            });
            
            console.log(`點數更新成功！新點數為: ${newPoints}`);
        }
    } catch (error) {
        console.error("更新點數失敗：", error);
    }
}

// 測試執行：請將後台 users 裡產生的那串亂碼 ID 複製貼到這裡測試
// testFetchUserPoints("貼上妳的DocID");