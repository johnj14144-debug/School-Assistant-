import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Logger } from '../log';
import type { Db } from './database';
import { settings } from './schema';

/** Every setting, with its schema and default. Add new ones here. */
const definitions = {
  /** Backup folder; null means the default folder under Documents. */
  'backup.folder': { schema: z.string().min(1).nullable(), fallback: null },
  'backup.lastSuccessAt': { schema: z.iso.datetime().nullable(), fallback: null },
  'backup.lastError': {
    schema: z.object({ at: z.iso.datetime(), message: z.string() }).nullable(),
    fallback: null,
  },
  /** The focus task the user paused; the timer offers to resume it. */
  'timer.paused': { schema: z.object({ taskId: z.uuid() }).nullable(), fallback: null },
  /** Minimum real sleep per night in minutes; 7.5 h is the owner's floor and can only go up. */
  'calendar.sleepFloorMin': { schema: z.number().int().min(450).max(720), fallback: 450 },
} as const satisfies Record<string, { schema: z.ZodType; fallback: unknown }>;

export type SettingKey = keyof typeof definitions;
export type SettingValue<K extends SettingKey> = z.infer<(typeof definitions)[K]['schema']>;

/** Typed key/value settings stored as JSON in the `setting` table. */
export class SettingsService {
  constructor(
    private readonly db: Db,
    private readonly log: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get<K extends SettingKey>(key: K): SettingValue<K> {
    const { schema, fallback } = definitions[key];
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get();
    if (!row) return fallback as SettingValue<K>;
    const parsed = schema.safeParse(parseJson(row.value));
    if (parsed.success) return parsed.data as SettingValue<K>;
    this.log.warn(`Setting ${key} has an invalid stored value; using the default`, row.value);
    return fallback as SettingValue<K>;
  }

  set<K extends SettingKey>(key: K, value: SettingValue<K>): void {
    const json = JSON.stringify(definitions[key].schema.parse(value));
    const updatedAt = this.now().toISOString();
    this.db
      .insert(settings)
      .values({ key, value: json, updatedAt })
      .onConflictDoUpdate({ target: settings.key, set: { value: json, updatedAt } })
      .run();
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
