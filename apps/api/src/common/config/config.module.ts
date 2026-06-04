/**
 * Typed configuration validation. Fails fast at startup if required env vars are missing.
 * Used by ConfigModule.forRoot({ validate: configValidationSchema }).
 */
export interface AppConfig {
  DATABASE_URL: string;
  REDIS_URL: string;
  OPENROUTER_API_KEY: string;
  PORT: number;
  NODE_ENV: 'development' | 'test' | 'production';
}

export function configValidationSchema(raw: Record<string, unknown>): AppConfig {
  const required = (key: string): string => {
    const value = raw[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  };

  return {
    DATABASE_URL: required('DATABASE_URL'),
    REDIS_URL: required('REDIS_URL'),
    // Optional until the ai-coaching module (US7) is enabled.
    OPENROUTER_API_KEY: typeof raw.OPENROUTER_API_KEY === 'string' ? raw.OPENROUTER_API_KEY : '',
    PORT: raw.PORT ? Number(raw.PORT) : 3000,
    NODE_ENV: (raw.NODE_ENV as AppConfig['NODE_ENV']) ?? 'development',
  };
}
