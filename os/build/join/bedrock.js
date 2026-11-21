// real Bedrock client (RakNet, offline) joins Geyser on the given UDP port
const bedrock = require("bedrock-protocol");
const port = Number(process.argv[2]);
let done = false; const fin = (m, c) => { if (done) return; done = true; console.log(m); setTimeout(() => process.exit(c), 300); };
try {
  const c = bedrock.createClient({ host: "127.0.0.1", port, username: "BedrockBob", offline: true, skipPing: false, connectTimeout: 20000 });
  c.on("join", () => console.log("BEDROCK_JOIN_PACKET"));
  c.on("spawn", () => fin("BEDROCK_SPAWNED_OK", 0));
  c.on("disconnect", (p) => fin("BEDROCK_DISCONNECT " + JSON.stringify(p).slice(0, 300), 3));
  c.on("error", (e) => console.log("BEDROCK_ERR " + (e && e.message)));
  c.on("close", () => fin("BEDROCK_CLOSED", 4));
} catch (e) { fin("BEDROCK_THROW " + e.message, 6); }
setTimeout(() => fin("BEDROCK_TIMEOUT", 5), 50000);
