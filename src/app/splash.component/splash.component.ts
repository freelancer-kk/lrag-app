import { Component, OnInit, ViewChild, effect } from '@angular/core';
import { SystemService } from '../core/services';
import { NgxSplideComponent, NgxSplideModule } from 'ngx-splide';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-splash',
  standalone: true,
  imports: [
    NgxSplideModule,
    TranslateModule
  ],
  templateUrl: './splash.component.html',
  styleUrl: './splash.component.scss'
})
export class SplashComponent implements OnInit {
  @ViewChild('mainSplide', { static: true }) mainSplide!: NgxSplideComponent;
  
  startText: string = '';
  text: string = '';
  animatedText: string = '';
  duration: number = 1500;
  slideIndex: number = 0;
  slides: any[] = [{
    "name": "SLIDE1",
    "paragraphs": [
      { name: "PARA1", text: '', before: '', class: 'title', after: '<br/>' },
      { name: "PARA2", text: '', before: '', class: 'normal', after: '<br/><br/>' },
      { name: "PARA3", text: '', before: '', class: 'bold', after: '<br/>' },
      { name: "PARA4", text: '', before: '', class: 'bold', after: '<br/>' },
      { name: "PARA5", text: '', before: '', class: 'bold', after: '<br/><br>' },
      { name: "PARA6", text: '', before: '', class: 'normal', after: '<br/>' },
      { name: "PARA7", text: '', before: '', class: 'normal', after: '<br/><br/>' },
      { name: "PARA8", text: '', before: '', class: 'normal', after: '<br/><br/>' },
      { name: "PARA9", text: '', before: '', class: 'normal', after: '' }
    ]
  },{
    "name": "SLIDE2",
    "paragraphs": [
      { name: "PARA1", text: '', before: '', class: 'title', after: '<br/><br/>' },
      { name: "PARA2", text: '', before: '', class: 'bold', after: '<br/>' },
      { name: "PARA3", text: '', before: '', class: 'bold', after: '<br/>' },
      { name: "PARA4", text: '', before: '', class: 'bold', after: '<br/><br/>' },      
      { name: "PARA5", text: '', before: '', class: 'italic', after: '<br/><br/>' },      
      { name: "PARA6", text: '', before: '', class: 'normal', after: '' },      
    ]
  }]

  constructor(
    public systemService: SystemService,    
  ) {
    effect(() => {
      if (this.systemService.startShow() === true) {
        if (this.slideIndex !== 1) {
          this.restartAnimation(1);
        }
      }
    });
  }

  async ngOnInit(): Promise<void> {
    if (this.systemService.appVersionChange) {
      this.restartAnimation(0);      
    }
    const divElem: HTMLElement | null = document.getElementById("slideShowElem");
    if (divElem) {
      const resizeObserver = new ResizeObserver((entries: ResizeObserverEntry[]) => {
        for (const entry of entries) {
          if (entry.contentRect) {
            // console.log('width:', entry.contentRect.width);
            this.refresh();
          }
        }
      })
      resizeObserver.observe(divElem);
    }
  }

  refresh = () => {
    this.mainSplide.getSplideInstance().refresh();
  }

  // Easing function (easeOutQuart for a smooth ease-out effect)
  easeOutQuart = (t: number): number => {
    return 1 - Math.pow(1 - t, 4);
  }

  // Animation function
  animateText = async (startTime: number, slide: number, para: number): Promise<void> => {
    if (slide === this.slideIndex) {
      const currentTime = performance.now();
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / this.duration, 1); // Calculates progress    
      // Apply easing to progress
      const easedProgress = this.easeOutQuart(progress);
      const cursor = Math.floor(easedProgress * this.text.length); // Update cursor with easing

      // Update the animated text
      this.slides[slide].paragraphs[para].text = this.startText + this.text.slice(0, cursor);

      if (progress < 1) {
        setTimeout(() => {
          requestAnimationFrame(() => this.animateText(startTime, slide, para)); // Continue animating if not complete          
        }, 20);
      } else {
        // console.log('next:', slide, para);
        this.startText = this.animatedText;
        para++;
        this.startAnimation(slide, para);
      }
    }
  }

  slideMoved = (ev: any) => {
    const newIndex: number = ev[0];
    // console.log('move to:', newIndex);    
    if (newIndex !== this.slideIndex) {
      this.restartAnimation(newIndex);
    }
  }

  restartAnimation = (index: number) => {
    this.animatedText = '';
    this.text = '';
    this.startText = '';
    this.slideIndex = index;    
    this.slides[index].paragraphs.forEach((p: any) => {
      p.text = '';
    });    
    this.startAnimation(index, 0);
  }

  // Start the animation
  startAnimation = async (slideNumber: number, para: number): Promise<void> => {
    console.log('startAnimation:', slideNumber, para);    
    const slideName: string = this.slides[slideNumber].name;
    const slideParagraphs: any[] = this.slides[slideNumber].paragraphs;
    if (para < slideParagraphs.length) {
      this.text = await this.systemService.get('PAGES.SPLASH.' + slideName + '.' + slideParagraphs[para].name);
      this.animatedText = '';
      requestAnimationFrame((startTime) => this.animateText(startTime, slideNumber, para));
    } else {
      console.log('startAnimation:completed all paragraphs');
    }    
  }  
}
