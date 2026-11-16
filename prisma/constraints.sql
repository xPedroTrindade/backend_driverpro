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
