require('dotenv').config();

const fs = require('fs');
const path = require('path');
const SteamUser = require('steam-user');
const SteamCommunity = require('steamcommunity');
const SteamTotp = require('steam-totp');
const cheerio = require('cheerio');
const readline = require('readline');

// Проверка критических переменных окружения
if (!process.env.STEAM_LOGIN || !process.env.STEAM_PASSWORD) {
  console.error('❌ Ошибка: Не заданы обязательные переменные окружения! Проверьте .env файл:');
  console.error('STEAM_LOGIN, STEAM_PASSWORD');
  process.exit(1);
}

const ACCOUNT_NAME = process.env.STEAM_LOGIN;
const PASSWORD = process.env.STEAM_PASSWORD;
const SHARED_SECRET = process.env.STEAM_SHARED_SECRET;
const UPDATE_INTERVAL = parseInt(process.env.UPDATE_INTERVAL_MS, 10) || 3600000;
const SENTRY_PATH = path.resolve(__dirname, 'sentry.bin');

const client = new SteamUser({
  sentry: fs.existsSync(SENTRY_PATH)
    ? fs.readFileSync(SENTRY_PATH)
    : null
});
const community = new SteamCommunity();

let loginAttempt = 0;
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// База неформальных фраз
const HOURLY_PHRASES = [
  "Тссс... Ночь на дворе! Спят все, кроме хардкорных геймеров 🌙",
  "Звезды горят ярко, а твой монитор - еще ярче! ✨",
  "Ночной патруль Steam на месте! 🦉",
  "Кофеиновая капельница подключена... Ночь-день-ночь! ☕",
  "Доброе утро! Первый враг повержен? ☀️",
  "Утренний кофе и Steam News - лучший завтрак! 📰",
  "Солнце встает, а ты все в игре? Восхищаюсь! 😎",
  "Программисты спят? Какой еще сон? 💻",
  "День в разгаре! Сколько FPS в твоей жизни сегодня? 🚀",
  "Обеденный перерыв = 5 минут на перекус + 55 минут на игру 🍔",
  "Работа может подождать, распродажа в Steam - нет! 🛒",
  "Послеполуденный зной... Идеальное время для хорроров! 👻",
  "Вечер настал! Самое время для кооператива с друзьями 👥",
  "Сумерки - грань между реальностью и виртуальным миром 🌆",
  "Луна сменила солнце, а ты все в битве? Боец! ⚔️",
  "Пора бы спать... Но всего один раундик, правда? 😴"
];

function generateHourlyInfo() {
  const now = new Date();
  const hour = now.getHours();
  
  let period;
  if (hour < 6) period = "ночь";
  else if (hour < 12) period = "утро";
  else if (hour < 18) period = "день";
  else period = "вечер";
  
  const randomIndex = Math.floor(Math.random() * HOURLY_PHRASES.length);
  
  return `${HOURLY_PHRASES[randomIndex]} [${period} ${now.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  })}]`;
}

function doLogOn() {
  loginAttempt++;
  console.log(`→ Попытка логина #${loginAttempt}`);
  
  const logOnOptions = {
    accountName: ACCOUNT_NAME,
    password: PASSWORD,
    rememberPassword: true
  };
  
  // Если есть shared secret, используем его
  if (SHARED_SECRET) {
    const authCode = SteamTotp.generateAuthCode(SHARED_SECRET);
    console.log(`✓ Сгенерирован код двухфакторки: ${authCode}`);
    logOnOptions.twoFactorCode = authCode;
  }
  
  client.logOn(logOnOptions);
}

client.on('steamGuard', (domain, callback, lastCodeWrong) => {
  const where = domain ? `на e-mail *@${domain}` : 'мобильный Authenticator';
  console.log(`→ SteamGuard требует код (${where})${lastCodeWrong ? ' — предыдущий был неверен' : ''}`);
  
  // Если есть shared secret, используем его
  if (SHARED_SECRET) {
    const code = SteamTotp.generateAuthCode(SHARED_SECRET);
    console.log(`→ Отправляем код: ${code}`);
    callback(code);
  } else {
    // Иначе запрашиваем ручной ввод
    rl.question('↳ Введите код из приложения Steam: ', (code) => {
      callback(code);
      rl.close();
    });
  }
});

client.on('sentry', sentryBytes => {
  try {
    fs.writeFileSync(SENTRY_PATH, sentryBytes);
    console.log('✓ Sentry-файл сохранён');
  } catch (e) {
    console.error('❌ Ошибка сохранения sentry-файла:', e.message);
  }
});

client.on('loggedOn', () => {
  console.log('✓ Залогинились как', client.steamID.getSteamID64());
  client.setPersona(SteamUser.EPersonaState.Online);
  client.webLogOn();
});

client.on('error', err => {
  console.error('Steam-клиент выдал ошибку:', err.message || err);
  
  if (err.eresult === SteamUser.EResult.RateLimitExceeded || 
      err.eresult === SteamUser.EResult.AccountLoginDeniedThrottle) {
    const delay = Math.min(5 * 60 * 1000, loginAttempt * 60 * 1000);
    console.warn(`⚠ RateLimit при логине (eresult=${err.eresult}). Повтор через ${delay/1000}s`);
    setTimeout(doLogOn, delay);
  } else if (err.eresult === SteamUser.EResult.InvalidLoginAuthCode) {
    console.error('❌ Неверный код двухфакторки.');
    
    if (SHARED_SECRET) {
      console.error('Проверьте:');
      console.error('1. Правильность SHARED_SECRET в .env файле');
      console.error('2. Синхронизацию времени на сервере');
      console.error('3. Нет ли лишних пробелов в переменных окружения');
    }
    
    console.log('Повторная попытка через 10 секунд...');
    setTimeout(doLogOn, 10000);
  } else {
    console.log('Повторная попытка через 30 секунд...');
    setTimeout(doLogOn, 30000);
  }
});

client.once('webSession', (sessionID, cookies) => {
  console.log('✓ WebSession получена');
  community.setCookies(cookies);
  community.sessionID = sessionID;

  const editUrl = `https://steamcommunity.com/profiles/${client.steamID.getSteamID64()}/edit`;
  community.httpRequestGet(editUrl, (err, res, body) => {
    if (err) {
      console.error('✗ Не удалось получить форму профиля:', err);
      return;
    }
    
    const $ = cheerio.load(body);
    const settings = {};
    $('form#editForm').find('input, select, textarea').each((i, el) => {
      const name = $(el).attr('name');
      if (!name) return;
      settings[name] = $(el).val() || '';
    });
    
    console.log('✓ Считаны поля профиля:', Object.keys(settings));
    
    const updateProfile = () => {
      const newInfo = generateHourlyInfo();
      const newSettings = { ...settings, summary: newInfo };
      
      community.editProfile(newSettings, err => {
        if (err) {
          console.error('✗ Ошибка при обновлении профиля:', err.message || err);
        } else {
          console.log('✓ Обновлено:', newInfo);
        }
      });
    };
    
    updateProfile();
    setInterval(updateProfile, UPDATE_INTERVAL);
    console.log(`↻ Автообновление каждые ${UPDATE_INTERVAL/60000} минут`);
  });
});

doLogOn();