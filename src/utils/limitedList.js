/**
 * Empuja `item` al final de `lista` y descarta el elemento más antiguo
 * si se supera `limite`. Mutación in-place a propósito: se usa sobre
 * arrays de historial que viven dentro de un store (público o de canal).
 */
function pushConLimite(lista, item, limite) {
    lista.push(item);
    if (lista.length > limite) lista.shift();
    return lista;
}

module.exports = { pushConLimite };
