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
  not_running,
  unknown,
  warning,
  downloaded,
  not_installed,
  upgrade,
  installed,
  upgrading,
  installing,
  upgrade_brew,
  installed_brew,
  upgrading_brew,
  installing_brew,
  upgrade_winget,
  installed_winget,
  upgrading_winget,
  installing_winget
}

export interface IStatus {
  status: EStatus,
  value: any
}

export interface IUser {
  affiliate: string;
  uuid: string;
  email: string;
  email_confirmed: string | undefined;
}

export interface IChat {
  id: string,
  who: EWho,
  content: string,
  docSources: string[]
}

export interface ITokenUsage {
  completionTokens: number,
  promptTokens: number,
  totalTokens: number
}

export const connOptions: ConnectionServiceOptions = {
  enableHeartbeat: true,
  heartbeatUrl: 'https://google.com',
  heartbeatInterval: 10000
}

export interface IHistory {
  id: string,
  when: Date,
  duration: number
  question: string,
  answer: string,
  toolResult: string | undefined,
  docContext: boolean,
  ingest: {
    embeddings_model: string
    ocr_model: string,
    ocrPrompt: string | undefined,
    ocrNumCtx: number | undefined,
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
  genInfo?: ITokenUsage,
  assessment: number
}

export interface IExternalChat {
  name: string;
  apiKey: string,
  model: string,
  temperature: number,
  maxTokens: number,
  maxRetries: number
}

export enum ELicenseType {
  FREE = 0,
  PRO = 1,
  PROPLUS = 2
}

export enum ELicenseStatus {
  ENTERING = 0,
  ENTERED,
  ACTIVATED,
  REVOKED,
  EXPIRED,
  NOT_ACTIVATED
}
export interface ILicenseDetails {
  success: boolean;
  license: {
    id: number;
    user_id: number;
    email: string;
    license_key: string;
    product_type: string;
    duration_months: number;
    stripe_payment_id: string;
    status: string;
    created_at: number;
    expires_at: number;
    last_checked: number;
    activations: number;
    machine_ids: string[];
  }
}

export interface ILicense {
  machineId: string,
  licenseKey: string,
  licenseType: ELicenseType,
  licenseChecked: boolean,
  licenseStatus: ELicenseStatus,
  licenseDetails: ILicenseDetails
}


