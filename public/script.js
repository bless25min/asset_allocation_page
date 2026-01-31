/**
 * script.js (V3.2 Final)
 * Logic for the Asset Allocation Simulator.
 * Handles Dual Independent Slider Groups, Monthly Compounding, and Wealth Gap.
 */

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {
    initInflationCalc();
    initSimulator();
    initEmbedMode();
    bindUIEvents(); // Bind immediately
    initAuth();     // Start LIFF in background
});

// --- Part 1: Inflation Calculator ---
function initInflationCalc() {
    const inputs = {
        item: document.getElementById('calc-item'),
        oldPrice: document.getElementById('calc-price-old'),
        nowPrice: document.getElementById('calc-price-now')
    };
    const btn = document.getElementById('btn-calc-inflation');
    const resultDiv = document.getElementById('calc-result');
    const resultSpan = document.getElementById('res-inflation-rate');

    btn.addEventListener('click', () => {
        const pOld = parseFloat(inputs.oldPrice.value);
        const pNow = parseFloat(inputs.nowPrice.value);
        const years = 10;

        if (pOld > 0 && pNow > 0) {
            const cagr = (Math.pow(pNow / pOld, 1 / years) - 1) * 100;
            const cagrFixed = cagr.toFixed(2);

            resultSpan.innerText = `${cagrFixed}%`;
            resultDiv.classList.remove('hidden');

            CONFIG.USER_INPUTS.calculatedInflation = cagr;
            document.dispatchEvent(new Event('inflationUpdated'));
        } else {
            alert("請輸入有效的價格數字！");
        }
    });
}

