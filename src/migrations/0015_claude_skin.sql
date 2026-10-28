-- 0015: expose the Claude UI skin while keeping WFLA X as the site default.
-- Only upgrade the historical shipped allow-list. Owner-customized lists are
-- left untouched and can enable the skin from the appearance console.
UPDATE app_settings
SET value = 'x,claude'
WHERE key = 'allowed_skins'
  AND REPLACE(value, ' ', '') IN ('x', 'x,endfield', 'endfield,x');
