-- Legacy API clients could set status and provider sync flags directly even though no provider
-- sync workers exist. Reset those unverified claims; existing endpoints remain configured and
-- can be checked again by an explicit endpoint ping.
UPDATE "Integration"
SET "status" = 'CONFIGURE',
    "syncPullRequests" = FALSE,
    "syncCiCdStatus" = FALSE
WHERE "status" <> 'CONFIGURE'
   OR "syncPullRequests" IS TRUE
   OR "syncCiCdStatus" IS TRUE;
