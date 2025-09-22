import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IngestComponent } from './ingest.component';

describe('IngestComponent', () => {
  let component: IngestComponent;
  let fixture: ComponentFixture<IngestComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IngestComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(IngestComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
