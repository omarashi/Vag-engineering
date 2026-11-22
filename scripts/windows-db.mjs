import EmbeddedPostgres from "../data/tooling/node_modules/embedded-postgres/dist/index.js";
import {existsSync} from "node:fs";
import {resolve} from "node:path";

const connection = new URL(process.env.DATABASE_URL);
if (!["127.0.0.1","localhost"].includes(connection.hostname)) throw Error("Use an isolated loopback database.");
const databaseDir = resolve("data", "windows-postgres");
const pg = new EmbeddedPostgres({
  databaseDir,
  user: decodeURIComponent(connection.username),
  password: decodeURIComponent(connection.password),
  port: Number(connection.port),
  persistent: true, initdbFlags: ["--encoding=UTF8"],
});
const initialize = !existsSync(resolve(databaseDir, "PG_VERSION"));
if (initialize) await pg.initialise();
await pg.start();
if (initialize) await pg.createDatabase(connection.pathname.slice(1));
console.log("VAG development PostgreSQL is ready.");
for (const signal of ["SIGTERM","SIGINT"]) process.on(signal, async () => { await pg.stop(); process.exit(0); });

