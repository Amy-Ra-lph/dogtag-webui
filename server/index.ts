import { buildApp } from "./app.js";

async function main() {
  const { app, port } = await buildApp();

  try {
    await app.listen({ port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
