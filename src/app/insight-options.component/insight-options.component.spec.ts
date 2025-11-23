import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InsightOptionsComponent } from './insight-options.component';

describe('InsightOptionsComponent', () => {
  let component: InsightOptionsComponent;
  let fixture: ComponentFixture<InsightOptionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InsightOptionsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InsightOptionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
