import mongoose, { type Document, Schema } from 'mongoose';

export interface IInstallationAccount {
  id: number;
  login: string;
  type?: string;
  avatarUrl?: string;
}

export interface IInstallation extends Document {
  installationId: number;
  account: IInstallationAccount;
  appId?: number;
  targetType?: string;
  permissions?: Record<string, string>;
  events?: string[];
  status: 'active' | 'deleted' | 'suspended';
  installedAt?: Date;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const installationAccountSchema = new Schema<IInstallationAccount>(
  {
    id: { type: Number, required: true },
    login: { type: String, required: true },
    type: { type: String, default: 'User' },
    avatarUrl: { type: String },
  },
  { _id: false },
);

const installationSchema = new Schema<IInstallation>(
  {
    installationId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    account: {
      type: installationAccountSchema,
      required: true,
    },
    appId: { type: Number },
    targetType: { type: String },
    permissions: { type: Schema.Types.Mixed, default: {} },
    events: [{ type: String }],
    status: {
      type: String,
      enum: ['active', 'deleted', 'suspended'],
      default: 'active',
      index: true,
    },
    installedAt: { type: Date },
    deletedAt: { type: Date },
  },
  {
    timestamps: true,
  },
);

installationSchema.index({ 'account.login': 1 });

export const Installation =
  (mongoose.models.Installation as mongoose.Model<IInstallation>) ||
  mongoose.model<IInstallation>('Installation', installationSchema);
