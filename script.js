let cooldowns = {}; // { pair: { endTime: ..., intervalId: ... } }
let currentPair = ""; // глобально
let currentTimeframe = "5s"; // текущий выбранный таймфрейм

// Telegram WebApp инициализация
let tg = null;
if (window.Telegram && window.Telegram.WebApp) {
    tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    
    // Устанавливаем тему Telegram
    if (tg.themeParams) {
        document.documentElement.style.setProperty('--tg-bg-color', tg.themeParams.bg_color || '#1a2332');
        document.documentElement.style.setProperty('--tg-text-color', tg.themeParams.text_color || '#ffffff');
        document.documentElement.style.setProperty('--tg-hint-color', tg.themeParams.hint_color || '#b8bcc8');
        document.documentElement.style.setProperty('--tg-link-color', tg.themeParams.link_color || '#4a9eff');
        document.documentElement.style.setProperty('--tg-button-color', tg.themeParams.button_color || '#4a9eff');
        document.documentElement.style.setProperty('--tg-button-text-color', tg.themeParams.button_text_color || '#ffffff');
    }
    
    // Отключаем контекстное меню в Telegram
    document.addEventListener('contextmenu', (e) => {
        if (tg && tg.platform === 'tdesktop') {
            e.preventDefault();
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    const generateButton = document.getElementById("generate-btn");
    const signalResult = document.getElementById("signal-result");
    // currencySelect больше не нужен, используем новый валютный селектор
    const timeButtons = document.querySelectorAll('.time-btn');
    const tabButtons = document.querySelectorAll('.tab-btn');

    let signalUpdateTimeout = null;
    currentPair = "OTC EUR/USD"; // По умолчанию

    // Инициализация
    initializeTimeButtons();
    initializeTabButtons();
    initializeLanguageSelector();
    initializeCurrencySelector();
    initializeWeekendModal();
    initializeGlobalClickHandler();
    
    // Принудительно закрываем все выпадающие списки при загрузке
    setTimeout(() => {
        const currencyDropdown = document.getElementById('currency-dropdown');
        const languageDropdown = document.getElementById('language-dropdown');
        const currencyBtn = document.getElementById('currency-btn');
        
        if (currencyDropdown) {
            currencyDropdown.classList.remove('show');
            currencyDropdown.style.pointerEvents = 'none';
            currencyDropdown.style.visibility = 'hidden';
            currencyDropdown.style.zIndex = '1';
        }
        if (languageDropdown) {
            languageDropdown.classList.remove('show');
        }
        if (currencyBtn) {
            currencyBtn.classList.remove('active');
        }
        
        console.log('Forced close all dropdowns on initialization');
    }, 100);
    
    // Проверяем выходные и обновляем состояние вкладок
    updateTabStates();
    
    // Инициализируем фильтрацию валютных пар (по умолчанию OTC активен)
    filterCurrencyPairs('otc');

    // Обработчик кнопки генерации сигнала
    generateButton.addEventListener("click", () => {
        console.log("Button clicked, generating signal...");

        // Получаем текущий язык для текста загрузки
        const activeLanguageOption = document.querySelector('.language-option.active');
        const language = activeLanguageOption ? activeLanguageOption.dataset.lang : 'en';
        
        // Показываем состояние загрузки
        generateButton.disabled = true;
        generateButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>${translations[language].generatingSignal}</span>`;
        
        // Очищаем предыдущий результат
        signalResult.innerHTML = `<div class="signal-loading"><i class="fas fa-spinner fa-spin"></i><span>${translations[language].analyzingMarket}</span></div>`;
        signalResult.classList.remove('has-signal');

        // Генерируем сигнал с небольшой задержкой для эффекта
        setTimeout(() => {
            const currencyPair = currentPair;
            const cooldownDuration = parseTimeframeToMs(currentTimeframe);

            const isBuy = Math.random() > 0.5;
            const confidence = getRandomConfidence(language);
            const now = new Date().toLocaleTimeString("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            });

            const signalDetails = `
                <div class="signal-generated">
                    <div class="signal-header-text">${translations[language].signalGenerated}</div>
                    <div class="signal-pair-time">${currencyPair} ${currentTimeframe}</div>
                <div class="signal-details">
                        <div class="signal-direction">
                            <div class="signal-direction-label">${translations[language].signalDirection}</div>
                            <div class="signal-direction-value ${isBuy ? "buy" : "sell"}">
                                <i class="fas fa-${isBuy ? "arrow-up" : "arrow-down"}"></i>
                                ${isBuy ? translations[language].buy : translations[language].sell}
                            </div>
                        </div>
                        <div class="signal-confidence">
                            <div class="signal-confidence-label">${translations[language].signalConfidence}</div>
                            <div class="signal-confidence-value ${confidence.level}">${confidence.text}</div>
                        </div>
                    </div>
                </div>
            `;
            signalResult.innerHTML = signalDetails;
            signalResult.classList.add('has-signal');

            // Дополнительная задержка 1.5 секунды перед началом кулдауна
            setTimeout(() => {
            const endTime = Date.now() + cooldownDuration;

            if (cooldowns[currencyPair]?.intervalId) {
                clearInterval(cooldowns[currencyPair].intervalId);
            }

            cooldowns[currencyPair] = { endTime };
            startCooldown(currencyPair, language);
                startCountdown();
                
                // Отправляем данные в Telegram WebApp
                sendToTelegram({
                    type: 'signal_generated',
                    pair: currencyPair,
                    timeframe: currentTimeframe,
                    direction: isBuy ? 'BUY' : 'SELL',
                    confidence: confidence.text,
                    timestamp: new Date().toISOString()
                });
            }, 1500); // 1.5 секунды дополнительной задержки

        }, 1500); // 1.5 секунды для красивого эффекта загрузки
    });

    // Обработчик изменения валютной пары будет в initializeCurrencySelector
});

// Инициализация кнопок времени
function initializeTimeButtons() {
    const timeButtons = document.querySelectorAll('.time-btn');
    
    timeButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('=== TIME BUTTON CLICKED ===');
            console.log('Button:', button.dataset.time);
            console.log('Event target:', e.target);
            console.log('Current pair before:', currentPair);
            
            // Принудительно закрываем все выпадающие списки
            const currencyDropdown = document.getElementById('currency-dropdown');
            const languageDropdown = document.getElementById('language-dropdown');
            const currencyBtn = document.getElementById('currency-btn');
            
            console.log('Currency dropdown show class:', currencyDropdown?.classList.contains('show'));
            console.log('Language dropdown show class:', languageDropdown?.classList.contains('show'));
            
            if (currencyDropdown) {
                currencyDropdown.classList.remove('show');
                currencyDropdown.style.pointerEvents = 'none';
                currencyDropdown.style.visibility = 'hidden';
                currencyDropdown.style.zIndex = '-1';
            }
            if (languageDropdown) {
                languageDropdown.classList.remove('show');
            }
            if (currencyBtn) {
                currencyBtn.classList.remove('active');
            }
            
            // Убираем активный класс со всех кнопок
            timeButtons.forEach(btn => btn.classList.remove('active'));
            // Добавляем активный класс к выбранной кнопке
            button.classList.add('active');
            // Обновляем текущий таймфрейм
            currentTimeframe = button.dataset.time;
            
            console.log('Current timeframe set to:', currentTimeframe);
            console.log('Current pair after:', currentPair);
            console.log('=== END TIME BUTTON CLICK ===');
        });
    });
}

// Функция проверки выходных дней
function isWeekend() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = воскресенье, 6 = суббота
    return dayOfWeek === 0 || dayOfWeek === 6;
}

// Функция показа сообщения о выходных
function showWeekendMessage() {
    const activeLanguageOption = document.querySelector('.language-option.active');
    const language = activeLanguageOption ? activeLanguageOption.dataset.lang : 'en';
    
    const messages = {
        'en': {
            title: 'Market Closed',
            message: 'Forex market is closed on weekends (Saturday and Sunday)',
            schedule: 'Trading hours: Monday - Friday',
            alternative: 'Use OTC trading instead',
            button: 'Got it'
        },
        'ru': {
            title: 'Рынок Закрыт',
            message: 'Рынок Forex закрыт в выходные дни (суббота и воскресенье)',
            schedule: 'Часы торговли: Понедельник - Пятница',
            alternative: 'Используйте OTC торговлю вместо этого',
            button: 'Понятно'
        },
        'es': {
            title: 'Mercado Cerrado',
            message: 'El mercado Forex está cerrado los fines de semana (sábado y domingo)',
            schedule: 'Horario de trading: Lunes - Viernes',
            alternative: 'Use el trading OTC en su lugar',
            button: 'Entendido'
        },
        'de': {
            title: 'Markt Geschlossen',
            message: 'Der Forex-Markt ist an Wochenenden geschlossen (Samstag und Sonntag)',
            schedule: 'Handelszeiten: Montag - Freitag',
            alternative: 'Verwenden Sie stattdessen OTC-Trading',
            button: 'Verstanden'
        },
        'pt': {
            title: 'Mercado Fechado',
            message: 'O mercado Forex está fechado nos fins de semana (sábado e domingo)',
            schedule: 'Horário de negociação: Segunda - Sexta',
            alternative: 'Use o trading OTC em vez disso',
            button: 'Entendi'
        },
        'hi': {
            title: 'बाजार बंद',
            message: 'फॉरेक्स बाजार सप्ताहांत में बंद है (शनिवार और रविवार)',
            schedule: 'ट्रेडिंग घंटे: सोमवार - शुक्रवार',
            alternative: 'इसके बजाय OTC ट्रेडिंग का उपयोग करें',
            button: 'समझ गया'
        },
        'tr': {
            title: 'Piyasa Kapalı',
            message: 'Forex piyasası hafta sonları kapalıdır (Cumartesi ve Pazar)',
            schedule: 'İşlem saatleri: Pazartesi - Cuma',
            alternative: 'Bunun yerine OTC işlem kullanın',
            button: 'Anladım'
        },
        'ar': {
            title: 'السوق مغلق',
            message: 'سوق الفوركس مغلق في عطلة نهاية الأسبوع (السبت والأحد)',
            schedule: 'ساعات التداول: الاثنين - الجمعة',
            alternative: 'استخدم تداول OTC بدلاً من ذلك',
            button: 'فهمت'
        },
        'uz': {
            title: 'Bozor Yopiq',
            message: 'Forex bozori dam olish kunlarida yopiq (shanba va yakshanba)',
            schedule: 'Savdo vaqti: Dushanba - Juma',
            alternative: 'Buning o\'rniga OTC savdodan foydalaning',
            button: 'Tushundim'
        },
        'tg': {
            title: 'Бозор Пӯшида',
            message: 'Бозори Forex дар рӯзҳои истироҳат пӯшида аст (шанбе ва якшанбе)',
            schedule: 'Вақти савдо: Душанбе - Ҷумъа',
            alternative: 'Ба ҷои ин савдои OTC истифода баред',
            button: 'Фаҳмидам'
        },
        'az': {
            title: 'Bazar Bağlı',
            message: 'Forex bazarı həftə sonları bağlıdır (şənbə və bazar)',
            schedule: 'Ticarət saatları: Bazar ertəsi - Cümə',
            alternative: 'Bunun əvəzinə OTC ticarətindən istifadə edin',
            button: 'Başa düşdüm'
        },
        'hy': {
            title: 'Շուկա Փակ',
            message: 'Forex շուկան փակ է հանգստյան օրերին (շաբաթ և կիրակի)',
            schedule: 'Առևտրի ժամեր: Երկուշաբթի - Ուրբաթ',
            alternative: 'Փոխարեն օգտագործեք OTC առևտուր',
            button: 'Հասկացա'
        }
    };
    
    const msg = messages[language] || messages['en'];
    
    // Обновляем текст в модальном окне
    document.getElementById('weekend-modal-title').textContent = msg.title;
    document.getElementById('weekend-modal-message').textContent = msg.message;
    document.getElementById('weekend-modal-schedule').textContent = msg.schedule;
    document.getElementById('weekend-modal-alternative').textContent = msg.alternative;
    document.getElementById('weekend-modal-btn-text').textContent = msg.button;
    
    // Показываем модальное окно
    const modal = document.getElementById('weekend-modal');
    modal.classList.add('show');
    
    // Также отправляем уведомление в Telegram
    sendToTelegram({
        type: 'weekend_notification',
        message: msg.message,
        timestamp: new Date().toISOString()
    });
}

// Инициализация табов
function initializeTabButtons() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Проверяем, не отключена ли вкладка
            if (button.classList.contains('disabled')) {
                const tab = button.dataset.tab;
                if (tab === 'forex' && isWeekend()) {
                    showWeekendMessage();
                }
                return; // Не переключаемся на отключенную вкладку
            }
            
            const tab = button.dataset.tab;
            
            // Убираем активный класс со всех табов
            tabButtons.forEach(btn => btn.classList.remove('active'));
            // Добавляем активный класс к выбранному табу
            button.classList.add('active');
            
            console.log(`Switched to ${tab} tab`);
            
            // Фильтруем валютные пары в зависимости от выбранной вкладки
            filterCurrencyPairs(tab);
        });
    });
}

// Функция фильтрации валютных пар
function filterCurrencyPairs(selectedTab) {
    const currencyDropdown = document.getElementById('currency-dropdown');
    const allOptions = currencyDropdown.querySelectorAll('.currency-option');
    
    // Скрываем все опции
    allOptions.forEach(option => {
        option.style.display = 'none';
    });
    
    // Показываем только нужные опции в зависимости от выбранной вкладки
    allOptions.forEach(option => {
        if (selectedTab === 'otc') {
            // Для OTC показываем только валюты с префиксом "OTC"
            if (option.textContent.startsWith('OTC ')) {
                option.style.display = 'block';
            }
        } else if (selectedTab === 'forex') {
            // Для Forex показываем только валюты без префикса "OTC"
            if (!option.textContent.startsWith('OTC ')) {
                option.style.display = 'block';
            }
        }
    });
    
    // Устанавливаем первую видимую опцию как выбранную
    const visibleOptions = Array.from(allOptions).filter(option => option.style.display !== 'none');
    if (visibleOptions.length > 0) {
        const selectedCurrency = visibleOptions[0].textContent;
        updateCurrencyButton(selectedCurrency);
        currentPair = selectedCurrency;
    }
}

// Получение случайного уровня уверенности
function getRandomConfidence(language = 'en') {
    const confidences = [
        { level: 'high', text: translations[language].confidence.high },
        { level: 'medium', text: translations[language].confidence.medium },
        { level: 'low', text: translations[language].confidence.low }
    ];
    
    const weights = [0.6, 0.3, 0.1]; // 60% высокий, 30% средний, 10% низкий
    const random = Math.random();
    let cumulative = 0;
    
    for (let i = 0; i < confidences.length; i++) {
        cumulative += weights[i];
        if (random <= cumulative) {
            return confidences[i];
        }
    }
    
    return confidences[0]; // fallback
}

// Таймер обратного отсчета
function startCountdown() {
    const countdownElement = document.getElementById('countdown-timer');
    if (!countdownElement) return;
    
    let timeLeft = 238; // 3 минуты 58 секунд
    
    const countdownInterval = setInterval(() => {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        
        countdownElement.textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:00`;
        
        timeLeft--;
        
        if (timeLeft < 0) {
            clearInterval(countdownInterval);
            countdownElement.textContent = '00:00:00';
        }
    }, 1000);
}

function startCooldown(pair, language = 'en') {
    const generateButton = document.getElementById("generate-btn");

    function updateCooldown() {
        const now = Date.now();
        const remaining = Math.ceil((cooldowns[pair].endTime - now) / 1000);
        
        // Используем переданный язык или получаем из активной опции
        const currentLanguage = language || (() => {
            const activeLanguageOption = document.querySelector('.language-option.active');
            return activeLanguageOption ? activeLanguageOption.dataset.lang : 'en';
        })();
        const baseText = translations[currentLanguage].generateButton;

        if (remaining <= 0) {
            clearInterval(cooldowns[pair].intervalId);
            generateButton.disabled = false;
            generateButton.innerHTML = `<i class="fas fa-bolt"></i><span>${baseText}</span>`;
            delete cooldowns[pair];
        } else {
            generateButton.disabled = true;
            generateButton.innerHTML = `<i class="fas fa-bolt"></i><span>${baseText} (${remaining}s)</span>`;
        }
    }

    updateCooldown();
    cooldowns[pair].intervalId = setInterval(updateCooldown, 1000);
}

function parseTimeframeToMs(timeframe) {
    const timeMap = {
        '5s': 5 * 1000,
        '15s': 15 * 1000,
        '30s': 30 * 1000,
        '1m': 60 * 1000,
        '3m': 3 * 60 * 1000,
        '5m': 5 * 60 * 1000,
        '30m': 30 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '4h': 4 * 60 * 60 * 1000
    };
    
    return timeMap[timeframe] || 60000; // По умолчанию 1 минута
}

function resetSignalAndChart(language = "en") {
    const signalResult = document.getElementById("signal-result");

    signalResult.innerHTML = `<div class="signal-placeholder">${translations[language].signalPlaceholder}</div>`;
    signalResult.classList.remove('has-signal');
}

const translations = {
    ru: {
        mainTitle: "Торговые Сигналы",
        subtitle: "Профессиональные торговые сигналы для бинарных опционов",
        tabs: ["OTC", "Форекс"],
        logoText: "Торговые Сигналы",
        currencyLabel: "Валютная Пара",
        timeframeLabel: "Время Экспирации",
        generateButton: "Получить Сигнал",
        signalTitle: "Сигнал",
        signalPlaceholder: "Нажмите 'Получить Сигнал'",
        languageLabel: "Язык",
        timeframes: ["5 секунд", "15 секунд", "30 секунд", "1 минута", "3 минуты", "5 минут", "30 минут", "1 час", "4 часа"],
        buy: "ПОКУПАТЬ",
        sell: "ПРОДАВАТЬ",
        timeframe: "Временной интервал",
        accuracy: "Точность",
        confidence: {
            high: "Высокий",
            medium: "Средний", 
            low: "Низкий"
        },
        signalGenerated: "Сигнал Сгенерирован!",
        signalDirection: "Направление Сигнала",
        signalConfidence: "Уровень Уверенности",
        generatingSignal: "Генерируем сигнал...",
        analyzingMarket: "Анализируем рынок..."
    },
    en: {
        mainTitle: "Trading Signals",
        subtitle: "Professional trading signals for binary options",
        tabs: ["OTC", "Forex"],
        logoText: "Trading Signals",
        currencyLabel: "Currency Pair",
        timeframeLabel: "Expiration Time",
        generateButton: "Get Signal",
        signalTitle: "Signal",
        signalPlaceholder: "Click 'Get Signal'",
        languageLabel: "Language",
        timeframes: ["5 seconds", "15 seconds", "30 seconds", "1 minute", "3 minutes", "5 minutes", "30 minutes", "1 hour", "4 hours"],
        buy: "BUY",
        sell: "SELL",
        timeframe: "Timeframe",
        accuracy: "Accuracy",
        confidence: {
            high: "High",
            medium: "Medium",
            low: "Low"
        },
        signalGenerated: "Signal Generated!",
        signalDirection: "Signal Direction",
        signalConfidence: "Confidence Level",
        generatingSignal: "Generating signal...",
        analyzingMarket: "Analyzing market..."
    },
    uz: {
        logoText: "Savdo Signallari",
        currencyLabel: "Valyuta Juftligi",
        timeframeLabel: "Muddati",
        generateButton: "Signal Olish",
        signalTitle: "Signal",
        signalPlaceholder: "Signal Olish uchun bosing",
        languageLabel: "Til",
        timeframes: ["5 soniya", "15 soniya", "30 soniya", "1 daqiqa", "3 daqiqa", "5 daqiqa", "30 daqiqa", "1 soat", "4 soat"],
        buy: "SOTIB OLISH",
        sell: "SOTISH",
        timeframe: "Vaqt oralig'i",
        accuracy: "Aniqlik",
        confidence: {
            high: "Yuqori",
            medium: "O'rta",
            low: "Past"
        },
        signalGenerated: "Signal Yaratildi!",
        signalDirection: "Signal Yo'nalishi",
        signalConfidence: "Ishonch Darajasi",
        generatingSignal: "Signal yaratilmoqda...",
        analyzingMarket: "Bozor tahlil qilinmoqda..."
    },
    es: {
        mainTitle: "Señales de Trading",
        subtitle: "Señales profesionales de trading para opciones binarias",
        tabs: ["OTC", "Forex"],
        logoText: "Señales de Trading",
        currencyLabel: "Par de Monedas",
        timeframeLabel: "Tiempo de Expiración",
        generateButton: "Obtener Señal",
        signalTitle: "Señal",
        signalPlaceholder: "Haz clic en 'Obtener Señal'",
        languageLabel: "Idioma",
        timeframes: ["5 segundos", "15 segundos", "30 segundos", "1 minuto", "3 minutos", "5 minutos", "30 minutos", "1 hora", "4 horas"],
        buy: "COMPRAR",
        sell: "VENDER",
        timeframe: "Marco temporal",
        accuracy: "Precisión",
        confidence: {
            high: "Alto",
            medium: "Medio",
            low: "Bajo"
        },
        signalGenerated: "¡Señal Generada!",
        signalDirection: "Dirección de la Señal",
        signalConfidence: "Nivel de Confianza",
        generatingSignal: "Generando señal...",
        analyzingMarket: "Analizando mercado..."
    },
    de: {
        mainTitle: "Trading Signale",
        subtitle: "Professionelle Trading-Signale für binäre Optionen",
        tabs: ["OTC", "Forex"],
        logoText: "Trading Signale",
        currencyLabel: "Währungspaar",
        timeframeLabel: "Ablaufzeit",
        generateButton: "Signal Erhalten",
        signalTitle: "Signal",
        signalPlaceholder: "Klicken Sie 'Signal Erhalten'",
        languageLabel: "Sprache",
        timeframes: ["5 Sekunden", "15 Sekunden", "30 Sekunden", "1 Minute", "3 Minuten", "5 Minuten", "30 Minuten", "1 Stunde", "4 Stunden"],
        buy: "KAUFEN",
        sell: "VERKAUFEN",
        timeframe: "Zeitrahmen",
        accuracy: "Genauigkeit",
        confidence: {
            high: "Hoch",
            medium: "Mittel",
            low: "Niedrig"
        },
        signalGenerated: "Signal Generiert!",
        signalDirection: "Signalrichtung",
        signalConfidence: "Vertrauensstufe",
        generatingSignal: "Signal wird generiert...",
        analyzingMarket: "Markt wird analysiert..."
    },
    pt: {
        mainTitle: "Sinais de Trading",
        subtitle: "Sinais profissionais de trading para opções binárias",
        tabs: ["OTC", "Forex"],
        logoText: "Sinais de Trading",
        currencyLabel: "Par de Moedas",
        timeframeLabel: "Tempo de Expiração",
        generateButton: "Obter Sinal",
        signalTitle: "Sinal",
        signalPlaceholder: "Clique em 'Obter Sinal'",
        languageLabel: "Idioma",
        timeframes: ["5 segundos", "15 segundos", "30 segundos", "1 minuto", "3 minutos", "5 minutos", "30 minutos", "1 hora", "4 horas"],
        buy: "COMPRAR",
        sell: "VENDER",
        timeframe: "Período de tempo",
        accuracy: "Precisão",
        confidence: {
            high: "Alto",
            medium: "Médio",
            low: "Baixo"
        },
        signalGenerated: "Sinal Gerado!",
        signalDirection: "Direção do Sinal",
        signalConfidence: "Nível de Confiança",
        generatingSignal: "Gerando sinal...",
        analyzingMarket: "Analisando mercado..."
    },
    hi: {
        mainTitle: "ट्रेडिंग सिग्नल",
        subtitle: "बाइनरी विकल्पों के लिए पेशेवर ट्रेडिंग सिग्नल",
        tabs: ["फॉरेक्स", "ओटीसी"],
        logoText: "ट्रेडिंग सिग्नल",
        currencyLabel: "मुद्रा जोड़ी",
        timeframeLabel: "समाप्ति समय",
        generateButton: "सिग्नल प्राप्त करें",
        signalTitle: "सिग्नल",
        signalPlaceholder: "'सिग्नल प्राप्त करें' पर क्लिक करें",
        languageLabel: "भाषा",
        timeframes: ["5 सेकंड", "15 सेकंड", "30 सेकंड", "1 मिनट", "3 मिनट", "5 मिनट", "30 मिनट", "1 घंटा", "4 घंटे"],
        buy: "खरीदें",
        sell: "बेचें",
        timeframe: "समय सीमा",
        accuracy: "सटीकता",
        confidence: {
            high: "उच्च",
            medium: "मध्यम",
            low: "कम"
        },
        signalGenerated: "सिग्नल उत्पन्न!",
        signalDirection: "सिग्नल दिशा",
        signalConfidence: "विश्वास स्तर",
        generatingSignal: "सिग्नल उत्पन्न हो रहा है...",
        analyzingMarket: "बाजार का विश्लेषण हो रहा है..."
    },
    tr: {
        mainTitle: "Trading Sinyalleri",
        subtitle: "İkili opsiyonlar için profesyonel trading sinyalleri",
        tabs: ["OTC", "Forex"],
        logoText: "Trading Sinyalleri",
        currencyLabel: "Döviz Çifti",
        timeframeLabel: "Son Kullanma Süresi",
        generateButton: "Sinyal Al",
        signalTitle: "Sinyal",
        signalPlaceholder: "'Sinyal Al' tıklayın",
        languageLabel: "Dil",
        timeframes: ["5 saniye", "15 saniye", "30 saniye", "1 dakika", "3 dakika", "5 dakika", "30 dakika", "1 saat", "4 saat"],
        buy: "SATIN AL",
        sell: "SAT",
        timeframe: "Zaman dilimi",
        accuracy: "Doğruluk",
        confidence: {
            high: "Yüksek",
            medium: "Orta",
            low: "Düşük"
        },
        signalGenerated: "Sinyal Oluşturuldu!",
        signalDirection: "Sinyal Yönü",
        signalConfidence: "Güven Seviyesi",
        generatingSignal: "Sinyal oluşturuluyor...",
        analyzingMarket: "Piyasa analiz ediliyor..."
    },
    ar: {
        mainTitle: "إشارات التداول",
        subtitle: "إشارات تداول مهنية للخيارات الثنائية",
        tabs: ["فوركس", "OTC"],
        logoText: "إشارات التداول",
        currencyLabel: "زوج العملات",
        timeframeLabel: "وقت الانتهاء",
        generateButton: "احصل على إشارة",
        signalTitle: "إشارة",
        signalPlaceholder: "انقر على 'احصل على إشارة'",
        languageLabel: "اللغة",
        timeframes: ["5 ثواني", "15 ثانية", "30 ثانية", "1 دقيقة", "3 دقائق", "5 دقائق", "30 دقيقة", "1 ساعة", "4 ساعات"],
        buy: "شراء",
        sell: "بيع",
        timeframe: "الإطار الزمني",
        accuracy: "الدقة",
        confidence: {
            high: "عالي",
            medium: "متوسط",
            low: "منخفض"
        },
        signalGenerated: "تم إنشاء الإشارة!",
        signalDirection: "اتجاه الإشارة",
        signalConfidence: "مستوى الثقة",
        generatingSignal: "جاري إنشاء الإشارة...",
        analyzingMarket: "جاري تحليل السوق..."
    },
    uz: {
        mainTitle: "Savdo Signallari",
        subtitle: "Binarlik opsiyalar uchun professional savdo signallari",
        tabs: ["OTC", "Forex"],
        logoText: "Savdo Signallari",
        currencyLabel: "Valyuta Juftligi",
        timeframeLabel: "Muddati",
        generateButton: "Signal Olish",
        signalTitle: "Signal",
        signalPlaceholder: "'Signal Olish' tugmasini bosing",
        languageLabel: "Til",
        timeframes: ["5 soniya", "15 soniya", "30 soniya", "1 daqiqa", "3 daqiqa", "5 daqiqa", "30 daqiqa", "1 soat", "4 soat"],
        buy: "SOTIB OLISH",
        sell: "SOTISH",
        timeframe: "Vaqt oralig'i",
        accuracy: "Aniqlik",
        confidence: {
            high: "Yuqori",
            medium: "O'rta",
            low: "Past"
        },
        signalGenerated: "Signal Yaratildi!",
        signalDirection: "Signal Yo'nalishi",
        signalConfidence: "Ishonch Darajasi",
        generatingSignal: "Signal yaratilmoqda...",
        analyzingMarket: "Bozor tahlil qilinmoqda..."
    },
    tg: {
        mainTitle: "Сигналҳои Савдо",
        subtitle: "Сигналҳои касбии савдо барои опсияҳои дуӣ",
        tabs: ["OTC", "Форекс"],
        logoText: "Сигналҳои Савдо",
        currencyLabel: "Ҷуфти Асъор",
        timeframeLabel: "Вақти Анҷом",
        generateButton: "Сигнал Гиред",
        signalTitle: "Сигнал",
        signalPlaceholder: "'Сигнал Гиред' клик кунед",
        languageLabel: "Забон",
        timeframes: ["5 сония", "15 сония", "30 сония", "1 дақиқа", "3 дақиқа", "5 дақиқа", "30 дақиқа", "1 соат", "4 соат"],
        buy: "ХАРИД",
        sell: "ФУРУШ",
        timeframe: "Фосилаи вақт",
        accuracy: "Дақиқӣ",
        confidence: {
            high: "Баланд",
            medium: "Миёна",
            low: "Паст"
        },
        signalGenerated: "Сигнал Эҷод Шуд!",
        signalDirection: "Равзанаи Сигнал",
        signalConfidence: "Сатҳи Эътимод",
        generatingSignal: "Сигнал эҷод карда мешавад...",
        analyzingMarket: "Бозор таҳлил карда мешавад..."
    },
    az: {
        mainTitle: "Ticarət Siqnalları",
        subtitle: "İkili seçimlər üçün peşəkar ticarət siqnalları",
        tabs: ["OTC", "Forex"],
        logoText: "Ticarət Siqnalları",
        currencyLabel: "Valyuta Cütü",
        timeframeLabel: "Bitmə Müddəti",
        generateButton: "Siqnal Al",
        signalTitle: "Siqnal",
        signalPlaceholder: "'Siqnal Al' düyməsini basın",
        languageLabel: "Dil",
        timeframes: ["5 saniyə", "15 saniyə", "30 saniyə", "1 dəqiqə", "3 dəqiqə", "5 dəqiqə", "30 dəqiqə", "1 saat", "4 saat"],
        buy: "ALMAQ",
        sell: "SATMAQ",
        timeframe: "Vaxt intervalı",
        accuracy: "Dəqiqlik",
        confidence: {
            high: "Yüksək",
            medium: "Orta",
            low: "Aşağı"
        },
        signalGenerated: "Siqnal Yaradıldı!",
        signalDirection: "Siqnal İstiqaməti",
        signalConfidence: "Etimad Səviyyəsi",
        generatingSignal: "Siqnal yaradılır...",
        analyzingMarket: "Bazar analiz edilir..."
    },
    hy: {
        mainTitle: "Առևտրային Ազդանշաններ",
        subtitle: "Երկուական տարբերակների համար մասնագիտական առևտրային ազդանշաններ",
        tabs: ["OTC", "Forex"],
        logoText: "Առևտրային Ազդանշաններ",
        currencyLabel: "Արժույթի Զույգ",
        timeframeLabel: "Ժամկետի Ավարտ",
        generateButton: "Ստանալ Ազդանշան",
        signalTitle: "Ազդանշան",
        signalPlaceholder: "Սեղմեք 'Ստանալ Ազդանշան'",
        languageLabel: "Լեզու",
        timeframes: ["5 վայրկյան", "15 վայրկյան", "30 վայրկյան", "1 րոպե", "3 րոպե", "5 րոպե", "30 րոպե", "1 ժամ", "4 ժամ"],
        buy: "ԳՆԱԼ",
        sell: "ՎԱՃԱՌԵԼ",
        timeframe: "Ժամանակային շրջանակ",
        accuracy: "Ճշտություն",
        confidence: {
            high: "Բարձր",
            medium: "Միջին",
            low: "Ամենացածր"
        },
        signalGenerated: "Ազդանշանը Ստեղծվեց!",
        signalDirection: "Ազդանշանի Ուղղություն",
        signalConfidence: "Վստահության Մակարդակ",
        generatingSignal: "Ազդանշանը ստեղծվում է...",
        analyzingMarket: "Շուկան վերլուծվում է..."
    }
};

function changeLanguage(language = "en") {
    console.log('=== changeLanguage function called ===');
    console.log('Changing language to:', language);
    console.log('translations object exists:', typeof translations !== 'undefined');
    console.log('translations for language:', translations[language]);
    
    // Обновляем заголовок и подзаголовок
    const mainTitleElement = document.querySelector('.main-title');
    console.log('Main title element:', mainTitleElement);
    if (mainTitleElement) {
        console.log('Setting main title to:', translations[language].mainTitle);
        mainTitleElement.textContent = translations[language].mainTitle;
    } else {
        console.log('Main title element not found!');
    }

    const subtitleElement = document.querySelector('.subtitle');
    console.log('Subtitle element:', subtitleElement);
    if (subtitleElement) {
        console.log('Setting subtitle to:', translations[language].subtitle);
        subtitleElement.textContent = translations[language].subtitle;
    } else {
        console.log('Subtitle element not found!');
    }

    // Обновляем табы
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach((btn, index) => {
        const span = btn.querySelector('span');
        if (span && translations[language].tabs[index]) {
            span.textContent = translations[language].tabs[index];
        }
    });

    const currencyLabelElement = document.getElementById("currency-label");
    if (currencyLabelElement) currencyLabelElement.textContent = translations[language].currencyLabel;

    const timeframeLabelElement = document.getElementById("timeframe-label");
    if (timeframeLabelElement) timeframeLabelElement.textContent = translations[language].timeframeLabel;

    const generateButtonElement = document.getElementById("generate-btn");
    if (generateButtonElement && !generateButtonElement.disabled) {
        generateButtonElement.innerHTML = `<i class="fas fa-bolt"></i><span>${translations[language].generateButton}</span>`;
    }

    // Обновляем плейсхолдер сигнала, если он отображается
    const signalResult = document.getElementById("signal-result");
    if (signalResult && !signalResult.classList.contains('has-signal')) {
        const placeholder = signalResult.querySelector('.signal-placeholder');
        if (placeholder) {
            placeholder.textContent = translations[language].signalPlaceholder;
        }
    }

    // Обновляем текст кнопок времени
    const timeButtons = document.querySelectorAll('.time-btn');
    timeButtons.forEach(button => {
        const timeValue = button.dataset.time;
        const timeText = getTimeText(timeValue, language);
        const timeShort = button.querySelector('.time-short');
        const timeFull = button.querySelector('.time-full');
        
        if (timeShort) timeShort.textContent = timeValue;
        if (timeFull) timeFull.textContent = timeText;
    });

    resetSignalAndChart(language);
    
    // Обновляем уже сгенерированные сигналы
    updateSignalLanguage(language);
}

function getTimeText(timeValue, language) {
    const timeMap = {
        ru: {
            '5s': '5 секунд',
            '15s': '15 секунд',
            '30s': '30 секунд',
            '1m': '1 минута',
            '3m': '3 минуты',
            '5m': '5 минут',
            '30m': '30 минут',
            '1h': '1 час',
            '4h': '4 часа'
        },
        en: {
            '5s': '5 seconds',
            '15s': '15 seconds',
            '30s': '30 seconds',
            '1m': '1 minute',
            '3m': '3 minutes',
            '5m': '5 minutes',
            '30m': '30 minutes',
            '1h': '1 hour',
            '4h': '4 hours'
        },
        uz: {
            '5s': '5 soniya', 
            '15s': '15 soniya',
            '30s': '30 soniya',
            '1m': '1 daqiqa', 
            '3m': '3 daqiqa',
            '5m': '5 daqiqa',
            '30m': '30 daqiqa',
            '1h': '1 soat',
            '4h': '4 soat'
        }
    };
    
    return timeMap[language]?.[timeValue] || timeValue;
}

// Инициализация селектора языка
function initializeLanguageSelector() {
    const languageBtn = document.getElementById('language-btn');
    const languageDropdown = document.getElementById('language-dropdown');
    const languageOptions = document.querySelectorAll('.language-option');
    
    let currentLanguage = 'en'; // текущий язык
    
    // Обработчик клика по кнопке языка
    languageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        languageDropdown.classList.toggle('show');
    });
    
    // Обработчики выбора языка
    languageOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const selectedLang = option.dataset.lang;
            console.log('Language option clicked:', selectedLang);
            
            // Всегда обновляем язык и закрываем меню
            currentLanguage = selectedLang;
            updateLanguageButton(selectedLang);
            
            // Обновляем интерфейс напрямую
            console.log('Updating interface for language:', selectedLang);
            
            // Обновляем заголовок и подзаголовок
            const mainTitleElement = document.querySelector('.main-title');
            if (mainTitleElement && translations[selectedLang]) {
                mainTitleElement.textContent = translations[selectedLang].mainTitle;
                console.log('Updated main title to:', translations[selectedLang].mainTitle);
            }
            
            const subtitleElement = document.querySelector('.subtitle');
            if (subtitleElement && translations[selectedLang]) {
                subtitleElement.textContent = translations[selectedLang].subtitle;
                console.log('Updated subtitle to:', translations[selectedLang].subtitle);
            }
            
            // Обновляем табы
            const tabButtons = document.querySelectorAll('.tab-btn');
            tabButtons.forEach((btn, index) => {
                const span = btn.querySelector('span');
                if (span && translations[selectedLang] && translations[selectedLang].tabs[index]) {
                    span.textContent = translations[selectedLang].tabs[index];
                }
            });
            
            // Обновляем лейблы
            const currencyLabelElement = document.getElementById("currency-label");
            if (currencyLabelElement && translations[selectedLang]) {
                currencyLabelElement.textContent = translations[selectedLang].currencyLabel;
            }
            
            const timeframeLabelElement = document.getElementById("timeframe-label");
            if (timeframeLabelElement && translations[selectedLang]) {
                timeframeLabelElement.textContent = translations[selectedLang].timeframeLabel;
            }
            
            // Обновляем кнопку генерации
            const generateButtonElement = document.getElementById("generate-btn");
            if (generateButtonElement && !generateButtonElement.disabled && translations[selectedLang]) {
                generateButtonElement.innerHTML = `<i class="fas fa-bolt"></i><span>${translations[selectedLang].generateButton}</span>`;
            }
            
            // Обновляем плейсхолдер сигнала
            const signalResult = document.getElementById("signal-result");
            if (signalResult && !signalResult.classList.contains('has-signal') && translations[selectedLang]) {
                const placeholder = signalResult.querySelector('.signal-placeholder');
                if (placeholder) {
                    placeholder.textContent = translations[selectedLang].signalPlaceholder;
                }
            }
            
            // Обновляем текст кнопок времени
            const timeButtons = document.querySelectorAll('.time-btn');
            timeButtons.forEach(button => {
                const timeValue = button.dataset.time;
                const timeText = getTimeText(timeValue, selectedLang);
                const timeShort = button.querySelector('.time-short');
                const timeFull = button.querySelector('.time-full');
                
                if (timeShort) timeShort.textContent = timeValue.replace('s', 'S').replace('m', 'M').replace('h', 'H');
                if (timeFull) timeFull.textContent = timeText;
            });
            
            // Обновляем уже сгенерированные сигналы
            updateSignalLanguage(selectedLang);
            
            // Закрываем меню сразу
            languageDropdown.classList.remove('show');
        });
    });
    
    // Закрытие выпадающего меню при клике вне его (с задержкой)
    document.addEventListener('click', (e) => {
        setTimeout(() => {
            // Проверяем, что клик не по кнопке языка и не по выпадающему меню
            if (!languageBtn.contains(e.target) && !languageDropdown.contains(e.target)) {
                languageDropdown.classList.remove('show');
            }
        }, 10);
    });
    
    // Функция обновления кнопки языка
    function updateLanguageButton(lang) {
        const flagIcon = languageBtn.querySelector('.flag-icon');
        const textSpan = languageBtn.querySelector('span');
        
        const languageData = {
            'en': { flag: 'https://flagcdn.com/16x12/us.png', name: 'English', alt: 'US Flag' },
            'ru': { flag: 'https://flagcdn.com/16x12/ru.png', name: 'Русский', alt: 'Russian Flag' },
            'es': { flag: 'https://flagcdn.com/16x12/es.png', name: 'Español', alt: 'Spanish Flag' },
            'de': { flag: 'https://flagcdn.com/16x12/de.png', name: 'Deutsch', alt: 'German Flag' },
            'pt': { flag: 'https://flagcdn.com/16x12/pt.png', name: 'Português', alt: 'Portuguese Flag' },
            'hi': { flag: 'https://flagcdn.com/16x12/in.png', name: 'हिन्दी', alt: 'Indian Flag' },
            'tr': { flag: 'https://flagcdn.com/16x12/tr.png', name: 'Türkçe', alt: 'Turkish Flag' },
            'ar': { flag: 'https://flagcdn.com/16x12/sa.png', name: 'العربية', alt: 'Saudi Flag' },
            'uz': { flag: 'https://flagcdn.com/16x12/uz.png', name: 'O\'zbekcha', alt: 'Uzbekistan Flag' },
            'tg': { flag: 'https://flagcdn.com/16x12/tj.png', name: 'Тоҷикӣ', alt: 'Tajikistan Flag' },
            'az': { flag: 'https://flagcdn.com/16x12/az.png', name: 'Azərbaycan', alt: 'Azerbaijan Flag' },
            'hy': { flag: 'https://flagcdn.com/16x12/am.png', name: 'Հայերեն', alt: 'Armenian Flag' }
        };
        
        const langData = languageData[lang];
        if (langData) {
            flagIcon.src = langData.flag;
            flagIcon.alt = langData.alt;
            textSpan.textContent = langData.name;
        }
        
        // Обновляем активное состояние в выпадающем меню
        languageOptions.forEach(option => {
            option.classList.remove('active');
            if (option.dataset.lang === lang) {
                option.classList.add('active');
            }
        });
    }
    
    // Функция смены языка (обновленная)
    function changeLanguage(lang) {
        const elements = {
            'main-title': translations[lang].mainTitle,
            'subtitle': translations[lang].subtitle,
            'currency-label': translations[lang].currencyLabel,
            'timeframe-label': translations[lang].timeframeLabel,
            'generate-btn': translations[lang].generateButton,
            'signal-placeholder': translations[lang].signalPlaceholder
        };
        
        Object.entries(elements).forEach(([id, text]) => {
            const element = document.getElementById(id);
            if (element) {
                if (id === 'generate-btn') {
                    element.querySelector('span').textContent = text;
                } else {
                    element.textContent = text;
                }
            }
        });
        
        // Обновление табов
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach((btn, index) => {
            const span = btn.querySelector('span');
            if (span) {
                span.textContent = translations[lang].tabs[index];
            }
        });
    }
    
    // Инициализируем язык при загрузке
    console.log('Initializing language selector, current language:', currentLanguage);
    changeLanguage(currentLanguage);
}

