require('dotenv').config();

const fs        = require('fs');
const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const path      = require('path');

const SENTRY_PATH = path.resolve(__dirname, 'sentry.bin');

const client = new SteamUser({
  sentry: null
});

client.logOn({
  accountName:     process.env.STEAM_LOGIN,
  password:        process.env.STEAM_PASSWORD,
  twoFactorCode:   SteamTotp.generateAuthCode(process.env.STEAM_SHARED_SECRET),
  rememberPassword: true
});

client.on('sentry', sentryBytes => {
  fs.writeFileSync(SENTRY_PATH, sentryBytes);
  console.log('✓ Sentry-файл сохранён в', SENTRY_PATH);
  process.exit(0);
});

client.on('error', err => {
  console.error('Ошибка при логине:', err);
  process.exit(1);
});
