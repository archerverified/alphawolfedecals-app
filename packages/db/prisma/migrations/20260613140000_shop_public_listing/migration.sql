-- Goal 9 / D3 shop locator opt-in. public_listing is the consent flag; public_city
-- is a coarse, non-PII location the shop chooses to publish (so the locator never
-- decrypts/exposes the encrypted address).
ALTER TABLE "shops" ADD COLUMN "public_listing" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "shops" ADD COLUMN "public_city" TEXT;
