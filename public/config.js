/**
 * config.js
 * Central configuration for the Asset Allocation Simulator.
 * Separates business logic from presentation.
 */

const CONFIG = {
    // 1. Definition of Rates
    RATES: {
        CASH_RETURN: 1.5,
        ETF_RETURN: 8.0,
        REAL_ESTATE_RETURN: 5.5,
        ACTIVE_RETURN_AVG: 15.0,
        ACTIVE_RETURN_BEST: 120.0,
        ACTIVE_RETURN_PENALTY: -50.0,
        INFLATION_RATE: 2.5
    },

    // 2. Risk Factors
    RISK: {
        CASH_RISK: 0,
        ETF_RISK: -45,
        REAL_ESTATE_RISK: -25,
        ACTIVE_RISK: -100
    },

    // 3. Probabilities
    PROBABILITY: {
        CASH_PROB: 99,
        ETF_PROB: 95,
        REAL_ESTATE_PROB: 90,
        ACTIVE_PROB: 10
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
    // 6. Simulator Feedback Text (Plain Language for Beginners)
    SCENARIO_TEXT: {
        // 1. Speculator (>20% Active)
        DANGER_ACTIVE: {
            TITLE: "⚠️ 像在走鋼索：你太依賴「運氣」了",
            HTML: `
                <ul class='analysis-list'>
                    <li><strong>發生什麼事：</strong> 你放了很多錢在「主動交易」（如當沖、加密貨幣、個股）。這就像想靠打德州撲克維生，雖然可能賺快錢，但也很容易把本金輸光。</li>
                    <li><strong>你的感覺：</strong> 每天看盤心情起起伏伏，賺錢時覺得自己是股神，賠錢時連飯都吃不下。</li>
                    <li><strong>朋友建議：</strong> 這種高風險投資最好只佔資金的一小部分（例如 10%），當作買彩券或娛樂就好，不要拿身家性命去賭。</li>
                </ul>`
        },
        // 2. Liquidity Crisis (Cash < 15%)
        LIQUIDITY_CRISIS: {
            TITLE: "⚠️ 手上沒現金：遇到急事怎麼辦？",
            HTML: `
                <ul class='analysis-list'>
                    <li><strong>發生什麼事：</strong> 你把幾乎所有的錢都拿去投資了，銀行帳戶空空如也。你看起來很有錢，但其實很脆弱。</li>
                    <li><strong>潛在危險：</strong> 萬一突然失業、生病或家裡急需用錢，你可能被迫在股市大跌時「忍痛賠錢賣股」。這就是所謂的「死在黎明前」。</li>
                    <li><strong>朋友建議：</strong> 投資前先存好「保命錢」（6個月生活費）。這筆錢雖然不會生利息，但能讓你在股市大跌時睡得安穩。</li>
                </ul>`
        },
        // 3. No Real Estate (RE < 5%)
        NO_REAL_ESTATE: {
            TITLE: "⚠️ 資產很靈活：但小心錢變薄了",
            HTML: `
                <ul class='analysis-list'>
                    <li><strong>發生什麼事：</strong> 你的錢都在股票或現金裡，隨時可以拿出來用，非常方便。但你缺了一塊「實體資產」（如房子）。</li>
                    <li><strong>潛在危險：</strong> 歷史經驗告訴我們，房價和房租通常會跟著物價一起漲。如果你沒有配置這類資產，未來可能要花更多錢在「住」這件事上。</li>
                    <li><strong>朋友建議：</strong> 買房門檻確實高，但它的好處是「抗跌」。如果不買房，也可以研究 REITs（房地產信託），讓你的資產組合也能跟著房市一起抗通膨。</li>
                </ul>`
        },
        // 4. Cash Hoarder (>50% Cash)
        CASH_DOMINANT: {
            TITLE: "📉 太過保守：你的錢正在「縮水」",
            HTML: `
                <ul class='analysis-list'>
                    <li><strong>發生什麼事：</strong> 你可能覺得投資很可怕，所以把大部分的錢都放在銀行定存。看起來很安全，數字都不會少。</li>
                    <li><strong>潛在危險：</strong> 這是「溫水煮青蛙」。現在的 100 元，20 年後可能只買得起 60 元的東西。你不理財，通膨會吃掉你的財。</li>
                    <li><strong>朋友建議：</strong> 試著撥出一點點錢（例如 20%）投資大盤指數（ETF）。這比選股安全得多，長期下來能幫你守住購買力。</li>
                </ul>`
        },
        // 4. Landlord (>40% RE)
        RE_DOMINANT: {
            TITLE: "🏠 房子太多了：錢被「卡」住了",
            HTML: `
                <ul class='analysis-list'>
                    <li><strong>發生什麼事：</strong> 你覺得有土斯有財，把大部分身家都壓在房地產上。</li>
                    <li><strong>潛在危險：</strong> 房子很難馬上變現。如果急需用一大筆錢（例如手術費），你很難「只賣掉廁所」來換現金，甚至可能要降價求售。</li>
                    <li><strong>朋友建議：</strong> 房子是好資產，但別忘了留點現金或股票。這樣需要用錢時，按幾個按鈕就能變現，不用看房仲臉色。</li>
                </ul>`
        },
        // 5. Indexer (>50% ETF)
        ETF_DOMINANT: {
            TITLE: "📈 坐雲霄飛車：心臟要夠大顆",
            HTML: `
                <ul class='analysis-list'>
                    <li><strong>發生什麼事：</strong> 你選擇了指數投資（ETF），相信經濟長期會成長。這是一個很棒的策略，但過程不會一帆風順。</li>
                    <li><strong>心理準備：</strong> 股市有時候會跌得很慘（例如跌 30%）。這時候你的帳戶數字會很難看，你要忍住「不要賣」，這比想像中難很多。</li>
                    <li><strong>朋友建議：</strong> 既然選擇了這條路，就要做個「長期主義者」。把眼光放遠到 10 年後，短期的漲跌就只是雜訊而已。</li>
                </ul>`
        },
        // 6. The Golden Ratio (Active 5-20%, Cash > 15%, Core > 40)
        BALANCED: {
            TITLE: "✨ 攻守兼備：這就是「黃金比例」",
            HTML: `
                <ul class='analysis-list'>
                    <li><strong>為什麼這樣好：</strong> 你有現金應急（守）、有房產/大盤抗通膨（穩）、還有一點點主動交易爭取超額報酬（攻）。</li>
                    <li><strong>實際好處：</strong> 這樣的配置就像一台好車：有安全氣囊（現金）、有穩定的引擎（核心資產）、還有偶爾能踩油門的樂趣（主動投資）。</li>
                    <li><strong>未來展望：</strong> 這是最能讓人「睡得著覺」的配置。不用天天盯盤，時間久了，資產自然會穩穩長大。</li>
                </ul>`
        },
        // 7. Default/Unbalanced
        DEFAULT: {
            TITLE: "💡 還在摸索中：你的錢有點「散」",
            HTML: `
                <ul class='analysis-list'>
                    <li><strong>發生什麼事：</strong> 你好像什麼都想試一點，或者還沒決定要主攻哪裡。目前的配置比較分散，就像一支球隊沒有隊長。</li>
                    <li><strong>潛在問題：</strong> 雖然分散是好事，但如果沒有一個「核心策略」（例如以房產或股市為主），資產很難有效率地長大，容易原地踏步。</li>
                    <li><strong>朋友建議：</strong> 試著問自己：「我最能承受哪種風險？」是房子的變現慢？還是股票的波動大？選定一個當主角，其他的當配角，投資之路會走得更順。</li>
                </ul>`
        }
    }
};

// Prevent accidental modification
// Object.freeze(CONFIG); // Removed freeze to allow USER_INPUTS modification at runtime

