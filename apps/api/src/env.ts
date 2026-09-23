import { apiEnvSchema, parseEnv } from '@thealotta/contracts'

export const loadEnv = () => parseEnv(apiEnvSchema)
export type Env = ReturnType<typeof loadEnv>
