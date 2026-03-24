import { pgTable, uuid, text, jsonb, timestamp, integer } from 'drizzle-orm/pg-core';

export const pipelines = pgTable('pipelines', {
  id:           uuid('id').primaryKey().defaultRandom(),
  name:         text('name').notNull(),
  sourceToken:  uuid('source_token').notNull().unique().defaultRandom(),
  actionType:   text('action_type').notNull(),
  actionConfig: jsonb('action_config').notNull().default({}),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pipelineSubscribers = pgTable('pipeline_subscribers', {
  id:         uuid('id').primaryKey().defaultRandom(),
  pipelineId: uuid('pipeline_id').notNull().references(() => pipelines.id, { onDelete: 'cascade' }),
  url:        text('url').notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable('jobs', {
  id:          uuid('id').primaryKey().defaultRandom(),
  pipelineId:  uuid('pipeline_id').notNull().references(() => pipelines.id, { onDelete: 'cascade' }),
  status:      text('status').notNull().default('pending'),
  payload:     jsonb('payload').notNull(),
  result:      jsonb('result'),
  error:       text('error'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const deliveryAttempts = pgTable('delivery_attempts', {
  id:             uuid('id').primaryKey().defaultRandom(),
  jobId:          uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  subscriberUrl:  text('subscriber_url').notNull(),
  status:         text('status').notNull().default('pending'),
  attemptCount:   integer('attempt_count').notNull().default(0),
  nextRetryAt:    timestamp('next_retry_at', { withTimezone: true }),
  responseStatus: integer('response_status'),
  responseBody:   text('response_body'),
  error:          text('error'),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
