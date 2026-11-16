-- CreateEnum
CREATE TYPE "UserTipo" AS ENUM ('motorista', 'passageiro');

-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('aguardando_orcamento', 'aguardando_confirmacao', 'confirmada', 'pendente', 'em_andamento', 'concluida', 'cancelada');

-- CreateEnum
CREATE TYPE "NotificationTipo" AS ENUM ('corrida_cancelada', 'nova_corrida', 'corrida_aceita', 'corrida_concluida', 'orcamento_recebido', 'corrida_confirmada');

-- CreateEnum
CREATE TYPE "PeriodoMotivo" AS ENUM ('manutencao', 'descanso', 'compromisso_pessoal', 'outros');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "tipo" "UserTipo" NOT NULL,
    "avatar_url" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "preco_km" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "conta_verificada" BOOLEAN NOT NULL DEFAULT false,
    "disponivel" BOOLEAN NOT NULL DEFAULT true,
    "total_corridas" INTEGER NOT NULL DEFAULT 0,
    "lucro_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passengers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_by_driver_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "modelo" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "consumo_medio" DECIMAL(6,2),
    "lugares" INTEGER,
    "aceita_pets" BOOLEAN NOT NULL DEFAULT false,
    "aceita_cadeirinha" BOOLEAN NOT NULL DEFAULT false,
    "aceita_volumes" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rides" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "passageiro_id" UUID,
    "passageiro_nome" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "distancia_km" DECIMAL(8,2) NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ida_volta" BOOLEAN NOT NULL DEFAULT false,
    "taxa_espera" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "pedagio" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "consumo_medio" DECIMAL(6,2),
    "combustivel_preco" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "preco_km" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "custo_combustivel" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "custo_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lucro_liquido" DECIMAL(10,2),
    "status" "RideStatus" NOT NULL DEFAULT 'aguardando_orcamento',
    "data" DATE NOT NULL,
    "hora" TIME(0) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "ride_id" UUID NOT NULL,
    "tipo" "NotificationTipo" NOT NULL,
    "titulo" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unavailable_periods" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "motivo" "PeriodoMotivo" NOT NULL DEFAULT 'outros',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unavailable_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_user_id_key" ON "drivers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "passengers_user_id_key" ON "passengers"("user_id");

-- CreateIndex
CREATE INDEX "passengers_created_by_driver_id_idx" ON "passengers"("created_by_driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_driver_id_key" ON "vehicles"("driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_placa_key" ON "vehicles"("placa");

-- CreateIndex
CREATE INDEX "rides_driver_id_data_hora_idx" ON "rides"("driver_id", "data", "hora");

-- CreateIndex
CREATE INDEX "rides_passageiro_id_data_hora_idx" ON "rides"("passageiro_id", "data", "hora");

-- CreateIndex
CREATE INDEX "rides_driver_id_status_idx" ON "rides"("driver_id", "status");

-- CreateIndex
CREATE INDEX "notifications_user_id_criado_em_idx" ON "notifications"("user_id", "criado_em" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_lida_idx" ON "notifications"("user_id", "lida");

-- CreateIndex
CREATE INDEX "unavailable_periods_driver_id_data_inicio_idx" ON "unavailable_periods"("driver_id", "data_inicio");

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passengers" ADD CONSTRAINT "passengers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passengers" ADD CONSTRAINT "passengers_created_by_driver_id_fkey" FOREIGN KEY ("created_by_driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_passageiro_id_fkey" FOREIGN KEY ("passageiro_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unavailable_periods" ADD CONSTRAINT "unavailable_periods_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Complemento do schema.prisma: o que o Prisma não consegue declarar.
-- Deve ser ANEXADO à migration inicial (prisma migrate dev --create-only, colar
-- este conteúdo no fim do migration.sql e então aplicar).
-- =============================================================================

-- ---------- Integridade (CHECK) ----------
ALTER TABLE "drivers"
  ADD CONSTRAINT "drivers_preco_km_check" CHECK ("preco_km" >= 0 AND "preco_km" <= 50),
  ADD CONSTRAINT "drivers_total_corridas_check" CHECK ("total_corridas" >= 0);

ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_lugares_check" CHECK ("lugares" IS NULL OR ("lugares" > 0 AND "lugares" <= 100)),
  ADD CONSTRAINT "vehicles_consumo_check" CHECK ("consumo_medio" IS NULL OR "consumo_medio" > 0);

ALTER TABLE "rides"
  ADD CONSTRAINT "rides_distancia_check" CHECK ("distancia_km" > 0),
  ADD CONSTRAINT "rides_valores_check" CHECK (
    "valor" >= 0 AND "taxa_espera" >= 0 AND "pedagio" >= 0 AND
    "custo_combustivel" >= 0 AND "custo_total" >= 0
  );

ALTER TABLE "unavailable_periods"
  ADD CONSTRAINT "unavailable_periods_datas_check" CHECK ("data_fim" >= "data_inicio");

-- ---------- Folgas do motorista nunca se sobrepõem ----------
-- Hoje a API checa "findOne + create", que tem corrida de concorrência.
-- Com a EXCLUDE o próprio banco garante (inclusive nas bordas, como a API já faz).
-- No schema "extensions" (padrão do Supabase), não no public.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
ALTER TABLE "unavailable_periods"
  ADD CONSTRAINT "unavailable_periods_sem_sobreposicao"
  EXCLUDE USING gist (
    "driver_id" WITH =,
    daterange("data_inicio", "data_fim", '[]') WITH &&
  );

-- ---------- Supabase: fecha a API REST pública ----------
-- O Supabase expõe as tabelas via PostgREST com a chave anon. Com RLS ligado e
-- SEM nenhuma policy, anon/authenticated não leem nada. O backend conecta como
-- role de servidor (postgres/prisma), que ignora RLS.
ALTER TABLE "users"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "drivers"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "passengers"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicles"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rides"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "unavailable_periods" ENABLE ROW LEVEL SECURITY;

-- A tabela de controle do Prisma também fica no public: sem RLS ela seria
-- legível/gravável pela chave anon via REST. Ela já existe quando esta
-- migration roda (o `prisma migrate` cria antes de aplicar).
DO $$
BEGIN
  IF to_regclass('"_prisma_migrations"') IS NOT NULL THEN
    ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
