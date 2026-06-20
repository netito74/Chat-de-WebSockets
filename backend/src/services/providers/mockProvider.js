'use strict';
/**
 * Proveedor de traduccion "mock": funciona completamente offline mediante un
 * diccionario es<->en y un conjunto de heuristicas simples. Se usa por
 * defecto en este entorno de desarrollo/demo porque no hay salida de red
 * disponible hacia APIs de traduccion externas (Google Cloud Translation,
 * DeepL, Azure Translator). La interfaz `translate(text, target, source)`
 * es la misma que implementarian los proveedores reales (ver
 * googleProvider.js y deeplProvider.js), por lo que cambiar de proveedor en
 * produccion es solo un cambio de configuracion (TRANSLATION_PROVIDER=google)
 * sin tocar el resto del sistema (principio de inversion de dependencias).
 */

const DICTIONARY = {
  hola: 'hello', adios: 'goodbye', 'buenos dias': 'good morning',
  'buenas tardes': 'good afternoon', 'buenas noches': 'good night',
  gracias: 'thank you', 'por favor': 'please', si: 'yes', no: 'no',
  'como estas': 'how are you', bien: 'fine', mal: 'bad',
  'que tal': 'how is it going', amigo: 'friend', amigos: 'friends',
  grupo: 'group', mensaje: 'message', mensajes: 'messages', usuario: 'user',
  'nos vemos': 'see you', perdon: 'sorry', lo: 'it', siento: 'sorry',
  bienvenido: 'welcome', bienvenidos: 'welcome', chat: 'chat',
};
const REVERSE = Object.fromEntries(Object.entries(DICTIONARY).map(([k, v]) => [v, k]));

function normalize(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function translateWord(word, map) {
  const stripped = word.replace(/[^\p{L}\p{N}]/gu, '');
  const lower = normalize(stripped);
  const hit = map[lower];
  if (!hit) return null;
  // preserva mayuscula inicial
  if (stripped[0] && stripped[0] === stripped[0].toUpperCase() && stripped[0] !== stripped[0].toLowerCase()) {
    return hit[0].toUpperCase() + hit.slice(1);
  }
  return hit;
}

async function translate(text, targetLang, sourceLang) {
  if (targetLang === sourceLang) return text;
  const map = targetLang === 'en' ? DICTIONARY : REVERSE;

  // intenta frases completas primero (orden por longitud descendente)
  let working = text;
  const phraseMap = Object.entries(map).sort((a, b) => b[0].length - a[0].length);
  for (const [phrase, translated] of phraseMap) {
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    working = working.replace(re, translated);
  }

  const words = working.split(/(\s+)/);
  const out = words.map((w) => {
    if (/^\s+$/.test(w)) return w;
    return translateWord(w, map) ?? w;
  });

  const result = out.join('');
  const langLabel = targetLang.toUpperCase();
  // Marca claramente que es una traduccion automatica de demostracion para
  // no inducir al usuario a pensar que es una traduccion profesional/exacta.
  return `${result} [auto-${langLabel}]`;
}

module.exports = { translate, name: 'mock' };
