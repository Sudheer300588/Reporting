const path = require("path");

// Load environment vars from the backend's .env
require("dotenv").config({
  path: path.join(__dirname, ".env"),
});

module.exports = {
  apps: [
    {
      name: "simple-app",
      script: "./server.js",
      cwd: __dirname,   // CRITICAL for Prisma + .env

      // Logging
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      time: true,

      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "1G",
    },
  ],
};
