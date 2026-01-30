/* =========================================
   Global Configuration & State
   ========================================= */
const DATA_URL = './data.json';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_JP = ['日', '月', '火', '水', '木', '金', '土'];

let adminData = {
    // 読み込み失敗時のフォールバックデータ
    timeSettings: Array(7).fill({start: "00:00", end: "00:00"}),
    timetables: {},
    tests: []
};

// ユーザー設定 (LocalStorage)
let userConfig = {
    classId: localStorage.getItem('userClassId') || '21HR',
    icalUrl: localStorage.getItem('userIcalUrl') || '',
    todos: JSON.parse(localStorage.getItem('userTodos')) || []
};

// Pomodoro State
let pomoTimerId = null;
let pomoTimeRemaining = 25 * 60;
let isPomoActive = false;

/* =========================================
   Initialization (DOM Ready)
   ========================================= */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. 管理者データのロード
    try {
        const res = await fetch(DATA_URL);
        if (res.ok) adminData = await res.json();
    } catch (e) {
        console.error("Data Load Error:", e);
    }

    // 2. コンポーネント初期化
    initNavigation();
    initClock(); // 時計と挨拶
    initDashboard(); // 時間割・授業表示
    initTodos();
    initPomodoro();
    initAdmin(); // 管理者機能

    // 3. 初回描画
    updateDashboardUI();
});

/* =========================================
   Core Logic: Navigation & UI Switching
   ========================================= */
function initNavigation() {
    // ページ遷移関数
    const switchPage = (pageId) => {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        
        const target = document.getElementById(pageId);
        if(target) target.classList.add('active');

        // ナビボタンのアクティブ化
        if(pageId === 'page-home') document.getElementById('btnHome').classList.add('active');
        if(pageId === 'page-settings') document.getElementById('btnSettings').classList.add('active');
    };

    // イベント設定
    document.getElementById('btnHome').addEventListener('click', () => switchPage('page-home'));
    
    document.getElementById('btnSettings').addEventListener('click', () => {
        // 設定画面を開くときに現在の値をセット
        renderSettingsForm();
        switchPage('page-settings');
    });

    document.getElementById('btnAdmin').addEventListener('click', () => {
        switchPage('page-admin-login');
    });

    document.getElementById('adminBackBtn').addEventListener('click', () => {
        switchPage('page-home'); // ログアウト扱いでホームへ
    });
}

/* =========================================
   Feature: Clock & Dynamic Greeting
   ========================================= */
function initClock() {
    const update = () => {
        const now = new Date();
        
        // 時計表示
        document.getElementById('currentTime').textContent = now.toLocaleTimeString('ja-JP', {hour12:false});
        document.getElementById('currentDate').textContent = 
            `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 (${DAYS_JP[now.getDay()]})`;

        // 動的メッセージ (ここを追加)
        const hour = now.getHours();
        let greeting = "今日も頑張りましょう！";
        if(hour >= 5 && hour < 11) greeting = "おはようございます！今日も1日頑張りましょう。";
        else if(hour >= 11 && hour < 18) greeting = "こんにちは！午後の授業も集中しましょう。";
        else if(hour >= 18) greeting = "こんばんは！明日の準備はできましたか？";
        
        document.getElementById('dynamicGreeting').textContent = greeting;

        // 定期的に授業状態をチェック
        checkCurrentClass(now);
    };
    setInterval(update, 1000);
    update();
}

/* =========================================
   Feature: Dashboard Main (Class, Schedule)
   ========================================= */
function updateDashboardUI() {
    // ヘッダーのクラス表示
    document.getElementById('headerClassDisplay').textContent = userConfig.classId;
    
    // スケジュール描画
    renderDailySchedule();
    // テストカウントダウン
    renderTestCountdown();
    // カレンダー
    renderCalendar();
}

function checkCurrentClass(now) {
    const minsNow = now.getHours() * 60 + now.getMinutes();
    const dayKey = DAYS[now.getDay()];
    const todaySchedule = adminData.timetables[userConfig.classId]?.[dayKey] || {};

    let nextSubject = "本日の授業終了";
    let badgeText = "--";
    let timeText = "";
    let foundNext = false;

    // 現在の時限判定
    adminData.timeSettings.forEach((period, idx) => {
        if(foundNext) return;

        const pNum = idx + 1;
        const [sh, sm] = period.start.split(':').map(Number);
        const [eh, em] = period.end.split(':').map(Number);
        const sMins = sh * 60 + sm;
        const eMins = eh * 60 + em;

        const subject = todaySchedule[pNum] || "空き";

        if (minsNow < sMins) {
            // これから始まる
            nextSubject = subject;
            badgeText = `${pNum}限`;
            timeText = `${sMins - minsNow}分後`;
            foundNext = true;
        } else if (minsNow >= sMins && minsNow <= eMins) {
            // 授業中
            nextSubject = subject;
            badgeText = `${pNum}限 授業中`;
            timeText = `残り${eMins - minsNow}分`;
            foundNext = true;
        }
    });

    if(!foundNext && Object.keys(todaySchedule).length === 0) {
         nextSubject = "休日";
         timeText = "";
    }

    document.getElementById('nextSubject').textContent = nextSubject;
    document.getElementById('nextPeriodBadge').textContent = badgeText;
    document.getElementById('timeUntilNext').textContent = timeText;
}

