export interface ReviewJobData {
  installationId?: number;
  repository: {
    id: number;
    owner: string;
    name: string;
    fullName: string;
  };
  pullRequest: {
    id: number;
    number: number;
    headSha: string;
    baseSha: string;
    title?: string;
  };
  action: string;
}

export interface ReviewQueue {
  enqueueReview(data: ReviewJobData): Promise<void>;
}

export class StubReviewQueue implements ReviewQueue {
  async enqueueReview(_data: ReviewJobData): Promise<void> {
    void _data;
    // Stub implementation: heavy work is enqueued later in Phase 4
  }
}
