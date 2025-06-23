require('dotenv').config();

const fs             = require('fs');
const path           = a= require('path');
const SteamUser      = require('steam-user');
const SteamCommunity = require('steamcommunity');
const cheerio        = require('cheerio');
const qrcode         = require('qrcode-terminal');

const ACCOUNT_NAME    = process.env.STEAM_LOGIN;
// const PASSWORD     = process.env.STEAM_PASSWORD;
// const SHARED_SECRET = process.env.STEAM_SHARED_SECRET;
const UPDATE_INTERVAL = parseInt(process.env.UPDATE_INTERVAL_MS, 10) || 30000;
const SENTRY_PATH     = path.resolve(__dirname, 'sentry.bin');

const frames = [
  '(•_•)',
  '( •_•)>⌐■-■',
  '(⌐■_■)'
];

const client = new SteamUser({
  sentry: fs.existsSync(SENTRY_PATH)
    ? fs.readFileSync(SENTRY_PATH)
    : null
});
const community = new SteamCommunity();

function doQrLogOn() {
  console.log(`→ Попытка входа для аккаунта: ${ACCOUNT_NAME}`);
  client.logOn({
    accountName: ACCOUNT_NAME,
    qrCode: true
  });
}

client.on('qrCode', (qr) => {
    console.log('Пожалуйста, отсканируйте этот QR-код с помощью мобильного приложения Steam:');
    qrcode.generate(qr, { small: true });
});

client.on('sentry', sentryBytes => {
  fs.writeFileSync(SENTRY_PATH, sentryBytes);
  console.log('✓ Sentry-файл сохранён.');
});

client.on('loggedOn', () => {
  console.log('✓ Успешный вход через QR-код как', client.steamID.getSteamID64());
  client.webLogOn();
});

client.on('error', err => {
  console.error('✗ Steam-клиент выдал ошибку:', err);
});

client.on('webSession', (sessionID, cookies) => {
  console.log('✓ WebSession получена');
  community.setCookies(cookies, sessionID);

  console.log('→ Загружаем страницу профиля для редактирования...');
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

    console.log('✓ Считаны текущие поля профиля.');
    console.log(`→ Запускаем анимацию с интервалом ${UPDATE_INTERVAL / 1000} секунд.`);

    let frameIndex = 0;
    setInterval(() => {
      const newSettings = { ...settings, summary: frames[frameIndex] };

      community.editProfile(newSettings, err => {
        if (err) {
          console.error('✗ Ошибка при обновлении профиля:', err.message || err);
        } else {
          console.log('→ Обновлён кадр:', frames[frameIndex]);
        }
      });

      frameIndex = (frameIndex + 1) % frames.length;
    }, UPDATE_INTERVAL);
  });
});

doQrLogOn();