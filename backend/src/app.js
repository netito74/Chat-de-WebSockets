"use strict";
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const path = require("path");
const config = require("./config");

const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const groupsRoutes = require("./routes/groups.routes");
const uploadsRoutes = require("./routes/uploads.routes");
const backgroundsRoutes = require("./routes/backgrounds.routes");
const { errorHandler } = require("./middleware/errorHandler");

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
      hsts: false, // ← esta línea es la clave
    }),
  );
  app.use(cors({ origin: config.cors.origin }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      instance: config.instanceId,
      time: new Date().toISOString(),
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/groups", groupsRoutes);
  app.use("/api/uploads", uploadsRoutes);
  app.use("/api/backgrounds", backgroundsRoutes);

  app.use("/uploads", express.static(config.uploads.dir, { maxAge: "1d" }));
  app.use(
    express.static(path.join(__dirname, "..", "..", "frontend", "public")),
  );

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
