import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export default class MCPClient {
  client: Client | undefined;
  transport: StreamableHTTPClientTransport | undefined;

  constructor() {}

  init = (): Promise<void> => {
    this.transport = new StreamableHTTPClientTransport(new URL("http://localhost:3003/mcp"));

    this.client = new Client({
        name: 'lrag-client',
        version: '1.0.0'
    });

    return this.client.connect(this.transport);
  }

  listTools = (): Promise<any> | undefined => {
    return this.client?.listTools();
  }

  listPrompts = (): Promise<any> | undefined => {
    return this.client?.listPrompts();
  }

  getPrompt = (name: string, arg1: string): Promise<any> | undefined => {
    return this.client?.getPrompt({
      name,
      arguments: {
          arg1
      }
    });
  }

  listResources = (): Promise<any> | undefined => {
    return this.client?.listResources();
  }

  readResource = (uri: string): Promise<any> | undefined => {
    return this.client?.readResource({
      uri
    });
  }

  callTool = (name: string, args: any): Promise<any> | undefined => {
    return this.client?.callTool({
        name,
        arguments: args
    });
  }
}