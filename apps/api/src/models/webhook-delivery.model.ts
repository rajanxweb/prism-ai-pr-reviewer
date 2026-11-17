import mongoose, { type Document, Schema } from 'mongoose';

export interface IWebhookDelivery extends Document {
  deliveryId: string;
  event: string;
  action?: string;
  processedAt: Date;
  createdAt: Date;
}

const webhookDeliverySchema = new Schema<IWebhookDelivery>(
  {
    deliveryId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    event: {
      type: String,
      required: true,
    },
    action: {
      type: String,
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      // 7 days TTL index
      expires: 604800,
    },
  },
  {
    // Don't auto-update createdAt
    timestamps: false,
  },
);

export const WebhookDelivery =
  (mongoose.models.WebhookDelivery as mongoose.Model<IWebhookDelivery>) ||
  mongoose.model<IWebhookDelivery>('WebhookDelivery', webhookDeliverySchema);
