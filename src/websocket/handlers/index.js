const { crearRegistroHandler } = require("./register.handler");
const { crearPublicoHandler } = require("./publicMessage.handler");
const { crearPrivadoHandler } = require("./privateMessage.handler");
const { crearTypingHandler } = require("./typing.handler");
const { crearCrearCanalHandler } = require("./channelCreate.handler");
const { crearMensajeCanalHandler } = require("./channelMessage.handler");
const { crearAgregarMiembroHandler } = require("./channelAddMember.handler");
const { crearEliminarMiembroHandler } = require("./channelRemoveMember.handler");
const { crearEliminarCanalHandler } = require("./channelDelete.handler");

/**
 * Tabla de despacho: cada `type` de mensaje entrante se asocia a un
 * manejador con la firma uniforme (ws, cliente, datos). Añadir un nuevo
 * tipo de mensaje al protocolo significa: crear su handler.js y añadir
 * una línea aquí — nada más se modifica.
 */
function crearTablaDeHandlers(deps) {
    return {
        register: crearRegistroHandler(deps),
        public: crearPublicoHandler(deps),
        private: crearPrivadoHandler(deps),
        typing: crearTypingHandler(deps),
        "channel-create": crearCrearCanalHandler(deps),
        "channel-msg": crearMensajeCanalHandler(deps),
        "channel-add-member": crearAgregarMiembroHandler(deps),
        "channel-remove-member": crearEliminarMiembroHandler(deps),
        "channel-delete": crearEliminarCanalHandler(deps),
    };
}

module.exports = { crearTablaDeHandlers };
