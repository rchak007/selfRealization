CREATE TABLE eternal_quest_chunks (
  id SERIAL PRIMARY KEY,
  project_name TEXT NOT NULL,
  sub_topic TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  text_content TEXT NOT NULL,
  last_used TIMESTAMP
);
