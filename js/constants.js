// ==========================================
// 1. 更新 Google Sheet 題庫與商店資料來源
// ==========================================
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=0&single=true&output=csv";
const GOOGLE_SHEET_STUDENTS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=485295361&single=true&output=csv";

const QUESTION_URLS = {
    chi: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=347151370&single=true&output=csv", 
    eng: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=1583741101&single=true&output=csv", 
    math: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=1479866223&single=true&output=csv", 
    sci: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=1403571866&single=true&output=csv", 
    soc: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTM5Rydk9kMiuBsUX_PNwbh_qJHUjldU9URxh5WvWKqGxxQuGat36mKziutjMSUaTNDXIsxmTr2Llaj/pub?gid=900979351&single=true&output=csv"  
};

// ==========================================
// 2. 更新成就系統 (Achievement List)
// ==========================================
export const ACHIEVEMENT_LIST = [
    { 
        id: 'first_quiz', icon: '🐣', title: '初學乍練', desc: '第一次在小學堂答對 10 題', 
        condition: (d) => (d.totalCorrect || 0) >= 10,
        getProgress: (d) => `${d.totalCorrect || 0} / 10`
    },
    { 
        id: 'eng_master', icon: '🔥', title: '百戰單字王', desc: '累計答對 100 題英文單字', 
        condition: (d) => (d.engCorrect || 0) >= 100,
        getProgress: (d) => `${d.engCorrect || 0} / 100`
    },
    { 
        id: 'seven_days', icon: '📅', title: '持之以恆', desc: '連續 7 天都有登入答題', 
        condition: (d) => (d.consecutiveDays || 0) >= 7,
        getProgress: (d) => `${d.consecutiveDays || 0} / 7 天`
    },
    { 
        id: 'team_player', icon: '🏆', title: '合作無間', desc: '第一次跟好友完成組隊挑戰', 
        condition: (d) => (d.teamGamesPlayed || 0) >= 1,
        getProgress: (d) => d.teamGamesPlayed ? "1 / 1" : "0 / 1"
    }
    // ... 可以保留原本的銀行與抽獎成就 ...
];
