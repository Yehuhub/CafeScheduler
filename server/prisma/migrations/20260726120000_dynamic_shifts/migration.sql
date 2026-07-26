-- Replace the fixed `slot` string enum with a per-week `Shift` entity referenced by FK.
-- Data-preserving: existing morning/mid/evening slots are turned into Shift rows per week
-- and the child tables are repointed onto the new shiftId columns.

PRAGMA foreign_keys=OFF;

-- CreateTable: Shift. `legacySlot` is a temporary column used only to backfill the child
-- FKs below; it is dropped in the final rebuild of this table.
CREATE TABLE "Shift" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "weekId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "legacySlot" TEXT,
    CONSTRAINT "Shift_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- One Shift per distinct (weekId, slot) that appears in any child table.
INSERT INTO "Shift" ("weekId", "name", "startTime", "legacySlot")
SELECT weekId,
       CASE slot WHEN 'morning' THEN 'Morning' WHEN 'mid' THEN 'Mid' WHEN 'evening' THEN 'Evening' ELSE slot END,
       CASE slot WHEN 'morning' THEN '06:00' WHEN 'mid' THEN '10:00' WHEN 'evening' THEN '13:00' ELSE '00:00' END,
       slot
FROM (
    SELECT "weekId", "slot" FROM "ShiftRequirement"
    UNION
    SELECT "weekId", "slot" FROM "Availability"
    UNION
    SELECT "weekId", "slot" FROM "Assignment"
);

-- Rebuild ShiftRequirement: slot -> shiftId
CREATE TABLE "new_ShiftRequirement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "weekId" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "shiftId" INTEGER NOT NULL,
    "cooksNeeded" INTEGER NOT NULL,
    "baristasNeeded" INTEGER NOT NULL,
    CONSTRAINT "ShiftRequirement_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShiftRequirement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ShiftRequirement" ("id", "weekId", "day", "shiftId", "cooksNeeded", "baristasNeeded")
SELECT r."id", r."weekId", r."day", s."id", r."cooksNeeded", r."baristasNeeded"
FROM "ShiftRequirement" r
JOIN "Shift" s ON s."weekId" = r."weekId" AND s."legacySlot" = r."slot";
DROP TABLE "ShiftRequirement";
ALTER TABLE "new_ShiftRequirement" RENAME TO "ShiftRequirement";
CREATE UNIQUE INDEX "ShiftRequirement_weekId_day_shiftId_key" ON "ShiftRequirement"("weekId", "day", "shiftId");

-- Rebuild Availability: slot -> shiftId
CREATE TABLE "new_Availability" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "weekId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "shiftId" INTEGER NOT NULL,
    "available" BOOLEAN NOT NULL,
    CONSTRAINT "Availability_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Availability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Availability_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Availability" ("id", "weekId", "userId", "day", "shiftId", "available")
SELECT a."id", a."weekId", a."userId", a."day", s."id", a."available"
FROM "Availability" a
JOIN "Shift" s ON s."weekId" = a."weekId" AND s."legacySlot" = a."slot";
DROP TABLE "Availability";
ALTER TABLE "new_Availability" RENAME TO "Availability";
CREATE UNIQUE INDEX "Availability_weekId_userId_day_shiftId_key" ON "Availability"("weekId", "userId", "day", "shiftId");

-- Rebuild Assignment: slot -> shiftId
CREATE TABLE "new_Assignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "weekId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "shiftId" INTEGER NOT NULL,
    "roleWorking" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Assignment_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Assignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Assignment" ("id", "weekId", "userId", "day", "shiftId", "roleWorking", "createdAt")
SELECT a."id", a."weekId", a."userId", a."day", s."id", a."roleWorking", a."createdAt"
FROM "Assignment" a
JOIN "Shift" s ON s."weekId" = a."weekId" AND s."legacySlot" = a."slot";
DROP TABLE "Assignment";
ALTER TABLE "new_Assignment" RENAME TO "Assignment";

-- Drop the temporary legacySlot column from Shift.
CREATE TABLE "new_Shift" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "weekId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    CONSTRAINT "Shift_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Shift" ("id", "weekId", "name", "startTime")
SELECT "id", "weekId", "name", "startTime" FROM "Shift";
DROP TABLE "Shift";
ALTER TABLE "new_Shift" RENAME TO "Shift";
CREATE UNIQUE INDEX "Shift_weekId_name_key" ON "Shift"("weekId", "name");

PRAGMA foreign_keys=ON;
