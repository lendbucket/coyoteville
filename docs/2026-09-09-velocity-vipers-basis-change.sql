-- Velocity Vipers Softball, home-game-2026-09-11: the basis change, on the record.
--
-- They signed fundraiser-v1.1-2026, which promised 50 percent of gross with
-- nothing deducted. Robert moved that night to net on 2026-09-09, so their
-- share is 50 percent after the 3.25 percent card processing cost.
--
-- On a 300 car night that is $1,451.25 rather than $1,500.00, a difference of
-- $48.75 to the organization.
--
-- This file exists because the code cannot write it. There are no production
-- credentials in this repo, so run this against production by hand. The basis
-- itself comes from lib/parking and is already live; this is the record of the
-- decision next to the row it affects, which is the part a code comment cannot
-- be.

update org_event_awards
   set admin_notes = concat_ws(' | ', nullif(admin_notes, ''), 'Basis changed to net by Robert on 2026-09-09. They signed fundraiser-v1.1-2026, which promised 50 percent of gross. Their share on this event is 50 percent after the 3.25 percent card processing cost.'),
       updated_at = now()
 where org_application_id = 'f67a418b-1f41-4306-af21-3ff7a17ff41a'
   and event_slug = 'home-game-2026-09-11';
