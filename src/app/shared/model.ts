import { ConnectionServiceOptions } from 'ng-connection-service';

export enum EWho {
  User = 0,
  Assistant
}

export enum EStatus {
  uploading = 0,
  uploaded,
  loaded,
  loading,
  indexing,
  splitting,
  extracting,
  saving,     
  adding,
  thinking,
  reranking,
  configuring,
  running_healthy,
  running,
  created,
  unpause,
  start,
  starting,
  restarting,
  preparing,
  error,
  destroy,
  die,
  running_unhealthy,
  exited,
  pause,
  paused,
  downloading,
  health_status_healthy,
  dead,
  not_running
}

export interface IStatus {
  status: EStatus,
  value: number
}

export interface IUser {
  affiliate: string;
  uuid: string;
  email: string;
  email_confirmed: string | undefined;
}

export interface IChat {
  who: EWho,
  content: string
}

export interface IGenInfo {
  model: string,
  created_at: number,
  done: boolean,
  total_duration: number,
  load_duration: number,
  prompt_eval_count: number,
  prompt_eval_duration: number,
  eval_count: number,
  eval_duration: number
}

export const connOptions: ConnectionServiceOptions = {
  enableHeartbeat: true,
  heartbeatUrl: 'https://google.com',
  heartbeatInterval: 10000
}

export interface IHistory {
  when: Date,
  question: string,
  answer: string,
  ingest: {
    embeddings_model: string
    chunkSize: number,
    overlap: number,
    separator: string,
    useSemantic: boolean,
    localVector: boolean,
    collection: string
  },
  insight: {
    model: string,
    k: number,
    filter: string | undefined,
    numCtx: number,
    ragPrompt: string | undefined,
    userPrompt: string | undefined
  }
  q_expanded: boolean,
  a_expanded: boolean,  
  genInfo?: IGenInfo,
  assessment: number
}


