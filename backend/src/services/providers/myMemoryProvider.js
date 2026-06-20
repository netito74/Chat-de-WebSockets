'use strict';
/**
 * Proveedor de traduccion MyMemory (https://mymemory.translated.net).
 *
 * Por que este proveedor y no el "mock": el proveedor mock solo conoce un
 * diccionario fijo de ~25 palabras/frases, por lo que cualquier mensaje real
 * queda casi sin traducir (la mayoria de palabras pasan intactas). MyMemory
 * es una API real de traduccion automatica, publica y gratuita: no requiere
 * registro ni API key, por lo que funciona "out of the box" sin que el
 * usuario tenga que configurar credenciales de Google/DeepL. Limite gratuito:
 * 5000 caracteres/dia de forma anonima, o 50000/dia si se configura
 * MYMEMORY_EMAIL (ver config/index.js). Para volumen de produccion alto, se
 * recomienda migrar a TRANSLATION_PROVIDER=google o =deepl.
 *
 * Documentacion: https://mymemory.translated.net/doc/spec.php
 */
const config = require('../../config');

const ENDPOINT = 'https://api.mymemory.translated.net/get';
const MAX_BYTES_PER_REQUEST = 480; // limite real de la API es 500 bytes
const REQUEST_TIMEOUT_MS = 8000;

/** Divide el texto en fragmentos que respeten el limite de bytes de la API, cortando en espacios cuando es posible. */
function splitIntoChunks(text, maxBytes) {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return [text];
  const chunks = [];
  let current = '';
  for (const word of text.split(/(\s+)/)) {
    const candidate = current + word;
    if (Buffer.byteLength(candidate, 'utf8') > maxBytes && current) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function translateChunk(text, targetLang, sourceLang) {
  const params = new URLSearchParams({ q: text, langpair: `${sourceLang}|${targetLang}` });
  if (config.translation.myMemoryEmail) params.set('de', config.translation.myMemoryEmail);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${ENDPOINT}?${params}`, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`MyMemory respondio HTTP ${res.status}`);

  const data = await res.json();
  if (data.responseStatus && Number(data.responseStatus) !== 200) {
    throw new Error(data.responseDetails || 'MyMemory rechazo la solicitud');
  }
  const translated = data?.responseData?.translatedText;
  if (!translated) throw new Error('MyMemory no devolvio texto traducido');

  // Quirk conocido de la API: cuando se agota la cuota gratuita anonima,
  // responde HTTP 200 pero con un texto de advertencia en vez de la
  // traduccion (p. ej. "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE
  // TRANSLATIONS FOR TODAY"). Hay que detectarlo explicitamente o se
  // mostraria esa advertencia como si fuera el mensaje traducido.
  if (/MYMEMORY WARNING/i.test(translated)) {
    throw new Error('Cuota gratuita de MyMemory agotada por hoy');
  }
  return translated;
}

async function translate(text, targetLang, sourceLang) {
  const chunks = splitIntoChunks(text, MAX_BYTES_PER_REQUEST);
  const translatedChunks = [];
  for (const chunk of chunks) {
    translatedChunks.push(await translateChunk(chunk, targetLang, sourceLang));
  }
  return translatedChunks.join('');
}

module.exports = { translate, name: 'mymemory' };
