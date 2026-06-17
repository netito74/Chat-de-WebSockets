const { Router } = require("express");
const { traducirUi } = require("../controllers/translate.controller");

const router = Router();
router.post("/", traducirUi);

module.exports = router;
