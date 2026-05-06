import { startServer } from "./server.js";
import { runCli } from "./cli/champs.js";

// 引数なし or --mcp-server: 既存の MCP Stdio サーバーを起動 (Claude Desktop 経路)
// それ以外: CLI モード (champs サブコマンド)
const argv = process.argv.slice(2);
const wantsMcpServer = argv.length === 0 || argv[0] === "--mcp-server";

if (wantsMcpServer) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  runCli(argv).then((code) => process.exit(code));
}