// Инициализация валютного селектора
function initializeCurrencySelector() {
    const currencyBtn = document.getElementById('currency-btn');
    const currencyDropdown = document.getElementById('currency-dropdown');
    const currencyOptions = document.querySelectorAll('.currency-option');
    
    // Обработчик клика по кнопке валют
    currencyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = currencyDropdown.classList.contains('show');
        currencyDropdown.classList.toggle('show');
        currencyBtn.classList.toggle('active', !isOpen);
    });
    
    // Обработчики выбора валюты
    currencyOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const selectedCurrency = option.textContent;
            
            console.log('=== CURRENCY OPTION CLICKED ===');
            console.log('Selected currency:', selectedCurrency);
            console.log('Event target:', e.target);
            console.log('Current pair before:', currentPair);
            
            // Обновляем кнопку
            updateCurrencyButton(selectedCurrency);
            
            // Обновляем активное состояние
            currencyOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            
            // Обновляем текущую валютную пару
            currentPair = selectedCurrency;
            
            console.log('Current pair after:', currentPair);
            console.log('=== END CURRENCY OPTION CLICK ===');
            
            // Проверяем кулдаун для новой валютной пары
            const generateButton = document.getElementById("generate-btn");
            if (cooldowns[currentPair] && cooldowns[currentPair].endTime > Date.now()) {
                const activeLanguageOption = document.querySelector('.language-option.active');
                const currentLanguage = activeLanguageOption ? activeLanguageOption.dataset.lang : 'en';
                startCooldown(currentPair, currentLanguage);
            } else {
                generateButton.disabled = false;
                // Получаем текущий язык и обновляем кнопку
                const activeLanguageOption = document.querySelector('.language-option.active');
                const language = activeLanguageOption ? activeLanguageOption.dataset.lang : 'en';
                const buttonText = translations[language].generateButton;
                generateButton.innerHTML = `<i class="fas fa-bolt"></i><span>${buttonText}</span>`;
            }
            
            // Закрываем меню
            currencyDropdown.classList.remove('show');
            currencyBtn.classList.remove('active');
        });
    });
    
    // Закрытие выпадающего меню при клике вне его
    document.addEventListener('click', (e) => {
        setTimeout(() => {
            if (!currencyBtn.contains(e.target) && !currencyDropdown.contains(e.target)) {
                currencyDropdown.classList.remove('show');
                currencyBtn.classList.remove('active');
            }
        }, 10);
    });
}

