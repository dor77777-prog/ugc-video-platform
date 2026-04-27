-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "selectedScriptId" TEXT;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_selectedScriptId_fkey" FOREIGN KEY ("selectedScriptId") REFERENCES "Script"("id") ON DELETE SET NULL ON UPDATE CASCADE;
