import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log/main';
import { safeStorage } from 'electron';
import * as HPKE from 'hpke'
import { KEM_ML_KEM_512, KDF_SHAKE256, AEAD_ChaCha20Poly1305 } from '@panva/hpke-noble'

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface IHPKEKey {
  publicKey: HPKE.Key;
  privateKey: HPKE.Key;
}

export interface ISenderSetup {
  encapsulatedSecret: Uint8Array;
  ctx: HPKE.SenderContext 
}

export default class Quantum {
  encryptionAvailable: boolean = false;
  suite: HPKE.CipherSuite; 
  privateKeyPath: string;
  publicKeyPath: string;
  cryptoKey: IHPKEKey | undefined;
  senderContext: ISenderSetup | undefined;
  recipientContext: HPKE.RecipientContext | undefined;
  
  constructor(configPath: string) {
    this.suite = new HPKE.CipherSuite(
      KEM_ML_KEM_512, KDF_SHAKE256, AEAD_ChaCha20Poly1305
    );

    this.privateKeyPath = path.join(configPath, 'lrag-key.pem');
    this.publicKeyPath = path.join(configPath, 'lrag-key-pub.pem');
    this.encryptionAvailable = safeStorage.isEncryptionAvailable();    
  }

  init = async () => {
    if (!fs.existsSync(this.privateKeyPath) || !fs.existsSync(this.publicKeyPath)) {
      await this.generateAndSaveKemKeyPair(this.privateKeyPath, this.publicKeyPath);
    }

    this.cryptoKey = await this.loadKemKeyPair(this.privateKeyPath, this.publicKeyPath);

    this.senderContext = await this.suite.SetupSender(this.cryptoKey.publicKey);
    this.recipientContext = await this.suite.SetupRecipient(this.cryptoKey.privateKey, this.senderContext.encapsulatedSecret);
    
    log.info("ENCRYPTION:", this.encryptionAvailable);
  }

  generateAndSaveKemKeyPair = (privateKeyPath: string, publicKeyPath: string): Promise<void> => {
    // Generate an ML-KEM key pair
    return this.suite.GenerateKeyPair(true).then(async (value: HPKE.KeyPair) => {
      // Save the keys to PEM files
      fs.writeFileSync(privateKeyPath, await this.suite.SerializePrivateKey(value.privateKey));
      fs.writeFileSync(publicKeyPath, await this.suite.SerializePublicKey(value.publicKey));      

      log.info("KEM key pair generated and saved to KEY files.");    
    });    
  }

  loadKemKeyPair = async (privateKeyPath: string, publicKeyPath: string): Promise<IHPKEKey> => {
    const privateKey: HPKE.Key = await this.suite.DeserializePrivateKey(fs.readFileSync(privateKeyPath), true);
    const publicKey: HPKE.Key = await this.suite.DeserializePublicKey(fs.readFileSync(publicKeyPath));    

    log.info("KEM key pair loaded from KEY files.");
    return { privateKey, publicKey };
  }

  runTest = async (ins: string): Promise<void> => {
    const plaintext: Uint8Array = encoder.encode(ins);
    if (this.cryptoKey) {
      const { encapsulatedSecret, ciphertext } = await this.suite.Seal(this.cryptoKey.publicKey, plaintext);
      log.info('Sealed!');
      const decrypted: Uint8Array = await this.suite.Open(this.cryptoKey.privateKey, encapsulatedSecret, ciphertext);
      log.info('ins:', ins);
      log.info('outs:', decoder.decode(decrypted));
    }
  }

  encrypt = (text: Uint8Array): Promise<Uint8Array> | undefined => {
    return this.senderContext?.ctx.Seal(text);
  }

  decrypt = (text: Uint8Array): Promise<Uint8Array> | undefined => {
    return this.recipientContext?.Open(text);
  }
}