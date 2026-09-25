-- Which inbox an application was submitted from (a label such as 'Gmail' or 'Kellogg', not the address),
-- so follow-ups land where recruiters expect them.
ALTER TABLE applications ADD COLUMN applied_email TEXT;
