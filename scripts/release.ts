#!/usr/bin/env bun

import { $, semver } from 'bun';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const pkgPath = resolve(root, 'package.json');
const jsrPath = resolve(root, 'jsr.json');

const bumpArg = process.argv[2] ?? 'patch';

function fatal(message: string): never {
    console.error(`\x1b[31merror\x1b[0m: ${message}`);
    process.exit(1);
}

async function readVersionedJson(path: string) {
    const file = Bun.file(path);
    if (!(await file.exists())) {
        fatal(`File not found: ${path}`);
    }

    let value;
    try {
        value = await file.json();
    } catch {
        fatal(`Failed to parse JSON in ${path}`);
    }

    if (typeof value !== 'object' || value === null || typeof value.version !== 'string') {
        fatal(`${path} must contain an object with a string "version"`);
    }
    return value;
}

function isExactVersion(value: string): boolean {
    const version = value.startsWith('v') ? value.slice(1) : value;
    try {
        semver.order(version, version);
        return true;
    } catch {
        return false;
    }
}

function bumpVersion(current: string, bump: string): string {
    const normalized = current.startsWith('v') ? current.slice(1) : current;

    if (!isExactVersion(normalized)) {
        fatal(`Invalid current version: ${current}`);
    }

    if (isExactVersion(bump)) {
        return bump.startsWith('v') ? bump.slice(1) : bump;
    }

    if (bump !== 'patch' && bump !== 'minor' && bump !== 'major') {
        fatal(`Invalid version bump "${bump}". Use patch, minor, major, or x.y.z`);
    }

    const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(normalized);
    if (!match) {
        fatal(`Cannot apply "${bump}" to non-standard version "${current}"`);
    }

    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);

    switch (bump) {
        case 'major':
            return `${major + 1}.0.0`;
        case 'minor':
            return `${major}.${minor + 1}.0`;
        case 'patch':
            return `${major}.${minor}.${patch + 1}`;
        default:
            fatal(`Unexpected bump type: ${String(bump)}`);
    }

    return bump;
}

const pkg = await readVersionedJson(pkgPath);
const jsr = await readVersionedJson(jsrPath);

const current = pkg.version;
if (jsr.version !== current) {
    fatal(`Version mismatch: package.json=${pkg.version}, jsr.json=${jsr.version}`);
}

const diffFiles = await $`git diff --quiet -- package.json jsr.json`.nothrow();
const diffCached = await $`git diff --cached --quiet -- package.json jsr.json`.nothrow();

if (diffFiles.exitCode !== 0 || diffCached.exitCode !== 0) {
    fatal('package.json or jsr.json have uncommitted changes. Please commit or stash them before releasing.');
}

const next = bumpVersion(current, bumpArg);

if (semver.order(next, current) <= 0) {
    fatal(`New version ${next} must be greater than current ${current}`);
}

const tag = `v${next}`;

const existingTag = await $`git tag --list ${tag}`.text();
if (existingTag.trim() !== '') {
    fatal(`Git tag already exists: ${tag}`);
}

pkg.version = next;
jsr.version = next;

await Bun.write(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
await Bun.write(jsrPath, `${JSON.stringify(jsr, null, 2)}\n`);

await $`bun run fmt`;
await $`bun run lint`;
await $`bun run test`;

try {
    await $`git add package.json jsr.json`;
} catch {
    fatal(`Failed to stage the updated files. They are left modified in your working directory.`);
}

console.log(`\x1b[32m✔\x1b[0m ${current} → ${next}`);
console.log(`\x1b[32m✔\x1b[0m Files updated and staged for commit.\n`);
console.log(`\x1b[1mTo finish the release, run the following commands:\x1b[0m\n`);
console.log(`  git commit -m "release: ${tag}"`);
console.log(`  git tag ${tag}`);
console.log(`  git push && git push origin ${tag}\n`);