// --- Part 2: Simulator Logic (Dual) ---
function initSimulator() {
    // === Inputs ===
    const finInputs = {
        initial: document.getElementById('inp-initial'),
        monthly: document.getElementById('inp-monthly'),
        rateA: document.getElementById('val-rate-a'), // In Panel A Header
        rateB: document.getElementById('val-rate-b')  // In Panel B Header
    };

    // --- Dual Slider Groups ---
    const groups = {
        a: {
            sliders: {
                cash: document.getElementById('slider-a-cash'),
                etf: document.getElementById('slider-a-etf'),
                re: document.getElementById('slider-a-re'),
                active: document.getElementById('slider-a-active')
            },
            labels: {
                cash: document.getElementById('val-a-cash'),
                etf: document.getElementById('val-a-etf'),
                re: document.getElementById('val-a-re'),
                active: document.getElementById('val-a-active')
            },
            state: { cash: 100, etf: 0, re: 0, active: 0 } // Default A: 100% Cash
        },
        b: {
            sliders: {
                cash: document.getElementById('slider-b-cash'),
                etf: document.getElementById('slider-b-etf'),
                re: document.getElementById('slider-b-re'),
                active: document.getElementById('slider-b-active')
            },
            labels: {
                cash: document.getElementById('val-b-cash'),
                etf: document.getElementById('val-b-etf'),
                re: document.getElementById('val-b-re'),
                active: document.getElementById('val-b-active')
            },
            state: { cash: 100, etf: 0, re: 0, active: 0 } // Default B: 100% Cash
        }
    };

    const outputs = {
        return: document.getElementById('out-return'),
        risk: document.getElementById('out-risk'),
        prob: document.getElementById('out-prob'),
        feedback: document.getElementById('sim-feedback')
    };

    let wealthChart = null;

    // --- Normalization Logic (Smart Remainder) ---
    function updateGroupState(groupKey, sourceKey) {
        const group = groups[groupKey];
        const state = group.state;

        // Ensure source is integer and valid
        state[sourceKey] = Math.max(0, Math.min(100, state[sourceKey]));

        let diff = 100 - state[sourceKey];
        const others = Object.keys(state).filter(k => k !== sourceKey);

        let sumOthers = 0;
        others.forEach(k => sumOthers += state[k]);

        if (sumOthers === 0) {
            // Even distribution for integers
            const count = others.length;
            const base = Math.floor(diff / count);
            let rem = diff % count;

            others.forEach(k => {
                state[k] = base;
                if (rem > 0) {
                    state[k]++;
                    rem--;
                }
            });
        } else {
            const ratio = diff / sumOthers;
            others.forEach(k => state[k] = Math.max(0, Math.round(state[k] * ratio)));
        }

        // Recalculate sum to find remainder/overflow
        let runningSum = 0;
        others.forEach(k => runningSum += state[k]);
        let remainder = diff - runningSum;

        // Smart Distribution of Remainder
        let loops = 0;
        while (remainder !== 0 && loops < 100) {
            if (remainder > 0) {
                // Add to largest item or cycle
                for (let k of others) {
                    if (remainder > 0) {
                        state[k]++;
                        remainder--;
                    }
                }
            } else {
                // Subtract from items > 0, largest first
                const sorted = [...others].sort((a, b) => state[b] - state[a]);
                let subtracted = false;
                for (let k of sorted) {
                    if (remainder < 0 && state[k] > 0) {
                        state[k]--;
                        remainder++;
                        subtracted = true;
                    }
                }
                if (!subtracted) break;
            }
            loops++;
        }

        // Final Safety Clamp
        others.forEach(k => state[k] = Math.max(0, Math.min(100, state[k])));

        // Visual Sync
        others.forEach(k => group.sliders[k].value = state[k]);

        updateUI();
    }

    // Attach Listeners for Both Groups
    ['a', 'b'].forEach(gKey => {
        Object.keys(groups[gKey].sliders).forEach(sKey => {
            groups[gKey].sliders[sKey].addEventListener('input', (e) => {
                groups[gKey].state[sKey] = parseInt(e.target.value);
                updateGroupState(gKey, sKey);
            });
        });
    });

    [finInputs.initial, finInputs.monthly].forEach(inp => {
        inp.addEventListener('input', updateUI);
    });
    document.addEventListener('inflationUpdated', updateUI);

    // Global listener for state restoration
    document.addEventListener('stateRestored', () => {
        ['a', 'b'].forEach(gKey => {
            const group = groups[gKey];
            Object.keys(group.sliders).forEach(sKey => {
                group.state[sKey] = parseInt(group.sliders[sKey].value) || 0;
            });
        });
        updateUI();
    });

    // --- Math ---
    function getWeightedReturn(reqState) {
        // EV = Rate * Probability (Expected Value logic)
        // No explicit penalty, just low probability for Active

        const wCash = (CONFIG.PROBABILITY.CASH_PROB / 100);
        const wEtf = (CONFIG.PROBABILITY.ETF_PROB / 100);
        const wRe = (CONFIG.PROBABILITY.REAL_ESTATE_PROB / 100);
        const wActive = (CONFIG.PROBABILITY.ACTIVE_PROB / 100);

        // Calculate Expected Return based on EV of each component
        return (
            (reqState.cash * CONFIG.RATES.CASH_RETURN * wCash) +
            (reqState.etf * CONFIG.RATES.ETF_RETURN * wEtf) +
            (reqState.re * CONFIG.RATES.REAL_ESTATE_RETURN * wRe) +
            (reqState.active * CONFIG.RATES.ACTIVE_RETURN_AVG * wActive)
        ) / 100;
    }

    // UPDATED: Monthly Compounding for Higher Accuracy
    function calculateFV(principal, monthly, annualRatePercent, years) {
        const rAnnual = annualRatePercent / 100;
        const rMonthly = rAnnual / 12;
        const months = years * 12;

        if (rAnnual === 0) return principal + (monthly * months);

        // FV of Principal: P * (1 + r)^n
        const fvPrincipal = principal * Math.pow(1 + rMonthly, months);

        // FV of Series (Ordinary Annuity): PMT * [((1 + r)^n - 1) / r]
        const fvContributions = monthly * ((Math.pow(1 + rMonthly, months) - 1) / rMonthly);

        return fvPrincipal + fvContributions;
    }

    function calculateMetrics() {
        const rateA = getWeightedReturn(groups.a.state);
        const rateB = getWeightedReturn(groups.b.state);

        // Metrics for Plan B
        const stateB = groups.b.state;
        const maxRiskB = (
            (stateB.cash * CONFIG.RISK.CASH_RISK) +
            (stateB.etf * CONFIG.RISK.ETF_RISK) +
            (stateB.re * CONFIG.RISK.REAL_ESTATE_RISK) +
            (stateB.active * CONFIG.RISK.ACTIVE_RISK)
        ) / 100;

        // --- New Probability Logic: Contribution Weighted ---
        // User Insight: Probability should depend on WHERE the money comes from, not just where money IS.
        // If 10% allocation generates 90% of returns, the risk profile is dominated by that 10%.

        // 1. Calculate weighted return contribution for each asset
        const contribCash = stateB.cash * CONFIG.RATES.CASH_RETURN;
        const contribEtf = stateB.etf * CONFIG.RATES.ETF_RETURN;
        const contribRe = stateB.re * CONFIG.RATES.REAL_ESTATE_RETURN;
        const contribActive = stateB.active * CONFIG.RATES.ACTIVE_RETURN_AVG;

        const totalReturnContrib = contribCash + contribEtf + contribRe + contribActive;

        // 2. Calculate Contribution Weights (Avoid divide by zero)
        // If total return is <= 0 (unlikely but possible), fall back to simple allocation weights
        let wCash, wEtf, wRe, wActive;

        if (totalReturnContrib > 0.001) {
            wCash = contribCash / totalReturnContrib;
            wEtf = contribEtf / totalReturnContrib;
            wRe = contribRe / totalReturnContrib;
            wActive = contribActive / totalReturnContrib;
        } else {
            wCash = stateB.cash / 100;
            wEtf = stateB.etf / 100;
            wRe = stateB.re / 100;
            wActive = stateB.active / 100;
        }

        // 3. Calculate Weighted Probability
        const probB = (
            (wCash * CONFIG.PROBABILITY.CASH_PROB) +
            (wEtf * CONFIG.PROBABILITY.ETF_PROB) +
            (wRe * CONFIG.PROBABILITY.REAL_ESTATE_PROB) +
            (wActive * CONFIG.PROBABILITY.ACTIVE_PROB)
        );

        // Best case logic for Bar
        let activeBest = CONFIG.RATES.ACTIVE_RETURN_BEST; // Always show potential upside
        const bestB = (
            (stateB.cash * CONFIG.RATES.CASH_RETURN_BEST) +
            (stateB.etf * CONFIG.RATES.ETF_RETURN_BEST) +
            (stateB.re * CONFIG.RATES.REAL_ESTATE_RETURN_BEST) +
            (stateB.active * activeBest)
        ) / 100;

        return {
            rateA,
            rateB,
            maxRiskB,
            probB,
            bestB,
            activeWarningB: (stateB.active > 20 || groups.a.state.active > 20),
            activeWarning: (stateB.active > 20)
        };
    }

    // --- Chart ---
    function updateChart(metrics) {
        const ctx = document.getElementById('wealthChart');
        if (!ctx) return;

        // Re-query inputs directly to ensure fresh value reading
        const elInitial = document.getElementById('inp-initial');
        const elMonthly = document.getElementById('inp-monthly');

        const initial = parseFloat(elInitial ? elInitial.value : 0) || 0;
        const monthly = parseFloat(elMonthly ? elMonthly.value : 0) || 0;

        const inflationRate = CONFIG.USER_INPUTS.calculatedInflation;
        const labels = CONFIG.TIME_HORIZONS.map(y => `${y}年後`);

        const dataA = CONFIG.TIME_HORIZONS.map(y => calculateFV(initial, monthly, metrics.rateA, y));
        const dataB = CONFIG.TIME_HORIZONS.map(y => calculateFV(initial, monthly, metrics.rateB, y));
        const dataInf = CONFIG.TIME_HORIZONS.map(y => calculateFV(initial, monthly, inflationRate, y));

        if (wealthChart) {
            wealthChart.data.datasets[0].data = dataInf;
            wealthChart.data.datasets[1].data = dataA;
            wealthChart.data.datasets[2].data = dataB;
            wealthChart.update();
        } else {
            wealthChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            type: 'line',
                            label: '通膨及格線',
                            data: dataInf,
                            borderColor: '#EF4444',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            pointRadius: 0,
                            order: 0
                        },
                        {
                            label: '方案 A (現況)',
                            data: dataA,
                            backgroundColor: '#94a3b8',
                            order: 2
                        },
                        {
                            label: '方案 B (策略)',
                            data: dataB,
                            backgroundColor: '#F59E0B',
                            order: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(255,255,255,0.1)' },
                            ticks: {
                                color: '#aaa',
                                callback: function (value) { return (value / 10000).toFixed(0) + '萬'; }
                            }
                        },
                        x: { display: true, grid: { display: false }, ticks: { color: '#aaa' } }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    let result = context.raw;
                                    return context.dataset.label + ': ' + Math.round(result / 10000).toLocaleString() + ' 萬';
                                },
                                footer: function (tooltipItems) {
                                    let valA = 0, valB = 0;
                                    tooltipItems.forEach(item => {
                                        if (item.dataset.label.includes('方案 A')) valA = item.parsed.y;
                                        if (item.dataset.label.includes('方案 B')) valB = item.parsed.y;
                                    });
                                    if (valA && valB) {
                                        const gap = valB - valA;
                                        return '財富差距: ' + (gap > 0 ? '+' : '') + Math.round(gap / 10000).toLocaleString() + ' 萬';
                                    }
                                }
                            }
                        }
                    }
                }
            });
        }

        // V3.2 Update Wealth Gap Card (Range Edition)
        const lastA = dataA[dataA.length - 1];

        // Calculate Best/Worst B Final Wealth
        // Cap "Long-term Best" at 30% to avoid astronomical numbers (120% is for short-term volatility)
        const longTermBestRate = Math.min(metrics.bestB, 30.0);

        const lastB_Best = calculateFV(initial, monthly, longTermBestRate, 20); // 20 years capped
        const lastB_Worst = calculateFV(initial, monthly, metrics.maxRiskB, 20);

        const gapMin = lastB_Worst - lastA;
        const gapMax = lastB_Best - lastA;
        const gapEl = document.getElementById('val-wealth-gap');

        if (gapEl) {
            // Helper specific for this manual HTML construction to control colors
            const fmt = (val) => {
                const wan = Math.round(val / 10000);
                const absWan = Math.abs(wan);
                let numStr = "";
                if (absWan >= 10000) {
                    numStr = (wan / 10000).toFixed(1) + '億';
                } else {
                    numStr = wan.toLocaleString() + '萬';
                }
                // Add explicit sign if positive
                if (val > 0) numStr = "+" + numStr;
                return numStr;
            };

            const minHtml = fmt(gapMin);
            const maxHtml = fmt(gapMax);

            gapEl.innerHTML = `<span style="color:var(--danger)">${minHtml}</span> <span style="font-size:0.75em;color:#64748b"> 至 </span> <span style="color:var(--accent)">${maxHtml}</span>`;
            // Override default color logic as we use inline HTML now
            gapEl.style.color = '';
        }
    }

    // Debounce Utility to prevent chart thrashing
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    // Debounced Analysis Update (Metrics + Feedback + Chart)
    // Separation of Concerns: 
    // updateUI = Instant (Labels + Loading Placeholder)
    // updateAnalysisResults = Delayed (Calculation + DOM thrashing + Chart)
    const debouncedUpdateAnalysis = debounce(updateAnalysisResults, 1000);

    let isAnalyzing = false; // State to track analyzing status

    function updateAnalysisResults() {
        // Calculate
        const metrics = calculateMetrics();

        // 1. Update Top Bar (Rates) - Restore real values
        if (finInputs.rateA) finInputs.rateA.innerText = `${metrics.rateA.toFixed(1)}%`;
        if (finInputs.rateB) finInputs.rateB.innerText = `${metrics.rateB.toFixed(1)}%`;

        // Store for persistence logic (avoid DOM dependency)
        CONFIG.USER_INPUTS.lastRateA = metrics.rateA;
        CONFIG.USER_INPUTS.lastRateB = metrics.rateB;

        // 2. Update Dashboard Stats - Restore real values
        outputs.return.innerText = (metrics.rateB > 0 ? '+' : '') + `${metrics.rateB.toFixed(1)}%`;
        outputs.return.style.color = (metrics.rateB < 0) ? 'var(--danger)' : 'var(--white)';

        const minRisk = metrics.maxRiskB.toFixed(1);
        const maxReward = metrics.bestB.toFixed(1);
        const maxSign = metrics.bestB > 0 ? '+' : '';
        outputs.risk.innerHTML = `<span style="color:#ef4444">${minRisk}%</span> ~ <span style="color:#10b981">${maxSign}${maxReward}%</span>`;

        outputs.prob.innerText = `${Math.round(metrics.probB)}%`;

        // 3. Advanced Feedback Logic
        const state = groups.b.state;
        const totalCore = state.etf + state.re;
        let scenarioKey = 'DEFAULT';

        // ... Scenario Logic ...
        if (state.active > 20) scenarioKey = 'DANGER_ACTIVE';
        else if (state.cash < 15) scenarioKey = 'LIQUIDITY_CRISIS';
        else if (state.re < 5) scenarioKey = 'NO_REAL_ESTATE';
        else if (state.active >= 5 && state.active <= 20 && totalCore >= 40 && state.cash >= 15) scenarioKey = 'BALANCED';
        else if (state.cash > 50) scenarioKey = 'CASH_DOMINANT';
        else if (state.re > 40) scenarioKey = 'RE_DOMINANT';
        else if (state.etf > 50) scenarioKey = 'ETF_DOMINANT';

        const feedbackConfig = CONFIG.SCENARIO_TEXT[scenarioKey];

        // Render HTML - Restore real feedback
        outputs.feedback.innerHTML = `
            <h4 style="margin-bottom:0.5rem; color:${feedbackConfig.TITLE.includes('警告') ? 'var(--danger)' : 'var(--white)'}">
                ${feedbackConfig.TITLE}
            </h4>
            ${feedbackConfig.HTML}
        `;
        outputs.feedback.style.color = '#e2e8f0';

        // 4. Update Chart (Heavy)
        const ctx = document.getElementById('wealthChart');
        if (ctx) ctx.style.opacity = '1';
        updateChart(metrics);

        // Analysis Complete
        isAnalyzing = false;
    }

    function updateUI() {
        // Phase 1: INSTANT Feedback (Zero Lag)
        // Sync Labels Group A
        Object.keys(groups.a.state).forEach(k => groups.a.labels[k].innerText = `${groups.a.state[k]}%`);
        // Sync Labels Group B
        Object.keys(groups.b.state).forEach(k => groups.b.labels[k].innerText = `${groups.b.state[k]}%`);

        // Phase 2: Set "Analyzing..." State (Stopgap to prevent stutter)
        if (!isAnalyzing) {
            isAnalyzing = true;

            // Set placeholders
            outputs.return.innerText = "...";
            outputs.risk.innerText = "...";
            outputs.prob.innerText = "...";

            // Set Feedback Placeholder
            outputs.feedback.innerHTML = `
                <h4 style="margin-bottom:0.5rem; color:#94a3b8">
                    🔄 策略分析中...
                </h4>
                <p style="color:#64748b; font-size:0.9rem;">正在計算資產相關性與風險模型...</p>
            `;

            // Optional: Dim the chart to indicate stale data
            const ctx = document.getElementById('wealthChart');
            if (ctx) ctx.style.opacity = '0.5';
        }

        // Also restore chart opacity in the delayed function? 
        // No, updateChart redraws it, but better to handle opacity restore there or just here implicitly.
        // Let's ensure updateAnalysisResults cleans up everything properly.
        // Actually, let's keep it simple: just text placeholders for now to verify smoothness.

        // Phase 3: DEBOUNCED Analysis (Heavy Lifting)
        debouncedUpdateAnalysis();

        // Restore opacity in the delayed function
        // Need to add ctx.style.opacity = '1' in updateAnalysisResults or updateChart
        // For now, let's just stick to the text placeholders as requested.
    }

    // Init
    updateUI();
}

