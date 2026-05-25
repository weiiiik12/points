// js/constants.js

export const DEFAULT_TIERS = [
    { id: 'common', index: 0, name: '普通', color: '#95a5a6', chance: 60, rewards: ['小日記減少一行', '假日玩電動加5分鐘', '假日爸爸陪玩電動5分鐘', '減少看書時間5分鐘'] },
    { id: 'uncommon', index: 1, name: '罕見', color: '#00b894', chance: 20, rewards: ['小日記減少二行', '假日玩電動加10分鐘', '假日爸爸陪玩電動10分鐘', '減少看書時間10分鐘'] },
    { id: 'rare', index: 2, name: '稀有', color: '#0984e3', chance: 10, rewards: ['小日記減少三行', '假日玩電動加15分鐘', '假日爸爸陪玩電動15分鐘', '減少看書時間15分鐘', '媽媽陪睡覺'] },
    { id: 'epic', index: 3, name: '史詩', color: '#6c5ce7', chance: 6, rewards: ['小日記減少四行', '平日可玩電動10分鐘', '假日爸爸陪玩電動30分鐘', '增加點數200點'] },
    { id: 'legendary', index: 4, name: '傳奇', color: '#e17055', chance: 3, rewards: ['平日可玩電動15分鐘', '零用錢100元', '增加點數300點'] },
    { id: 'mythic', index: 5, name: '神話', color: '#d63031', chance: 1, rewards: ['平日可玩電動30分鐘', '可任意選購500元內的小禮物', '打手心處罰減免一次', '增加點數500點'] }
];

