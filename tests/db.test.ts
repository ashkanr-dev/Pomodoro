import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { Task } from "../src/lib/types.ts";

// The datastore resolves its directory at import time, so point it at a
// scratch directory before the module is loaded.
const dataDir = await mkdtemp(path.join(tmpdir(), "pomodoro-db-"));
process.env.POMODORO_DATA_DIR = dataDir;

const { checkWritable, mutate, newId, read } = await import("../src/lib/db.ts");

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

test("the writability probe succeeds on a usable data directory", async () => {
  await assert.doesNotReject(checkWritable());
});

test("the writability probe cleans up after itself", async () => {
  // Health checks run on a schedule; leaked probe files would pile up forever.
  await checkWritable();
  await checkWritable();
  await checkWritable();

  const leftovers = (await readdir(dataDir)).filter((name) =>
    name.startsWith(".probe-"),
  );
  assert.deepEqual(leftovers, []);
});

test("the writability probe rejects when the directory cannot be created", async () => {
  // The data directory is resolved at import time, so the override has to be
  // in place before the fresh copy of the module loads. A regular file where a
  // directory belongs is what an unmounted volume looks like from inside the
  // container.
  process.env.POMODORO_DATA_DIR = path.join(dataDir, "db.json", "nested");
  try {
    const { checkWritable: check } = await import(
      `../src/lib/db.ts?unusable=${Date.now()}`
    );
    await assert.rejects(check(), /ENOTDIR|ENOENT|EACCES/);
  } finally {
    process.env.POMODORO_DATA_DIR = dataDir;
  }
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