// --- Part 3: Embed & Fullscreen Logic ---
// --- Part 3: Embed & Fullscreen Logic ---
function initEmbedMode() {
    const urlParams = new URLSearchParams(window.location.search);
    const isEmbed = urlParams.get('mode') === 'embed';

    if (!isEmbed) return;

    // Elements
    const body = document.body;
    const launcher = document.getElementById('embed-launcher');
    const startBtn = document.getElementById('btn-start-embed');
    const exitBtn = document.getElementById('btn-exit-fullscreen');
    const newWindowBtn = document.getElementById('btn-new-window');

    // 1. Initial State
    body.classList.add('embed-mode');
    launcher.classList.remove('hidden');
    // Simulator hidden by CSS (body.embed-mode .simulator-section)

    // Feature Detection: Check if Fullscreen is allowed
    const isFullscreenEnabled = document.fullscreenEnabled ||
        document.webkitFullscreenEnabled ||
        document.mozFullScreenEnabled ||
        document.msFullscreenEnabled;

    // Prepare "New Window" link (points to same page but clean URL)
    // Remove query params to avoid infinite embed loop in new window if preferred, 
    // OR keep them but ensure the user gets a full view.
    // Let's just point to index.html without embed param so it presents as standalone.
    const cleanUrl = window.location.href.split('?')[0];
    if (newWindowBtn) {
        newWindowBtn.href = cleanUrl;

        // Strategy: 
        // If Fullscreen BLOCKED: Show "Open New Window" prominently
        // If Fullscreen OK: Show "Start" (FS) + "Open New Window" (Secondary)
        if (!isFullscreenEnabled) {
            startBtn.innerHTML = '<span class="icon">⎋</span> 在新視窗開啟';
            // Repurpose start button to open new window
            startBtn.onclick = () => window.open(cleanUrl, '_blank');
            // Hide the secondary link since the main button does it now
            newWindowBtn.classList.add('hidden');
        } else {
            // Fullscreen might be possible, but let's show the secondary link just in case
            newWindowBtn.classList.remove('hidden');
        }
    }

    // 2. Start (Fullscreen) Handler (Only if FS enabled)
    if (isFullscreenEnabled) {
        startBtn.addEventListener('click', () => {
            enterFullscreen();
        });
    }

    // 3. Exit Handler
    exitBtn.addEventListener('click', () => {
        exitFullscreen();
    });

    // 4. Native Fullscreen Change Listener
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('mozfullscreenchange', onFullscreenChange);
    document.addEventListener('MSFullscreenChange', onFullscreenChange);

    function enterFullscreen() {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
            docEl.requestFullscreen().catch(err => {
                console.warn("Fullscreen failed:", err);
                // Fallback if promise rejects (e.g. user denied or obscure policy)
                // We can't auto-open window here easily due to async loss of gesture,
                // but we can alert or update UI.
                alert("無法進入全螢幕模式，請嘗試點擊「在新視窗開啟」。");
                newWindowBtn.classList.remove('hidden');
            });
        } else if (docEl.mozRequestFullScreen) {
            docEl.mozRequestFullScreen();
        } else if (docEl.webkitRequestFullscreen) {
            docEl.webkitRequestFullscreen();
        } else if (docEl.msRequestFullscreen) {
            docEl.msRequestFullscreen();
        }
        updateEmbedState(true);
    }

    function exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        updateEmbedState(false);
    }

    function onFullscreenChange() {
        const isFS = document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement;

        updateEmbedState(!!isFS);
    }

    function updateEmbedState(isFullscreen) {
        if (isFullscreen) {
            body.classList.add('fullscreen-mode');
            launcher.classList.add('hidden');
            exitBtn.classList.remove('hidden');
        } else {
            body.classList.remove('fullscreen-mode');
            launcher.classList.remove('hidden');
            exitBtn.classList.add('hidden');
        }
    }
}

