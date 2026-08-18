#!/usr/bin/env bun

import { $ } from 'bun';
import { resolve } from 'node:path';

const SPEC_URL = 'https://server.kivox.com.co/openapi.yaml';

const OUTPUT = resolve(import.meta.dir, '../src/codegen/api.ts');

console.log(`Generating types from ${SPEC_URL}...`);

await $`bunx openapi-typescript ${SPEC_URL} --output ${OUTPUT} --default-non-nullable false --alphabetize`;

console.log(`[OK] ${OUTPUT}`);
