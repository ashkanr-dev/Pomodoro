import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { Task } from "../src/lib/types.ts";

// The datastore resolves its directory at import time, so point it at a
// scratch directory before the module is loaded.
const dataDir = await mkdtemp(path.join(tmpdir(), "pomodoro-db-"));
process.env.POMODORO_DATA_DIR = dataDir;

const { mutate, newId, read } = await import("../src/lib/db.ts");

function task(title: string): Task {
  return {
    id: newId(),
    userId: "user",
    title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    archived: false,
  };
}

test("an empty database reads as empty rather than failing", async () => {
  const tasks = await read((db) => db.tasks);
  assert.deepEqual(tasks, []);
});

test("writes are visible to later reads and land on disk", async () => {
  await mutate((db) => {
    db.tasks.push(task("Write the report"));
  });

  const titles = await read((db) => db.tasks.map((t) => t.title));
  assert.deepEqual(titles, ["Write the report"]);

  const onDisk = JSON.parse(
    await readFile(path.join(dataDir, "db.json"), "utf8"),
  ) as { tasks: Task[] };
  assert.equal(onDisk.tasks.length, 1);
  assert.equal(onDisk.tasks[0].title, "Write the report");
});

test("concurrent writes all survive instead of clobbering each other", async () => {
  await mutate((db) => {
    db.tasks = [];
  });

  // Without serialisation these interleave and most of them are lost.
  await Promise.all(
    Array.from({ length: 25 }, (_, index) =>
      mutate((db) => {
        db.tasks.push(task(`Task ${index}`));
      }),
    ),
  );

  const count = await read((db) => db.tasks.length);
  assert.equal(count, 25);

  const onDisk = JSON.parse(
    await readFile(path.join(dataDir, "db.json"), "utf8"),
  ) as { tasks: Task[] };
  assert.equal(onDisk.tasks.length, 25);
});

test("a failed write leaves the database untouched", async () => {
  await mutate((db) => {
    db.tasks = [task("Keep me")];
  });

  await assert.rejects(
    mutate((db) => {
      db.tasks.push(task("Lose me"));
      throw new Error("boom");
    }),
    /boom/,
  );

  // The queue must survive the rejection, and the partial write must not.
  const titles = await read((db) => db.tasks.map((t) => t.title));
  assert.deepEqual(titles, ["Keep me"]);
});
