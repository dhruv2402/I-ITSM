import mongoose, { Schema } from 'mongoose';

/*
 * MongoDB collections. Documents store the domain snapshots; _id is the
 * readable business id (INC1001, E1001, SVC-PAY...). Indexes support the
 * search/filter criteria and the reports.
 */
const opts = { versionKey: false, strict: false } as const;

const UserSchema = new Schema(
  {
    _id: String,
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true, index: true },
    phone: String,
    department: String,
    active: { type: Boolean, default: true },
    createdAt: Date,
    skills: [String],
    maxWorkload: Number,
    experienceYears: Number,
    available: Boolean,
  },
  opts,
);

const IncidentSchema = new Schema(
  {
    _id: String,
    title: { type: String, required: true },
    description: String,
    reporterId: { type: String, index: true },
    reporterName: String,
    categoryCode: { type: String, index: true },
    categoryConfidence: Number,
    serviceId: { type: String, index: true },
    impact: Number,
    urgency: Number,
    businessCriticality: Number,
    affectedUsers: Number,
    priority: { type: String, index: true },
    priorityScore: Number,
    priorityStrategy: String,
    priorityRationale: [String],
    status: { type: String, index: true },
    assignedTechnicianId: { type: String, index: true },
    assignedTechnicianName: String,
    sla: Schema.Types.Mixed,
    notes: Schema.Types.Mixed,
    resolution: Schema.Types.Mixed,
    closure: Schema.Types.Mixed,
    feedback: Schema.Types.Mixed,
    escalationLevel: Number,
    relatedIncidentIds: [String],
    duplicateOfId: String,
    reopenCount: Number,
    createdAt: { type: Date, index: true },
    updatedAt: Date,
  },
  opts,
);
IncidentSchema.index({ title: 'text', description: 'text' });

const ServiceSchema = new Schema(
  { _id: String, name: String, description: String, businessCriticality: Number, ownerTeam: String, userBase: Number, dependsOn: [String], active: Boolean },
  opts,
);

const CategorySchema = new Schema({ _id: String, name: String, description: String, keywords: [String], active: Boolean }, opts);

const SlaPolicySchema = new Schema(
  {
    _id: String,
    name: String,
    priority: { type: String, index: true },
    serviceId: { type: String, default: null },
    responseMinutes: Number,
    resolutionMinutes: Number,
    warningThresholdPct: Number,
    active: Boolean,
  },
  opts,
);

const AuditSchema = new Schema(
  {
    _id: String,
    timestamp: { type: Date, index: true },
    userId: { type: String, index: true },
    userName: String,
    userRole: String,
    action: { type: String, index: true },
    incidentId: { type: String, index: true },
    previousState: String,
    newState: String,
    description: String,
  },
  opts,
);

const NotificationSchema = new Schema(
  {
    _id: String,
    userId: { type: String, index: true },
    channel: String,
    eventType: String,
    incidentId: String,
    title: String,
    message: String,
    severity: String,
    status: String,
    error: String,
    read: Boolean,
    createdAt: { type: Date, index: true },
  },
  opts,
);

const SettingSchema = new Schema({ _id: String, value: String }, opts);
const CounterSchema = new Schema({ _id: String, seq: Number }, opts);

const model = (name: string, schema: Schema, collection: string) =>
  (mongoose.models[name] as mongoose.Model<any>) ?? mongoose.model(name, schema, collection);

export const UserModel = model('User', UserSchema, 'users');
export const IncidentModel = model('Incident', IncidentSchema, 'incidents');
export const ServiceModel = model('ItService', ServiceSchema, 'services');
export const CategoryModel = model('Category', CategorySchema, 'categories');
export const SlaPolicyModel = model('SlaPolicy', SlaPolicySchema, 'sla_policies');
export const AuditModel = model('AuditRecord', AuditSchema, 'audit_records');
export const NotificationModel = model('Notification', NotificationSchema, 'notifications');
export const SettingModel = model('Setting', SettingSchema, 'settings');
export const CounterModel = model('Counter', CounterSchema, 'counters');
