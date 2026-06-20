'use strict';
/**
 * Proveedor alternativo para produccion: DeepL API. Igual que
 * googleProvider.js, no se ejecuta en este entorno sandbox pero queda listo
 * para activarse con TRANSLATION_PROVIDER=deepl y DEEPL_API_KEY.
 */
const config = require('../../config');

async function translate(text, targetLang, sourceLang) {
  const apiKey = config.translation.deeplApiKey;
  if (!apiKey) {
    throw new Error('DEEPL_API_KEY no configurada');
  }
  const res = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      text,
      target_lang: targetLang.toUpperCase(),
      source_lang: sourceLang.toUpperCase(),
    }),
  });
  if (!res.ok) {
    throw new Error(`DeepL API respondio ${res.status}`);
  }
  const data = await res.json();
  return data?.translations?.[0]?.text ?? text;
}

module.exports = { translate, name: 'deepl' };
