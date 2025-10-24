import { Component } from '@angular/core';
import { SystemService } from '../core/services';
import { NgxSplideModule } from 'ngx-splide';

@Component({
  selector: 'app-splash',
  standalone: true,
  imports: [
    NgxSplideModule
  ],
  templateUrl: './splash.component.html',
  styleUrl: './splash.component.scss'
})
export class SplashComponent {
  constructor(
    public systemService: SystemService,    
  ) {
  }
}
