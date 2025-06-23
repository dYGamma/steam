require('dotenv').config();

const fs             = require('fs');
const path           = require('path');
const SteamUser      = require('steam-user');
const SteamCommunity = require('steamcommunity');
const SteamTotp      = require('steam-totp');
const cheerio        = require('cheerio');

const ACCOUNT_NAME    = process.env.STEAM_LOGIN;
const PASSWORD        = process.env.STEAM_PASSWORD;
const SHARED_SECRET   = process.env.STEAM_SHARED_SECRET;
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

let loginAttempt = 0;

function doLogOn() {
  loginAttempt++;
  console.log(`→ Попытка логина #${loginAttempt}`);
  client.logOn({
    accountName:     ACCOUNT_NAME,
    password:        PASSWORD,
    rememberPassword: true
  });
}

client.on('steamGuard', (domain, callback, lastCodeWrong) => {
  const where = domain ? `на e-mail *@${domain}` : 'мобильный Authenticator';
  console.log(`→ SteamGuard требует код (${where})${lastCodeWrong ? ' — предыдущий был неверен' : ''}`);

  const code = SteamTotp.generateAuthCode(SHARED_SECRET);
  console.log(`→ Отправляем код: ${code}`);
  callback(code);
});

client.on('sentry', sentryBytes => {
  fs.writeFileSync(SENTRY_PATH, sentryBytes);
  console.log('✓ Sentry-файл сохранён, дальше не требуем двухфакторку');
});

client.on('loggedOn', () => {
  console.log('✓ Залогинились как', client.steamID.getSteamID64());
  client.webLogOn();
});

client.on('error', err => {
  if (err.eresult === SteamUser.EResult.RateLimitExceeded || err.eresult === 84) {
    const delay = Math.min(5 * 60 * 1000, loginAttempt * 60 * 1000);
    console.warn(`⚠ RateLimit при логине (eresult=${err.eresult}). Повтор через ${delay/1000}s`);
    setTimeout(doLogOn, delay);
  } else {
    console.error('Steam-клиент выдал ошибку:', err);
  }
});

client.once('webSession', (sessionID, cookies) => {
  console.log('✓ WebSession получена');
  community.setCookies(cookies, sessionID);

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

    let idx = 0;
    setInterval(() => {
      const newSettings = { ...settings, summary: frames[idx] };
      community.editProfile(newSettings, err => {
        if (err) {
          console.error('✗ Ошибка при обновлении профиля:', err.message || err);
        } else {
          console.log('→ Обновлён кадр:', frames[idx]);
        }
      });
      idx = (idx + 1) % frames.length;
    }, UPDATE_INTERVAL);
  });
});

doLogOn();