// --- Part 4: Auth & Data Logic (LIFF V2) ---
const LIFF_ID = '1656872168-iM0I3QG0';
let LIFF_READY = false;

function bindUIEvents() {
    // 1. Auth Actions
    document.getElementById('btn-login').addEventListener('click', () => {
        if (!LIFF_READY) return alert('系統初始化中，請稍候...');
        if (!liff.isLoggedIn()) {
            savePendingState();
            liff.login();
        }
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        if (!LIFF_READY) return alert('系統初始化中...');
        logout();
    });

    document.getElementById('btn-save-sim').addEventListener('click', () => {
        if (!LIFF_READY) return alert('請稍候，系統認證中...');
        saveSimulation();
    });

    document.getElementById('btn-view-stats').addEventListener('click', () => {
        if (!LIFF_READY) return alert('統計功能載入中，請稍候...');
        loadStats();
    });

    // 2. Modal Close Actions
    const closeStats = () => document.getElementById('stats-modal').classList.add('hidden');
    document.getElementById('btn-close-stats').addEventListener('click', closeStats);

    const footerBtn = document.getElementById('btn-close-stats-footer');
    if (footerBtn) footerBtn.addEventListener('click', closeStats);

    const overlay = document.getElementById('stats-modal');
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeStats();
    });
}

