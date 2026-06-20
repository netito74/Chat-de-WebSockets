'use strict';
/**
 * Proveedor real para produccion: Google Cloud Translation API v2 (REST).
 * No se ejecuta en este entorno de desarrollo (sin salida a internet hacia
 * translation.googleapis.com), pero queda implementado y listo para
 * activarse con TRANSLATION_PROVIDER=google y GOOGLE_TRANSLATE_API_KEY.
 */
const config = require('../../config');

async function translate(text, targetLang, sourceLang) {
  const apiKey = config.translation.googleApiKey;
  if (!apiKey) {
    throw new Error('GOOGLE_TRANSLATE_API_KEY no configurada');
  }
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, target: targetLang, source: sourceLang, format: 'text' }),
  });
  if (!res.ok) {
    throw new Error(`Google Translate API respondio ${res.status}`);
  }
  const data = await res.json();
  return data?.data?.translations?.[0]?.translatedText ?? text;
}

module.exports = { translate, name: 'google' };
