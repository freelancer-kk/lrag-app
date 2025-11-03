import { Injectable } from '@angular/core';
import { IExternalChat } from '../../shared/model';

@Injectable({
  providedIn: 'root'
})
export class PrivacyService {
  externalChats: IExternalChat[] = [];
  userEmail: string = '';
  affiliateCode: string = '';

  constructor() {}
}
