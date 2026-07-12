import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

const DEFAULT_PORT = 8080;

const parsedPort = rawPort ? Number(rawPort) : NaN;

const port =
  rawPort && !Number.isNaN(parsedPort) && parsedPort > 0
    ? parsedPort
    : DEFAULT_PORT;

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
