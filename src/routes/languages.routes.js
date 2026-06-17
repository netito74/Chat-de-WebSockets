const { Router } = require("express");
const { obtenerIdiomas } = require("../controllers/languages.controller");

const router = Router();
router.get("/", obtenerIdiomas);

module.exports = router;