// Функция обновления кнопки валют
function updateCurrencyButton(currency) {
    const currencyBtn = document.getElementById('currency-btn');
    const span = currencyBtn.querySelector('span');
    if (span) {
        span.textContent = currency;
    }
}

// Функция обновления состояния вкладок
function updateTabStates() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const forexTab = document.querySelector('.tab-btn[data-tab="forex"]');
    
    if (isWeekend()) {
        // В выходные отключаем Forex
        if (forexTab) {
            forexTab.classList.add('disabled');
            forexTab.title = 'Forex market is closed on weekends';
        }
        
        // Если Forex был активен, переключаемся на OTC
        if (forexTab && forexTab.classList.contains('active')) {
            forexTab.classList.remove('active');
            const otcTab = document.querySelector('.tab-btn[data-tab="otc"]');
            if (otcTab) {
                otcTab.classList.add('active');
            }
        }
    } else {
        // В рабочие дни убираем отключение с Forex
        if (forexTab) {
            forexTab.classList.remove('disabled');
            forexTab.title = '';
        }
    }
}

// Инициализация модального окна выходных
function initializeWeekendModal() {
    const modal = document.getElementById('weekend-modal');
    const closeBtn = document.getElementById('weekend-modal-close');
    
    // Обработчик закрытия по кнопке
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });
    
    // Обработчик закрытия по клику вне модального окна
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });
    
    // Обработчик закрытия по Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            modal.classList.remove('show');
        }
    });
}

