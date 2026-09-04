import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * In-repository atomic text writer (temp file + rename), extracted from
 * self-update.js so the personalization store shares the exact same
 * durability contract: process-crash / exception-path atomicity via
 * rename(2). Crash durability beyond that (fsync of file and parent
 * directory) is intentionally out of scope — see design §5.2.
 */
export function atomicWriteText(file, content, fs = { mkdirSync, writeFileSync, renameSync }) {
  fs.mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}
