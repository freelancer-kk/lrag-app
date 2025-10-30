import { ipcMain } from 'electron';
import * as path from 'path';

import { Document } from "@langchain/core/documents";
import { isMac, isWindows } from './SystemInfo';
import DepService from './DepService';

export default class ReRankerService {
  serviceInstance: DepService;
  webContents: Electron.WebContents | undefined;

  constructor(
    installedVersion: string,
    availableVersion: string,
    darwin_dl: string,
    default_dl: string,
    userTempPath: string,
    appDataPath: string,
  ) {

    let execDir: string = path.join(appDataPath, 'reranker', 'dist');
    let executable: string = "rest-reranker.exe";
    let args: string[] = [];
    let urls: string[] = [];


    if (isWindows) {
      urls = [default_dl];
    } else {
      urls = [darwin_dl];
      executable = 'rest-reranker.app';    
    }

    this.serviceInstance = new DepService(
      "reranker",
      "reranker",
      executable,      
      execDir,
      args,
      appDataPath,
      userTempPath,
      urls,
      async (): Promise<boolean> => {

        try {
          const text: string = await (await fetch(
            'http://localhost:2021/',
            {
              method: 'GET'
            }
          )).text();
          console.log('rerank:service:ready', text);
          return true;
        } catch (e) {
          console.error('rerank:not:ready', e);
        }
        return false
      },
      [],
      installedVersion,
      availableVersion
    )
  }

  register = (webContents: Electron.WebContents | undefined) => {
    this.webContents = webContents;
    this.serviceInstance.register(this.webContents);
    ipcMain.on('service-reranker', async (event: any, arg: any) => {
      const { callbackId, command, params }= arg;
      console.log('reranker:', callbackId, command, params)
      let response: any = {}
      try {
        switch (command) {
          case "rerank": {
            response = await this.rerank(params.query, params.docs);
          }
          break;
          default: {
            response = await this.serviceInstance.handleCommand(event, arg);
          } 
        }
      } catch (e) {
        console.error(e);
        response.error = e;
      }
      response.command = command;
      response.params = params;
      event.reply('reply', {
        callbackId,
        response: JSON.stringify(response)
      })
    }) 
  }
  
  install = (): Promise<boolean> => {
    return this.serviceInstance.install();
  }

  stop = (): Promise<any> => {
    return this.serviceInstance.stop(true);
  }

  isReady = (): boolean => {
    return this.serviceInstance.isReady
  }

  rerank = async (query: string, docs: Document[]): Promise<Document[] | undefined> => {
    try {
      const body: any = {
        query,
        documents: docs.map((d: Document) => {
          return d.pageContent;
        }),
        metadata: docs.map((d: Document, index: number) => {
          return { "source" : index + '-' + d.metadata.source }
        }),
      }

      console.log('rerankerService:rerank:', body);

      const data: any = await (await fetch(
        'http://localhost:2021/rerank',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body)
        }
      )).json();

      const ret_docs: Document[] = []
      for await (const md of data.metadata) {
        const fIdx: number = docs.findIndex((d, i) => (i + '-' + d.metadata.source) === md.source);
        // console.log('RERANKING:', docs[fIdx].pageContent.substring(0, 20));      
        
        ret_docs.push(docs[fIdx]);
      }
      return ret_docs;
    } catch (e) {
      console.error(e);    
    }    
  }
}