function renderDailySchedule() {
    const list = document.getElementById('dailyScheduleList');
    list.innerHTML = '';
    
    const now = new Date();
    const dayKey = DAYS[now.getDay()];
    const minsNow = now.getHours() * 60 + now.getMinutes();

    document.getElementById('scheduleDay').textContent = `${DAYS_JP[now.getDay()]}曜日`;
    const todaySchedule = adminData.timetables[userConfig.classId]?.[dayKey] || {};

    adminData.timeSettings.forEach((period, idx) => {
        const pNum = idx + 1;
        const subject = todaySchedule[pNum] || "-";
        
        const li = document.createElement('li');
        
        // ハイライト判定
        const [sh, sm] = period.start.split(':').map(Number);
        const [eh, em] = period.end.split(':').map(Number);
        const sMins = sh * 60 + sm;
        const eMins = eh * 60 + em;
        
        if(minsNow >= sMins && minsNow <= eMins) {
            li.classList.add('active');
        }

        li.innerHTML = `
            <div><span style="font-weight:bold; margin-right:10px;">${pNum}</span> ${subject}</div>
            <div style="font-size:0.8rem; opacity:0.7;">${period.start} - ${period.end}</div>
        `;
        list.appendChild(li);
    });
}

function renderTestCountdown() {
    const now = new Date();
    // 未来のテストを探す
    const upcoming = adminData.tests
        .map(t => ({...t, dateObj: new Date(t.date)}))
        .filter(t => t.dateObj.setHours(23,59,59) >= now.getTime())
        .sort((a,b) => a.dateObj - b.dateObj)[0];

    const container = document.getElementById('testContainer');
    if (upcoming) {
        document.getElementById('targetTestName').textContent = upcoming.name;
        const diff = upcoming.dateObj - now;
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        document.getElementById('cdDays').textContent = days;
        container.parentElement.style.background = 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)';
    } else {
        document.getElementById('targetTestName').textContent = "予定されたテストはありません";
        document.getElementById('cdDays').textContent = "--";
        container.parentElement.style.background = '#ccc'; // グレーアウト
    }
}

/* =========================================
   Feature: Settings (Class & ICal)
   ========================================= */
function renderSettingsForm() {
    // クラス選択肢生成
    const select = document.getElementById('settingClassSelect');
    select.innerHTML = '';
    for(let i=21; i<=28; i++) {
        const hr = `${i}HR`;
        const opt = document.createElement('option');
        opt.value = hr;
        opt.textContent = hr;
        if(hr === userConfig.classId) opt.selected = true;
        select.appendChild(opt);
    }
    // iCal入力
    document.getElementById('icalUrlInput').value = userConfig.icalUrl;
}

// 設定保存ボタン
document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    const newClass = document.getElementById('settingClassSelect').value;
    const newIcal = document.getElementById('icalUrlInput').value;

    userConfig.classId = newClass;
    userConfig.icalUrl = newIcal;

    localStorage.setItem('userClassId', newClass);
    localStorage.setItem('userIcalUrl', newIcal);

    alert('設定を保存しました');
    updateDashboardUI(); // 画面更新
});

function renderCalendar() {
    const container = document.getElementById('calendarContent');
    if(userConfig.icalUrl) {
        // デモ用: 実際はGoogle Calendar Embed URLに変換するか、リンクを表示する
        // ここでは簡易的にリンクボタンを表示
        container.innerHTML = `
            <div>
                <i class="fa-solid fa-check-circle" style="color:#38B2AC; font-size:2rem; margin-bottom:10px;"></i>
                <p>連携済み</p>
                <a href="${userConfig.icalUrl}" target="_blank" style="color:#5B4DFF; display:block; margin-top:10px;">カレンダーを開く</a>
            </div>
        `;
    } else {
        container.innerHTML = `<p class="placeholder-text">設定画面でiCal URLを登録してください</p>`;
    }
}

/* =========================================
   Feature: ToDo List
   ========================================= */
function initTodos() {
    renderTodoList();

    document.getElementById('addTodoBtn').addEventListener('click', () => {
        const input = document.getElementById('newTodoInput');
        if(input.value.trim()) {
            userConfig.todos.push({ text: input.value, done: false });
            saveTodos();
            input.value = '';
        }
    });
}