// Глобальный обработчик кликов для закрытия выпадающих списков
function initializeGlobalClickHandler() {
    document.addEventListener('click', (e) => {
        const currencyDropdown = document.getElementById('currency-dropdown');
        const languageDropdown = document.getElementById('language-dropdown');
        const currencyBtn = document.getElementById('currency-btn');
        const languageBtn = document.getElementById('language-btn');
        
        // Проверяем, не кликнули ли мы по элементам выпадающих списков
        const isCurrencyClick = currencyBtn && currencyBtn.contains(e.target);
        const isLanguageClick = languageBtn && languageBtn.contains(e.target);
        const isCurrencyDropdownClick = currencyDropdown && currencyDropdown.contains(e.target);
        const isLanguageDropdownClick = languageDropdown && languageDropdown.contains(e.target);
        
        // Если клик не по элементам валютного селектора, закрываем его
        if (!isCurrencyClick && !isCurrencyDropdownClick && currencyDropdown && currencyDropdown.classList.contains('show')) {
            currencyDropdown.classList.remove('show');
            if (currencyBtn) currencyBtn.classList.remove('active');
        }
        
        // Если клик не по элементам языкового селектора, закрываем его
        if (!isLanguageClick && !isLanguageDropdownClick && languageDropdown && languageDropdown.classList.contains('show')) {
            languageDropdown.classList.remove('show');
        }
    });
}

