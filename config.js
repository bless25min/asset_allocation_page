/**
 * config.js
 * Central configuration for the Asset Allocation Simulator.
 * Separates business logic from presentation.
 */

const CONFIG = {
    // 1. Definition of Rates (Annualized Returns)
    RATES: {
        CASH_RETURN: 1.5,       // Fixed Deposit Rate (%)
        ETF_RETURN: 7.0,        // Index Fund Annualized (%)
        REAL_ESTATE_RETURN: 4.5,// Real Estate (Rent + Appreciation) [NEW]
        ACTIVE_RETURN_AVG: 50.0,// Active Trading Expected (%)
        ACTIVE_RETURN_BEST: 300.0, // Active Trading Maximum (%)
        ACTIVE_RETURN_PENALTY: -50.0, // Penalty for over-allocation (>20%) [NEW]
        INFLATION_RATE: 2.5     // Inflation Benchmark (%) (Overwritten by Calc)
    },

    // 2. Definition of Risks (Max Drawdown)
    RISK: {
        CASH_RISK: 0,           // No risk
        ETF_RISK: -50,          // Market crash scenario (%)
        REAL_ESTATE_RISK: -30,  // Liquidity/Housing Bubble Risk [NEW]
        ACTIVE_RISK: -100       // Total loss scenario (%)
    },

    // 3. Definition of Probabilities (Confidence Score)
    PROBABILITY: {
        CASH_PROB: 100,         // Certainty
        ETF_PROB: 70,           // High probability
        REAL_ESTATE_PROB: 85,   // High stability [NEW]
        ACTIVE_PROB: 40         // Lower probability
    },

    // 4. Time Horizons for Projection [NEW]
    // 4. Time Horizons for Projection [NEW]
    TIME_HORIZONS: Array.from({ length: 20 }, (_, i) => i + 1),

    // 5. User Input Storage (Runtime) [NEW]
    USER_INPUTS: {
        calculatedInflation: 2.5, // Default
        initialCapital: 1000000,
        monthlyContribution: 20000
    },

    // 6. Simulator Feedback Text
    // 6. Simulator Feedback Text (Rich HTML Analysis)
    SCENARIO_TEXT: {
        // 1. Speculator (>20% Active)
        DANGER_ACTIVE: {
            TITLE: "⚠️ 極高風險：你的財富正在走鋼索",
            HTML: `
                <ul class='analysis-list'>
                    <li><strong>心理解析：</strong> 你渴望快速致富，不想慢慢變老。這種「急」，讓你很容易忽視背後的巨大風險。</li>
                    <li><strong>隱形代價：</strong> 你的生活品質被盤勢綁架了。主動交易的情緒成本，其實比你想像的還貴。</li>
                    <li><strong>關鍵盲點：</strong> 歷史上 90% 的散戶輸在「過度交易」。你現在不是在新創事業，而是在賭博。</li>
                </ul>`
        },
        // 2. Cash Hoarder (>50% Cash)
        CASH_DOMINANT: {
            TITLE: "📉 溫水煮青蛙：你正在「安全」地變窮",
            HTML: `
                <ul class='analysis-list'>
                    <li><strong>心理解析：</strong> 你極度厭惡損失。只有看到銀行數字不變少，你才能感到安心。</li>
                    <li><strong>隱形代價：</strong> 你以為守住了本金，其實輸給了通膨，你的購買力將確定性地逐漸變少。</li>
                    <li><strong>關鍵盲點：</strong> 「不投資」本身就是一種 all-in 現金的投資，而且長期勝率極低。</li>
                </ul>`
        },
        // 3. Landlord (>40% RE)
        RE_DOMINANT: {
            TITLE: "🏠 資產焦慮：你看得到財富，卻用不到",
            HTML: `
                <ul class='analysis-list'>
                    <li><strong>心理解析：</strong> 你相信「有土斯有財」。實體資產讓你感到踏實，覺得這才是真正的錢。</li>
                    <li><strong>隱形代價：</strong> 當人生遇到急需 (如醫療、創業) 時，房子救不了你。過低的流動性會逼你在最差的狀態賤賣資產。</li>
                    <li><strong>關鍵盲點：</strong> 房產雖好，但不能當飯吃。你需要的是「源源不絕的現金流」，而不僅僅是帳面上的磚頭。</li>
                </ul>`
        },
        // 4. Indexer (>50% ETF)
        ETF_DOMINANT: {
            TITLE: "📈 苦行僧式的積累：方向正確，但缺乏激情",
            HTML: `
                <ul class='analysis-list'>
                    <li><strong>心理解析：</strong> 你理性、自律，相信科學與數據。你願意延遲享樂，為了未來的自由。</li>
                    <li><strong>隱形代價：</strong> 這是一條漫長而無聊的路。如果缺乏一點點「超額回報」，你可能會錯失你與家人享樂的時間與體力。</li>
                    <li><strong>關鍵盲點：</strong> 守成有餘，進攻不足。你可能低估了自己透過學習創造 (超額報酬) 的潛力。</li>
                </ul>`
        },
        // 5. The Golden Ratio (Active 5-20%, Cash < 40, Core > 40)
        BALANCED: {
            TITLE: "✨ 財富自由的入場券：你是資產的主人",
            HTML: `
                <ul class='analysis-list'>
                    <li><strong>心理解析：</strong> 你不再為錢工作，而是讓錢為你工作。你理解風險，並且學會了駕馭它。</li>
                    <li><strong>結構優勢：</strong> 你的配置像一個精密的生態系。房產/ETF 提供穩定的養分，主動交易則提供了突變演化的機會。</li>
                    <li><strong>未來展望：</strong> 這是讓人「晚上睡得著，早上會笑醒」的配置。保持現狀，時間是你最好的朋友。</li>
                </ul>`
        },
        // 6. Default/Unbalanced
        DEFAULT: {
            TITLE: "💡 尋找你的定位中...",
            HTML: `
                <ul class='analysis-list'>
                    <li><strong>心理解析：</strong> 你什麼都想要一點，以為這樣就是分散風險。這其實反映了你對各類資產的信心不足，不敢確立核心。</li>
                    <li><strong>隱形代價：</strong> 樣樣通，樣樣鬆。你的資產組合像是一支沒有主將的球隊，多頭時跑不快，空頭時也跌得痛。</li>
                    <li><strong>關鍵盲點：</strong> 「平均分散」不等於「有效配置」。沒有 (核心策略) 的投資組合，很容易在市場震盪中迷失方向。</li>
                </ul>`
        }
    }
};

// Prevent accidental modification
// Object.freeze(CONFIG); // Removed freeze to allow USER_INPUTS modification at runtime

