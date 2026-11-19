-- =============================================================================
-- Fluxo único de status + conflito de agenda + índice da FK de notificações.
-- =============================================================================

-- Corridas manuais do fluxo legado ("pendente") viram "confirmada", que é como
-- a corrida manual nasce agora. Precisa vir ANTES da troca do enum.
UPDATE "rides" SET "status" = 'confirmada' WHERE "status" = 'pendente';

-- AlterEnum
BEGIN;
CREATE TYPE "RideStatus_new" AS ENUM ('aguardando_orcamento', 'aguardando_confirmacao', 'confirmada', 'em_andamento', 'concluida', 'cancelada');
ALTER TABLE "public"."rides" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "rides" ALTER COLUMN "status" TYPE "RideStatus_new" USING ("status"::text::"RideStatus_new");
ALTER TYPE "RideStatus" RENAME TO "RideStatus_old";
ALTER TYPE "RideStatus_new" RENAME TO "RideStatus";
DROP TYPE "public"."RideStatus_old";
ALTER TABLE "rides" ALTER COLUMN "status" SET DEFAULT 'aguardando_orcamento';
COMMIT;

-- CreateIndex
CREATE INDEX "notifications_ride_id_idx" ON "notifications"("ride_id");

-- ---------- Conflito de agenda ----------
-- Um motorista não pode ter duas corridas ATIVAS no mesmo dia e horário.
-- Canceladas e concluídas não contam (liberam o horário). Como a EXCLUDE das
-- folgas, o banco garante mesmo com pedidos simultâneos (SQLSTATE 23P01).
-- Usa os operadores gist de date/time da extensão btree_gist (migration inicial).
ALTER TABLE "rides"
  ADD CONSTRAINT "rides_sem_conflito_de_horario"
  EXCLUDE USING gist (
    "driver_id" WITH =,
    "data" WITH =,
    "hora" WITH =
  ) WHERE ("status" NOT IN ('cancelada', 'concluida'));