function renderTodoList() {
    const list = document.getElementById('todoList');
    list.innerHTML = '';
    
    let doneCount = 0;
    userConfig.todos.forEach((todo, index) => {
        if(todo.done) doneCount++;
        const li = document.createElement('li');
        li.className = todo.done ? 'done' : '';
        li.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <input type="checkbox" ${todo.done ? 'checked' : ''}>
                <span>${todo.text}</span>
            </div>
            <button class="delete-btn" style="border:none; background:none; color:#aaa; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
        `;
        
        // チェックイベント
        li.querySelector('input').addEventListener('change', () => {
            userConfig.todos[index].done = !userConfig.todos[index].done;
            saveTodos();
        });
        // 削除イベント
        li.querySelector('.delete-btn').addEventListener('click', () => {
            userConfig.todos.splice(index, 1);
            saveTodos();
        });

        list.appendChild(li);
    });

    const total = userConfig.todos.length;
    document.getElementById('todoCount').textContent = `${doneCount}/${total}`;
    const percent = total > 0 ? (doneCount / total) * 100 : 0;
    document.getElementById('todoProgress').style.width = `${percent}%`;
}

function saveTodos() {
    localStorage.setItem('userTodos', JSON.stringify(userConfig.todos));
    renderTodoList();
}

/* === 5. ポモドーロタイマー (設定機能付き) === */
    let timerInterval;
    let isRunning = false;
    
    // 初期設定 (分)
    let workDuration = 25;
    let breakDuration = 5;
    
    let timeLeft = workDuration * 60;
    let isWorkMode = true; // true = 作業中, false = 休憩中

    const timerDisplay = document.getElementById('pomoTimer');
    const startBtn = document.getElementById('pomoStartBtn');
    const resetBtn = document.getElementById('pomoResetBtn');
    const statusText = document.getElementById('pomoStatus'); // "25分集中"などのテキスト

    // 設定関連のDOM
    const settingsBtn = document.getElementById('pomoSettingsBtn');
    const modal = document.getElementById('pomoModal');
    const closeValBtn = document.getElementById('closePomoModal');
    const saveSettingsBtn = document.getElementById('savePomoSettings');
    const workInput = document.getElementById('pomoWorkInput');
    const breakInput = document.getElementById('pomoBreakInput');

    function updateDisplay() {
        const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        const s = (timeLeft % 60).toString().padStart(2, '0');
        timerDisplay.textContent = `${m}:${s}`;
    }
    
    function updateStatusText() {
        if(isWorkMode) {
            statusText.textContent = `${workDuration}分集中`;
            statusText.style.color = "var(--text-sub)";
        } else {
            statusText.textContent = `${breakDuration}分休憩`;
            statusText.style.color = "var(--text-green)";
        }
    }

    function toggleTimer() {
        if (isRunning) {
            clearInterval(timerInterval);
            startBtn.textContent = '開始';
            startBtn.classList.remove('active'); // 色を戻すスタイルがあれば
        } else {
            timerInterval = setInterval(() => {
                if (timeLeft > 0) {
                    timeLeft--;
                    updateDisplay();
                } else {
                    // タイマー終了時の切り替え
                    clearInterval(timerInterval);
                    isRunning = false;
                    startBtn.textContent = '開始';
                    
                    // モード切り替え
                    isWorkMode = !isWorkMode;
                    if (isWorkMode) {
                        timeLeft = workDuration * 60;
                        alert('休憩終了！作業に戻りましょう。');
                    } else {
                        timeLeft = breakDuration * 60;
                        alert('作業終了！休憩しましょう。');
                    }
                    updateDisplay();
                    updateStatusText();
                }
            }, 1000);
            startBtn.textContent = '停止';
        }
        isRunning = !isRunning;
    }

    function resetTimer() {
        clearInterval(timerInterval);
        isRunning = false;
        isWorkMode = true; // リセット時は作業モードに戻す
        timeLeft = workDuration * 60;
        updateDisplay();
        updateStatusText();
        startBtn.textContent = '開始';
    }

    // === モーダル操作 ===
    settingsBtn.addEventListener('click', () => {
        // 現在の設定値を入力欄に反映して開く
        workInput.value = workDuration;
        breakInput.value = breakDuration;
        modal.classList.add('open');
    });

    closeValBtn.addEventListener('click', () => {
        modal.classList.remove('open');
    });

    // モーダルの外側をクリックしたら閉じる
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('open');
        }
    });

    // 設定保存
    saveSettingsBtn.addEventListener('click', () => {
        const newWork = parseInt(workInput.value);
        const newBreak = parseInt(breakInput.value);

        if (newWork > 0 && newBreak > 0) {
            workDuration = newWork;
            breakDuration = newBreak;
            
            // 設定を保存したらタイマーをリセットして反映
            resetTimer();
            modal.classList.remove('open');
        } else {
            alert("時間は1分以上に設定してください");
        }
    });

    startBtn.addEventListener('click', toggleTimer);
    resetBtn.addEventListener('click', resetTimer);

    // 初期化実行
    updateDisplay();
    updateStatusText();
    document.getElementById('pomoResetBtn').addEventListener('click', () => {
        clearInterval(pomoTimerId);
        isPomoActive = false;
        pomoTimeRemaining = 25 * 60;
        display.textContent = "25:00";
        btn.textContent = "開始";
    });
}

/* =========================================
   Feature: Admin Panel
   ========================================= */
function initDashboard() {} // 空定義（上のupdateUIで処理するため）

function initAdmin() {
    // ログイン処理
    document.getElementById('adminLoginBtn').addEventListener('click', () => {
        const pass = document.getElementById('adminPasswordInput').value;
        if(pass === '1234') {
            document.getElementById('page-admin-login').classList.remove('active');
            document.getElementById('page-admin-dashboard').classList.add('active');
            renderAdminUI();
        } else {
            document.getElementById('loginError').style.display = 'block';
        }
    });

    // タブ切り替え
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(tab.dataset.target).classList.add('active');
        });
    });

    // 変更監視（JSONダウンロード用）
    document.getElementById('downloadJsonBtn').addEventListener('click', () => {
        const jsonStr = JSON.stringify(adminData, null, 2);
        const blob = new Blob([jsonStr], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "data.json";
        a.click();
        URL.revokeObjectURL(url);
    });

    // 各種エディタの初期化
    const classSel = document.getElementById('adminClassSelect');
    // 21HR-28HR
    for(let i=21; i<=28; i++) {
        const opt = document.createElement('option');
        opt.value = `${i}HR`;
        opt.textContent = `${i}HR`;
        classSel.appendChild(opt);
    }
    classSel.addEventListener('change', renderScheduleEditor);
    document.getElementById('adminDaySelect').addEventListener('change', renderScheduleEditor);

    // テスト追加
    document.getElementById('addTestBtn').addEventListener('click', () => {
        const name = document.getElementById('newTestName').value;
        const date = document.getElementById('newTestDate').value;
        if(name && date) {
            adminData.tests.push({name, date});
            renderTestList();
            document.getElementById('newTestName').value = '';
        }
    });
}

function renderAdminUI() {
    renderTimingsEditor();
    renderScheduleEditor();
    renderTestList();
}

function renderTimingsEditor() {
    const container = document.getElementById('timingsEditor');
    container.innerHTML = '';
    adminData.timeSettings.forEach((ts, idx) => {
        const div = document.createElement('div');
        div.className = 'schedule-row';
        div.innerHTML = `
            <label>${idx+1}限</label>
            <input type="time" class="input-field" value="${ts.start}" onchange="updateTiming(${idx}, 'start', this.value)">
            <span>~</span>
            <input type="time" class="input-field" value="${ts.end}" onchange="updateTiming(${idx}, 'end', this.value)">
        `;
        container.appendChild(div);
    });
}
// グローバルスコープに露出させてHTMLのonchangeから呼べるようにする
window.updateTiming = (idx, key, val) => {
    adminData.timeSettings[idx][key] = val;
};

function renderScheduleEditor() {
    const container = document.getElementById('scheduleEditor');
    container.innerHTML = '';
    
    const cls = document.getElementById('adminClassSelect').value || '21HR';
    const day = document.getElementById('adminDaySelect').value || 'Mon';

    if(!adminData.timetables[cls]) adminData.timetables[cls] = {};
    if(!adminData.timetables[cls][day]) adminData.timetables[cls][day] = {};

    for(let i=1; i<=7; i++) {
        const div = document.createElement('div');
        div.className = 'schedule-row';
        const val = adminData.timetables[cls][day][i] || "";
        div.innerHTML = `
            <label>${i}限</label>
            <input type="text" class="input-field" value="${val}" placeholder="科目名" 
             oninput="updateSchedule('${cls}', '${day}', ${i}, this.value)">
        `;
        container.appendChild(div);
    }
}
window.updateSchedule = (cls, day, period, val) => {
    adminData.timetables[cls][day][period] = val;
};

function renderTestList() {
    const list = document.getElementById('adminTestList');
    list.innerHTML = '';
    adminData.tests.forEach((t, idx) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${t.name} (${t.date})</span>
            <button onclick="deleteTest(${idx})" style="color:red; background:none; border:none; cursor:pointer;">削除</button>
        `;
        list.appendChild(li);
    });
}
window.deleteTest = (idx) => {
    adminData.tests.splice(idx, 1);
    renderTestList();

};