async function initAuth() {
    try {
        await liff.init({ liffId: LIFF_ID });
        LIFF_READY = true;

        if (liff.isLoggedIn()) {
            await handleLoggedInUser();
        } else {
            updateAuthState(false);
        }

        // Restore state
        restorePendingState();

        // [UX] Post-login auto-open
        if (localStorage.getItem('pending_stats_open')) {
            localStorage.removeItem('pending_stats_open');
            setTimeout(loadStats, 800); // Android needs slightly more time
        }
    } catch (error) {
        console.error('LIFF Init Failed:', error);
        // Show user-friendly error on Android
        if (window.navigator.userAgent.includes('Android')) {
            alert('LINE 登入初始化失敗，請嘗試由官方帳號重新開啟連結。');
        }
    }
}

async function handleLoggedInUser() {
    try {
        // Android WebView can be slow to sync idToken
        let idToken = liff.getIDToken();
        let retries = 0;

        while (!idToken && retries < 5) {
            console.warn(`idToken not ready, retry ${retries + 1}...`);
            await new Promise(r => setTimeout(r, 600)); // Increased delay for Android
            idToken = liff.getIDToken();
            retries++;
        }

        if (!idToken) {
            console.error('Failed to get idToken after retries');
            // Check if we have cached profile
            if (localStorage.getItem('line_user_id')) {
                updateAuthState(true);
                return;
            }
            throw new Error('無法取得 LINE 認證資訊，請嘗試重新整理頁面');
        }

        const profile = await liff.getProfile();
        const res = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken })
        });

        const data = await res.json();

        if (data.success) {
            localStorage.setItem('line_user_id', profile.userId);
            localStorage.setItem('line_user_name', profile.displayName);
            localStorage.setItem('line_user_pic', profile.pictureUrl);
            updateAuthState(true);
        } else {
            throw new Error(data.error || '後端認證失敗');
        }
    } catch (e) {
        console.error('Handle User Failed:', e);
        // On Android, provide a clearer hint
        if (window.navigator.userAgent.includes('Android')) {
            alert('登入處理失敗：' + e.message);
        }
        if (!localStorage.getItem('line_user_id')) {
            updateAuthState(false);
        }
    }
}



