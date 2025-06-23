require('dotenv').config();

const fs             = require('fs');
const path           = require('path');
const SteamUser      = require('steam-user');
const SteamCommunity = require('steamcommunity');
const cheerio        = require('cheerio');

const ACCOUNT_NAME    = process.env.STEAM_LOGIN;
const PASSWORD        = process.env.STEAM_PASSWORD;
const UPDATE_INTERVAL = parseInt(process.env.UPDATE_INTERVAL_MS, 10) || 30000;
const SENTRY_PATH     = path.resolve(__dirname, 'sentry.bin');

// ASCII-кадры вашей анимации
const frames = [
  '(•_•)',
  '( •_•)>⌐■-■',
  '(⌐■_■)'
];

// Инициализируем клиент с подгрузкой sentry-файла (если есть)
const client = new SteamUser({
  sentry: fs.existsSync(SENTRY_PATH)
    ? fs.readFileSync(SENTRY_PATH)
    : null
});
const community = new SteamCommunity();

// Обработчик успешного логина в клиенте
client.on('loggedOn', () => {
  console.log('✓ Залогинены как', client.steamID.getSteamID64());
  client.webLogOn();
});

// Ошибки Steam-клиента
client.on('error', err => {
  console.error('Steam-клиент ошибка:', err);
  process.exit(1);
});

// После получения webSession шлём запрос на форму редактирования профиля
client.once('webSession', (sessionID, cookies) => {
  community.setCookies(cookies, sessionID);
  console.log('✓ WebSession установлена');

  const editUrl = `https://steamcommunity.com/profiles/${client.steamID.getSteamID64()}/edit`;
  community.httpRequestGet(editUrl, (err, res, body) => {
    if (err) {
      console.error('✗ Не удалось получить форму профиля:', err);
      process.exit(1);
    }

    // Парсим все поля формы
    const $ = cheerio.load(body);
    const settings = {};
    $('form#editForm').find('input, select, textarea').each((i, el) => {
      const name = $(el).attr('name');
      if (!name) return;
      settings[name] = $(el).val() || '';
    });
    console.log('✓ Поля профиля считаны:', Object.keys(settings));

    // Стартуем цикл анимации
    let idx = 0;
    setInterval(() => {
      const newSettings = { ...settings, summary: frames[idx] };
      community.editProfile(newSettings, err => {
        if (err) {
          console.error('✗ Ошибка при обновлении профиля:', err);
        } else {
          console.log(`→ Обновлён кадр: ${frames[idx]}`);
        }
      });
      idx = (idx + 1) % frames.length;
    }, UPDATE_INTERVAL);
  });
});

// Запускаем логин — без двухфакторки (sentry.bin уже хранит доверие)
client.logOn({
  accountName:     ACCOUNT_NAME,
  password:        PASSWORD,
  rememberPassword: true
});
