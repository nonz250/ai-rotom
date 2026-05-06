import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ZodType } from "zod";

export type ToolContent = { type: "text"; text: string };
export type ToolResult = {
  content: ToolContent[];
  isError?: boolean;
};
export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

export interface RegisteredTool {
  name: string;
  description: string;
  schema: z.ZodObject<Record<string, ZodType>>;
  rawSchema: Record<string, ZodType>;
  invoke: ToolHandler;
}

/**
 * register*Tool ハンドラを Map に集めるだけの McpServer モック。
 * Stdio transport を起動せず、CLI 側から直接 invoke するために使う。
 * 本家 MCP SDK は `server.tool(name, description, schema, handler)` の
 * schema を z.object() でラップして事前検証してから handler を呼ぶ。
 * party-tools.test.ts の createFakeServer と同じ前処理を行う。
 */
export class CliMcpAdapter {
  private readonly tools = new Map<string, RegisteredTool>();

  asServer(): McpServer {
    const fake = {
      tool: (
        name: string,
        description: string,
        schema: Record<string, ZodType>,
        handler: ToolHandler,
      ): void => {
        const validator = z.object(schema);
        this.tools.set(name, {
          name,
          description,
          schema: validator,
          rawSchema: schema,
          invoke: async (args) => {
            const parsed = validator.parse(args) as Record<string, unknown>;
            return handler(parsed);
          },
        });
      },
    };
    return fake as unknown as McpServer;
  }

  list(): RegisteredTool[] {
    return [...this.tools.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }
}
