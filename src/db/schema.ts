import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default('Skyforge Pilot'),
  photoUrl: text('photo_url').notNull().default(''),
  preferredLocale: text('preferred_locale').notNull().default('en'),
  preferredRig: text('preferred_rig').notNull().default('vanguard'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const cloudSaves = pgTable('cloud_saves', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  deviceName: text('device_name').notNull().default('Web Browser'),
  platform: text('platform').notNull().default('desktop'),
  version: integer('version').notNull().default(1),
  highestWave: integer('highest_wave').notNull().default(1),
  bestScore: integer('best_score').notNull().default(0),
  totalKills: integer('total_kills').notNull().default(0),
  unlockedRigs: text('unlocked_rigs').notNull().default('["vanguard","sentinel","ronin"]'),
  settingsJson: text('settings_json').notNull().default('{}'),
  isAutoBackup: boolean('is_auto_backup').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const matchHistory = pgTable('match_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  mode: text('mode').notNull().default('solo'),
  score: integer('score').notNull().default(0),
  wave: integer('wave').notNull().default(1),
  kills: integer('kills').notNull().default(0),
  durationSec: integer('duration_sec').notNull().default(0),
  rigUsed: text('rig_used').notNull().default('vanguard'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const performanceLogs = pgTable('performance_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  avgFps: real('avg_fps').notNull().default(60),
  avgFrameMs: real('avg_frame_ms').notNull().default(16.6),
  drawCalls: integer('draw_calls').notNull().default(0),
  deviceType: text('device_type').notNull().default('desktop'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  cloudSaves: many(cloudSaves),
  matchHistory: many(matchHistory),
  performanceLogs: many(performanceLogs),
}));

export const cloudSavesRelations = relations(cloudSaves, ({ one }) => ({
  user: one(users, {
    fields: [cloudSaves.userId],
    references: [users.id],
  }),
}));

export const matchHistoryRelations = relations(matchHistory, ({ one }) => ({
  user: one(users, {
    fields: [matchHistory.userId],
    references: [users.id],
  }),
}));

export const performanceLogsRelations = relations(performanceLogs, ({ one }) => ({
  user: one(users, {
    fields: [performanceLogs.userId],
    references: [users.id],
  }),
}));
