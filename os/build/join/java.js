// real Java client (offline/cracked name) joins the server on the given port, says hello, waits for a reply from the server
const mineflayer = require("mineflayer");
const [port, ver] = [Number(process.argv[2]), process.argv[3]];
const bot = mineflayer.createBot({ host: "127.0.0.1", port, username: "CrackedBob", auth: "offline", version: ver, hideErrors: false });
let done = false; const fin = (m, c) => { if (done) return; done = true; console.log(m); try { bot.end(); } catch (e) {} setTimeout(() => process.exit(c), 300); };
bot.once("spawn", () => { console.log("JAVA_SPAWNED as " + bot.username + " at " + bot.entity.position); bot.chat("hello from a cracked client"); setTimeout(() => fin("JAVA_JOINED_OK health=" + bot.health, 0), 4000); });
bot.on("kicked", (r) => fin("JAVA_KICKED " + JSON.stringify(r).slice(0, 300), 3));
bot.on("error", (e) => console.log("JAVA_ERR " + e.message));
bot.on("end", (r) => fin("JAVA_END " + r, 4));
setTimeout(() => fin("JAVA_TIMEOUT", 5), 60000);
