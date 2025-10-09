import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { Express } from 'express';
import { IncomingMessage, Server, ServerResponse } from 'http';
import { z } from 'zod';

export default class MCPService {
    server: McpServer | undefined;
    app: Express | undefined;
    httpServer: Server<typeof IncomingMessage, typeof ServerResponse> | undefined;

    constructor() {}

    init = () => {
        this.server = new McpServer({
            name: 'lrag-mcp-server',
            version: '1.0.0'
        });

        this.app =  express();
    }

    register = () => {
        if (this.server) {
            this.server.registerTool(
                'sum',
                {
                    title: 'Summation Tool',
                    description: 'Sum total',
                    inputSchema: { a: z.array(z.number()) },
                    outputSchema: { result: z.number() }
                },
                async ({ a }) => {                    
                    let result: number = 0;
                    for await (const n of a) {
                        result += n;
                    }
                    const output = { result };
                    return {
                        content: [{ type: 'text', text: JSON.stringify(output) }],
                        structuredContent: output
                    };
                }
            );            
/*
        this.server.registerResource(
            'greeting',
            new ResourceTemplate('greeting://{name}', { list: undefined }),
            {
                title: 'Greeting Resource', // Display name for UI
                description: 'Dynamic greeting generator'
            },
            async (uri, { name }) => ({
                contents: [
                    {
                        uri: uri.href,
                        text: `Hello, ${name}!`
                    }
                ]
            })
        );
*/        
        }
    }

    start = () => {
        if (this.app) {
            // Set up Express and HTTP transport
            this.app.use(express.json());

            this.app.post('/mcp', async (req, res) => {
                // Create a new transport for each request to prevent request ID collisions
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: undefined,
                    enableJsonResponse: true
                });

                res.on('close', () => {
                    transport.close();
                });

                await this.server?.connect(transport);
                await transport.handleRequest(req, res, req.body);
            });

            const port = parseInt(process.env.PORT || '3003');
            this.httpServer = this.app.listen(port, () => {
                console.log(`LRag MCP Server running on http://localhost:${port}/mcp`);
            }).on('error', error => {
                console.error('Server error:', error);
                process.exit(1);
            });
        }
    }

    stop = () => {
        if (this.httpServer) {
            this.httpServer.close();
        }
    }
}