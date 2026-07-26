// GLemples — real-time WebGL image warper
// Copyright (C) 2026 Daniel Hebberd
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Packages `dist/` into `releases/glemples-<version>.zip`.
 *
 * Run via `npm run release`, which builds first. Prefers the `zip` CLI and
 * falls back to PowerShell's Compress-Archive on Windows, so the task does not
 * depend on a Unix shell.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const releases = join(root, "releases");

const { version } = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
);
const archive = join(releases, `glemples-${version}.zip`);

if (!existsSync(dist)) {
  console.error("No dist/ directory — run `npm run build` first.");
  process.exit(1);
}

mkdirSync(releases, { recursive: true });
rmSync(archive, { force: true });

/**
 * Runs a command, returning true when it exists and exits cleanly.
 *
 * @param {string} cmd Executable to run.
 * @param {string[]} args Arguments to pass.
 * @param {string} cwd Working directory.
 * @returns {boolean} Whether the command succeeded.
 */
function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  return r.error === undefined && r.status === 0;
}

// Archive the *contents* of dist/ so index.html lands at the archive root.
const zipped =
  run("zip", ["-rq", archive, "."], dist) ||
  (process.platform === "win32" &&
    run(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Compress-Archive -Path '${join(dist, "*")}' -DestinationPath '${archive}' -Force`,
      ],
      root,
    ));

if (!zipped) {
  console.error(
    "Could not create the archive: no usable `zip` command was found.\n" +
      "Install zip (Debian/Ubuntu: `apt install zip`, macOS: preinstalled), " +
      "or archive dist/ by hand.",
  );
  process.exit(1);
}

console.log(`Wrote ${archive}`);