// Функция отправки данных в Telegram WebApp
function sendToTelegram(data) {
    if (tg && tg.sendData) {
        try {
            tg.sendData(JSON.stringify(data));
        } catch (error) {
            console.log('Telegram WebApp not available:', error);
        }
    }
}

// Функция показа уведомления в Telegram
function showTelegramAlert(message) {
    if (tg && tg.showAlert) {
        tg.showAlert(message);
    } else {
        alert(message);
    }
}

// Функция показа подтверждения в Telegram
function showTelegramConfirm(message, callback) {
    if (tg && tg.showConfirm) {
        tg.showConfirm(message, callback);
    } else {
        const result = confirm(message);
        callback(result);
    }
}

// Функция обновления языка уже сгенерированных сигналов
function updateSignalLanguage(language) {
    const signalResult = document.getElementById("signal-result");
    if (!signalResult || !signalResult.classList.contains('has-signal')) {
        return; // Нет активного сигнала
    }
    
    // Обновляем заголовок сигнала
    const signalHeader = signalResult.querySelector('.signal-header-text');
    if (signalHeader) {
        signalHeader.textContent = translations[language].signalGenerated;
    }
    
    // Обновляем лейблы
    const directionLabel = signalResult.querySelector('.signal-direction-label');
    if (directionLabel) {
        directionLabel.textContent = translations[language].signalDirection;
    }
    
    const confidenceLabel = signalResult.querySelector('.signal-confidence-label');
    if (confidenceLabel) {
        confidenceLabel.textContent = translations[language].signalConfidence;
    }
    
    // Обновляем кнопки BUY/SELL
    const directionValue = signalResult.querySelector('.signal-direction-value');
    if (directionValue) {
        const isBuy = directionValue.classList.contains('buy');
        const icon = directionValue.querySelector('i');
        const text = directionValue.childNodes[2]; // Текстовый узел
        
        if (text) {
            text.textContent = isBuy ? translations[language].buy : translations[language].sell;
        }
    }
    
    // Обновляем уровень уверенности
    const confidenceValue = signalResult.querySelector('.signal-confidence-value');
    if (confidenceValue) {
        const level = confidenceValue.classList.contains('high') ? 'high' : 
                     confidenceValue.classList.contains('medium') ? 'medium' : 'low';
        confidenceValue.textContent = translations[language].confidence[level];
    }
}