function updateAuthState(isLoggedIn) {
    const userId = localStorage.getItem('line_user_id');
    const userName = localStorage.getItem('line_user_name');
    const userPic = localStorage.getItem('line_user_pic');

    const btnLogin = document.getElementById('btn-login');
    const userInfo = document.getElementById('user-info');
    const btnSave = document.getElementById('btn-save-sim');

    if (userId) {
        // Logged In
        btnLogin.classList.add('hidden');
        userInfo.classList.remove('hidden');
        document.getElementById('user-name').innerText = userName;
        if (userPic && userPic !== 'undefined') {
            document.getElementById('user-pic').src = userPic;
        } else {
            document.getElementById('user-pic').src = 'https://ui-avatars.com/api/?name=' + userName;
        }

        btnSave.classList.remove('hidden');
    } else {
        // Guest
        btnLogin.classList.remove('hidden');
        userInfo.classList.add('hidden');
        btnSave.classList.add('hidden');
    }
}

function logout() {
    if (confirm('確定要登出嗎？')) {
        if (liff.isLoggedIn()) {
            liff.logout();
        }
        localStorage.removeItem('line_user_id');
        localStorage.removeItem('line_user_name');
        localStorage.removeItem('line_user_pic');
        updateAuthState(false);
        window.location.reload();
    }
}

