import mongoose, { type Document, Schema } from 'mongoose';

export interface IPullRequestAuthor {
  id: number;
  login: string;
}

export interface IPullRequest extends Document {
  githubId: number;
  number: number;
  repositoryId: number;
  repositoryFullName: string;
  installationId?: number;
  title: string;
  state: 'open' | 'closed';
  author: IPullRequestAuthor;
  headSha: string;
  baseSha: string;
  headRef: string;
  baseRef: string;
  draft: boolean;
  htmlUrl?: string;
  mergedAt?: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pullRequestAuthorSchema = new Schema<IPullRequestAuthor>(
  {
    id: { type: Number, required: true },
    login: { type: String, required: true },
  },
  { _id: false },
);

const pullRequestSchema = new Schema<IPullRequest>(
  {
    githubId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    number: {
      type: Number,
      required: true,
      index: true,
    },
    repositoryId: {
      type: Number,
      required: true,
      index: true,
    },
    repositoryFullName: {
      type: String,
      required: true,
      index: true,
    },
    installationId: {
      type: Number,
      index: true,
    },
    title: { type: String, required: true },
    state: {
      type: String,
      enum: ['open', 'closed'],
      default: 'open',
      index: true,
    },
    author: {
      type: pullRequestAuthorSchema,
      required: true,
    },
    headSha: { type: String, required: true },
    baseSha: { type: String, required: true },
    headRef: { type: String, required: true },
    baseRef: { type: String, required: true },
    draft: { type: Boolean, default: false },
    htmlUrl: { type: String },
    mergedAt: { type: Date },
    closedAt: { type: Date },
  },
  {
    timestamps: true,
  },
);

pullRequestSchema.index({ repositoryFullName: 1, number: 1 }, { unique: true });

export const PullRequest =
  (mongoose.models.PullRequest as mongoose.Model<IPullRequest>) ||
  mongoose.model<IPullRequest>('PullRequest', pullRequestSchema);
