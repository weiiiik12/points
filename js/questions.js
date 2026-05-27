// js/questions.js

// 這裡可以自由增加題目，支援單選題
export const DAILY_QUESTIONS = [
    {
        id: 1,
        question: "下列哪一個單字是『學校』的意思？",
        options: ["Apple", "School", "Teacher", "Book"],
        answer: 1, // 代表 options[1] 的 "School" 是正確答案
        points: 20 // 答對獲得 20 點
    },
    {
        id: 2,
        question: "老師在英文課常說的『Listen carefully』是什麼意思？",
        options: ["大聲朗讀", "仔細聆聽", "請回座位", "打開課本"],
        answer: 1,
        points: 20
    },
    {
        id: 3,
        question: "英文句子開頭的第一個字母通常要如何處理？",
        options: ["維持小寫", "全部加底線", "一定要大寫", "隨便都可以"],
        answer: 2,
        points: 20
    }
];

const today = new Date();
const isWeekend = (today.getDay() === 0 || today.getDay() === 6); // 0是週日，6是週六
const basePoints = 10;
const finalPoints = isWeekend ? basePoints * 2 : basePoints;
