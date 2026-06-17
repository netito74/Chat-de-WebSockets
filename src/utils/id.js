/**
 * Genera un identificador único y corto, usado tanto para clientes
 * como para canales. No depende de ningún estado externo: dada su
 * naturaleza pura, es trivialmente testeable.
 */
function generarId() {
    return `_${Math.random().toString(36).substring(2, 11)}`;
}

module.exports = { generarId };
