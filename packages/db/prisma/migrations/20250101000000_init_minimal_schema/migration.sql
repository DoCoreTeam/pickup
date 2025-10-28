-- CreateEnum
CREATE TYPE "public"."StoreStatus" AS ENUM ('active', 'paused');

-- CreateTable
CREATE TABLE "public"."superadmin" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_modified" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "superadmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."stores" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "subdomain" TEXT,
    "subdomain_status" TEXT,
    "subdomain_created_at" TIMESTAMP(3),
    "subdomain_last_modified" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_modified" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paused_at" TIMESTAMP(3),

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."store_settings" (
    "id" SERIAL NOT NULL,
    "store_id" TEXT NOT NULL,
    "basic" JSONB,
    "discount" JSONB,
    "delivery" JSONB,
    "pickup" JSONB,
    "images" JSONB,
    "business_hours" JSONB,
    "section_order" JSONB,
    "qr_code" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."activity_logs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "user_id" TEXT,
    "user_name" TEXT,
    "target_type" TEXT,
    "target_id" TEXT,
    "target_name" TEXT,
    "details" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."analytics" (
    "id" SERIAL NOT NULL,
    "site_visits" JSONB,
    "store_visits" JSONB,
    "phone_clicks" JSONB,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."release_notes" (
    "id" SERIAL NOT NULL,
    "version" TEXT NOT NULL,
    "codename" TEXT,
    "release_date" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "highlights" JSONB,
    "features" JSONB,
    "bug_fixes" JSONB,
    "technical_improvements" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."current_store" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "store_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "current_store_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "superadmin_username_key" ON "public"."superadmin"("username");

-- CreateIndex
CREATE INDEX "superadmin_username_idx" ON "public"."superadmin"("username");

-- CreateIndex
CREATE UNIQUE INDEX "stores_subdomain_key" ON "public"."stores"("subdomain");

-- CreateIndex
CREATE INDEX "stores_status_idx" ON "public"."stores"("status");

-- CreateIndex
CREATE INDEX "stores_subdomain_idx" ON "public"."stores"("subdomain");

-- CreateIndex
CREATE INDEX "stores_created_at_idx" ON "public"."stores"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "store_settings_store_id_key" ON "public"."store_settings"("store_id");

-- CreateIndex
CREATE INDEX "store_settings_store_id_idx" ON "public"."store_settings"("store_id");

-- CreateIndex
CREATE INDEX "activity_logs_type_idx" ON "public"."activity_logs"("type");

-- CreateIndex
CREATE INDEX "activity_logs_timestamp_idx" ON "public"."activity_logs"("timestamp");

-- CreateIndex
CREATE INDEX "activity_logs_user_id_idx" ON "public"."activity_logs"("user_id");

-- CreateIndex
CREATE INDEX "release_notes_version_idx" ON "public"."release_notes"("version");

-- CreateIndex
CREATE INDEX "release_notes_release_date_idx" ON "public"."release_notes"("release_date");

-- AddForeignKey
ALTER TABLE "public"."store_settings" ADD CONSTRAINT "store_settings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
