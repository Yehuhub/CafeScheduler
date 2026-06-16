-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Week" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "startDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'availability_open',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME
);
INSERT INTO "new_Week" ("createdAt", "id", "publishedAt", "startDate", "status") SELECT "createdAt", "id", "publishedAt", "startDate", "status" FROM "Week";
DROP TABLE "Week";
ALTER TABLE "new_Week" RENAME TO "Week";
CREATE UNIQUE INDEX "Week_startDate_key" ON "Week"("startDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
