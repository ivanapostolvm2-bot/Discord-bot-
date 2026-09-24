const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Файлове за запазване на конфигурацията
const CONFIG_FILE = path.join(__dirname, 'panel_config.json');
const BOT_RUN_FILE = path.join(__dirname, 'bot_code.js');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let botProcess = null;
let botStatus = 'Offline';
let consoleLogs = [];

// Функция за добавяне на лог в конзолата на уебсайта
function addLog(message) {
    const timestamp = new Date().toLocaleTimeString('bg-BG');
    const logLine = `[${timestamp}] ${message}`;
    consoleLogs.push(logLine);
    console.log(logLine); // Логва и в самия Render за всеки случай
    if (consoleLogs.length > 100) consoleLogs.shift(); // Пази последните 100 реда лог
}

// Зареждане на запазения токен и код при стартиране на сървъра
let savedData = { token: '', code: '// Постави твоя код тук...' };
if (fs.existsSync(CONFIG_FILE)) {
    try { savedData = JSON.parse(fs.readFileSync(CONFIG_FILE)); } catch (e) {}
}

// Главна уеб страница (Дизайнът от твоята снимка)
app.get('/', (req, res) => {
    const statusColor = botStatus === 'Online' ? '#2ecc71' : '#e74c3c';
    const logsText = consoleLogs.length > 0 ? consoleLogs.join('\n') : 'Няма логове.';

    res.send(`
        <html>
            <head>
                <title>Управление на Discord Бот</title>
                <meta charset="utf-8">
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #0f1115; color: #ffffff; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
                    .container { background-color: #1a1d24; padding: 30px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); width: 100%; max-width: 650px; border: 1px solid #2d323f; }
                    h2 { text-align: center; color: #5865F2; margin-top: 0; font-size: 24px; }
                    .status-container { text-align: center; font-weight: bold; margin-bottom: 20px; font-size: 18px; }
                    .status-dot { height: 12px; width: 12px; background-color: ${statusColor}; border-radius: 50%; display: inline-block; margin-left: 8px; }
                    label { display: block; font-weight: bold; margin-bottom: 5px; font-size: 14px; color: #b9bbbe; }
                    input[type="text"], textarea { width: 100%; padding: 12px; background-color: #202225; border: 1px solid #2f3136; border-radius: 5px; color: #dcddde; font-family: monospace; font-size: 14px; box-sizing: border-box; margin-bottom: 15px; resize: vertical; }
                    input[type="text"]:focus, textarea:focus { border-color: #5865F2; outline: none; }
                    .buttons { display: flex; gap: 15px; margin-bottom: 20px; }
                    button { flex: 1; padding: 14px; font-size: 16px; font-weight: bold; border: none; border-radius: 5px; cursor: pointer; color: white; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background 0.2s; }
                    .btn-start { background-color: #2ecc71; }
                    .btn-start:hover { background-color: #27ae60; }
                    .btn-stop { background-color: #e74c3c; }
                    .btn-stop:hover { background-color: #c0392b; }
                    .console-title { font-weight: bold; color: #2ecc71; margin-bottom: 5px; font-size: 14px; }
                    .console { background-color: #000000; border: 1px solid #2f3136; border-radius: 5px; padding: 15px; height: 180px; overflow-y: auto; font-family: 'Courier New', monospace; font-size: 13px; color: #2ecc71; white-space: pre-wrap; word-break: break-all; }
                </style>
                <script>
                    // Автоматично превъртане на конзолата най-долу при зареждане
                    window.onload = function() {
                        var consoleDiv = document.getElementById("console");
                        consoleDiv.scrollTop = consoleDiv.scrollHeight;
                    };
                </script>
            </head>
            <body>
                <div class="container">
                    <h2>Управление на Discord Бот</h2>
                    <div class="status-container">
                        Статус: <span style="color: ${statusColor}">${botStatus}</span><span class="status-dot"></span>
                    </div>
                    
                    <form action="/action" method="POST">
                        <label>Discord Token:</label>
                        <input type="text" name="token" placeholder="Постави bot токена" value="${savedData.token}">
                        
                        <label>Код на бота (index.js):</label>
                        <textarea name="code" rows="12" placeholder="Постави JavaScript кода...">${savedData.code}</textarea>
                        
                        <div class="buttons">
                            <button type="submit" name="btn" value="start" class="btn-start">▶ Старт</button>
                            <button type="submit" name="btn" value="stop" class="btn-stop">■ Стоп</button>
                        </div>
                    </form>
                    
                    <div class="console-title">Конзола (Грешки / Логове):</div>
                    <div id="console" class="console">${logsText}</div>
                </div>
            </body>
        </html>
    `);
});

// Линкове за Бутоните Старт / Стоп
app.post('/action', (req, res) => {
    const { token, code, btn } = req.body;

    // Запазваме въведените данни във файл, за да си стоят там
    savedData = { token, code };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(savedData, null, 2));

    if (btn === 'start') {
        if (botStatus === 'Online') {
            addLog("Ботът вече работи! Натисни първо Стоп, ако искаш да го рестартираш.");
        } else if (!token.trim()) {
            addLog("Грешка: Не може да стартирате бота без валиден Токен!");
        } else {
            addLog("Инициализиране и стартиране на бота...");
            
            // Записваме кода на самия бот в отделен файл, който ще стартираме
            fs.writeFileSync(BOT_RUN_FILE, code);

            // Стартираме бота като отделен процес и му подаваме токена като Environment Variable
            botProcess = spawn('node', [BOT_RUN_FILE], {
                env: { ...process.env, DISCORD_TOKEN: token }
            });

            botStatus = 'Online';

            // Прихващане на нормалните лог съобщения от бота
            botProcess.stdout.on('data', (data) => {
                addLog(data.toString().trim());
            });

            // Прихващане на грешки от кода на бота
            botProcess.stderr.on('data', (data) => {
                addLog(`ГРЕШКА: ${data.toString().trim()}`);
            });

            // Когато процесът на бота спре
            botProcess.on('close', (code) => {
                botStatus = 'Offline';
                addLog(`Процесът на бота завърши с код: ${code}`);
            });
        }
    } 
    
    else if (btn === 'stop') {
        if (botProcess) {
            addLog("Спиране на бота от уеб контролния панел...");
            botProcess.kill();
            botProcess = null;
            botStatus = 'Offline';
        } else {
            addLog("Ботът вече е спрян.");
        }
    }

    // Връщаме потребителя обратно на същата страница, за да види обновения статус и логове
    setTimeout(() => {
        res.redirect('/');
    }, 500);
});

server.listen(PORT, () => {
    console.log(`Уеб панелът работи успешно на порт ${PORT}`);
});
