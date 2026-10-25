import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey().notNull(),
  json: text('json').notNull(),
  storageVersion: integer('storage_version').notNull().default(0),
});
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey().notNull(),
  json: text('json').notNull(),
  storageVersion: integer('storage_version').notNull().default(0),
});
export const accountMembers = sqliteTable('account_members', {
  profileId: text('profile_id').primaryKey().notNull(),
  accountId: text('account_id').notNull(),
});
export const responseCache = sqliteTable('response_cache', {
  hash: text('hash').primaryKey().notNull(),
  json: text('json').notNull(),
  createdAt: text('created_at').notNull(),
});
