// js/main.js
import { db } from './firebase-init.js';
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ⚠️ 記得放上妳的 Firebase 學生 Document ID 喔！
const MY_DOC_ID = "把妳的後台亂碼DocID貼在這裡"; 
const userRef = doc(db, "users", MY_DOC_ID);

// ----------------------------------------------------
// 📚 測試用小題庫（未來可以直接對接妳原本的單字系統）
// ----------------------------------------------------
const quizDB = [
    { question: "「蘋果」的英文是什麼？", answer: "apple" },
    { question: "「香蕉」的英文是什麼？", answer: "banana" },
    { question: "「老師」的英文是什麼？", answer: "teacher" },
    { question: "「英文」的英文是什麼？", answer: "english" }
];
let currentQuizIndex = 0;

// ----------------------------------------------------
// 📅 核心功能：判斷今天是不是週末 (週六或週日)
// ----------------------------------------------------
function isWeekend() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 是週日，1-5 是週一到五，6 是週六
    return dayOfWeek === 0 || dayOfWeek === 6;
}

// ----------------------------------------------------
// 🔌 直播監聽雲端點數資料
// ----------------------------------------------------
function startListeningData() {
    onSnapshot(userRef, (snapshot) => {
        if (snapshot.exists()) {
            const userData = snapshot.data();
            document.getElementById('points-display').innerText = userData.points || 0;
            document.getElementById('user-name-display').innerText = userData.name || "未命名";
        }
    });
}

// ----------------------------------------------------
// 💰 更新雲端點數
// ----------------------------------------------------
async function changePoints(amount) {
    try {
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const currentPoints = userSnap.data().points || 0;
            await updateDoc(userRef, { points: currentPoints + amount });
        }
    } catch (error) {
        console.error("更新點數失敗：", error);
    }
}

// ----------------------------------------------------
// 🎯 答題與點數結算核心邏輯
// ----------------------------------------------------
// 初始化題目顯示與週末提示
function initQuiz() {
    // 1. 檢查是否為週末，是的話就把黃色加倍緞帶顯示出來！
    if (isWeekend()) {
        document.getElementById('weekend-badge').style.display = 'block';
    }

    // 2. 隨機挑一題顯示
    currentQuizIndex = Math.floor(Math.random() * quizDB.length);
    document.getElementById('question-box').innerText = quizDB[currentQuizIndex].question;
}

// 檢查學生的答案
function checkAnswer() {
    const userInput = document.getElementById('answer-input').value.trim().toLowerCase();
    const correctAnswer = quizDB[currentQuizIndex].answer;
    const msgBox = document.getElementById('result-msg');

    if (!userInput) {
        msgBox.style.color = "#e67e22";
        msgBox.innerText = "請先輸入單字再送出喔！";
        return;
    }

    if (userInput === correctAnswer) {
        // 🎉 答對了！開始計算點數
        let basePoints = 10; // 基礎常態加 10 點
        let finalPoints = basePoints;
        let bonusText = "";

        // 💡 關鍵：如果時間偵測器發現是週末，直接把點數乘 2！
        if (isWeekend()) {
            finalPoints = basePoints * 2;
            bonusText = " (週末特別挑戰點數加倍！)";
        }

        msgBox.style.color = "#00b894";
        msgBox.innerText = `🥳 太棒了！答對囉！獲得 ${finalPoints} 點！${bonusText}`;
        
        // 發送點數到雲端
        changePoints(finalPoints);

        // 清空輸入框，並在 2 秒後自動換下一題
        document.getElementById('answer-input').value = "";
        setTimeout(() => {
            msgBox.innerText = "";
            initQuiz();
        }, 2000);

    } else {
        // ❌ 答錯了
        msgBox.style.color = "#d63031";
        msgBox.innerText = "答案不太對喔，再試一次看看！";
    }
}

// ----------------------------------------------------
// 🖱️ 綁定答題點擊事件
// ----------------------------------------------------
document.getElementById('btn-submit-answer').addEventListener('click', checkAnswer);

// 支援鍵盤 Enter 鍵送出答案
document.getElementById('answer-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkAnswer();
});

// ----------------------------------------------------
// 🚀 網頁一打開，立刻啟動！
// ----------------------------------------------------
startListeningData();
initQuiz();
