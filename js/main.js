// js/main.js
import { auth } from './firebase-init.js';
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 絕招：一載入網頁就立刻強制登出，清除所有殘留的死帳號快取！
signOut(auth).then(() => {
    alert("✨ 殘留帳號已成功清除排毒！網頁即將自動刷新，您可以正常註冊新帳號了！");
    // 清除成功後，自動把程式碼還原，這樣才不會無限循環登出
    location.reload();
}).catch((err) => {
    alert("清除快取失敗: " + err.message);
});
