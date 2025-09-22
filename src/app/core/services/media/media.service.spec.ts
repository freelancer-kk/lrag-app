import { TestBed } from '@angular/core/testing';

import { Media } from './media.service';

describe('Media', () => {
  let service: Media;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Media);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
