CREATE TABLE bcn_file (
	fileid INTEGER PRIMARY KEY ASC,
	dirname TEXT,
	filename TEXT,
	mtime INTEGER,
	size INTEGER,
	ext TEXT,
	type TEXT,
	json TEXT,
	json_valid BOOLEAN,
	schema_valid BOOLEAN,
	data_valid_message TEXT
);

CREATE UNIQUE INDEX file_name_index ON bcn_file (filename, dirname);
CREATE UNIQUE INDEX file_path_index ON bcn_file (dirname, filename, type);
CREATE UNIQUE INDEX file_type_index ON bcn_file (type, dirname, filename);
CREATE UNIQUE INDEX file_ext_index ON bcn_file (ext, type, dirname, filename);

CREATE TABLE bcn_config (
	initialized BOOLEAN default 0,
	version INTEGER default 1
);

INSERT INTO bcn_config (initialized, version) VALUES (0, 1);
