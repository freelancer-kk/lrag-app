import { TestBed } from '@angular/core/testing';

import { RerankerService } from './reranker-service';

describe('RerankerService', () => {
  let service: RerankerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RerankerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
