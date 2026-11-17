import mongoose, { type Document, Schema } from 'mongoose';

export interface IRepositoryOwner {
  id: number;
  login: string;
}

export interface IRepository extends Document {
  githubId: number;
  name: string;
  fullName: string;
  private: boolean;
  owner: IRepositoryOwner;
  installationId: number;
  defaultBranch?: string;
  status: 'active' | 'inactive' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

const repositoryOwnerSchema = new Schema<IRepositoryOwner>(
  {
    id: { type: Number, required: true },
    login: { type: String, required: true },
  },
  { _id: false },
);

const repositorySchema = new Schema<IRepository>(
  {
    githubId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    name: { type: String, required: true },
    fullName: {
      type: String,
      required: true,
      index: true,
    },
    private: { type: Boolean, default: false },
    owner: {
      type: repositoryOwnerSchema,
      required: true,
    },
    installationId: {
      type: Number,
      required: true,
      index: true,
    },
    defaultBranch: { type: String, default: 'main' },
    status: {
      type: String,
      enum: ['active', 'inactive', 'archived'],
      default: 'active',
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

export const Repository =
  (mongoose.models.Repository as mongoose.Model<IRepository>) ||
  mongoose.model<IRepository>('Repository', repositorySchema);
