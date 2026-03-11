const { HOST, PORT } = require("./src/server/config");
const { createAppServer } = require("./src/server/app");
const { ensureStore } = require("./src/server/store");

const server = createAppServer();

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

ensureStore()
  .then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`Elder Companion Assistant running on http://${HOST}:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