export const ACHIEVEMENT_LIST = [
    { 
        id: 'first_login', icon: '🐣', title: '新手上路', desc: '第一次登入系統', 
        condition: (d) => true,
        getProgress: (d) => "1 / 1"
    },
    { 
        id: 'rich_1000', icon: '💰', title: '第一桶金', desc: '總資產 (現金+定存) 超過 1,000 點', 
        condition: (d) => (d.score + (d.deposits||[]).reduce((sum, item) => sum + item.amount, 0)) >= 1000,
        getProgress: (d) => `${d.score + (d.deposits||[]).reduce((sum, item) => sum + item.amount, 0)} / 1000`
    },
    { 
        id: 'rich_5000', icon: '💎', title: '超級富豪', desc: '總資產超過 5,000 點', buffText: "💎 銀行黑卡：定存利率提升 8%",
        condition: (d) => (d.score + (d.deposits||[]).reduce((sum, item) => sum + item.amount, 0)) >= 5000,
        getProgress: (d) => `${d.score + (d.deposits||[]).reduce((sum, item) => sum + item.amount, 0)} / 5000`
    },
    { 
        id: 'saver_5', icon: '🏦', title: '小小銀行家', desc: '累積定存天數達到 20 天 (單筆需滿 100 點)', buffText: "🏦 VIP 利率：活存利率提升 10%",
        condition: (d) => {
            const historyDays = d.statDepositDays || 0;
            const currentDays = (d.deposits||[]).reduce((sum, item) => {
                if (item.amount >= 100) {
                    const days = Math.round((new Date(item.endDate) - new Date(item.startDate)) / (1000 * 60 * 60 * 24));
                    return sum + days;
                }
                return sum;
            }, 0);
            return (historyDays + currentDays) >= 20;
        },
        getProgress: (d) => {
             const historyDays = d.statDepositDays || 0;
             const currentDays = (d.deposits||[]).reduce((sum, item) => {
                if (item.amount >= 100) {
                    const days = Math.round((new Date(item.endDate) - new Date(item.startDate)) / (1000 * 60 * 60 * 24));
                    return sum + days;
                }
                return sum;
            }, 0);
            return `${historyDays + currentDays} / 20 天`;
        }
    },
    { 
        id: 'gacha_king', icon: '🎰', title: '轉盤大師', desc: '累計抽獎超過 20 次', buffText: "🎰 熟客折扣：抽獎費用打 95 折",
        condition: (d) => d.history.filter(h => h.reason.includes('抽獎')).length >= 20,
        getProgress: (d) => `${d.history.filter(h => h.reason.includes('抽獎')).length} / 20 次`
    },
    { 
        id: 'lucky_leg', icon: '🌟', title: '歐皇降臨', desc: '背包內擁有傳奇或神話級獎勵', buffText: "🌟 炫耀光環：抽獎時擁有黃金背景特效",
        condition: (d) => d.bag.some(i => ['傳奇','神話'].includes(i.tierName)),
        getProgress: (d) => d.bag.some(i => ['傳奇','神話'].includes(i.tierName)) ? "1 / 1" : "0 / 1"
    },
    { 
        id: 'spender_vip', icon: '💸', title: '揮霍無度', desc: '累計消費超過 3,000 點', 
        condition: (d) => d.history.filter(h => h.amount < 0 && !h.reason.includes('定存')).reduce((acc, cur) => acc + Math.abs(cur.amount), 0) >= 3000,
        getProgress: (d) => `${d.history.filter(h => h.amount < 0 && !h.reason.includes('定存')).reduce((acc, cur) => acc + Math.abs(cur.amount), 0)} / 3000`
    },
    { 
        id: 'hoarder', icon: '🐹', title: '倉鼠症候群', desc: '背包裡累積超過 10 個獎品', 
        condition: (d) => d.bag.length >= 10,
        getProgress: (d) => `${d.bag.length} / 10 個`
    },
    { 
        id: 'interest_lover', icon: '📈', title: '複利見證者', desc: '領取過 5 次有效的活存利息 (需 > 5點)', 
        condition: (d) => d.history.filter(h => h.reason.includes('活存利息') && h.amount >= 5).length >= 5,
        getProgress: (d) => `${d.history.filter(h => h.reason.includes('活存利息') && h.amount >= 5).length} / 5 次`
    },
    { 
        id: 'deposit_harvest', icon: '🌾', title: '豐收時刻', desc: '成功領回至少 1 次定存', 
        condition: (d) => d.history.some(h => h.reason.includes('定存領回')),
        getProgress: (d) => d.history.some(h => h.reason.includes('定存領回')) ? "1 / 1" : "0 / 1"
    },
    { 
        id: 'bad_luck', icon: '🌚', title: '非洲酋長', desc: '累計抽獎超過 80 次還沒中大獎', buffText: "🌚 幸運補償：大保底門檻減少 10 次",
        condition: (d) => d.pityLegendary === 0 && d.history.filter(h => h.reason.includes('抽獎')).length > 80,
        getProgress: (d) => d.pityLegendary === 0 ? `${d.history.filter(h => h.reason.includes('抽獎')).length} / 80` : "運氣太好 (保底已重置)"
    },
    { 
        id: 'redeem_master', icon: '🎫', title: '兌換達人', desc: '累計使用過 10 張卡片', 
        condition: (d) => d.history.filter(h => h.reason.includes('使用')).length >= 10,
        getProgress: (d) => `${d.history.filter(h => h.reason.includes('使用')).length} / 10 張`
    },
    { 
        id: 'big_win', icon: '🧧', title: '橫財就手', desc: '單次獲得超過 300 點 (非定存)', 
        condition: (d) => d.history.some(h => h.amount >= 300 && !h.reason.includes('定存') && !h.reason.includes('使用')),
        getProgress: (d) => d.history.some(h => h.amount >= 300 && !h.reason.includes('定存') && !h.reason.includes('使用')) ? "1 / 1" : "0 / 1"
    },
    { 
        id: 'purple_army', icon: '😈', title: '紫裝狂人', desc: '背包內同時擁有 3 張史詩級卡片', 
        condition: (d) => d.bag.filter(i => i.tierName === '史詩').length >= 3,
        getProgress: (d) => `${d.bag.filter(i => i.tierName === '史詩').length} / 3 張`
    },
    { 
        id: 'collector', icon: '🌈', title: '收集控', desc: '背包內擁有 4 種不同等級的卡片', 
        condition: (d) => new Set(d.bag.map(i => i.tierName)).size >= 4,
        getProgress: (d) => `${new Set(d.bag.map(i => i.tierName)).size} / 4 種`
    }
];