async function saveSimulation() {
    if (!liff.isLoggedIn()) {
        liff.login();
        return;
    }

    const btn = document.getElementById('btn-save-sim');
    const originalText = btn.innerText;
    btn.innerText = '儲存中...';
    btn.disabled = true;

    try {
        const userId = liff.getDecodedIDToken().sub;
        const payload = gatherSimulationData();

        const res = await fetch('/api/simulation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId
            },
            body: JSON.stringify(payload)
        });

        const json = await res.json();
        if (json.success) {
            alert('✅ 配置已儲存至您的帳號！');
        } else {
            alert('❌ 儲存失敗: ' + (json.error || 'Unknown'));
        }
    } catch (e) {
        alert('連線錯誤：' + e.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function gatherSimulationData() {
    return {
        inputData: {
            initial: document.getElementById('inp-initial').value,
            monthly: document.getElementById('inp-monthly').value
        },
        allocationData: {
            panelA: {
                cash: parseInt(document.getElementById('slider-a-cash').value),
                etf: parseInt(document.getElementById('slider-a-etf').value),
                re: parseInt(document.getElementById('slider-a-re').value),
                active: parseInt(document.getElementById('slider-a-active').value)
            },
            panelB: {
                cash: parseInt(document.getElementById('slider-b-cash').value),
                etf: parseInt(document.getElementById('slider-b-etf').value),
                re: parseInt(document.getElementById('slider-b-re').value),
                active: parseInt(document.getElementById('slider-b-active').value)
            }
        },
        metricsData: {
            rateA: parseFloat(CONFIG.USER_INPUTS.lastRateA || 0),
            rateB: parseFloat(CONFIG.USER_INPUTS.lastRateB || 0),
            risk: parseFloat(document.getElementById('out-risk').innerText),
            prob: parseFloat(document.getElementById('out-prob').innerText),
            infItem: (document.getElementById('calc-item').value).trim() || "",
            infPriceOld: parseFloat(document.getElementById('calc-price-old').value) || 0,
            infPriceNow: parseFloat(document.getElementById('calc-price-now').value) || 0,
            infRate: CONFIG.USER_INPUTS.calculatedInflation ? CONFIG.USER_INPUTS.calculatedInflation.toFixed(2) : "0.00"
        }
    };
}

let allStatsData = null; // Cache for switching groups

async function loadStats() {
    const modal = document.getElementById('stats-modal');
    modal.classList.remove('hidden');

    // 0. Pre-login Anonymous Storage (Zero Data Loss Strategy)
    try {
        const payload = gatherSimulationData();
        await fetch('/api/simulation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.warn('Anonymous Save Failed (Ignoring):', e);
    }

    // 1. Force Login Check (UI Version)
    if (!liff.isLoggedIn()) {
        const filters = document.getElementById('stats-filters');
        const grid = document.querySelector('.stats-content-grid');
        const cta = document.getElementById('stats-cta-link'); // Added
        if (cta) cta.classList.add('hidden'); // Added
        if (filters) filters.style.display = 'none';
        if (grid) grid.innerHTML = `
            <div style="grid-column: 1/-1; padding: 2rem 1rem; text-align:center;">
                <div style="margin-bottom: 1.5rem;">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/4/41/LINE_logo.svg" alt="LINE" width="40" style="margin-bottom:1rem;">
                    <h4 style="color: #fff; margin-bottom: 0.5rem;">想看大家怎麼配嗎？</h4>
                    <p style="font-size: 0.85rem; color: #94a3b8; line-height:1.4;">
                        📊 數據已為您先行儲存！<br>
                        登入後即可解鎖社群大數據，查看不同本金規模的配置參考。
                    </p>
                </div>
                <button onclick="loginToSeeStats()" class="btn-line-cta">
                    使用 LINE 帳號登入
                </button>
            </div>
        `;
        return;
    }

    try {
        // 2. Friendship Check
        const friendship = await liff.getFriendship();
        if (!friendship.friendFlag) {
            const filters = document.getElementById('stats-filters');
            const cta = document.getElementById('stats-cta-link'); // Added
            if (cta) cta.classList.add('hidden'); // Added
            if (filters) filters.style.display = 'none';
            const grid = document.querySelector('.stats-content-grid');
            if (grid) grid.innerHTML = `
                <div style="grid-column: 1/-1; padding: 2.5rem 1rem; text-align:center;">
                    <p style="margin-bottom: 1rem; font-weight: bold; color: #fff;">🔓 您需要先加入 LINE 官方帳號好友</p>
                    <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 1.5rem;">
                        由於統計結果為進階功能，請在授權頁面中勾選「加入好友」。<br>
                        若您剛才遺漏了，請點擊下方按鈕重新授權。
                    </p>
                    <button onclick="loginToSeeStats()" class="btn-line-cta">
                        ✅ 重新登入並加入好友
                    </button>
                </div>
            `;
            return;
        }

        // 3. Fetch Data
        // Meta Pixel: Track CompleteRegistration (Login + Friend Add Success)
        if (typeof fbq === 'function') {
            fbq('track', 'CompleteRegistration');
        }

        const res = await fetch('/api/stats');
        const data = await res.json();
        allStatsData = data.groups;

        // Show filters and render default (small)
        document.getElementById('stats-filters').style.display = 'flex';
        const cta = document.getElementById('stats-cta-link'); // Added
        if (cta) cta.classList.remove('hidden'); // Show now
        switchStatsGroup('small');

    } catch (e) {
        console.error(e);
        const grid = document.querySelector('.stats-content-grid');
        if (grid) grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 2rem;">連線錯誤</div>';
    }
}

function switchStatsGroup(groupKey) {
    if (!allStatsData) return;

    // Update Tab Active State
    const buttons = document.querySelectorAll('#stats-filters button');
    buttons.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(`'${groupKey}'`));
    });

    const g = allStatsData.find(item => item.key === groupKey);
    const aBody = document.getElementById('stats-a-body');
    const bBody = document.getElementById('stats-b-body');
    const infBox = document.getElementById('stats-inf-box');

    if (!g || g.count === 0) {
        const emptyMsg = '<tr><td colspan="2">尚無數據</td></tr>';
        aBody.innerHTML = emptyMsg;
        bBody.innerHTML = emptyMsg;
        infBox.innerHTML = '<p>尚無數據</p>';
        return;
    }

    // Render Table A (Current)
    if (!g.a || g.a.count === 0) {
        aBody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding: 2rem; color: #64748b;">尚無有效配置數據</td></tr>';
    } else {
        aBody.innerHTML = `
            <tr><td>現金/定存</td><td>${g.a.cash}%</td></tr>
            <tr><td>指數/ETF</td><td>${g.a.etf}%</td></tr>
            <tr><td>房地產</td><td>${g.a.re}%</td></tr>
            <tr><td>主動投資</td><td>${g.a.active}%</td></tr>
            <tr class="accent-row"><td>平均預期報酬</td><td>${g.a.avgRet}%</td></tr>
        `;
    }

    // Render Table B (Target)
    if (!g.b || g.b.count === 0) {
        bBody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding: 2rem; color: #64748b;">尚無有效配置數據</td></tr>';
    } else {
        bBody.innerHTML = `
            <tr><td>現金/定存</td><td>${g.b.cash}%</td></tr>
            <tr><td>指數/ETF</td><td>${g.b.etf}%</td></tr>
            <tr><td>房地產</td><td>${g.b.re}%</td></tr>
            <tr><td>主動投資</td><td>${g.b.active}%</td></tr>
            <tr class="accent-row"><td>平均期望報酬</td><td>${g.b.avgRet}%</td></tr>
        `;
    }

    // Render Inflation Feed
    if (!g.inf.feed || g.inf.feed.length === 0) {
        infBox.innerHTML = '<div class="inf-empty">尚無通膨觀測數據</div>';
    } else {
        const feedHtml = g.inf.feed.map(item => `
            <div class="inf-item-card">
                <div class="inf-item-info">
                    <span class="inf-item-name">${item.name}</span>
                    <span class="inf-item-prices">${item.old} → ${item.now}</span>
                </div>
                <div class="inf-item-rate">
                    <span class="inf-rate-val">${item.rate}%</span>
                    <span class="inf-rate-label">Est. Inflation</span>
                </div>
            </div>
        `).join('');
        infBox.innerHTML = `<div class="inf-feed-container">${feedHtml}</div>
                            <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.5rem; text-align:center;">
                                Based on ${g.inf.count} community reports
                            </div>`;
    }
}

