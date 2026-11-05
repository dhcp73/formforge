import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

// Each test file runs in its own fork with its own throwaway database + data dir.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "formforge-test-"));
process.env.FORMFORGE_DATA_DIR = dir;
process.env.FORMFORGE_DB = path.join(dir, "test.db");
process.env.FORMFORGE_SECRET = "test-secret-key-for-formforge-unit-tests-0123456789";
process.env.FORMFORGE_DNS = "off";
process.env.FORMFORGE_RETRY_SCALE = "0";
process.env.FORMFORGE_PROVIDER_TIMEOUT_MS = "400";
process.env.PUBLIC_URL = "http://formforge.test";
process.env.APOLLO_BASE_URL = "https://apollo.test/api/v1";
process.env.VALYU_BASE_URL = "https://valyu.test/v1";
process.env.OPENAI_BASE_URL = "https://openai.test/v1";
process.env.OPENROUTER_BASE_URL = "https://openrouter.test/api/v1";
for (const k of ["APOLLO_API_KEY", "CLAY_WEBHOOK_URL", "CLAY_CALLBACK_SECRET", "VALYU_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "SMTP_URL", "ALERT_WEBHOOK_URL", "ALERT_EMAIL"]) delete process.env[k];

afterAll(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
