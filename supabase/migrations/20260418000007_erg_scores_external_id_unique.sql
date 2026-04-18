ALTER TABLE erg_workouts ADD CONSTRAINT erg_workouts_user_id_external_id_unique UNIQUE (user_id, external_id);