function loginToSeeStats() {
    localStorage.setItem('pending_stats_open', 'true');
    savePendingState(); // Collect current inputs just in case
    liff.login();
}

// --- Persistence Helpers ---
function saveAndLogin() {
    savePendingState();
    liff.login();
}

function savePendingState() {
    try {
        const state = {
            // General
            initial: document.getElementById('inp-initial').value,
            monthly: document.getElementById('inp-monthly').value,
            // Panel A (Current)
            cashA: document.getElementById('slider-a-cash').value,
            etfA: document.getElementById('slider-a-etf').value,
            reA: document.getElementById('slider-a-re').value,
            activeA: document.getElementById('slider-a-active').value,
            // Panel B (Target)
            cashB: document.getElementById('slider-b-cash').value,
            etfB: document.getElementById('slider-b-etf').value,
            reB: document.getElementById('slider-b-re').value,
            activeB: document.getElementById('slider-b-active').value,
            // Inflation
            infItem: document.getElementById('calc-item').value,
            infPriceOld: document.getElementById('calc-price-old').value,
            infPriceNow: document.getElementById('calc-price-now').value
        };
        localStorage.setItem('pending_sim_state', JSON.stringify(state));
    } catch (e) {
        console.error('Save State Failed:', e);
    }
}

function restorePendingState() {
    const saved = localStorage.getItem('pending_sim_state');
    if (!saved) return;

    try {
        const state = JSON.parse(saved);
        if (state.initial) document.getElementById('inp-initial').value = state.initial;
        if (state.monthly) document.getElementById('inp-monthly').value = state.monthly;

        // Panel A
        if (state.cashA) document.getElementById('slider-a-cash').value = state.cashA;
        if (state.etfA) document.getElementById('slider-a-etf').value = state.etfA;
        if (state.reA) document.getElementById('slider-a-re').value = state.reA;
        if (state.activeA) document.getElementById('slider-a-active').value = state.activeA;

        // Panel B
        if (state.cashB) document.getElementById('slider-b-cash').value = state.cashB;
        if (state.etfB) document.getElementById('slider-b-etf').value = state.etfB;
        if (state.reB) document.getElementById('slider-b-re').value = state.reB;
        if (state.activeB) document.getElementById('slider-b-active').value = state.activeB;

        // Inflation
        if (state.infItem) document.getElementById('calc-item').value = state.infItem;
        if (state.infPriceOld) document.getElementById('calc-price-old').value = state.infPriceOld;
        if (state.infPriceNow) document.getElementById('calc-price-now').value = state.infPriceNow;

        // Trigger simulator recalculation
        const event = new Event('input', { bubbles: true });
        document.getElementById('slider-b-cash').dispatchEvent(event);
        document.getElementById('slider-a-cash').dispatchEvent(event);
        document.getElementById('calc-price-now').dispatchEvent(event);

    } catch (e) {
        console.error('Restore State Failed:', e);
    } finally {
        localStorage.removeItem('pending_sim_state');
    }
}


